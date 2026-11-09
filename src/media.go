//go:build windows

package main

// Media is a read-only view of the actual I:\Media folders.
// No copying, indexing on disk, rename or source-file modification.
import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type mediaService struct {
	mu     sync.RWMutex
	root   string
	appDir string
}
type mediaConfig struct {
	Root string `json:"root"`
}

var mediaSections = []string{"3DPrint", "Bilder", "Bücher", "Filme", "MP3", "Programme", "Videos", "Spiele"}

// Prefer the real root-level Media directory shown on ARK 0. On other drive
// letters prefer the Media directory next to ARK, without moving any files.
// An explicit, existing media.json root always takes priority.
func newMedia() *mediaService {
	dir := rzAppDir()
	resource := rzMediaCurrent()
	// A missing/ambiguous root is deliberately empty; never route to I:.
	return &mediaService{root: resource.Path, appDir: dir}
}
func (m *mediaService) rootPath() string { m.mu.RLock(); defer m.mu.RUnlock(); return m.root }
func (m *mediaService) rootStatus() map[string]any {
	root := m.rootPath()
	f, e := os.Stat(root)
	found := []string{}
	if e == nil && f.IsDir() {
		for _, s := range mediaSections {
			if d, de := os.Stat(filepath.Join(root, s)); de == nil && d.IsDir() {
				found = append(found, s)
			}
		}
	}
	return map[string]any{"ready": e == nil && f.IsDir(), "root": root, "sections": found, "expected": mediaSections}
}
func (m *mediaService) safePath(rel string) (string, error) {
	if m.rootPath() == "" {
		return "", errors.New("Media-Root nicht eindeutig erkannt; bitte in Raziel bestaetigen")
	}
	if strings.ContainsRune(rel, 0) || filepath.IsAbs(rel) || filepath.VolumeName(rel) != "" {
		return "", errors.New("Unzulässiger Pfad")
	}
	rel = filepath.Clean(filepath.FromSlash(rel))
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", errors.New("Außerhalb des Media-Verzeichnisses")
	}
	base, e := filepath.EvalSymlinks(m.rootPath())
	if e != nil {
		return "", e
	}
	path, e := filepath.EvalSymlinks(filepath.Join(m.rootPath(), rel))
	if e != nil {
		return "", e
	}
	sub, e := filepath.Rel(base, path)
	if e != nil || sub == ".." || strings.HasPrefix(sub, ".."+string(os.PathSeparator)) {
		return "", errors.New("Außerhalb des Media-Verzeichnisses")
	}
	return path, nil
}
func (m *mediaService) list(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "GET required", 405)
		return
	}
	rel := r.URL.Query().Get("path")
	dir, e := m.safePath(rel)
	if e != nil {
		http.Error(w, e.Error(), 400)
		return
	}
	f, e := os.Stat(dir)
	if e != nil || !f.IsDir() {
		http.Error(w, "Verzeichnis nicht vorhanden", 404)
		return
	}
	items, e := os.ReadDir(dir)
	if e != nil {
		http.Error(w, "Lesefehler", 403)
		return
	}
	type item struct {
		Name string `json:"name"`
		Path string `json:"path"`
		Dir  bool   `json:"dir"`
		Size int64  `json:"size"`
		Ext  string `json:"ext"`
	}
	out := make([]item, 0, len(items))
	for _, ent := range items {
		if ent.Type()&os.ModeSymlink != 0 {
			continue
		}
		child := filepath.Join(dir, ent.Name())
		relative, e := filepath.Rel(m.rootPath(), child)
		if e != nil {
			continue
		}
		if _, e = m.safePath(filepath.ToSlash(relative)); e != nil {
			continue
		}
		info, e := ent.Info()
		if e != nil {
			continue
		}
		out = append(out, item{ent.Name(), filepath.ToSlash(relative), info.IsDir(), info.Size(), strings.ToLower(filepath.Ext(ent.Name()))})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Dir != out[j].Dir {
			return out[i].Dir
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	parent := ""
	if rel != "" {
		parent = filepath.ToSlash(filepath.Dir(filepath.FromSlash(rel)))
		if parent == "." {
			parent = ""
		}
	}
	writeJSON(w, map[string]any{"path": rel, "parent": parent, "entries": out})
}

// Search only filenames and relative paths on demand. Explicit resource limits
// avoid scanning an entire 5 TB drive on each keystroke. No persistent index.
func (m *mediaService) search(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "GET required", 405)
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(q)) < 2 || len(q) > 120 {
		http.Error(w, "Suchbegriff muss 2 bis 120 Zeichen lang sein", 400)
		return
	}
	root, e := filepath.EvalSymlinks(m.rootPath())
	if e != nil {
		writeJSON(w, map[string]any{"ready": false, "entries": []any{}})
		return
	}
	q = strings.ToLower(q)
	type hit struct {
		Name    string `json:"name"`
		Path    string `json:"path"`
		Section string `json:"section"`
		Dir     bool   `json:"dir"`
		Size    int64  `json:"size"`
		Ext     string `json:"ext"`
	}
	hits := make([]hit, 0, 35)
	scanned := 0
	limited := false
	// Scan sections in the user-given order; preserve original directory tree.
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()
	const maxEntries = 150000
	var visit func(string, string, string)
	visit = func(dir, rel, section string) {
		if len(hits) >= 35 || scanned >= maxEntries || ctx.Err() != nil {
			limited = true
			return
		}
		ents, e := os.ReadDir(dir)
		if e != nil {
			return
		}
		for _, ent := range ents {
			if scanned >= maxEntries || len(hits) >= 35 || ctx.Err() != nil {
				limited = true
				return
			}
			scanned++
			if ent.Type()&os.ModeSymlink != 0 {
				continue
			}
			pathRel := filepath.Join(rel, ent.Name())
			isDir := ent.IsDir()
			name := strings.ToLower(ent.Name())
			// File names and folder names only, not hidden content.
			if strings.Contains(name, q) {
				info, e := ent.Info()
				if e == nil {
					hits = append(hits, hit{ent.Name(), filepath.ToSlash(pathRel), section, isDir, info.Size(), strings.ToLower(filepath.Ext(ent.Name()))})
				}
			}
			if isDir {
				// NTFS junctions can look like directories; never traverse reparse points.
				if ent.Type()&os.ModeIrregular != 0 {
					continue
				}
				child := filepath.Join(dir, ent.Name())
				canonical, e := filepath.EvalSymlinks(child)
				if e != nil {
					continue
				}
				within, e := filepath.Rel(root, canonical)
				if e != nil || within == ".." || strings.HasPrefix(within, ".."+string(os.PathSeparator)) {
					continue
				}
				visit(child, pathRel, section)
			}
		}
	}
	for _, section := range mediaSections {
		base := filepath.Join(root, section)
		info, e := os.Stat(base)
		if e != nil || !info.IsDir() {
			continue
		}
		visit(base, section, section)
		if limited {
			break
		}
	}
	writeJSON(w, map[string]any{"ready": true, "entries": hits, "scanned": scanned, "partial": limited})
}

