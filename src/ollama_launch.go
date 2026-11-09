//go:build windows

package main

// ARK-04 Ollama bridge: detects whether the local Ollama server answers and, if not,
// starts it itself – exactly like the existing NFC Manager / Local Toolbox integration
// in apps.go, just for the fixed Ollama install the user relocated to I:\Media\AI\Ollama.
import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

const ollamaHTTPBase = "http://127.0.0.1:11434"

type ollamaManager struct {
	media *mediaService
	mu    sync.Mutex
	proc  *exec.Cmd
	pid   int
	last  time.Time
	pull  *ollamaPullProgress

	// Runtime-Setup (Download des offiziellen portablen Pakets), getrennt vom
	// laufenden Server-Prozess oben, aber vom selben Mutex geschuetzt.
	installBusy       bool
	installMessage    string
	installDoneBytes  int64
	installTotalBytes int64
}

func newOllamaManager(m *mediaService) *ollamaManager {
	return &ollamaManager{media: m, pull: &ollamaPullProgress{}}
}

// installDir follows the same relocation the user performed earlier in this project:
// Ollama lives under the Media root in an "AI\Ollama" folder, not on C:, unless the
// user explicitly bound an existing installation via the ARK-0 install dashboard.
func (o *ollamaManager) installDir() string {
	fallback := filepath.Join(o.media.rootPath(), "AI", "Ollama")
	return installSelectOr("ollama", true, fallback)
}

func (o *ollamaManager) exePath() (string, error) {
	path := filepath.Join(o.installDir(), "ollama.exe")
	if st, err := os.Stat(path); err == nil && !st.IsDir() {
		return filepath.Clean(path), nil
	}
	return "", fmt.Errorf("ollama.exe nicht gefunden unter %s", path)
}

func ollamaReachable() bool {
	client := &http.Client{Timeout: 1500 * time.Millisecond}
	resp, err := client.Get(ollamaHTTPBase + "/api/version")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func (o *ollamaManager) status() map[string]any {
	o.mu.Lock()
	managed := o.proc != nil
	pid := o.pid
	installBusy := o.installBusy
	installMessage := o.installMessage
	installDone := o.installDoneBytes
	installTotal := o.installTotalBytes
	o.mu.Unlock()
	_, installErr := o.exePath()
	out := map[string]any{
		"reachable":           ollamaReachable(),
		"managed_by_ark":      managed,
		"pid":                 pid,
		"installed":           installErr == nil,
		"install_busy":        installBusy,
		"install_message":     installMessage,
		"install_done_bytes":  installDone,
		"install_total_bytes": installTotal,
	}
	if ramBytes, err := totalSystemRAMBytes(); err == nil {
		out["ram_bytes"] = ramBytes
		out["ram_gb"] = math.Round(float64(ramBytes)/1024/1024/1024*10) / 10
	}
	return out
}

// totalSystemRAMBytes reads the real installed RAM via the Windows API, the same
// GlobalMemoryStatusEx call Task Manager uses – no estimate, no external process.
var (
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	globalMemoryStatusEx = kernel32.NewProc("GlobalMemoryStatusEx")
)

func totalSystemRAMBytes() (uint64, error) {
	var m struct {
		length               uint32
		memoryLoad           uint32
		totalPhys            uint64
		availPhys            uint64
		totalPageFile        uint64
		availPageFile        uint64
		totalVirtual         uint64
		availVirtual         uint64
		availExtendedVirtual uint64
	}
	m.length = uint32(unsafe.Sizeof(m))
	ret, _, callErr := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&m)))
	if ret == 0 {
		return 0, fmt.Errorf("GlobalMemoryStatusEx: %w", callErr)
	}
	return m.totalPhys, nil
}

type ollamaModel struct {
	Name string `json:"name"`
	Size int64  `json:"size_bytes"`
}

// ollamaListModels asks the local Ollama server which models are actually installed –
// no guessing from the manifests folder, the running server is the single source of truth.
func ollamaListModels() ([]ollamaModel, error) {
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Get(ollamaHTTPBase + "/api/tags")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Ollama antwortet mit HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	var parsed struct {
		Models []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("Antwort nicht lesbar: %w", err)
	}
	out := make([]ollamaModel, 0, len(parsed.Models))
	for _, m := range parsed.Models {
		out = append(out, ollamaModel{Name: m.Name, Size: m.Size})
	}
	return out, nil
}

