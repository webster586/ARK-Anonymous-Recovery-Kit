//go:build windows

package main

// ARK Windows EXE bridge. Existing binaries are never copied or modified.
// No assumption is made about the application's internal modules or CLI.
import (
	"log"
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

type localApp struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Filename string `json:"filename"`
	Exists   bool   `json:"exists"`
	Path     string `json:"path"`
	Size     int64  `json:"size_bytes,omitempty"`
	Modified string `json:"modified,omitempty"`
	PEType   string `json:"pe_type,omitempty"`
	ValidPE  bool   `json:"valid_pe"`
	Running  bool   `json:"running"`
	PID      int    `json:"pid,omitempty"`
}

type trackedApp struct {
	pid int
	cmd *exec.Cmd
}

type localApps struct {
	media      *mediaService
	mu         sync.Mutex
	running    map[string]*trackedApp
	lastLaunch map[string]time.Time
}

func newLocalApps(m *mediaService) *localApps {
	return &localApps{media: m, running: make(map[string]*trackedApp), lastLaunch: make(map[string]time.Time)}
}

var permittedApps = []struct{ id, name, filename string }{
	{"localtoolbox", "Local Toolbox V3", "LocalToolbox-v3.exe"},
	{"nfcmanager", "NFC Manager", "NfcManager.exe"},
	{"retroarch", "RetroArch", filepath.Join("RetroArch", "retroarch.exe")},
}

func (a *localApps) get(id string) (localApp, bool) {
	var item localApp
	known := false
	for _, spec := range permittedApps {
		if spec.id == id {
			item = localApp{ID: spec.id, Name: spec.name, Filename: spec.filename}
			known = true
			break
		}
	}
	if !known {
		return item, false
	}
	// Match only exactly the two pre-approved program files, relative to the actual Media root.
	path := filepath.Join(a.media.rootPath(), "Programme", item.Filename)
	item.Path = filepath.Clean(path)
	if st, err := os.Stat(item.Path); err == nil && !st.IsDir() && strings.EqualFold(filepath.Ext(item.Path), ".exe") {
		item.Exists = true
		item.Size = st.Size()
		item.Modified = st.ModTime().Local().Format("2006-01-02 15:04")
		if typ, err := peMachine(item.Path); err == nil {
			item.ValidPE = true
			item.PEType = typ
		}
		// Do not infer product version from executable filename/PE architecture.
	}
	a.mu.Lock()
	if p := a.running[id]; p != nil {
		item.Running = true
		item.PID = p.pid
	}
	a.mu.Unlock()
	return item, true
}

func sameOriginLaunch(r *http.Request) bool {
	if r.Header.Get("X-ARK-Launch") != "1" {
		return false
	}
	if r.Header.Get("Origin") != "" && r.Header.Get("Origin") != "http://"+r.Host {
		return false
	}
	if sf := r.Header.Get("Sec-Fetch-Site"); sf != "" && sf != "same-origin" && sf != "none" {
		return false
	}
	return true
}

var (
	user32                   = syscall.NewLazyDLL("user32.dll")
	enumWindows              = user32.NewProc("EnumWindows")
	getWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
	isWindowVisible          = user32.NewProc("IsWindowVisible")
	setForegroundWindow      = user32.NewProc("SetForegroundWindow")
	showWindowAsync          = user32.NewProc("ShowWindowAsync")
)

// Best-effort foreground focus of a WINDOW BELONGING TO the already running PID.
// Windows foreground restrictions can prevent activation; expose that honestly.
func focusPID(pid int) bool {
	if pid <= 0 {
		return false
	}
	var hwnd uintptr
	callback := syscall.NewCallback(func(win uintptr, _ uintptr) uintptr {
		var owner uint32
		getWindowThreadProcessId.Call(win, uintptr(unsafe.Pointer(&owner)))
		v, _, _ := isWindowVisible.Call(win)
		if int(owner) == pid && v != 0 {
			hwnd = win
			return 0
		}
		return 1
	})
	enumWindows.Call(callback, 0)
	if hwnd == 0 {
		return false
	}
	showWindowAsync.Call(hwnd, 9) // SW_RESTORE
	ok, _, _ := setForegroundWindow.Call(hwnd)
	return ok != 0
}

func (a *localApps) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/apps/list", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET required", 405)
			return
		}
		items := make([]localApp, 0, len(permittedApps))
		for _, spec := range permittedApps {
			item, _ := a.get(spec.id)
			items = append(items, item)
		}
		writeJSON(w, map[string]any{"apps": items, "platform": "windows", "read_only": true, "integration": "external_exe"})
	})
	mux.HandleFunc("/api/apps/launch", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOriginLaunch(r) {
			http.Error(w, "Aufruf nicht erlaubt", 403)
			return
		}
		id := r.URL.Query().Get("id")
		app, ok := a.get(id)
		if !ok {
			http.Error(w, "Unbekanntes Programm", 404)
			return
		}
		if !app.Exists {
			http.Error(w, "Datei nicht gefunden: "+app.Path, 404)
			return
		}
		if !app.ValidPE {
			http.Error(w, "Ungültiges oder nicht unterstütztes Windows-Programm (PE-Header)", 422)
			return
		}
		if app.PEType == "Windows ARM64" {
			http.Error(w, "ARM64-Programm wird auf Windows x64 nicht gestartet", 422)
			return
		}
		a.mu.Lock()
		if proc := a.running[id]; proc != nil {
			pid := proc.pid
			a.mu.Unlock()
			focused := focusPID(pid)
			writeJSON(w, map[string]any{"started": false, "already_running": true, "focused": focused, "id": id, "pid": pid, "name": app.Name})
			return
		}
		if time.Since(a.lastLaunch[id]) < 800*time.Millisecond {
			a.mu.Unlock()
			http.Error(w, "Start läuft bereits", 429)
			return
		}
		cmd := exec.Command(app.Path)
		cmd.Dir = filepath.Dir(app.Path)
		// A direct absolute path and no shell; no arbitrary command injection.
		if err := cmd.Start(); err != nil {
			a.mu.Unlock()
			http.Error(w, "Start fehlgeschlagen: "+err.Error(), 500)
			return
		}
		proc := &trackedApp{pid: cmd.Process.Pid, cmd: cmd}
		a.running[id] = proc
		a.lastLaunch[id] = time.Now()
		a.mu.Unlock()
		go func() {
			err := cmd.Wait()
			if err != nil {
				log.Printf("%s beendet: %v", app.Name, err)
			}
			a.mu.Lock()
			if a.running[id] == proc {
				delete(a.running, id)
			}
			a.mu.Unlock()
		}()
		writeJSON(w, map[string]any{"started": true, "already_running": false, "id": id, "pid": proc.pid, "name": app.Name})
	})
}
