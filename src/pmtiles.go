//go:build windows

package main

// PMTiles-Weltbasiskarte als Atlas-Hintergrund-Ebene.
//
// Liest den PMTiles-v3-Container (https://github.com/protomaps/PMTiles,
// spec/v3/spec.md) direkt aus der großen Archivdatei per Byte-Range-Zugriff,
// ohne Drittanbieter-Go-Module (siehe go.mod: keine require-Einträge). Das
// Dateikopf-Layout, die Hilbert-Kurven-Mathematik für ZXY<->TileID und die
// Varint-Verzeichniscodierung sind funktional nachgebildet nach der
// öffentlichen Referenzimplementierung github.com/protomaps/go-pmtiles
// (Copyright 2021 Protomaps LLC, BSD-3-Clause), neu geschrieben in reinem
// Go-Standardbibliothek-Code für ARK.
import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

type pmtilesCompression uint8

const (
	pmNoCompression pmtilesCompression = 1
	pmGzip          pmtilesCompression = 2
)

type pmtilesHeader struct {
	RootOffset, RootLength                                   uint64
	MetadataOffset, MetadataLength                           uint64
	LeafOffset, LeafLength                                   uint64
	TileDataOffset, TileDataLength                           uint64
	AddressedTilesCount, TileEntriesCount, TileContentsCount uint64
	InternalCompression, TileCompression                     pmtilesCompression
	TileType                                                 uint8
	MinZoom, MaxZoom                                         uint8
	MinLonE7, MinLatE7, MaxLonE7, MaxLatE7                   int32
}

var errPMTileNotFound = errors.New("Kachel nicht im PMTiles-Archiv vorhanden")

func parsePMTilesHeader(d []byte) (pmtilesHeader, error) {
	var h pmtilesHeader
	if len(d) < 127 || string(d[0:7]) != "PMTiles" {
		return h, errors.New("keine gültige PMTiles-Datei (Magic-Bytes fehlen)")
	}
	if d[7] != 3 {
		return h, fmt.Errorf("PMTiles-Spec-Version %d wird nicht unterstützt (nur v3)", d[7])
	}
	le64 := func(o int) uint64 { return binary.LittleEndian.Uint64(d[o : o+8]) }
	le32 := func(o int) int32 { return int32(binary.LittleEndian.Uint32(d[o : o+4])) }
	h.RootOffset = le64(8)
	h.RootLength = le64(16)
	h.MetadataOffset = le64(24)
	h.MetadataLength = le64(32)
	h.LeafOffset = le64(40)
	h.LeafLength = le64(48)
	h.TileDataOffset = le64(56)
	h.TileDataLength = le64(64)
	h.AddressedTilesCount = le64(72)
	h.TileEntriesCount = le64(80)
	h.TileContentsCount = le64(88)
	h.InternalCompression = pmtilesCompression(d[97])
	h.TileCompression = pmtilesCompression(d[98])
	h.TileType = d[99]
	h.MinZoom = d[100]
	h.MaxZoom = d[101]
	h.MinLonE7 = le32(102)
	h.MinLatE7 = le32(106)
	h.MaxLonE7 = le32(110)
	h.MaxLatE7 = le32(114)
	return h, nil
}

func pmtilesDecompress(data []byte, c pmtilesCompression) ([]byte, error) {
	switch c {
	case pmNoCompression:
		return data, nil
	case pmGzip:
		r, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
		defer r.Close()
		return io.ReadAll(r)
	default:
		return nil, fmt.Errorf("PMTiles-Kompression %d wird nicht unterstützt (nur unkomprimiert oder gzip)", c)
	}
}

