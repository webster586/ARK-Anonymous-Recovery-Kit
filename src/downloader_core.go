package main

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"path/filepath"
	"strings"
)

// A pasted URL must be an ordinary public http(s) media-page URL, not a
// command-line option, a local file or a request to a local network service.
func validMediaURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if len(raw) > 2048 || len(raw) < 10 {
		return "", errors.New("URL fehlt oder ist zu lang")
	}
	u, e := url.Parse(raw)
	if e != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
		return "", errors.New("Bitte eine vollständige http(s)-Medien-URL eingeben")
	}
	host := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || !strings.Contains(host, ".") || strings.Contains(host, "\\") {
		return "", errors.New("Lokale Netzwerkadressen werden nicht unterstützt")
	}
	if ip := net.ParseIP(host); ip != nil {
		return "", errors.New("IP-Adressen sind als Medienquelle nicht erlaubt")
	}
	if u.Port() != "" && u.Port() != "443" && u.Port() != "80" {
		return "", errors.New("Nur Web-Standardports sind erlaubt")
	}
	return u.String(), nil
}

func downloaderArgs(url, target, ffmpegDir string, mp3, playlist bool) []string {
	args := []string{"--ignore-config", "--no-overwrites", "--no-mtime", "--newline", "--windows-filenames", "--ffmpeg-location", ffmpegDir, "--paths", target, "--output", "%(title).180B [%(id)s].%(ext)s"}
	// Playlist downloads are strictly opt-in. A watch URL with list= can
	// otherwise unexpectedly download hundreds of videos.
	if playlist {
		args = append(args, "--yes-playlist")
	} else {
		args = append(args, "--no-playlist")
	}
	if mp3 {
		args = append(args, "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0")
	} else {
		args = append(args, "--format", "bv*+ba/b", "--merge-output-format", "mp4")
	}
	return append(args, "--", url)
}

// Some services expose a collection-only URL, with no single clip to select.
// Refuse the known YouTube playlist URL form unless the user opted in.
func requiresPlaylistOptIn(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := strings.ToLower(strings.TrimPrefix(u.Hostname(), "www."))
	if (host == "youtube.com" || host == "m.youtube.com" || host == "music.youtube.com") && strings.TrimRight(u.Path, "/") == "/playlist" {
		return true
	}
	return false
}

func destinationFolder(folder string) (string, error) {
	folder = strings.TrimSpace(folder)
	if folder == "" || strings.ContainsRune(folder, 0) || !filepath.IsAbs(folder) {
		return "", fmt.Errorf("Speicherort muss ein vollständiger Ordnerpfad sein")
	}
	clean := filepath.Clean(folder)
	if clean == filepath.VolumeName(clean)+string(filepath.Separator) {
		return "", errors.New("Bitte einen Unterordner statt des Laufwerksstamms auswählen")
	}
	return clean, nil
}