// music returns a bounded, read-only catalogue of the existing MP3 folder.
// Filenames and paths only: no media is modified and no index is persisted.
func (m *mediaService) music(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "GET required", http.StatusMethodNotAllowed)
		return
	}
	root, err := m.safePath("MP3")
	if err != nil {
		writeJSON(w, map[string]any{"ready": false, "tracks": []any{}, "reason": "MP3-Ordner nicht vorhanden"})
		return
	}
	st, err := os.Stat(root)
	if err != nil || !st.IsDir() {
		writeJSON(w, map[string]any{"ready": false, "tracks": []any{}})
		return
	}
	type track struct {
		Name   string `json:"name"`
		Path   string `json:"path"`
		Folder string `json:"folder"`
		Ext    string `json:"ext"`
		Size   int64  `json:"size"`
	}
	out := make([]track, 0, 256)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	const maxEntries, maxTracks, maxDepth = 100000, 5000, 12
	scanned := 0
	limited := false
	allowed := map[string]bool{".mp3": true, ".wav": true, ".ogg": true, ".flac": true, ".m4a": true}
	var walk func(string, string, int)
	walk = func(dir, rel string, depth int) {
		if depth > maxDepth || len(out) >= maxTracks || scanned >= maxEntries || ctx.Err() != nil {
			limited = true
			return
		}
		entries, e := os.ReadDir(dir)
		if e != nil {
			return
		}
		for _, ent := range entries {
			if len(out) >= maxTracks || scanned >= maxEntries || ctx.Err() != nil {
				limited = true
				return
			}
			scanned++
			// Never cross into symlinks, NTFS junctions or reparse points.
			if ent.Type()&os.ModeSymlink != 0 || ent.Type()&os.ModeIrregular != 0 {
				continue
			}
			childRel := filepath.ToSlash(filepath.Join(rel, ent.Name()))
			child, e := m.safePath(childRel)
			if e != nil {
				continue
			}
			if ent.IsDir() {
				walk(child, childRel, depth+1)
				continue
			}
			ext := strings.ToLower(filepath.Ext(ent.Name()))
			if !allowed[ext] {
				continue
			}
			info, e := ent.Info()
			if e != nil || !info.Mode().IsRegular() {
				continue
			}
			out = append(out, track{Name: ent.Name(), Path: childRel, Folder: filepath.ToSlash(filepath.Dir(childRel)), Ext: ext, Size: info.Size()})
		}
	}
	walk(root, "MP3", 0)
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Path) < strings.ToLower(out[j].Path) })
	writeJSON(w, map[string]any{"ready": true, "tracks": out, "scanned": scanned, "partial": limited})
}

