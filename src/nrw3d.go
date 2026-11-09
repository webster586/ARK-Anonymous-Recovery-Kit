//go:build windows

package main

// NRW 3D preview: read-only catalog of the original NRW DataGrabber folder.
// A deliberately bounded GML preview parser is not a replacement for the
// complete Sechtem 3D V1.3.4 triangulation / STL toolchain.
import (
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var nrwDGMName = regexp.MustCompile(`(?i)(?:dgm1|dgm).*?_(\d{3})_(\d{4})(?:_|\.)`)
var nrwTileName = regexp.MustCompile(`(?i)(?:lod2|3d).*?_(\d{3})_(\d{4})(?:_|\.)`)

type nrwFile struct {
	File  string `json:"file"`
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Bytes int64  `json:"bytes"`
}
type nrwCatalog struct {
	mu       sync.Mutex
	Root     string    `json:"root"`
	Files    []nrwFile `json:"tiles"`
	DGMFiles []nrwFile `json:"dgm_tiles"`
	Count    int       `json:"gml_count"`
	DGM      int       `json:"dgm_count"`
	Other    int       `json:"other_count"`
	Err      string    `json:"error,omitempty"`
	// Whitelist of OSM GeoJSON candidates from the last bounded discovery scan.
	// Only these exact paths may be served via /api/nrw3d/osm/file.
	osmAllowed map[string]int64
	// Preprocessed whole-region OSM tiles (roads/waterways/water polygons),
	// produced offline by tools/osmtiles from a Geofabrik .osm.pbf extract.
	// Auto-detected as an "osm_tiles" subfolder of Root; see scanOSMTiles.
	osmTilesDir   string
	osmTileSet    map[[2]int]bool
	OSMTileSource string `json:"osm_tile_source,omitempty"`
}

type nrwOSMFile struct {
	File  string `json:"file"`
	Bytes int64  `json:"bytes"`
}

const nrwOSMMaxBytes = 128 * 1024 * 1024

// Directories that are never useful for local geodata and expensive to walk.
var nrwOSMSkipDirs = map[string]bool{
	"windows": true, "program files": true, "program files (x86)": true,
	"programdata": true, "$recycle.bin": true, "system volume information": true,
	"appdata": true, "node_modules": true, ".git": true, "__pycache__": true,
	"recovery": true, "perflogs": true,
}

// nrwOSMSniff reports whether the file header plausibly is a GeoJSON FeatureCollection.
func nrwOSMSniff(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	head := make([]byte, 2048)
	n, _ := io.ReadFull(f, head)
	s := string(head[:n])
	return strings.Contains(s, `"FeatureCollection"`)
}

// Browsers omit the Origin header on same-origin GET requests, so GET-only
// local endpoints validate the Host header (blocks DNS rebinding) and, when
// an Origin header is present, require it to match as well.
func nrwLocalRequest(r *http.Request, address string) bool {
	port := strings.TrimPrefix(address, "127.0.0.1:")
	if r.Host != address && r.Host != "localhost:"+port {
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" {
		return origin == "http://"+address || origin == "http://localhost:"+port
	}
	return true
}

// scanOSM performs a bounded, read-only walk over local drives looking for
// .geojson/.json FeatureCollections. The configured data drive is searched
// first and the system drive last; depth, per-drive entry count and total
// wall time are capped so discovery stays responsive. Nothing is modified.
func (c *nrwCatalog) scanOSM() ([]nrwOSMFile, bool) {
	const perRootEntries, maxDepth, maxResults = 150000, 7, 50
	deadline := time.Now().Add(20 * time.Second)
	truncated := false
	var out []nrwOSMFile
	c.mu.Lock()
	dataRoot := c.Root
	c.mu.Unlock()
	var roots []string
	seenRoot := map[string]bool{}
	addRoot := func(p string) {
		if p == "" || seenRoot[strings.ToLower(p)] {
			return
		}
		if fi, err := os.Stat(p); err == nil && fi.IsDir() {
			seenRoot[strings.ToLower(p)] = true
			roots = append(roots, p)
		}
	}
	if v := filepath.VolumeName(dataRoot); v != "" {
		addRoot(v + `\`)
	}
	for _, drive := range []string{"D", "E", "F", "G", "H", "I", "J", "K"} {
		addRoot(drive + `:\`)
	}
	addRoot(`C:\`)
	for _, root := range roots {
		entries := 0
		baseDepth := strings.Count(filepath.Clean(root), string(os.PathSeparator))
		_ = filepath.WalkDir(root, func(path string, de os.DirEntry, walkErr error) error {
			if walkErr != nil {
				if de != nil && de.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			entries++
			if entries > perRootEntries || time.Now().After(deadline) || len(out) >= maxResults {
				truncated = true
				return filepath.SkipAll
			}
			if de.IsDir() {
				if nrwOSMSkipDirs[strings.ToLower(de.Name())] {
					return filepath.SkipDir
				}
				if strings.Count(filepath.Clean(path), string(os.PathSeparator))-baseDepth >= maxDepth {
					return filepath.SkipDir
				}
				return nil
			}
			ext := strings.ToLower(filepath.Ext(de.Name()))
			if ext != ".geojson" && ext != ".json" {
				return nil
			}
			fi, e := de.Info()
			if e != nil || fi.Size() < 64 || fi.Size() > nrwOSMMaxBytes {
				return nil
			}
			if !nrwOSMSniff(path) {
				return nil
			}
			out = append(out, nrwOSMFile{File: path, Bytes: fi.Size()})
			return nil
		})
		if time.Now().After(deadline) || len(out) >= maxResults {
			break
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Bytes > out[j].Bytes })
	c.mu.Lock()
	c.osmAllowed = map[string]int64{}
	for _, f := range out {
		c.osmAllowed[strings.ToLower(filepath.Clean(f.File))] = f.Bytes
	}
	c.mu.Unlock()
	return out, truncated
}

// scanOSMTiles looks for a preprocessed "osm_tiles" subfolder next to the
// configured data root (produced offline by tools/osmtiles from a Geofabrik
// .osm.pbf extract) and, if found, loads its small index.json so individual
// tile files can be served by coordinate without a filesystem walk per request.
func (c *nrwCatalog) scanOSMTiles(root string) (dir string, source string, set map[[2]int]bool) {
	dir = filepath.Join(root, "osm_tiles")
	b, err := os.ReadFile(filepath.Join(dir, "index.json"))
	if err != nil {
		return "", "", nil
	}
	var idx struct {
		Source string `json:"source"`
		Tiles  []struct {
			X int `json:"x"`
			Y int `json:"y"`
		} `json:"tiles"`
	}
	if json.Unmarshal(b, &idx) != nil || len(idx.Tiles) == 0 {
		return "", "", nil
	}
	set = make(map[[2]int]bool, len(idx.Tiles))
	for _, t := range idx.Tiles {
		set[[2]int{t.X, t.Y}] = true
	}
	return dir, idx.Source, set
}

type nrwXY struct {
	X int `json:"x"`
	Y int `json:"y"`
}

func (c *nrwCatalog) snapshot() any {
	c.mu.Lock()
	defer c.mu.Unlock()
	osmTiles := make([]nrwXY, 0, len(c.osmTileSet))
	for k := range c.osmTileSet {
		osmTiles = append(osmTiles, nrwXY{X: k[0], Y: k[1]})
	}
	return struct {
		Root       string    `json:"root"`
		Tiles      []nrwFile `json:"tiles"`
		DGMTiles   []nrwFile `json:"dgm_tiles"`
		GML        int       `json:"gml_count"`
		DGM        int       `json:"dgm_count"`
		Other      int       `json:"other_count"`
		Error      string    `json:"error,omitempty"`
		OSMTiles   []nrwXY   `json:"osm_tiles"`
		OSMTileSrc string    `json:"osm_tile_source,omitempty"`
	}{c.Root, append([]nrwFile(nil), c.Files...), append([]nrwFile(nil), c.DGMFiles...), c.Count, c.DGM, c.Other, c.Err, osmTiles, c.OSMTileSource}
}
func newNRW() *nrwCatalog {
	c := &nrwCatalog{}
	base, _ := os.Executable()
	dir := filepath.Dir(base)
    if p:=installSelected("nrw3d",true);p!="" {
        if c.scan(p)==nil {return c}
    }
	b, e := os.ReadFile(filepath.Join(dir, "nrw3d.json"))
	if e == nil {
		var p struct {
			Root string `json:"root"`
		}
		if json.Unmarshal(b, &p) == nil && p.Root != "" {
			if rzConfigurationLocationAllowed(p.Root) && c.scan(p.Root) == nil {
				return c
			}
		}
	}
	// Klassischer Pfad direkt im Laufwerksstamm, oder gesammelt unter
	// Media\Geodaten nach der Root-Aufräumaktion - ohne nrw3d.json zu
	// benötigen. Reihenfolge: aktueller Standardpfad zuerst, danach derselbe
	// Ordnername auf anderen Laufwerksbuchstaben, der alte Pfad (vor der
	// Root-Aufräumaktion) nur als letzter Kompatibilitäts-Fallback.
	fallbacks := []string{}
	for _, p := range rzResourceLocations("Geodaten", "NRW Datagrabber") {
		fallbacks = rzAddUnique(fallbacks, p)
	}
	media := rzMediaCurrent()
	if media.State == "ready" {
		fallbacks = rzAddUnique(fallbacks, filepath.Join(media.Path, "Geodaten", "NRW Datagrabber"))
	}
	fallbacks = rzAddUnique(fallbacks, filepath.Join(dir, "NRW Datagrabber"))
	for _, fallback := range fallbacks {
		if _, err := os.Stat(fallback); err == nil {
			if c.scan(fallback) == nil {
				// Automatisch gefundener Ordner wird NUR für diesen Lauf
				// verwendet und NICHT dauerhaft in nrw3d.json geschrieben -
				// Persistieren geschieht ausschließlich über
				// /api/nrw3d/config, also nach ausdrücklicher Bestätigung
				// des Nutzers in den Einstellungen.
				return c
			}
		}
	}
	return c
}
func (c *nrwCatalog) scan(root string) error {
	root, err := filepath.Abs(strings.TrimSpace(root))
	if err != nil {
		return err
	}
	fi, err := os.Stat(root)
	if err != nil {
		return err
	}
	if !fi.IsDir() {
		return errors.New("kein Ordner")
	}
	var files, dgmFiles []nrwFile
	var gml, dgm, other int
	err = filepath.WalkDir(root, func(path string, de os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if de.IsDir() {
			// Preprocessed OSM tiles are indexed separately via scanOSMTiles
			// and would otherwise add tens of thousands of small JSON files
			// to this walk for a whole-NRW extract.
			if strings.EqualFold(de.Name(), "osm_tiles") {
				return filepath.SkipDir
			}
			return nil
		}
		if len(files)+gml+dgm+other > 250000 {
			return errors.New("Mehr als 250000 Dateien: kleineren Datenordner wählen")
		}
		ext := strings.ToLower(filepath.Ext(de.Name()))
		switch ext {
		case ".gml":
			gml++
		case ".tif", ".tiff":
			dgm++
		default:
			other++
		}
		if ext == ".gml" {
			match := nrwTileName.FindStringSubmatch(de.Name())
			if len(match) == 3 {
				x, _ := strconv.Atoi(match[1])
				y, _ := strconv.Atoi(match[2])
				fi, e := de.Info()
				if e == nil {
					files = append(files, nrwFile{File: path, X: x, Y: y, Bytes: fi.Size()})
				}
			}
		}
		if ext == ".tif" || ext == ".tiff" {
			match := nrwDGMName.FindStringSubmatch(de.Name())
			if len(match) == 3 {
				x, _ := strconv.Atoi(match[1])
				y, _ := strconv.Atoi(match[2])
				fi, e := de.Info()
				if e == nil {
					dgmFiles = append(dgmFiles, nrwFile{File: path, X: x, Y: y, Bytes: fi.Size()})
				}
			}
		}
		return nil
	})
	osmDir, osmSrc, osmSet := c.scanOSMTiles(root)
	c.mu.Lock()
	defer c.mu.Unlock()
	if err != nil {
		c.Err = err.Error()
		return err
	}
	c.Root = root
	c.Files = files
	c.DGMFiles = dgmFiles
	c.Count = gml
	c.DGM = dgm
	c.Other = other
	c.Err = ""
	c.osmTilesDir = osmDir
	c.OSMTileSource = osmSrc
	c.osmTileSet = osmSet
	return nil
}
func (c *nrwCatalog) saveRoot(root string) error {
	if err := c.scan(root); err != nil {
		return err
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	b, _ := json.MarshalIndent(map[string]string{"root": c.Root}, "", "  ")
	return os.WriteFile(filepath.Join(filepath.Dir(exe), "nrw3d.json"), b, 0600)
}
func (c *nrwCatalog) routes(mux *http.ServeMux, address string) {
	// Bounded local directory discovery: inspect known names only, never crawl entire drives.
	mux.HandleFunc("/api/nrw3d/discover", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || !nrwLocalRequest(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		seen := map[string]bool{}
		var paths []string
		appendIfExists := func(path string) {
			if path == "" {
				return
			}
			path = filepath.Clean(path)
			if seen[strings.ToLower(path)] {
				return
			}
			if f, err := os.Stat(path); err == nil && f.IsDir() {
				// Quick format existence check, no recursive disk scan here.
				for _, rel := range []string{"gmlxml/lod2_gml", "lod2_gml", "gmlxml", "dgm1_tiff"} {
					if sub, e := os.Stat(filepath.Join(path, filepath.FromSlash(rel))); e == nil && sub.IsDir() {
						seen[strings.ToLower(path)] = true
						paths = append(paths, path)
						return
					}
				}
			}
		}
		for _, media := range rzMediaRoots(rzAppDir()) {
			for _, folder := range []string{"NRW Datagrabber", "NRW DataGrabber", "NRW-DataGrabber", "NRW", "Geodaten"} {
				appendIfExists(filepath.Join(media, "Geodaten", folder))
				appendIfExists(filepath.Join(media, folder))
			}
		}
		c.mu.Lock()
		root := c.Root
		c.mu.Unlock()
		appendIfExists(root)
		writeJSON(w, map[string]any{"candidates": paths})
	})
	// Bounded drive discovery for OSM GeoJSON; results are offered to the user
	// and only imported after explicit confirmation in the UI.
	mux.HandleFunc("/api/nrw3d/osm/discover", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || !nrwLocalRequest(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		candidates, truncated := c.scanOSM()
		writeJSON(w, map[string]any{"candidates": candidates, "truncated": truncated})
	})
	// Serves exactly one previously discovered candidate file, read-only.
	mux.HandleFunc("/api/nrw3d/osm/file", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || !nrwLocalRequest(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		file := filepath.Clean(strings.TrimSpace(r.URL.Query().Get("file")))
		c.mu.Lock()
		size, ok := c.osmAllowed[strings.ToLower(file)]
		c.mu.Unlock()
		if !ok {
			http.Error(w, "Datei nicht in der letzten Suche gefunden. Erst Suche ausführen.", 404)
			return
		}
		if size > nrwOSMMaxBytes {
			http.Error(w, "GeoJSON überschreitet 128-MB-Limit", 413)
			return
		}
		f, err := os.Open(file)
		if err != nil {
			http.Error(w, err.Error(), 404)
			return
		}
		defer f.Close()
		w.Header().Set("Content-Type", "application/geo+json")
		_, _ = io.Copy(w, io.LimitReader(f, nrwOSMMaxBytes))
	})
	// Serves one preprocessed OSM tile (roads/waterways/water polygons for a
	// single 1km UTM32 tile), already pre-projected and pre-clipped by
	// tools/osmtiles. Read-only passthrough, bounded to known tile coordinates.
	mux.HandleFunc("/api/nrw3d/osm/tile", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		x, e1 := strconv.Atoi(r.URL.Query().Get("x"))
		y, e2 := strconv.Atoi(r.URL.Query().Get("y"))
		if e1 != nil || e2 != nil {
			http.Error(w, "x/y required", 400)
			return
		}
		c.mu.Lock()
		dir := c.osmTilesDir
		ok := c.osmTileSet != nil && c.osmTileSet[[2]int{x, y}]
		c.mu.Unlock()
		if !ok {
			http.Error(w, "keine OSM-Kacheldaten für x/y", 404)
			return
		}
		name := filepath.Join(dir, fmt.Sprintf("osm_%d_%d.json", x, y))
		f, err := os.Open(name)
		if err != nil {
			http.Error(w, err.Error(), 404)
			return
		}
		defer f.Close()
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.Copy(w, io.LimitReader(f, 32*1024*1024))
	})
	mux.HandleFunc("/api/nrw3d/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		writeJSON(w, c.snapshot())
	})
	mux.HandleFunc("/api/nrw3d/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		var p struct {
			Root string `json:"root"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&p); err != nil {
			http.Error(w, "invalid json", 400)
			return
		}
		if err := c.saveRoot(p.Root); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		writeJSON(w, c.snapshot())
	})
	mux.HandleFunc("/api/nrw3d/terrain", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		x, e1 := strconv.Atoi(r.URL.Query().Get("x"))
		y, e2 := strconv.Atoi(r.URL.Query().Get("y"))
		if e1 != nil || e2 != nil {
			http.Error(w, "x/y required", 400)
			return
		}
		c.mu.Lock()
		var file nrwFile
		found := false
		for _, v := range c.DGMFiles {
			if v.X == x && v.Y == y {
				file = v
				found = true
				break
			}
		}
		c.mu.Unlock()
		if !found {
			http.Error(w, "DGM tile missing", 404)
			return
		}
		if file.Bytes > 100*1024*1024 {
			http.Error(w, "DGM tile exceeds safety limit", 413)
			return
		}
		out, e := readNRWTerrain(file.File, x, y)
		if e != nil {
			http.Error(w, e.Error(), 422)
			return
		}
		writeJSON(w, out)
	})
	mux.HandleFunc("/api/nrw3d/tile", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		x, e1 := strconv.Atoi(r.URL.Query().Get("x"))
		y, e2 := strconv.Atoi(r.URL.Query().Get("y"))
		if e1 != nil || e2 != nil {
			http.Error(w, "x/y required", 400)
			return
		}
		c.mu.Lock()
		var file nrwFile
		found := false
		for _, v := range c.Files {
			if v.X == x && v.Y == y {
				file = v
				found = true
				break
			}
		}
		c.mu.Unlock()
		if !found {
			http.Error(w, "tile not found in chosen directory", 404)
			return
		}
		if file.Bytes > 150*1024*1024 {
			http.Error(w, "tile too large for preview", 413)
			return
		}
		mesh, err := readNRWGML(file.File, x, y)
		if err != nil {
			http.Error(w, err.Error(), 422)
			return
		}
		writeJSON(w, mesh)
	})
}