// ollamaPullProgress tracks one running "ollama pull" so the UI can poll the real
// download progress instead of guessing; only one pull runs at a time.
type ollamaPullProgress struct {
	mu        sync.Mutex
	active    bool
	done      bool
	name      string
	status    string
	completed int64
	total     int64
	err       string
}

func (p *ollamaPullProgress) snapshot() map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := map[string]any{"active": p.active, "done": p.done, "name": p.name, "status": p.status, "completed": p.completed, "total": p.total}
	if p.err != "" {
		out["error"] = p.err
	}
	return out
}

// startPull streams the real "ollama pull" progress from the local server's own
// NDJSON API – the same download Ollama's own CLI would perform, just triggered from ARK.
func (o *ollamaManager) startPull(name string) error {
	o.pull.mu.Lock()
	if o.pull.active {
		o.pull.mu.Unlock()
		return errors.New("Es läuft bereits ein Modell-Download")
	}
	o.pull.active, o.pull.done, o.pull.name, o.pull.status = true, false, name, "wird gestartet …"
	o.pull.completed, o.pull.total, o.pull.err = 0, 0, ""
	o.pull.mu.Unlock()

	go func() {
		defer func() {
			o.pull.mu.Lock()
			o.pull.active, o.pull.done = false, true
			o.pull.mu.Unlock()
		}()
		body, _ := json.Marshal(map[string]any{"model": name, "stream": true})
		req, err := http.NewRequest(http.MethodPost, ollamaHTTPBase+"/api/pull", bytes.NewReader(body))
		if err != nil {
			o.pull.mu.Lock()
			o.pull.err = err.Error()
			o.pull.mu.Unlock()
			return
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := (&http.Client{}).Do(req)
		if err != nil {
			o.pull.mu.Lock()
			o.pull.err = err.Error()
			o.pull.mu.Unlock()
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			msg, _ := io.ReadAll(resp.Body)
			o.pull.mu.Lock()
			o.pull.err = fmt.Sprintf("Ollama antwortet mit HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
			o.pull.mu.Unlock()
			return
		}
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Bytes()
			if len(line) == 0 {
				continue
			}
			var ev struct {
				Status    string `json:"status"`
				Completed int64  `json:"completed"`
				Total     int64  `json:"total"`
				Error     string `json:"error"`
			}
			if jerr := json.Unmarshal(line, &ev); jerr != nil {
				continue
			}
			o.pull.mu.Lock()
			if ev.Error != "" {
				o.pull.err = ev.Error
			} else {
				o.pull.status = ev.Status
				if ev.Total > 0 {
					o.pull.total, o.pull.completed = ev.Total, ev.Completed
				}
			}
			o.pull.mu.Unlock()
		}
	}()
	return nil
}

// ollamaDeleteModel removes a locally installed model via the Ollama server's own API –
// ARK never touches the model files on disk directly.
func ollamaDeleteModel(name string) error {
	body, _ := json.Marshal(map[string]string{"model": name})
	req, err := http.NewRequest(http.MethodDelete, ollamaHTTPBase+"/api/delete", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Ollama antwortet mit HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}

// ollamaChat sends one message as a non-streaming chat request – simple request/response,
// matching what the previous local chat panel used before its source was lost.
func ollamaChat(model, message string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"model":    model,
		"messages": []map[string]string{{"role": "user", "content": message}},
		"stream":   false,
	})
	req, err := http.NewRequest(http.MethodPost, ollamaHTTPBase+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 300 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Ollama antwortet mit HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	var parsed struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		Error string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", fmt.Errorf("Antwort nicht lesbar: %w", err)
	}
	if parsed.Error != "" {
		return "", errors.New(parsed.Error)
	}
	return parsed.Message.Content, nil
}