func (m *mediaService) file(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "GET required", 405)
		return
	}
	rel := r.URL.Query().Get("path")
	if rel == "" {
		http.Error(w, "Dateipfad fehlt", 400)
		return
	}
	path, e := m.safePath(rel)
	if e != nil {
		http.Error(w, e.Error(), 400)
		return
	}
	f, e := os.Open(path)
	if e != nil {
		http.Error(w, "Datei nicht lesbar", 404)
		return
	}
	defer f.Close()
	st, e := f.Stat()
	if e != nil || st.IsDir() {
		http.Error(w, "Keine Datei", 400)
		return
	}
	ext := strings.ToLower(filepath.Ext(path))
	safe := map[string]string{".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".csv": "text/plain; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".flac": "audio/flac", ".m4a": "audio/mp4", ".mp4": "video/mp4", ".webm": "video/webm"}
	typ, inline := safe[ext]
	if !inline {
		typ = mime.TypeByExtension(ext)
		if typ == "" {
			typ = "application/octet-stream"
		}
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename*=UTF-8''%s", urlEscapeFile(st.Name())))
	}
	w.Header().Set("Content-Type", typ)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; script-src 'none'; connect-src 'none'; form-action 'none'")
	http.ServeContent(w, r, st.Name(), st.ModTime(), f)
}
func (m *mediaService) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/media/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("Origin") != "" && !strings.HasPrefix(r.Header.Get("Origin"), "http://127.0.0.1:") {
			http.Error(w, "forbidden", 403)
			return
		}
		var c mediaConfig
		if e := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&c); e != nil {
			http.Error(w, "Invalid JSON", 400)
			return
		}
		root := strings.Trim(strings.TrimSpace(c.Root), "\"")
		if !filepath.IsAbs(root) {
			http.Error(w, "Vollständigen Pfad angeben", 400)
			return
		}
		root = filepath.Clean(root)
		info, e := os.Stat(root)
		if e != nil || !info.IsDir() {
			http.Error(w, "Ordner nicht gefunden", 400)
			return
		}
		cfg, e := json.MarshalIndent(mediaConfig{Root: root}, "", "  ")
		if e != nil {
			http.Error(w, e.Error(), 500)
			return
		}
		if e = os.WriteFile(filepath.Join(m.appDir, "media.json"), append(cfg, '\n'), 0600); e != nil {
			http.Error(w, e.Error(), 500)
			return
		}
		m.mu.Lock()
		m.root = root
		m.mu.Unlock()
		writeJSON(w, m.rootStatus())
	})
	mux.HandleFunc("/api/media/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		writeJSON(w, m.rootStatus())
	})
	mux.HandleFunc("/api/media/music", m.music)
	mux.HandleFunc("/api/media/list", m.list)
	mux.HandleFunc("/api/media/search", m.search)
	mux.HandleFunc("/api/media/file", m.file)
	m.epubRoutes(mux)
}
