//go:build windows

package main

// Restricted offline GeoTIFF reader for single-band DGM1 height grids.
// Supports strips, integer/float samples, uncompressed, LZW and ZIP/deflate.
import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
)

type terrainTile struct {
	X       int       `json:"x"`
	Y       int       `json:"y"`
	N       int       `json:"n"`
	Heights []float32 `json:"heights"`
}

func readNRWTerrain(path string, x, y int) (terrainTile, error) {
	out := terrainTile{X: x, Y: y}
	b, e := os.ReadFile(path)
	if e != nil {
		return out, e
	}
	if len(b) < 16 {
		return out, errors.New("TIFF zu kurz")
	}
	var order binary.ByteOrder
	switch string(b[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return out, errors.New("TIFF Byteorder unbekannt")
	}
	if order.Uint16(b[2:4]) != 42 {
		return out, errors.New("BigTIFF oder unbekannter TIFF-Typ")
	}
	at := int(order.Uint32(b[4:8]))
	if at < 8 || at+2 > len(b) {
		return out, errors.New("TIFF IFD fehlt")
	}
	num := int(order.Uint16(b[at:]))
	if num > 1024 || at+2+12*num > len(b) {
		return out, errors.New("TIFF Tags ungültig")
	}
	tags := map[int][]uint32{}
	for i := 0; i < num; i++ {
		p := at + 2 + i*12
		t := int(order.Uint16(b[p:]))
		typ := order.Uint16(b[p+2:])
		count := int(order.Uint32(b[p+4:]))
		sz := 0
		switch typ {
		case 3:
			sz = 2
		case 4:
			sz = 4
		default:
			continue
		}
		if count < 1 || count > 1000000 {
			continue
		}
		size := count * sz
		off := p + 8
		if size > 4 {
			off = int(order.Uint32(b[p+8:]))
		}
		if off < 0 || off+size > len(b) {
			continue
		}
		arr := make([]uint32, count)
		for j := 0; j < count; j++ {
			if sz == 2 {
				arr[j] = uint32(order.Uint16(b[off+j*sz:]))
			} else {
				arr[j] = order.Uint32(b[off+j*sz:])
			}
		}
		tags[t] = arr
	}
	one := func(k int, def uint32) uint32 {
		if a := tags[k]; len(a) > 0 {
			return a[0]
		}
		return def
	}
	w, h := int(one(256, 0)), int(one(257, 0))
	if w < 2 || h < 2 || w > 5000 || h > 5000 {
		return out, fmt.Errorf("ungewöhnliches DGM Raster %d x %d", w, h)
	}
	if one(277, 1) != 1 {
		return out, errors.New("mehrkanaliges TIFF nicht unterstützt")
	}
	bits, fmtid, compression, predictor := int(one(258, 0)), int(one(339, 1)), int(one(259, 1)), int(one(317, 1))
	if bits != 16 && bits != 32 && bits != 64 {
		return out, fmt.Errorf("TIFF Bittiefe %d nicht unterstützt", bits)
	}
	if predictor != 1 {
		return out, fmt.Errorf("TIFF Predictor %d noch nicht unterstützt", predictor)
	}
	offsets, sizes := tags[273], tags[279]
	rowsPerStrip := int(one(278, uint32(h)))
	if len(offsets) == 0 || len(offsets) != len(sizes) || rowsPerStrip < 1 {
		return out, errors.New("TIFF Strips fehlen (tiled TIFF derzeit nicht unterstützt)")
	}
	step := max(1, int(math.Ceil(float64(max(w, h))/128)))
	n := int(math.Ceil(float64(max(w, h))/float64(step))) + 1
	if n > 132 {
		n = 132
	}
	out.N = n
	out.Heights = make([]float32, n*n)
	// Decode strips sequentially to a bounded sampled height grid.
	row := 0
	for k, off := range offsets {
		end := uint64(off) + uint64(sizes[k])
		if end > uint64(len(b)) {
			return terrainTile{}, errors.New("TIFF Strip außerhalb der Datei")
		}
		src := b[off:end]
		var raw []byte
		switch compression {
		case 1:
			raw = src
		case 5:
			raw, e = decodeTIFFLZW(src, w*rowsPerStrip*(bits/8))
		case 8, 32946:
			var rd io.ReadCloser
			rd, e = zlib.NewReader(bytes.NewReader(src))
			if e == nil {
				raw, e = io.ReadAll(io.LimitReader(rd, int64(w*rowsPerStrip*(bits/8)+1)))
				rd.Close()
			}
		default:
			return terrainTile{}, fmt.Errorf("TIFF Kompression %d nicht unterstützt", compression)
		}
		if e != nil {
			return terrainTile{}, fmt.Errorf("DGM Dekompression: %w", e)
		}
		rows := min(rowsPerStrip, h-row)
		if len(raw) < rows*w*(bits/8) {
			return terrainTile{}, errors.New("TIFF Strip unvollständig")
		}
		for sy := 0; sy < n; sy++ {
			// TIFF rows run north-to-south (row 0 = north edge), but the
			// client's height grid uses row 0 = SOUTH edge (matching its
			// Z-axis convention where increasing row/iy means increasing
			// northing). Flip here so out.Heights[0] is the south edge and
			// out.Heights[n-1] is the north edge, or the rendered terrain
			// ends up mirrored north/south relative to roads and buildings.
			flippedSy := n - 1 - sy
			iy := min(h-1, int(float64(flippedSy)*float64(h-1)/float64(n-1)))
			if iy < row || iy >= row+rows {
				continue
			}
			for sx := 0; sx < n; sx++ {
				ix := min(w-1, int(float64(sx)*float64(w-1)/float64(n-1)))
				z := ((iy-row)*w + ix) * (bits / 8)
				var v float64
				switch {
				case bits == 32 && fmtid == 3:
					v = float64(math.Float32frombits(order.Uint32(raw[z:])))
				case bits == 64 && fmtid == 3:
					v = math.Float64frombits(order.Uint64(raw[z:]))
				case bits == 16 && fmtid == 2:
					v = float64(int16(order.Uint16(raw[z:])))
				case bits == 16:
					v = float64(order.Uint16(raw[z:]))
				case bits == 32 && fmtid == 2:
					v = float64(int32(order.Uint32(raw[z:])))
				default:
					v = float64(order.Uint32(raw[z:]))
				}
				if math.IsNaN(v) || math.IsInf(v, 0) || v < -500 || v > 10000 {
					v = 0
				}
				out.Heights[sy*n+sx] = float32(v)
			}
		}
		row += rows
		if row >= h {
			break
		}
	}
	if row < h {
		return terrainTile{}, errors.New("TIFF Raster abgeschnitten")
	}
	return out, nil
}