// pmtilesRotate und pmtilesZxyToID bilden Kachelkoordinaten (Z,X,Y) auf die
// Position entlang der Hilbert-Kurve ab, exakt wie in pmtiles/tile_id.go der
// Referenzimplementierung.
func pmtilesRotate(n, x, y, rx, ry uint32) (uint32, uint32) {
	if ry == 0 {
		if rx != 0 {
			x = n - 1 - x
			y = n - 1 - y
		}
		return y, x
	}
	return x, y
}
func pmtilesZxyToID(z uint8, x, y uint32) uint64 {
	acc := (uint64(1)<<(uint(z)*2) - 1) / 3
	n := uint32(z - 1) // unterläuft für z==0 absichtlich auf 255; der Schiebe-
	// vorgang unten liefert dafür 0 verschobene Bits, der Schleifenkörper läuft
	// also nie und acc bleibt 0 - entspricht TileID 0 für die einzige Z0-Kachel.
	for s := uint32(1) << n; s > 0; s >>= 1 {
		rx := s & x
		ry := s & y
		acc += uint64((3*rx)^ry) << n
		x, y = pmtilesRotate(s, x, y, rx, ry)
		n--
	}
	return acc
}

type pmtilesEntry struct {
	TileID    uint64
	Offset    uint64
	Length    uint32
	RunLength uint32
}

// pmtilesDecodeDirectory dekodiert ein (ggf. gzip-komprimiertes) PMTiles-
// Verzeichnis: vier parallele Varint-Felder (Anzahl, Delta-TileIDs,
// RunLengths, Lengths, Offsets mit "0 = direkt an vorherigen Eintrag
// anschließend"-Sonderfall), siehe spec/v3/spec.md "Directory".
func pmtilesDecodeDirectory(raw []byte, compression pmtilesCompression) ([]pmtilesEntry, error) {
	data, err := pmtilesDecompress(raw, compression)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return nil, errors.New("leeres PMTiles-Verzeichnis")
	}
	pos := 0
	readUvarint := func() (uint64, error) {
		v, n := binary.Uvarint(data[pos:])
		if n <= 0 {
			return 0, errors.New("PMTiles-Verzeichnis beschädigt (Varint)")
		}
		pos += n
		return v, nil
	}
	count, err := readUvarint()
	if err != nil {
		return nil, err
	}
	entries := make([]pmtilesEntry, count)
	var lastID uint64
	for i := range entries {
		d, err := readUvarint()
		if err != nil {
			return nil, err
		}
		lastID += d
		entries[i].TileID = lastID
	}
	for i := range entries {
		v, err := readUvarint()
		if err != nil {
			return nil, err
		}
		entries[i].RunLength = uint32(v)
	}
	for i := range entries {
		v, err := readUvarint()
		if err != nil {
			return nil, err
		}
		entries[i].Length = uint32(v)
	}
	for i := range entries {
		v, err := readUvarint()
		if err != nil {
			return nil, err
		}
		if i > 0 && v == 0 {
			entries[i].Offset = entries[i-1].Offset + uint64(entries[i-1].Length)
		} else {
			entries[i].Offset = v - 1
		}
	}
	return entries, nil
}

// pmtilesFindTile führt eine binäre Suche nach der TileID im Verzeichnis
// durch. RunLength==0 bedeutet "Eintrag verweist auf ein Leaf-Verzeichnis",
// sonst deckt der Eintrag RunLength aufeinanderfolgende Kachel-IDs ab.
func pmtilesFindTile(entries []pmtilesEntry, tileID uint64) (pmtilesEntry, bool) {
	m, n := 0, len(entries)-1
	for m <= n {
		k := (n + m) >> 1
		cmp := int64(tileID) - int64(entries[k].TileID)
		if cmp > 0 {
			m = k + 1
		} else if cmp < 0 {
			n = k - 1
		} else {
			return entries[k], true
		}
	}
	if n >= 0 {
		if entries[n].RunLength == 0 {
			return entries[n], true
		}
		if tileID-entries[n].TileID < uint64(entries[n].RunLength) {
			return entries[n], true
		}
	}
	return pmtilesEntry{}, false
}

type pmtilesBasemap struct {
	mu       sync.Mutex
	path     string
	file     *os.File
	header   pmtilesHeader
	root     []pmtilesEntry
	ready    bool
	err      string
	metadata map[string]any
}

