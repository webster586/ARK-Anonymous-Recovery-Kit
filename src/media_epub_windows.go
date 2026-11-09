//go:build windows

package main

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func (m *mediaService) epubOpen(rel string) (*epubBook, error) {
	if strings.ToLower(filepath.Ext(rel)) != ".epub" {
		return nil, errors.New("Keine EPUB-Datei")
	}
	p, e := m.safePath(rel)
	if e != nil {
		return nil, e
	}
	f, e := os.Open(p)
	if e != nil {
		return nil, e
	}
	defer f.Close()
	st, e := f.Stat()
	if e != nil {
		return nil, e
	}
	if !st.Mode().IsRegular() || st.Size() < 100 || st.Size() > 512<<20 {
		return nil, errors.New("EPUB-Dateigröße nicht unterstützt")
	}
	zr, e := zip.NewReader(f, st.Size())
	if e != nil {
		return nil, e
	}
	return epubLoad(zr.File)
}
func (m *mediaService) epubRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/media/epub/info", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		b, e := m.epubOpen(r.URL.Query().Get("path"))
		if e != nil {
			http.Error(w, e.Error(), 422)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, b)
	})
	mux.HandleFunc("/api/media/epub/chapter", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		rel := r.URL.Query().Get("path")
		n, e := strconv.Atoi(r.URL.Query().Get("chapter"))
		if e != nil {
			http.Error(w, "Kapitelnummer fehlt", 400)
			return
		}
		b, e := m.epubOpen(rel)
		if e != nil {
			http.Error(w, e.Error(), 422)
			return
		}
		doc, e := b.renderChapter(n, rel)
		if e != nil {
			http.Error(w, e.Error(), 422)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "sandbox allow-same-origin; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'")
		size, _ := strconv.Atoi(r.URL.Query().Get("size"))
		if size < 13 || size > 36 {
			size = 19
		}
		doc = strings.Replace(doc, "</head>", fmt.Sprintf("<style>html{--book-size:%dpx}</style></head>", size), 1)
		io.WriteString(w, doc)
	})
	mux.HandleFunc("/api/media/epub/image", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		b, e := m.epubOpen(r.URL.Query().Get("path"))
		if e != nil {
			http.Error(w, "EPUB nicht lesbar", 422)
			return
		}
		name, e := epubSafeEntry(r.URL.Query().Get("entry"))
		if e != nil || !isEpubImage(name) {
			http.Error(w, "Kein zulässiges Bild", 400)
			return
		}
		raw, e := epubRead(b.archive[name], maxEpubImage)
		if e != nil {
			http.Error(w, "Bild nicht verfügbar", 404)
			return
		}
		ct := map[string]string{".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}[strings.ToLower(filepath.Ext(name))]
		w.Header().Set("Content-Type", ct)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "sandbox allow-same-origin; default-src 'none'; script-src 'none'")
		w.Write(raw)
	})
}
