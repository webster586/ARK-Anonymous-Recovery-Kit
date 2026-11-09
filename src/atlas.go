//go:build windows

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
)

type atlasCatalog struct {
	mu     sync.Mutex
	Path   string       `json:"path"`
	Ready  bool         `json:"ready"`
	Err    string       `json:"error,omitempty"`
	Layers []atlasLayer `json:"layers,omitempty"`
}
type atlasLayer struct {
	Name     string `json:"name"`
	Geometry string `json:"geometry"`
	SRS      int    `json:"srs"`
}
type atlasFeature struct {
	Type       string         `json:"type"`
	Properties map[string]any `json:"properties"`
	Geometry   geoGeometry    `json:"geometry"`
}

func atlasAppDir() string { p, _ := os.Executable(); return filepath.Dir(p) }
func atlasDefaultPaths() []string {
	// A resource can be unambiguous even when the overall Media root is not.
	// Use the same verified candidate list exposed by Raziel V0.4.x.
	paths := append([]string{}, rzResourceCandidates("natural_earth")...)
	dir := atlasAppDir()
	for _, p := range []string{dir, filepath.Dir(dir)} {
		paths = rzAddUnique(paths, filepath.Join(p, "Natural Earth", "packages", "natural_earth_vector.gpkg"))
	}
	return paths
}

func newAtlas() *atlasCatalog {
	a := &atlasCatalog{}
	// Keep explicit user configuration first, but do not let a stale path
	// prevent automatic discovery after drive-letter changes.
	b, e := os.ReadFile(filepath.Join(atlasAppDir(), "atlas.json"))
	if e == nil {
		var c struct {
			Path string `json:"path"`
		}
		if json.Unmarshal(b, &c) == nil && c.Path != "" && rzConfigurationLocationAllowed(c.Path) {
			if a.load(c.Path) == nil {
				return a
			}
		}
	}
	candidates := atlasDefaultPaths()
	if len(rzResourceCandidates("natural_earth")) > 1 {
		a.Err = "Mehrere Natural-Earth-Dateien gefunden; Auswahl erforderlich"
		return a
	}
	for _, p := range candidates {
		if _, e := os.Stat(p); e == nil {
			if err := a.load(p); err == nil {
				return a
			} else {
				a.Err = err.Error()
			}
		}
	}
	if a.Err == "" {
		a.Err = "Natural-Earth-GeoPackage nicht gefunden"
	}
	return a
}