func pmtilesAppDir() string { p, _ := os.Executable(); return filepath.Dir(p) }

// pmtilesDefaultCandidates sucht *.pmtiles-Dateien unterhalb der bekannten
// Media\Geodaten-Ordner. Protomaps-Basiskarten tragen ein Datum im
// Dateinamen (YYYYMMDD.pmtiles), daher sortiert nach Namen = chronologisch,
// sodass stets die neueste gefundene Datei bevorzugt werden kann.
func pmtilesDefaultCandidates() []string {
	media := rzMediaCurrent()
	all := rzResourceCandidates("pmtiles_osm")
	if media.State == "ready" {
		filtered := []string{}
		for _, p := range all {
			if rzIsContained(media.Path, p) {
				filtered = append(filtered, p)
			}
		}
		return filtered
	}
	// If exactly one valid archive was discovered across all drives, it is safe to use.
	if len(all) == 1 {
		return all
	}
	// More than one candidate needs explicit confirmation. Never arbitrarily pick newest drive.
	return nil
}

func newPMTilesBasemap() *pmtilesBasemap {
	p := &pmtilesBasemap{}
	dir := pmtilesAppDir()
	if b, e := os.ReadFile(filepath.Join(dir, "pmtiles.json")); e == nil {
		var c struct {
			Path string `json:"path"`
		}
		if json.Unmarshal(b, &c) == nil && c.Path != "" {
			if rzConfigurationLocationAllowed(c.Path) && p.open(c.Path) == nil {
				return p
			}
		}
	}
	candidates := pmtilesDefaultCandidates()
	for i := len(candidates) - 1; i >= 0; i-- { // neueste (letzte nach Sortierung) zuerst versuchen
		if err := p.open(candidates[i]); err == nil {
			return p
		} else {
			p.err = err.Error()
		}
	}
	if len(candidates) == 0 {
		p.err = "Keine eindeutige PMTiles-Datei gefunden"
	}
	return p
}