// start launches "ollama.exe serve" hidden (no console window, no tray icon) with
// OLLAMA_MODELS pointed at the relocated model store, mirroring the persisted user
// environment variable set up earlier so models keep landing on I: instead of C:.
func (o *ollamaManager) start() error {
	o.mu.Lock()
	if o.proc != nil {
		o.mu.Unlock()
		return nil // already launched by ARK, let the caller just keep polling reachability
	}
	if time.Since(o.last) < 2*time.Second {
		o.mu.Unlock()
		return errors.New("Start läuft bereits")
	}
	o.mu.Unlock()

	path, err := o.exePath()
	if err != nil {
		return err
	}
	cmd := exec.Command(path, "serve")
	cmd.Dir = o.installDir()
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Env = append(os.Environ(), "OLLAMA_MODELS="+filepath.Join(o.installDir(), "models"))
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("Start fehlgeschlagen: %w", err)
	}

	o.mu.Lock()
	o.proc = cmd
	o.pid = cmd.Process.Pid
	o.last = time.Now()
	o.mu.Unlock()

	go func() {
		_ = cmd.Wait()
		o.mu.Lock()
		o.proc = nil
		o.pid = 0
		o.mu.Unlock()
	}()
	return nil
}

func (o *ollamaManager) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/ollama/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET required", 405)
			return
		}
		writeJSON(w, o.status())
	})
	// Idempotent: if Ollama already answers, this just confirms it; otherwise ARK
	// starts it itself and waits a few seconds for the server to come up.
	mux.HandleFunc("/api/ollama/ensure", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOriginLaunch(r) {
			http.Error(w, "Aufruf nicht erlaubt", 403)
			return
		}
		if ollamaReachable() {
			writeJSON(w, map[string]any{"ok": true, "already_running": true})
			return
		}
		if err := o.start(); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			if ollamaReachable() {
				writeJSON(w, map[string]any{"ok": true, "already_running": false})
				return
			}
			time.Sleep(300 * time.Millisecond)
		}
		writeJSON(w, map[string]any{"ok": false, "error": "Ollama wurde gestartet, antwortet aber noch nicht. Bitte kurz erneut versuchen."})
	})
	// Confirm-gated: downloads the official portable Ollama runtime if it is not
	// already present/bound. Mirrors the arkArgos busy/status pattern for consistency.
	mux.HandleFunc("/api/ollama/setup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOriginLaunch(r) {
			http.Error(w, "Aufruf nicht erlaubt", 403)
			return
		}
		if err := o.startSetup(); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "started": true})
	})
	mux.HandleFunc("/api/ollama/models", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET required", 405)
			return
		}
		models, err := ollamaListModels()
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "models": models})
	})
	mux.HandleFunc("/api/ollama/pull", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOriginLaunch(r) {
			http.Error(w, "Aufruf nicht erlaubt", 403)
			return
		}
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
			writeJSON(w, map[string]any{"ok": false, "error": "Modellname fehlt"})
			return
		}
		if err := o.startPull(strings.TrimSpace(req.Name)); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "started": true})
	})
	mux.HandleFunc("/api/ollama/pull/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET required", 405)
			return
		}
		writeJSON(w, o.pull.snapshot())
	})
	mux.HandleFunc("/api/ollama/delete", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOriginLaunch(r) {
			http.Error(w, "Aufruf nicht erlaubt", 403)
			return
		}
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
			writeJSON(w, map[string]any{"ok": false, "error": "Modellname fehlt"})
			return
		}
		if err := ollamaDeleteModel(strings.TrimSpace(req.Name)); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	})
	mux.HandleFunc("/api/ollama/chat", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOriginLaunch(r) {
			http.Error(w, "Aufruf nicht erlaubt", 403)
			return
		}
		var req struct {
			Model   string `json:"model"`
			Message string `json:"message"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32*1024)).Decode(&req); err != nil || strings.TrimSpace(req.Message) == "" || strings.TrimSpace(req.Model) == "" {
			writeJSON(w, map[string]any{"ok": false, "error": "Modell oder Nachricht fehlt"})
			return
		}
		reply, err := ollamaChat(strings.TrimSpace(req.Model), req.Message)
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "reply": reply})
	})
}