func atlasQuote(s string) string { return `"` + strings.ReplaceAll(s, `"`, `""`) + `"` }
func (a *atlasCatalog) load(path string) error {
	path, err := filepath.Abs(strings.Trim(strings.TrimSpace(path), `"`))
	if err != nil {
		return err
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return errors.New("Datei statt Ordner auswählen")
	}
	if info.Size() < 512 {
		return errors.New("GeoPackage zu klein")
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	header := make([]byte, 16)
	_, err = io.ReadFull(f, header)
	_ = f.Close()
	if err != nil || string(header) != "SQLite format 3\x00" {
		return errors.New("Datei ist keine SQLite/GeoPackage-Datenbank")
	}
	db, err := openAtlasDB(path)
	if err != nil {
		return err
	}
	defer db.Close()
	layers := []atlasLayer{}
	err = db.rows("SELECT table_name,column_name,srs_id FROM gpkg_geometry_columns", 1000, func(row [][]byte) error {
		if len(row) < 3 {
			return nil
		}
		n := string(row[0])
		s, _ := strconv.Atoi(string(row[2]))
		layers = append(layers, atlasLayer{n, string(row[1]), s})
		return nil
	})
	if err != nil {
		return fmt.Errorf("GeoPackage-Geometriedaten: %w", err)
	}
	if len(layers) == 0 {
		return errors.New("GeoPackage enthält keine Vektorebenen")
	}
	sort.Slice(layers, func(i, j int) bool { return layers[i].Name < layers[j].Name })
	a.mu.Lock()
	a.Path = path
	a.Ready = true
	a.Err = ""
	a.Layers = layers
	a.mu.Unlock()
	return nil
}
func (a *atlasCatalog) snapshot() any {
	a.mu.Lock()
	defer a.mu.Unlock()
	return map[string]any{"path": a.Path, "ready": a.Ready, "error": a.Err, "layers": append([]atlasLayer(nil), a.Layers...)}
}
func (a *atlasCatalog) save(path string) error {
	if err := a.load(path); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(map[string]string{"path": a.Path}, "", "  ")
	return os.WriteFile(filepath.Join(atlasAppDir(), "atlas.json"), b, 0600)
}
func (a *atlasCatalog) layer(name string, limit int) (any, error) {
	a.mu.Lock()
	path := a.Path
	var layer atlasLayer
	found := false
	for _, l := range a.Layers {
		if l.Name == name {
			layer = l
			found = true
			break
		}
	}
	a.mu.Unlock()
	if !found {
		return nil, errors.New("Ebene nicht gefunden")
	}
	if layer.SRS != 4326 {
		return nil, fmt.Errorf("Koordinatensystem %d nicht unterstützt, 4326 erforderlich", layer.SRS)
	}
	db, err := openAtlasDB(path)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	columns := []string{}
	err = db.rows("PRAGMA table_info("+atlasQuote(layer.Name)+")", 128, func(row [][]byte) error {
		if len(row) >= 2 {
			columns = append(columns, string(row[1]))
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	chooseColumn := func(candidates ...string) string {
		for _, x := range candidates {
			for _, c := range columns {
				if strings.EqualFold(c, x) {
					return c
				}
			}
		}
		return ""
	}
	labelCol := chooseColumn("name_de", "name", "name_en", "name_long", "admin", "sovereignt", "formal_en", "nameascii", "name_sort")
	placeRank := chooseColumn("scalerank")
	namesql := "''"
	if labelCol != "" {
		namesql = atlasQuote(labelCol)
	}
	orderBy := ""
	if placeRank != "" && strings.Contains(name, "populated_places") {
		orderBy = " ORDER BY " + atlasQuote(placeRank) + " ASC"
	}
	q := fmt.Sprintf("SELECT %s,%s FROM %s%s LIMIT %d", atlasQuote(layer.Geometry), namesql, atlasQuote(layer.Name), orderBy, limit)
	features := make([]atlasFeature, 0, limit)
	skipped := 0
	err = db.rows(q, limit, func(row [][]byte) error {
		if len(row) < 2 || len(row[0]) == 0 {
			return nil
		}
		g, e := decodeGPKG(row[0])
		if e != nil {
			skipped++
			return nil
		}
		name := string(row[1])
		if len(name) > 130 {
			name = name[:130]
		}
		features = append(features, atlasFeature{Type: "Feature", Properties: map[string]any{"name": name}, Geometry: g})
		return nil
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{"type": "FeatureCollection", "features": features, "layer": name, "skipped": skipped, "count": len(features)}, nil
}
func (a *atlasCatalog) routes(mux *http.ServeMux, address string) {
	mux.HandleFunc("/api/atlas/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET only", 405)
			return
		}
		writeJSON(w, a.snapshot())
	})
	mux.HandleFunc("/api/atlas/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		var c struct {
			Path string `json:"path"`
		}
		if json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&c) != nil {
			http.Error(w, "invalid JSON", 400)
			return
		}
		if err := a.save(c.Path); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		writeJSON(w, a.snapshot())
	})
	mux.HandleFunc("/api/atlas/layer", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET only", 405)
			return
		}
		name := r.URL.Query().Get("name")
		if !strings.HasPrefix(name, "ne_") {
			http.Error(w, "Nur Natural-Earth-Ebenen", 400)
			return
		}
		limit := 1200
		if strings.Contains(name, "populated_places") {
			limit = 700
		} else if strings.Contains(name, "rivers") {
			limit = 1800
		} else if strings.Contains(name, "lakes") {
			limit = 1100
		}
		data, err := a.layer(name, limit)
		if err != nil {
			http.Error(w, err.Error(), 422)
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=900")
		writeJSON(w, data)
	})
}