type nrwMesh struct {
	Roof   []float32 `json:"roof"`
	Wall   []float32 `json:"wall"`
	Ground []float32 `json:"ground"`
	X      int       `json:"x"`
	Y      int       `json:"y"`
	Note   string    `json:"note"`
}

func readNRWGML(path string, x, y int) (nrwMesh, error) {
	result := nrwMesh{X: x, Y: y, Note: "LoD2-Vorschau: einfache Polygone / fan-triangulation, keine geprüfte Dach-/Druckgeometrie"}
	f, err := os.Open(path)
	if err != nil {
		return result, err
	}
	defer f.Close()
	dec := xml.NewDecoder(io.LimitReader(f, 155*1024*1024))
	var stack []string
	var polys int
	for {
		tok, e := dec.Token()
		if e == io.EOF {
			break
		}
		if e != nil {
			return result, fmt.Errorf("GML parse: %w", e)
		}
		switch el := tok.(type) {
		case xml.StartElement:
			local := strings.ToLower(el.Name.Local)
			stack = append(stack, local)
			if local != "poslist" {
				continue
			}
			surface := ""
			exterior := false
			for _, s := range stack {
				switch s {
				case "roofsurface":
					surface = "roof"
				case "wallsurface":
					surface = "wall"
				case "groundsurface":
					surface = "ground"
				case "exterior":
					exterior = true
				case "interior":
					exterior = false
				}
			}
			if surface == "" || !exterior {
				var ignored string
				_ = dec.DecodeElement(&ignored, &el)
				stack = stack[:len(stack)-1]
				continue
			}
			var raw string
			if err := dec.DecodeElement(&raw, &el); err != nil {
				return result, err
			}
			stack = stack[:len(stack)-1]
			vals := strings.Fields(raw)
			if len(vals) < 12 || len(vals)%3 != 0 {
				continue
			}
			poly := make([][3]float32, 0, len(vals)/3)
			for i := 0; i+2 < len(vals); i += 3 {
				ee, err1 := strconv.ParseFloat(vals[i], 64)
				nn, err2 := strconv.ParseFloat(vals[i+1], 64)
				hh, err3 := strconv.ParseFloat(vals[i+2], 64)
				if err1 != nil || err2 != nil || err3 != nil {
					poly = nil
					break
				}
				if ee > 30000000 {
					ee -= 32000000
				}
				poly = append(poly, [3]float32{float32(ee - float64(x*1000+500)), float32(hh), float32(-(nn - float64(y*1000+500)))})
			}
			if len(poly) < 3 {
				continue
			}
			if poly[0] == poly[len(poly)-1] {
				poly = poly[:len(poly)-1]
			}
			if len(poly) < 3 {
				continue
			}
			target := &result.Roof
			if surface == "wall" {
				target = &result.Wall
			} else if surface == "ground" {
				target = &result.Ground
			}
			for i := 1; i < len(poly)-1; i++ {
				for _, v := range [3][3]float32{poly[0], poly[i], poly[i+1]} {
					*target = append(*target, v[:]...)
				}
			}
			polys++
			if len(result.Roof)+len(result.Wall)+len(result.Ground) > 3_000_000 {
				return result, errors.New("too many vertices; use a smaller tile")
			}
		case xml.EndElement:
			if len(stack) > 0 {
				stack = stack[:len(stack)-1]
			}
		}
	}
	if polys == 0 {
		return result, errors.New("keine unterstützten LoD2-Polygonflächen gefunden")
	}
	return result, nil
}
