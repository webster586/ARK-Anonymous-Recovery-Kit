//go:build windows

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// Bible is an explicitly read-only folder browser. The existing folder tree is
// authoritative, and no file is copied, renamed, moved or indexed by ARK.
type bibleService struct {
	mu     sync.RWMutex
	root   string
	appDir string
}
type bibleConfig struct {
	Root string `json:"root"`
}

func newBible() *bibleService {
	exe, err := os.Executable()
	if err != nil {
		exe = "."
	}
	dir := filepath.Dir(exe)
	root := filepath.Join(dir, "Bibel")
	if !rzDir(root) {
		if m := rzMediaCurrent(); m.State == "ready" && rzDir(filepath.Join(m.Path, "Bibel")) {
			root = filepath.Join(m.Path, "Bibel")
		}
	}
	if b, err := os.ReadFile(filepath.Join(dir, "bibel.json")); err == nil {
		var c bibleConfig
		if json.Unmarshal(b, &c) == nil && c.Root != "" && rzDir(c.Root) {
			root = c.Root
		}
	}
	return &bibleService{root: root, appDir: dir}
}
func (b *bibleService) rootPath() string { b.mu.RLock(); defer b.mu.RUnlock(); return b.root }
func (b *bibleService) status() map[string]any {
	root := b.rootPath()
	fi, err := os.Stat(root)
	ready := err == nil && fi.IsDir()
	msg := "Ordner bereit – nur Lesen"
	if !ready {
		msg = "Bibel-Ordner nicht gefunden: " + root
	}
	return map[string]any{"ready": ready, "root": root, "default": filepath.Join(b.appDir, "Bibel"), "message": msg}
}
func (b *bibleService) setRoot(value string) error {
	value = strings.Trim(strings.TrimSpace(value), "\"")
	if value == "" {
		value = filepath.Join(b.appDir, "Bibel")
	}
	if !filepath.IsAbs(value) {
		return fmt.Errorf("Bitte vollständigen Ordnerpfad verwenden")
	}
	value = filepath.Clean(value)
	fi, err := os.Stat(value)
	if err != nil {
		return err
	}
	if !fi.IsDir() {
		return fmt.Errorf("Der Pfad ist kein Ordner")
	}
	raw, err := json.MarshalIndent(bibleConfig{Root: value}, "", "  ")
	if err != nil {
		return err
	}
	if err = os.WriteFile(filepath.Join(b.appDir, "bibel.json"), append(raw, '\n'), 0600); err != nil {
		return err
	}
	b.mu.Lock()
	b.root = value
	b.mu.Unlock()
	return nil
}
func (b *bibleService) safePath(rel string) (string, error) {
	root := b.rootPath()
	if rel == "" {
		rel = "."
	}
	rel = filepath.FromSlash(rel)
	if filepath.IsAbs(rel) || filepath.VolumeName(rel) != "" {
		return "", errors.New("Ungültiger relativer Pfad")
	}
	cleaned := filepath.Clean(rel)
	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(os.PathSeparator)) {
		return "", errors.New("Pfad außerhalb des Bibel-Ordners")
	}
	// Resolve junctions/symlinks and refuse external targets.
	canonicalRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", fmt.Errorf("Ordner fehlt: %w", err)
	}
	absolute, err := filepath.EvalSymlinks(filepath.Join(root, cleaned))
	if err != nil {
		return "", err
	}
	r, err := filepath.Rel(canonicalRoot, absolute)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(os.PathSeparator)) {
		return "", errors.New("Pfad außerhalb des Bibel-Ordners")
	}
	return absolute, nil
}
func (b *bibleService) list(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "GET erforderlich", 405)
		return
	}
	rel := r.URL.Query().Get("path")
	full, err := b.safePath(rel)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	fi, err := os.Stat(full)
	if err != nil || !fi.IsDir() {
		http.Error(w, "Ordner nicht gefunden", 404)
		return
	}
	names, err := os.ReadDir(full)
	if err != nil {
		http.Error(w, "Ordner nicht lesbar", 403)
		return
	}
	type entry struct {
		Name string `json:"name"`
		Path string `json:"path"`
		Dir  bool   `json:"dir"`
		Size int64  `json:"size"`
		Kind string `json:"kind"`
	}
	out := make([]entry, 0, len(names))
	for _, item := range names {
		// No symlink/junction traversal outside root.
		path, err := filepath.Rel(b.rootPath(), filepath.Join(full, item.Name()))
		if err != nil {
			continue
		}
		resolved, e := b.safePath(filepath.ToSlash(path))
		if e != nil {
			continue
		}
		info, e := os.Stat(resolved)
		if e != nil {
			continue
		}
		kind := strings.ToLower(filepath.Ext(item.Name()))
		out = append(out, entry{item.Name(), filepath.ToSlash(path), info.IsDir(), info.Size(), kind})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Dir != out[j].Dir {
			return out[i].Dir
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	if rel == "." {
		rel = ""
	}
	parent := ""
	if rel != "" {
		parent = filepath.ToSlash(filepath.Dir(filepath.FromSlash(rel)))
		if parent == "." {
			parent = ""
		}
	}
	writeJSON(w, map[string]any{"path": rel, "parent": parent, "entries": out})
}
func (b *bibleService) file(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "GET erforderlich", 405)
		return
	}
	rel := r.URL.Query().Get("path")
	if rel == "" {
		http.Error(w, "Dateipfad fehlt", 400)
		return
	}
	full, err := b.safePath(rel)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	f, err := os.Open(full)
	if err != nil {
		http.Error(w, "Datei nicht lesbar", 404)
		return
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		http.Error(w, "Keine Datei", 400)
		return
	}
	ext := strings.ToLower(filepath.Ext(full))
	allowed := map[string]string{
		".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".csv": "text/plain; charset=utf-8",
		".pdf": "application/pdf", ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
		".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
		".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".webm": "video/webm",
	}
	mediaType, ok := allowed[ext]
	if !ok {
		mediaType = mime.TypeByExtension(ext)
		if mediaType == "" {
			mediaType = "application/octet-stream"
		}
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", mediaType)
	if !ok {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename*=UTF-8''%s", urlEscapeFile(fi.Name())))
	}
	// Sandboxed HTML: disable scripts, forms and outbound network requests.
	if ext == ".html" || ext == ".htm" {
		w.Header().Set("Content-Security-Policy", "sandbox; default-src 'self' data:; script-src 'none'; connect-src 'none'; form-action 'none'")
	}
	http.ServeContent(w, r, fi.Name(), fi.ModTime(), f)
}
func urlEscapeFile(name string) string { // encode RFC5987 without introducing external dependency
	s := []byte(name)
	var b strings.Builder
	for _, c := range s {
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || strings.ContainsRune("-._~", rune(c)) {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}
func (b *bibleService) routes(mux *http.ServeMux, addr string) {
	mux.HandleFunc("/api/bible/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET erforderlich", 405)
			return
		}
		writeJSON(w, b.status())
	})
	mux.HandleFunc("/api/bible/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, addr) {
			http.Error(w, "forbidden", 403)
			return
		}
		var payload bibleConfig
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&payload); err != nil {
			http.Error(w, "JSON ungültig", 400)
			return
		}
		if err := b.setRoot(payload.Root); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		writeJSON(w, b.status())
	})
	mux.HandleFunc("/api/bible/list", b.list)
	mux.HandleFunc("/api/bible/file", b.file)
}
