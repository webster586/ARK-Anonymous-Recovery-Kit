//go:build windows

package main

// Confirm-gated, offline-by-default installer for the Ollama runtime itself.
// Mirrors the existing download/verify pattern from library.go (resumable
// download + SHA-256 check against an officially published hash) and the
// zip-slip-safe extractor from ark_zip_core.go. Nothing here runs without an
// explicit POST to /api/ollama/setup (see routes() in ollama_launch.go).
import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	ollamaReleaseAPI   = "https://api.github.com/repos/ollama/ollama/releases/latest"
	ollamaAssetName    = "ollama-windows-amd64.zip"
	ollamaChecksumName = "sha256sum.txt"
)

type githubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}
type githubRelease struct {
	TagName string               `json:"tag_name"`
	Assets  []githubReleaseAsset `json:"assets"`
}

// fetchLatestOllamaRelease asks GitHub's own release API for the current
// official Windows package and its companion checksum file. No version is
// hardcoded, so this keeps working as upstream ships new releases.
func fetchLatestOllamaRelease(ctx context.Context) (zipURL string, zipSize int64, checksumURL, version string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ollamaReleaseAPI, nil)
	if err != nil {
		return "", 0, "", "", err
	}
	req.Header.Set("User-Agent", "ARK-Ollama-Installer/1.0")
	req.Header.Set("Accept", "application/vnd.github+json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", 0, "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", 0, "", "", fmt.Errorf("HTTP %d von der GitHub Release-API", resp.StatusCode)
	}
	var rel githubRelease
	if err = json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&rel); err != nil {
		return "", 0, "", "", err
	}
	for _, a := range rel.Assets {
		switch a.Name {
		case ollamaAssetName:
			zipURL, zipSize = a.BrowserDownloadURL, a.Size
		case ollamaChecksumName:
			checksumURL = a.BrowserDownloadURL
		}
	}
	if zipURL == "" || checksumURL == "" {
		return "", 0, "", "", errors.New("offizielles Windows-Paket oder Pruefsummen-Datei nicht im Release gefunden")
	}
	return zipURL, zipSize, checksumURL, rel.TagName, nil
}

// fetchOllamaExpectedSHA256 downloads the small official checksum manifest and
// returns the hash for the exact asset we are about to install.
func fetchOllamaExpectedSHA256(ctx context.Context, checksumURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, checksumURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "ARK-Ollama-Installer/1.0")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d bei der Pruefsummen-Datei", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(body), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 {
			continue
		}
		name := strings.TrimPrefix(fields[1], "*")
		name = strings.TrimPrefix(name, "./")
		if name == ollamaAssetName {
			return strings.ToLower(strings.TrimSpace(fields[0])), nil
		}
	}
	return "", fmt.Errorf("kein Eintrag fuer %s in der Pruefsummen-Datei", ollamaAssetName)
}

// startSetup launches the download/verify/install sequence in the background,
// exactly once at a time, reusing the existing busy/message convention.
func (o *ollamaManager) startSetup() error {
	o.mu.Lock()
	if o.installBusy {
		o.mu.Unlock()
		return errors.New("Ollama-Einrichtung läuft bereits")
	}
	o.mu.Unlock()
	if _, err := o.exePath(); err == nil {
		return errors.New("Ollama ist bereits vorhanden (lokal gefunden oder gebunden)")
	}
	o.mu.Lock()
	o.installBusy = true
	o.installMessage = "Offizielle Ollama-Version wird ermittelt …"
	o.installDoneBytes, o.installTotalBytes = 0, 0
	o.mu.Unlock()

	go func() {
		// A ~1.5 GB download over a slow connection can take a long time; the
		// context only bounds total runtime, not single requests.
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
		defer cancel()
		err := o.setupInstall(ctx)
		o.mu.Lock()
		o.installBusy = false
		if err != nil {
			o.installMessage = "Fehler: " + err.Error()
		} else {
			o.installMessage = "Ollama wurde installiert und ist einsatzbereit"
		}
		o.mu.Unlock()
	}()
	return nil
}

func (o *ollamaManager) setProgress(done, total int64) {
	o.mu.Lock()
	o.installDoneBytes = done
	if total > 0 {
		o.installTotalBytes = total
	}
	o.mu.Unlock()
}

func (o *ollamaManager) setMessage(msg string) {
	o.mu.Lock()
	o.installMessage = msg
	o.mu.Unlock()
}

// setupInstall downloads the official portable Ollama package, verifies it
// against GitHub's own published SHA-256, extracts it with the same
// zip-slip-safe routine used elsewhere in ARK, and places the files into
// installDir() (the Media-root folder, or a user-bound folder if set).
func (o *ollamaManager) setupInstall(ctx context.Context) error {
	dir := o.installDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("Zielordner konnte nicht angelegt werden: %w", err)
	}

	zipURL, zipSize, checksumURL, version, err := fetchLatestOllamaRelease(ctx)
	if err != nil {
		return fmt.Errorf("Release-Abfrage fehlgeschlagen: %w", err)
	}
	o.setMessage(fmt.Sprintf("Pruefsumme fuer Ollama %s wird geladen …", version))
	expectedHash, err := fetchOllamaExpectedSHA256(ctx, checksumURL)
	if err != nil {
		return fmt.Errorf("Pruefsumme nicht verfuegbar: %w", err)
	}

	zipPath := filepath.Join(dir, ollamaAssetName)
	o.setMessage("Download läuft …")
	if err := downloadResumable(ctx, zipURL, zipPath, zipSize, o.setProgress); err != nil {
		return fmt.Errorf("Download fehlgeschlagen: %w", err)
	}

	o.setMessage("Prüfsumme wird verglichen …")
	got, err := sha256File(ctx, zipPath)
	if err != nil {
		return fmt.Errorf("Integritätsprüfung fehlgeschlagen: %w", err)
	}
	if !strings.EqualFold(got, expectedHash) {
		_ = os.Remove(zipPath)
		return errors.New("Prüfsumme stimmt nicht überein – Datei verworfen")
	}

	o.setMessage("Archiv wird entpackt …")
	extractDir := filepath.Join(dir, "_setup_extract")
	_ = os.RemoveAll(extractDir)
	if err := os.MkdirAll(extractDir, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(extractDir)
	if _, err := arkZIPExtract(zipPath, extractDir); err != nil {
		return fmt.Errorf("Entpacken fehlgeschlagen: %w", err)
	}

	entries, err := os.ReadDir(extractDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		dest := filepath.Join(dir, entry.Name())
		if _, err := os.Stat(dest); err == nil {
			// Never overwrite something already in the target folder (e.g. a
			// models/ folder from an earlier manual setup).
			continue
		}
		if err := os.Rename(filepath.Join(extractDir, entry.Name()), dest); err != nil {
			return fmt.Errorf("Datei konnte nicht verschoben werden: %w", err)
		}
	}
	_ = os.Remove(zipPath)

	if _, err := o.exePath(); err != nil {
		return fmt.Errorf("Nach dem Entpacken wurde ollama.exe nicht gefunden: %w", err)
	}
	return nil
}
