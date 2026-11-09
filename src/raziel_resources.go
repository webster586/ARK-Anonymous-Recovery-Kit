//go:build windows

package main

// Raziel V0.4.1 LAB: read-only, bounded, drive-letter-independent location discovery.
// It never writes source disks and refuses ambiguous roots instead of silently
// binding the wrong media collection. The installer never touches production.
import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"unsafe"
)

type rzResource struct {
	Kind       string   `json:"kind"`
	Path       string   `json:"path,omitempty"`
	Candidates []string `json:"candidates,omitempty"`
	State      string   `json:"state"`
	Source     string   `json:"source,omitempty"`
}

func rzFile(p string) bool { f, e := os.Stat(p); return e == nil && !f.IsDir() }
func rzDir(p string) bool  { f, e := os.Stat(p); return e == nil && f.IsDir() }
func rzAppDir() string {
	p, e := os.Executable()
	if e != nil {
		return "."
	}
	return filepath.Dir(p)
}
func rzAddUnique(xs []string, p string) []string {
	p = filepath.Clean(p)
	for _, v := range xs {
		if strings.EqualFold(p, v) {
			return xs
		}
	}
	return append(xs, p)
}
func rzMediaSignature(p string) bool {
	if !rzDir(p) {
		return false
	}
	for _, n := range []string{"Geodaten", "Wikipedia", "Wikibooks", "MP3", "Filme", "Bücher", "Videos", "AI", "Bilder", "3DPrint", "Spiele"} {
		if rzDir(filepath.Join(p, n)) {
			return true
		}
	}
	return false
}
func rzDriveRoots() []string {
	roots := []string{}
	// All mounted drive letters, not a hand-coded C..K subset.
	for c := 'A'; c <= 'Z'; c++ {
		p := string(c) + ":\\"
		if rzDir(p) {
			roots = append(roots, p)
		}
	}
	return roots
}
func rzCandidateRoots(app string) []string {
	app = filepath.Clean(app)
	roots := []string{}
	// Version folders, parent root and sibling media are supported.
	for p, depth := app, 0; depth < 4; depth++ {
		roots = rzAddUnique(roots, filepath.Join(p, "Media"))
		roots = rzAddUnique(roots, p)
		parent := filepath.Dir(p)
		if parent == p {
			break
		}
		p = parent
	}
	for _, vol := range rzDriveRoots() {
		roots = rzAddUnique(roots, filepath.Join(vol, "Media"))
		// Old layout used Media on the root of the storage volume.
		roots = rzAddUnique(roots, vol)
	}
	return roots
}
func rzMediaRoots(app string) []string {
	xs := []string{}
	for _, p := range rzCandidateRoots(app) {
		if rzMediaSignature(p) {
			xs = rzAddUnique(xs, p)
		}
	}
	return xs
}

