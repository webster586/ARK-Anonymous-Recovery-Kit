//go:build windows

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// installScanState is the pollable snapshot of the ARK-0 systemwide deep
// search. It replaces the former per-component "SUCHEN" buttons (one 25s,
// all-drive walk per click) with a single walk that checks every still-
// missing, bindable component's known file/folder name at once.
type installScanState struct {
	State     string              `json:"state"` // idle, running, complete, cancelled
	Message   string              `json:"message"`
	Inspected int                 `json:"inspected"`
	Current   string              `json:"current_path,omitempty"`
	Results   map[string][]string `json:"results"`
	StartedAt string              `json:"started_at,omitempty"`
	EndedAt   string              `json:"ended_at,omitempty"`
}

type installScanManager struct {
	mu     sync.Mutex
	state  installScanState
	cancel context.CancelFunc
}

var installScan = &installScanManager{state: installScanState{State: "idle", Results: map[string][]string{}}}

func (m *installScanManager) snapshot() installScanState {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := m.state
	cp.Results = make(map[string][]string, len(m.state.Results))
	for k, v := range m.state.Results {
		cp.Results[k] = append([]string(nil), v...)
	}
	return cp
}

func (m *installScanManager) start(root string) bool {
	m.mu.Lock()
	if m.state.State == "running" {
		m.mu.Unlock()
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	m.cancel = cancel
	m.state = installScanState{State: "running", Message: "Tiefensuche laeuft ...", Results: map[string][]string{}, StartedAt: time.Now().Format(time.RFC3339)}
	m.mu.Unlock()
	go m.run(ctx, root)
	return true
}

func (m *installScanManager) requestCancel() {
	m.mu.Lock()
	cancel := m.cancel
	m.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

const installScanMaxPerComponent = 8
const installScanMaxInspected = 1200000

// run performs exactly one recursive, read-only walk across all local drives
// and matches every visited entry against the names/suffixes of every
// currently missing component in installManifest(root), instead of the old
// approach of repeating a full-drive walk once per component click.
func (m *installScanManager) run(ctx context.Context, root string) {
	byName := map[string][]string{}
	bySuffix := map[string][]string{}
	for _, c := range installManifest(root) {
		if !c.CanBind || c.Verified {
			continue
		}
		base := strings.ToLower(filepath.Base(c.Path))
		byName[base] = append(byName[base], c.ID)
		if c.ID == "wikipedia" {
			bySuffix[".zim"] = append(bySuffix[".zim"], c.ID)
		}
	}

	finish := func(state, message string) {
		m.mu.Lock()
		m.state.State = state
		m.state.Message = message
		m.state.EndedAt = time.Now().Format(time.RFC3339)
		m.state.Current = ""
		m.mu.Unlock()
	}

	if len(byName) == 0 && len(bySuffix) == 0 {
		finish("complete", "Alle bindbaren Komponenten sind bereits erkannt, keine Suche noetig.")
		return
	}

	drives := []string{}
	for letter := 'A'; letter <= 'Z'; letter++ {
		drive := fmt.Sprintf("%c:\\", letter)
		if info, err := os.Stat(drive); err == nil && info.IsDir() {
			drives = append(drives, drive)
		}
	}

	results := map[string][]string{}
	inspected := 0
	lastReport := time.Now()

	allFound := func() bool {
		for name, ids := range byName {
			_ = name
			for _, id := range ids {
				if len(results[id]) < installScanMaxPerComponent {
					return false
				}
			}
		}
		return true
	}

	report := func(force bool) {
		if !force && time.Since(lastReport) < 400*time.Millisecond {
			return
		}
		lastReport = time.Now()
		m.mu.Lock()
		m.state.Inspected = inspected
		cp := make(map[string][]string, len(results))
		for k, v := range results {
			cp[k] = append([]string(nil), v...)
		}
		m.state.Results = cp
		m.mu.Unlock()
	}

	for _, drive := range drives {
		if ctx.Err() != nil || inspected > installScanMaxInspected || allFound() {
			break
		}
		filepath.WalkDir(drive, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if ctx.Err() != nil {
				return filepath.SkipAll
			}
			inspected++
			if inspected > installScanMaxInspected {
				return filepath.SkipAll
			}
			m.mu.Lock()
			m.state.Current = p
			m.mu.Unlock()
			report(false)
			name := strings.ToLower(d.Name())
			if d.IsDir() {
				if d.Type()&os.ModeSymlink != 0 {
					return filepath.SkipDir
				}
				// Never touch the security fallback, Windows system locations or recovery partitions.
				if strings.HasSuffix(name, "_alt") || name == "windows" || name == "$recycle.bin" || name == "system volume information" || name == "winsxs" || name == "node_modules" || name == "managerbackups" {
					return filepath.SkipDir
				}
				if ids, ok := byName[name]; ok {
					for _, id := range ids {
						if len(results[id]) < installScanMaxPerComponent {
							results[id] = append(results[id], p)
						}
					}
					return filepath.SkipDir
				}
				return nil
			}
			if ids, ok := byName[name]; ok {
				for _, id := range ids {
					if len(results[id]) < installScanMaxPerComponent {
						results[id] = append(results[id], p)
					}
				}
			}
			if ids, ok := bySuffix[strings.ToLower(filepath.Ext(name))]; ok {
				for _, id := range ids {
					if len(results[id]) < installScanMaxPerComponent {
						results[id] = append(results[id], p)
					}
				}
			}
			if allFound() {
				return filepath.SkipAll
			}
			return nil
		})
	}

	for k := range results {
		sort.Strings(results[k])
	}

	found := 0
	for _, v := range results {
		if len(v) > 0 {
			found++
		}
	}
	m.mu.Lock()
	m.state.Inspected = inspected
	m.state.Results = results
	m.mu.Unlock()

	switch {
	case ctx.Err() == context.Canceled:
		finish("cancelled", fmt.Sprintf("Tiefensuche abgebrochen nach %d geprueften Eintraegen, %d Komponenten mit Fund.", inspected, found))
	default:
		finish("complete", fmt.Sprintf("Tiefensuche abgeschlossen: %d Eintraege geprueft, %d Komponenten mit Fund.", inspected, found))
	}
}

// installRegisterScan wires the single systemwide deep search that now backs
// the ARK-0 "ERNEUT PRUEFEN" button, reusing the same safe-walk rules as the
// previous per-component search (loopback-only, same-origin gated).
func installRegisterScan(mux *http.ServeMux, address string, root string) {
	mux.HandleFunc("/api/install/scan/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		if !installScan.start(root) {
			http.Error(w, "Tiefensuche laeuft bereits", 409)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(installScan.snapshot())
	})
	mux.HandleFunc("/api/install/scan/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "method", 405)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(installScan.snapshot())
	})
	mux.HandleFunc("/api/install/scan/cancel", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		installScan.requestCancel()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(installScan.snapshot())
	})
}
