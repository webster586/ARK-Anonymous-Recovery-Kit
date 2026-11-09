//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type installComponent struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Dependency    string `json:"dependency"`
	Path          string `json:"path"`
	Status        string `json:"status"`
	Kind          string `json:"kind"`
	Download      string `json:"download"`
	CanBind       bool   `json:"can_bind"`
	Picker        string `json:"picker"`
	Verified      bool   `json:"verified"`
	SetupEndpoint string `json:"setup_endpoint,omitempty"`
}
type installBindings struct {
	Paths map[string]string `json:"paths"`
}

func installRoot() string { exe, _ := os.Executable(); return filepath.Dir(exe) }
func installFile(root, relative string) bool {
	i, e := os.Stat(filepath.Join(root, relative))
	return e == nil && !i.IsDir()
}
func installDir(root, relative string) bool {
	i, e := os.Stat(filepath.Join(root, relative))
	return e == nil && i.IsDir()
}
func installManifest(root string) []installComponent {
	type spec struct {
		id, name, dep, path, kind, download, setup string
		dir, bind                                  bool
	}
	specs := []spec{
		{id: "controller", name: "ARK Controller", dep: "Windows x64", path: "ARK_Controller_Windows_x64.exe", kind: "core", download: "included"},
		{id: "ui", name: "ARK UI", dep: "Controller", path: "src/ui/index.html", kind: "core", download: "included"},
		{id: "raziel", name: "ARK-01 Raziel", dep: "Controller", path: "src/raziel_v03_scan.go", kind: "module", download: "included"},
		{id: "uriel", name: "ARK-02 Uriel", dep: "Controller", path: "src/ui/js/20-uriel-and-navigation.js", kind: "module", download: "included"},
		{id: "gabriel", name: "ARK-03 Gabriel", dep: "Controller", path: "src/ui/js/10-gabriel-seraph.js", kind: "module", download: "included"},
		{id: "michael", name: "ARK-04 Michael", dep: "Controller", path: "src/ui/js/40-michael-tools.js", kind: "module", download: "included"},
		{id: "noah", name: "ARK-05 Noah", dep: "Controller", path: "src/ui/index.html", kind: "module", download: "concept"},
		{id: "bible", name: "Bibel", dep: "Controller", path: "bibel.json", kind: "resource", download: "included"},
		{id: "python", name: "Python 3.11", dep: "Windows x64", path: "tools/argos/python/python.exe", kind: "runtime", download: "official-python.org"},
		{id: "ffmpeg", name: "FFmpeg", dep: "Windows x64", path: "ffmpeg.exe", kind: "runtime", download: "gyan.dev"},
		{id: "ffprobe", name: "FFprobe", dep: "FFmpeg", path: "ffprobe.exe", kind: "runtime", download: "gyan.dev"},
		{id: "argos_worker", name: "Argos Worker", dep: "Python", path: "tools/argos/ark_argos_worker.py", kind: "runtime", download: "included"},
		{id: "argos_libraries", name: "Argos Bibliotheken", dep: "Python + native Abhaengigkeiten", path: "tools/argos/python/Lib/site-packages/argostranslate", kind: "runtime", download: "unconfigured", dir: true},
		{id: "argos_models", name: "Argos Sprachmodelle", dep: "Argos Bibliotheken", path: "tools/argos/models", kind: "model", download: "approval-required", dir: true, bind: true},
		{id: "mic_capture", name: "Mikrofonaufnahme", dep: "Windows WaveIn / PowerShell", path: "mic_capture.cs", kind: "runtime", download: "included"},
		{id: "whisper", name: "Whisper Modell", dep: "Whisper Runtime", path: "models/ggml-base.bin", kind: "model", download: "approval-required", bind: true, setup: "/api/voice/setup"},
		{id: "kiwix_serve", name: "Kiwix Server", dep: "Kiwix Windows", path: "kiwix-tools/kiwix-serve.exe", kind: "runtime", download: "unconfigured", setup: "/api/kiwix/setup"},
		{id: "kiwix_search", name: "Kiwix Suche", dep: "Kiwix Windows", path: "kiwix-tools/kiwix-search.exe", kind: "runtime", download: "unconfigured", setup: "/api/kiwix/setup"},
		{id: "wikipedia", name: "Wikipedia / ZIM-Archivordner", dep: "Kiwix Server", path: "resources/wikipedia", kind: "data", download: "approval-required", dir: true, bind: true},
		{id: "nrw3d", name: "NRW 3D", dep: "Terrain + LoD2 + OSM", path: "resources/nrw3d", kind: "data", download: "approval-required", dir: true, bind: true},
		{id: "atlas", name: "World Atlas", dep: "Offline Kartendaten", path: "atlas.json", kind: "resource", download: "included"},
		{id: "osm", name: "OSM Karten", dep: "Lokale Kartendaten", path: "src/ui/atlas/osm-fallback.js", kind: "resource", download: "included"},
		{id: "yt_dlp", name: "Media Downloader yt-dlp", dep: "FFmpeg", path: "tools/yt-dlp.exe", kind: "runtime", download: "unconfigured"},
		{id: "origin_standalone", name: "Origin Manager (extern)", dep: "Eigenstaendige Installation", path: "Origin/Origin_Manager.exe", kind: "external", download: "external-only"},
		{id: "ollama", name: "Ollama Runtime", dep: "Lokal bereitgestelltes Ollama", path: "resources/ollama", kind: "runtime", download: "approval-required", dir: true, bind: true, setup: "/api/ollama/setup"},
		{id: "llm", name: "Lokale KI Modelle", dep: "Ollama Runtime", path: "resources/llm", kind: "model", download: "approval-required", dir: true, bind: true},
		{id: "media", name: "Medienarchiv", dep: "Gabriel", path: "resources/media", kind: "data", download: "external-only", dir: true, bind: true},
	}
	bindings := installReadBindings(root)
	out := make([]installComponent, 0, len(specs))
	for _, s := range specs {
		ok := installFile(root, s.path)
		if s.dir {
			ok = installDir(root, s.path)
		}
		if s.id == "ffmpeg" && !ok {
			ok = installFile(root, "ffmpeg.exe")
		}
		if s.id == "ffprobe" && !ok {
			ok = installFile(root, "ffprobe.exe")
		}

		show := s.path
		if value := bindings.Paths[s.id]; value != "" {
			if info, err := os.Stat(value); err == nil && ((info.IsDir() == s.dir && (s.id != "wikipedia" || !info.IsDir() || len(installZIMFiles(value)) > 0)) || (s.id == "wikipedia" && !info.IsDir() && strings.EqualFold(filepath.Ext(value), ".zim"))) {
				ok = true
				show = value
			} else {
				show = value
			}
		}
		status := "Fehlt"
		if ok {
			status = "Datei erkannt"
		}
		if s.download == "concept" {
			status = "Konzept"
		}
		if s.id == "origin_standalone" {
			status = "Extern"
		}
		picker := "file"
		if s.dir {
			picker = "folder"
		}
		// Every component can be manually selected, including runtime tools and external Origin.
		verified := ok
		out = append(out, installComponent{ID: s.id, Name: s.name, Dependency: s.dep, Path: show, Status: status, Kind: s.kind, Download: s.download, CanBind: true, Picker: picker, Verified: verified, SetupEndpoint: s.setup})
	}
	return out
}
func installReadBindings(root string) installBindings {
	b := installBindings{Paths: map[string]string{}}
	raw, err := os.ReadFile(filepath.Join(root, "ARK_STATE", "install_bindings.json"))
	if err == nil {
		json.Unmarshal(raw, &b)
	}
	if b.Paths == nil {
		b.Paths = map[string]string{}
	}
	return b
}
func installRegister(mux *http.ServeMux, address string) {
	root := installRoot()
	mux.HandleFunc("/api/install/components", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "method", 405)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]interface{}{"components": installManifest(root), "checked_at": time.Now().Format(time.RFC3339)})
	})
	// Native dialogs launched from an HTTP server can hang without a foreground window.
	// The in-app explorer is served by this read-only endpoint instead.
	mux.HandleFunc("/api/install/explore", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// GET navigation from ARK's browser normally has no Origin header.
		// Validate the loopback Host and any supplied Origin (DNS-rebinding protection).
		if !nrwLocalRequest(r, address) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		requested := r.URL.Query().Get("path")
		type entry struct {
			Name  string `json:"name"`
			Path  string `json:"path"`
			IsDir bool   `json:"is_dir"`
		}
		response := struct {
			Path      string  `json:"path"`
			Parent    string  `json:"parent"`
			Entries   []entry `json:"entries"`
			Truncated bool    `json:"truncated"`
		}{Entries: []entry{}}
		if requested == "" {
			// Show only mounted and accessible volumes, without any recursive scan.
			for letter := 'A'; letter <= 'Z'; letter++ {
				drive := fmt.Sprintf("%c:\\", letter)
				if info, err := os.Stat(drive); err == nil && info.IsDir() {
					response.Entries = append(response.Entries, entry{Name: drive, Path: drive, IsDir: true})
				}
			}
		} else {
			cleaned := filepath.Clean(requested)
			if !filepath.IsAbs(cleaned) || filepath.VolumeName(cleaned) == "" {
				http.Error(w, "Ungueltiger Pfad", 400)
				return
			}
			// The security fallback must never be browsed, including any nested path.
			for _, part := range strings.Split(strings.ReplaceAll(strings.ToLower(cleaned), "/", "\\"), "\\") {
				if strings.HasSuffix(part, "_alt") || part == "managerbackups" {
					http.Error(w, "Sicherheitsfallback ausgeschlossen", 403)
					return
				}
			}
			inf, err := os.Lstat(cleaned)
			if err != nil || !inf.IsDir() || inf.Mode()&os.ModeSymlink != 0 {
				http.Error(w, "Ordner nicht verfuegbar", 400)
				return
			}
			listing, err := os.ReadDir(cleaned)
			if err != nil {
				http.Error(w, "Ordner nicht lesbar: "+err.Error(), 403)
				return
			}
			response.Path = cleaned
			parent := filepath.Dir(cleaned)
			if parent != cleaned && filepath.VolumeName(parent) != "" {
				response.Parent = parent
			}
			response.Entries = make([]entry, 0, min(len(listing), 1200))
			for _, item := range listing {
				name := strings.ToLower(item.Name())
				if strings.HasSuffix(name, "_alt") || name == "managerbackups" {
					continue
				}
				if item.Type()&os.ModeSymlink != 0 {
					continue
				}
				// Windows reparse points/junctions must not be followed.
				info, err := item.Info()
				if err != nil || info.Mode()&os.ModeSymlink != 0 {
					continue
				}
				response.Entries = append(response.Entries, entry{Name: item.Name(), Path: filepath.Join(cleaned, item.Name()), IsDir: item.IsDir()})
				if len(response.Entries) >= 1200 {
					response.Truncated = true
					break
				}
			}
			sort.SliceStable(response.Entries, func(i, j int) bool {
				if response.Entries[i].IsDir != response.Entries[j].IsDir {
					return response.Entries[i].IsDir
				}
				return strings.ToLower(response.Entries[i].Name) < strings.ToLower(response.Entries[j].Name)
			})
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(response)
	})
	// The former per-component "SUCHEN" search is replaced by a single
	// systemwide deep search shared by all components (see install_scan_windows.go),
	// triggered once from the ARK-0 "ERNEUT PRUEFEN" button instead of one
	// full-drive walk per component click.
	installRegisterScan(mux, address, root)

	mux.HandleFunc("/api/install/bind", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		var payload struct {
			ID   string `json:"id"`
			Path string `json:"path"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&payload) != nil {
			http.Error(w, "json", 400)
			return
		}
		allowed := false
		picker := ""
		expected := ""
		for _, c := range installManifest(root) {
			if c.ID == payload.ID && c.CanBind {
				allowed = true
				picker = c.Picker
				expected = c.Path
				break
			}
		}
		if !allowed {
			http.Error(w, "Komponente nicht bindbar", 400)
			return
		}
		p := filepath.Clean(payload.Path)
		info, err := os.Stat(p)
		if err != nil || !filepath.IsAbs(p) || ((info.IsDir() != (picker == "folder")) && !(payload.ID == "wikipedia" && !info.IsDir() && strings.EqualFold(filepath.Ext(p), ".zim"))) {
			http.Error(w, "Datei bzw. Ordner nicht vorhanden oder falscher Typ", 400)
			return
		}
		// File bindings must match the expected executable/data name, not arbitrary files.
		if payload.ID == "wikipedia" {
			if info.IsDir() && len(installZIMFiles(p)) == 0 {
				http.Error(w, "Im gewaehlten Ordner wurden keine ZIM-Archive gefunden", 400)
				return
			}
			if !info.IsDir() && !strings.EqualFold(filepath.Ext(p), ".zim") {
				http.Error(w, "Wikipedia erwartet einen Ordner mit .zim-Dateien", 400)
				return
			}
		}
		if picker == "file" && payload.ID != "wikipedia" && !strings.EqualFold(filepath.Base(p), filepath.Base(expected)) {
			http.Error(w, "Dateiname passt nicht zur Komponente: "+filepath.Base(expected), 400)
			return
		}
		b := installReadBindings(root)
		b.Paths[payload.ID] = p
		directory := filepath.Join(root, "ARK_STATE")
		if err := os.MkdirAll(directory, 0700); err != nil {
			http.Error(w, "Statusordner", 500)
			return
		}
		bs, _ := json.MarshalIndent(b, "", "  ")
		tmp := filepath.Join(directory, "install_bindings.json.tmp")
		if err := os.WriteFile(tmp, bs, 0600); err != nil {
			http.Error(w, "Statusdatei", 500)
			return
		}
		if err := os.Rename(tmp, filepath.Join(directory, "install_bindings.json")); err != nil {
			http.Error(w, "Statusdatei", 500)
			return
		}
		// Apply the binding to any already-running service right away instead
		// of requiring the user to restart ARK (see installOnBindingChanged).
		if installOnBindingChanged != nil {
			installOnBindingChanged(payload.ID)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
	})
}

// installOnBindingChanged lets other services react immediately when the
// user confirms a new ARK-0 binding through /api/install/bind, instead of
// the change only taking effect after a full ARK restart. main() wires this
// up once the relevant services (wiki, library, ...) exist; until then it is
// nil and bindings still just persist to disk, as before this fix.
var installOnBindingChanged func(id string)
