//go:build windows

package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNRWLocalRequest(t *testing.T) {
	const address = "127.0.0.1:8765"
	req := func(host, origin string) bool {
		r := httptest.NewRequest("GET", "http://"+host+"/api/nrw3d/osm/discover", nil)
		r.Host = host
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		return nrwLocalRequest(r, address)
	}
	if !req(address, "") {
		t.Error("same-origin GET ohne Origin-Header muss erlaubt sein")
	}
	if !req("localhost:8765", "http://localhost:8765") {
		t.Error("localhost mit passendem Origin muss erlaubt sein")
	}
	if req("evil.example:8765", "") {
		t.Error("fremder Host muss abgelehnt werden (DNS-Rebinding)")
	}
	if req(address, "http://evil.example") {
		t.Error("fremder Origin muss abgelehnt werden")
	}
}

func TestNRWOSMSniff(t *testing.T) {
	dir := t.TempDir()
	write := func(name, content string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
		return p
	}
	fc := write("ok.geojson", `{"type":"FeatureCollection","features":[]}`)
	if !nrwOSMSniff(fc) {
		t.Error("FeatureCollection nicht erkannt")
	}
	cfg := write("config.json", `{"root":"D:\\NRW Datagrabber"}`)
	if nrwOSMSniff(cfg) {
		t.Error("Konfigurationsdatei fälschlich als GeoJSON erkannt")
	}
	if nrwOSMSniff(filepath.Join(dir, "missing.geojson")) {
		t.Error("fehlende Datei fälschlich erkannt")
	}
}

func TestNRWOSMAllowlist(t *testing.T) {
	c := &nrwCatalog{osmAllowed: map[string]int64{`i:\daten\a.geojson`: 10}}
	c.mu.Lock()
	_, ok := c.osmAllowed[`i:\daten\a.geojson`]
	_, bad := c.osmAllowed[`i:\daten\b.geojson`]
	c.mu.Unlock()
	if !ok || bad {
		t.Error("Whitelist-Verhalten unerwartet")
	}
}

// Preprocessed whole-NRW OSM tiles (tools/osmtiles output) must be
// auto-discovered next to the data root and served by coordinate.
func TestNRWOSMTileDiscoveryAndServing(t *testing.T) {
	root := t.TempDir()
	tilesDir := filepath.Join(root, "osm_tiles")
	if err := os.MkdirAll(tilesDir, 0755); err != nil {
		t.Fatal(err)
	}
	tileBody := `{"x":355,"y":5628,"roads":[{"a":[355107.6,5628503.5],"b":[355253.1,5628575.9],"width":5}]}`
	if err := os.WriteFile(filepath.Join(tilesDir, "osm_355_5628.json"), []byte(tileBody), 0644); err != nil {
		t.Fatal(err)
	}
	index := `{"source":"nordrhein-westfalen-latest.osm.pbf","tiles":[{"x":355,"y":5628,"roads":1,"waterways":0,"waters":0}]}`
	if err := os.WriteFile(filepath.Join(tilesDir, "index.json"), []byte(index), 0644); err != nil {
		t.Fatal(err)
	}

	c := newNRWCatalogForTest(t, root)
	if c.OSMTileSource != "nordrhein-westfalen-latest.osm.pbf" {
		t.Errorf("osm tile source = %q, want nordrhein-westfalen-latest.osm.pbf", c.OSMTileSource)
	}
	if !c.osmTileSet[[2]int{355, 5628}] {
		t.Error("Kachel 355/5628 nicht im Index gefunden")
	}

	mux := http.NewServeMux()
	const address = "127.0.0.1:0"
	c.routes(mux, address)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/nrw3d/osm/tile?x=355&y=5628", nil))
	if rec.Code != 200 {
		t.Fatalf("erwartete Kachel: status %d, body %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != tileBody {
		t.Errorf("Kachelinhalt weicht ab: %s", rec.Body.String())
	}

	rec2 := httptest.NewRecorder()
	mux.ServeHTTP(rec2, httptest.NewRequest("GET", "/api/nrw3d/osm/tile?x=999&y=999", nil))
	if rec2.Code != 404 {
		t.Errorf("nicht indizierte Kachel: status %d, erwartet 404", rec2.Code)
	}

	rec3 := httptest.NewRecorder()
	mux.ServeHTTP(rec3, httptest.NewRequest("GET", "/api/nrw3d/status", nil))
	if rec3.Code != 200 || !strings.Contains(rec3.Body.String(), `"osm_tiles":[{"x":355,"y":5628}]`) {
		t.Errorf("Status enthält Kachelliste nicht: %s", rec3.Body.String())
	}
}

// newNRWCatalogForTest scans root the same way the server does at startup,
// without touching the real executable-relative nrw3d.json config file.
func newNRWCatalogForTest(t *testing.T, root string) *nrwCatalog {
	t.Helper()
	c := &nrwCatalog{}
	if err := c.scan(root); err != nil {
		t.Fatalf("scan(%q): %v", root, err)
	}
	return c
}