// Windows volume serial is stable across drive-letter changes.
func rzVolumeSerial(path string) (string, bool) {
	vol := filepath.VolumeName(filepath.Clean(path))
	if len(vol) != 2 || vol[1] != ':' {
		return "", false
	}
	root := vol + `\`
	dll := syscall.NewLazyDLL("kernel32.dll")
	proc := dll.NewProc("GetVolumeInformationW")
	ptr, e := syscall.UTF16PtrFromString(root)
	if e != nil {
		return "", false
	}
	var serial uint32
	ret, _, _ := proc.Call(uintptr(unsafe.Pointer(ptr)), 0, 0, uintptr(unsafe.Pointer(&serial)), 0, 0, 0, 0)
	if ret == 0 {
		return "", false
	}
	return fmt.Sprintf("%08X", serial), true
}

// Persist a user-approved volume fingerprint + relative location, never a fixed drive letter.
type rzBinding struct {
	VolumeSerial string `json:"volume_serial"`
	Relative     string `json:"relative"`
	LastPath     string `json:"last_path,omitempty"`
}

func rzBindFile(app string) string { return filepath.Join(app, "raziel_bindings.json") }
func rzReadBinding(app string) rzBinding {
	var b rzBinding
	raw, e := os.ReadFile(rzBindFile(app))
	if e == nil {
		_ = json.Unmarshal(raw, &b)
	}
	return b
}
func rzIsContained(root, p string) bool {
	rel, e := filepath.Rel(root, p)
	return e == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}
func rzFindBoundMedia(app string) string {
	b := rzReadBinding(app)
	if b.VolumeSerial == "" || filepath.IsAbs(b.Relative) || strings.ContainsRune(b.Relative, 0) || b.Relative == ".." || strings.HasPrefix(filepath.Clean(b.Relative), ".."+string(filepath.Separator)) {
		return ""
	}
	found := []string{}
	for _, drive := range rzDriveRoots() {
		serial, ok := rzVolumeSerial(drive)
		if !ok || !strings.EqualFold(serial, b.VolumeSerial) {
			continue
		}
		candidate := filepath.Join(drive, b.Relative)
		if rzMediaSignature(candidate) && rzIsContained(drive, candidate) {
			found = rzAddUnique(found, candidate)
		}
	}
	if len(found) == 1 {
		return found[0]
	}
	return ""
}
func rzChooseMedia(app, configured string) rzResource {
	r := rzResource{Kind: "media", State: "missing"}
	// A previously confirmed volume binding survives drive-letter changes.
	if bound := rzFindBoundMedia(app); bound != "" {
		r.Path = bound
		r.State = "ready"
		r.Source = "confirmed-volume-binding"
		return r
	}
	// Legacy config accepted only if it has a valid media signature; explicit confirmation preferred.
	if configured != "" && rzMediaSignature(configured) {
		r.Path = filepath.Clean(configured)
		r.State = "ready"
		r.Source = "user-config"
		return r
	}
	candidates := rzMediaRoots(app)
	if len(candidates) == 0 {
		return r
	}
	// Prefer a single matching Media directory; if more than one exists,
	// the administrator needs to select one explicitly.
	r.Candidates = candidates
	if len(candidates) > 1 {
		r.State = "ambiguous"
		return r
	}
	r.Path = candidates[0]
	r.State = "ready"
	r.Source = "auto-discovery"
	return r
}
func rzMediaConfig(app string) string {
	raw, e := os.ReadFile(filepath.Join(app, "media.json"))
	if e != nil {
		return ""
	}
	var c struct {
		Root string `json:"root"`
	}
	if json.Unmarshal(raw, &c) != nil {
		return ""
	}
	return c.Root
}
func rzMediaCurrent() rzResource { app := rzAppDir(); return rzChooseMedia(app, rzMediaConfig(app)) }
func rzResourceLocations(parts ...string) []string {
	app := rzAppDir()
	roots := []string{}
	media := rzMediaCurrent()
	if media.State == "ready" {
		roots = append(roots, media.Path)
	} else {
		// Read-only discovery; do not select ambiguous candidate automatically.
		if media.State == "ambiguous" {
			return nil
		}
	}
	roots = append(roots, app, filepath.Dir(app))
	found := []string{}
	for _, r := range roots {
		p := filepath.Join(append([]string{r}, parts...)...)
		if rzDir(p) || rzFile(p) {
			found = rzAddUnique(found, p)
		}
	}
	return found
}
func rzResourceDirs(parts ...string) []string {
	found := []string{}
	for _, root := range rzMediaRoots(rzAppDir()) {
		p := filepath.Join(append([]string{root}, parts...)...)
		if rzDir(p) {
			found = rzAddUnique(found, p)
		}
	}
	return found
}

// Independently locate resource directories, even when Media roots are ambiguous.
func rzResourceCandidates(kind string) []string {
	found := []string{}
	roots := rzMediaRoots(rzAppDir())
	// Include app-local resources for self-contained distributions.
	roots = rzAddUnique(roots, rzAppDir())
	roots = rzAddUnique(roots, filepath.Dir(rzAppDir()))
	var relative [][]string
	switch kind {
	case "pmtiles_osm":
		relative = [][]string{{"Geodaten", "NRW Datagrabber", "pmtiles"}, {"Geodaten", "pmtiles"}, {"pmtiles"}}
	case "nrw3d":
		relative = [][]string{{"Geodaten", "NRW Datagrabber"}}
	case "natural_earth":
		relative = [][]string{{"Geodaten", "Natural Earth", "packages", "natural_earth_vector.gpkg"}}
	case "wikipedia":
		relative = [][]string{{"Wikipedia"}}
	case "wikibooks":
		relative = [][]string{{"Wikibooks"}}
	case "ollama_models":
		relative = [][]string{{"AI", "Ollama"}}
	}
	for _, root := range roots {
		for _, parts := range relative {
			p := filepath.Join(append([]string{root}, parts...)...)
			if kind == "pmtiles_osm" {
				if !rzDir(p) {
					continue
				}
				entries, e := os.ReadDir(p)
				if e != nil {
					continue
				}
				for _, entry := range entries {
					if !entry.IsDir() && strings.EqualFold(filepath.Ext(entry.Name()), ".pmtiles") {
						found = rzAddUnique(found, filepath.Join(p, entry.Name()))
					}
				}
			} else if rzDir(p) || rzFile(p) {
				found = rzAddUnique(found, p)
			}
		}
	}
	sort.Strings(found)
	return found
}
func rzResourceStatus() []rzResource {
	app := rzAppDir()
	m := rzMediaCurrent()
	results := []rzResource{m}
	for _, kind := range []string{"pmtiles_osm", "nrw3d", "natural_earth", "wikipedia", "wikibooks", "ollama_models"} {
		rr := rzResource{Kind: kind, State: "missing"}
		candidates := rzResourceCandidates(kind)
		rr.Candidates = candidates
		switch len(candidates) {
		case 0:
		case 1:
			rr.Path = candidates[0]
			rr.State = "ready"
			rr.Source = "content-discovery"
		default:
			rr.State = "needs-confirmation"
		}
		results = append(results, rr)
	}
	for _, v := range []struct {
		kind  string
		parts []string
	}{
		{"ffmpeg", []string{"tools", "ffmpeg.exe"}},
		{"ffprobe", []string{"tools", "ffprobe.exe"}},
		{"argos_python", []string{"tools", "argos", ".venv", "Scripts", "python.exe"}},
		{"argos_worker", []string{"tools", "argos", "ark_argos_worker.py"}},
		{"argos_models", []string{"tools", "argos", "models"}},
	} {
		rr := rzResource{Kind: v.kind, State: "missing"}
		for _, p := range []string{app, filepath.Dir(app)} {
			full := filepath.Join(append([]string{p}, v.parts...)...)
			if rzFile(full) || rzDir(full) {
				rr.Path = full
				rr.State = "present-unverified"
				rr.Source = "ark-local"
				break
			}
		}
		results = append(results, rr)
	}
	return results
}
func rzRegisterV4(mux *http.ServeMux) {
	mux.HandleFunc("/api/raziel/v4/resources", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET only", 405)
			return
		}
		// Listen on the existing loopback-only local controller.
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(map[string]any{"version": "0.4.1-lab", "read_only": true, "resources": rzResourceStatus()})
	})
}
func rzStableCandidates(paths []string) []string { sort.Strings(paths); return paths }

// Existing absolute paths remain accepted when they belong to the detected
// ARK installation or selected media root. A stale foreign-drive mapping is
// not trusted just because its original drive letter is still mounted.
func rzConfigurationLocationAllowed(p string) bool {
	if !filepath.IsAbs(p) {
		return false
	}
	m := rzMediaCurrent()
	if m.State != "ready" {
		return m.State == "missing"
	} // ambiguous != permission
	roots := []string{m.Path, rzAppDir(), filepath.Dir(rzAppDir())}
	path, err := filepath.Abs(p)
	if err != nil {
		return false
	}
	for _, root := range roots {
		rel, err := filepath.Rel(root, path)
		if err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel) {
			return true
		}
	}
	return false
}