func (p *pmtilesBasemap) open(path string) error {
	path, err := filepath.Abs(strings.TrimSpace(path))
	if err != nil {
		return err
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() || info.Size() < 127 {
		return errors.New("keine gültige PMTiles-Datei")
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	headerBuf := make([]byte, 127)
	if _, err := f.ReadAt(headerBuf, 0); err != nil {
		f.Close()
		return err
	}
	header, err := parsePMTilesHeader(headerBuf)
	if err != nil {
		f.Close()
		return err
	}
	rootBuf := make([]byte, header.RootLength)
	if _, err := f.ReadAt(rootBuf, int64(header.RootOffset)); err != nil {
		f.Close()
		return err
	}
	root, err := pmtilesDecodeDirectory(rootBuf, header.InternalCompression)
	if err != nil {
		f.Close()
		return fmt.Errorf("Wurzelverzeichnis: %w", err)
	}
	var metadata map[string]any
	if header.MetadataLength > 0 {
		metaBuf := make([]byte, header.MetadataLength)
		if _, err := f.ReadAt(metaBuf, int64(header.MetadataOffset)); err == nil {
			if raw, err2 := pmtilesDecompress(metaBuf, header.InternalCompression); err2 == nil {
				_ = json.Unmarshal(raw, &metadata)
			}
		}
	}
	p.mu.Lock()
	if p.file != nil {
		p.file.Close()
	}
	p.path = path
	p.file = f
	p.header = header
	p.root = root
	p.ready = true
	p.err = ""
	p.metadata = metadata
	p.mu.Unlock()
	return nil
}

// getTile liefert die rohen, noch komprimierten Kachel-Bytes zurück, damit
// der Aufrufer sie per Content-Encoding unverändert an den Browser
// durchreichen kann, statt sie serverseitig zu entpacken und erneut zu
// komprimieren.
func (p *pmtilesBasemap) getTile(z uint8, x, y uint32) ([]byte, pmtilesCompression, error) {
	p.mu.Lock()
	file := p.file
	header := p.header
	entries := p.root
	ready := p.ready
	p.mu.Unlock()
	if !ready || file == nil {
		return nil, 0, errors.New("Basiskarte nicht geladen")
	}
	if z < header.MinZoom || z > header.MaxZoom {
		return nil, 0, errPMTileNotFound
	}
	if maxCoord := uint32(1) << uint(z); x >= maxCoord || y >= maxCoord {
		return nil, 0, errPMTileNotFound
	}
	tileID := pmtilesZxyToID(z, x, y)
	for depth := 0; depth < 6; depth++ {
		entry, ok := pmtilesFindTile(entries, tileID)
		if !ok {
			return nil, 0, errPMTileNotFound
		}
		if entry.RunLength > 0 {
			buf := make([]byte, entry.Length)
			if _, err := file.ReadAt(buf, int64(header.TileDataOffset+entry.Offset)); err != nil {
				return nil, 0, err
			}
			return buf, header.TileCompression, nil
		}
		leafBuf := make([]byte, entry.Length)
		if _, err := file.ReadAt(leafBuf, int64(header.LeafOffset+entry.Offset)); err != nil {
			return nil, 0, err
		}
		next, err := pmtilesDecodeDirectory(leafBuf, header.InternalCompression)
		if err != nil {
			return nil, 0, err
		}
		entries = next
	}
	return nil, 0, errors.New("zu viele verschachtelte PMTiles-Verzeichnisebenen")
}

func (p *pmtilesBasemap) snapshot() any {
	p.mu.Lock()
	defer p.mu.Unlock()
	name, attribution := "", ""
	if p.metadata != nil {
		if v, ok := p.metadata["name"].(string); ok {
			name = v
		}
		if v, ok := p.metadata["attribution"].(string); ok {
			attribution = v
		}
	}
	return map[string]any{
		"path": p.path, "ready": p.ready, "error": p.err,
		"name": name, "attribution": attribution,
		"minZoom": p.header.MinZoom, "maxZoom": p.header.MaxZoom,
		"bounds": []float64{
			float64(p.header.MinLonE7) / 1e7, float64(p.header.MinLatE7) / 1e7,
			float64(p.header.MaxLonE7) / 1e7, float64(p.header.MaxLatE7) / 1e7,
		},
		"tileCount": p.header.AddressedTilesCount,
	}
}

func (p *pmtilesBasemap) save(path string) error {
	if err := p.open(path); err != nil {
		p.mu.Lock()
		p.err = err.Error()
		p.mu.Unlock()
		return err
	}
	b, _ := json.MarshalIndent(map[string]string{"path": p.path}, "", "  ")
	return os.WriteFile(filepath.Join(pmtilesAppDir(), "pmtiles.json"), b, 0600)
}

func (p *pmtilesBasemap) routes(mux *http.ServeMux, address string) {
	mux.HandleFunc("/api/atlas/basemap/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET only", 405)
			return
		}
		writeJSON(w, p.snapshot())
	})
	mux.HandleFunc("/api/atlas/basemap/config", func(w http.ResponseWriter, r *http.Request) {
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
		if err := p.save(c.Path); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		writeJSON(w, p.snapshot())
	})
	mux.HandleFunc("/api/atlas/basemap/tile", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET only", 405)
			return
		}
		z, errZ := strconv.Atoi(r.URL.Query().Get("z"))
		x, errX := strconv.Atoi(r.URL.Query().Get("x"))
		y, errY := strconv.Atoi(r.URL.Query().Get("y"))
		if errZ != nil || errX != nil || errY != nil || z < 0 || z > 255 || x < 0 || y < 0 {
			http.Error(w, "ungültige z/x/y-Parameter", 400)
			return
		}
		data, compression, err := p.getTile(uint8(z), uint32(x), uint32(y))
		if err != nil {
			if err == errPMTileNotFound {
				http.Error(w, "nicht gefunden", 404)
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}
		if compression == pmGzip {
			w.Header().Set("Content-Encoding", "gzip")
		}
		w.Header().Set("Content-Type", "application/x-protobuf")
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(data)
	})
}
