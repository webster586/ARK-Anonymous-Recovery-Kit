package main

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
)

type geoGeometry struct {
	Type        string `json:"type"`
	Coordinates any    `json:"coordinates"`
}

func decodeGPKG(blob []byte) (geoGeometry, error) {
	if len(blob) < 13 || !bytes.Equal(blob[:2], []byte("GP")) {
		return geoGeometry{}, errors.New("kein GeoPackage-Geometry-BLOB")
	}
	flag := blob[3]
	env := (flag >> 1) & 7
	num := map[byte]int{0: 0, 1: 4, 2: 6, 3: 6, 4: 8}
	n, ok := num[env]
	if !ok {
		return geoGeometry{}, errors.New("GPKG envelope ungültig")
	}
	off := 8 + n*8
	if len(blob) <= off {
		return geoGeometry{}, errors.New("GeoPackage-Geometry abgeschnitten")
	}
	p := &wkbDecoder{b: blob[off:]}
	return p.geometry(0)
}

type wkbDecoder struct {
	b        []byte
	pos      int
	vertices int
}

func (p *wkbDecoder) take(n int) ([]byte, error) {
	if n < 0 || p.pos+n > len(p.b) {
		return nil, errors.New("WKB abgeschnitten")
	}
	b := p.b[p.pos : p.pos+n]
	p.pos += n
	return b, nil
}
func (p *wkbDecoder) count(order binary.ByteOrder) (int, error) {
	b, e := p.take(4)
	if e != nil {
		return 0, e
	}
	n := order.Uint32(b)
	if n > 200000 {
		return 0, errors.New("WKB zu viele Elemente")
	}
	return int(n), nil
}
func (p *wkbDecoder) line(order binary.ByteOrder, dim int) ([][]float64, error) {
	n, e := p.count(order)
	if e != nil {
		return nil, e
	}
	if n > 40000 {
		return nil, errors.New("WKB Linie zu groß")
	}
	pts := make([][]float64, 0, n)
	for i := 0; i < n; i++ {
		if p.vertices > 100000 {
			return nil, errors.New("WKB Geometrie zu groß")
		}
		p.vertices++
		b, e := p.take(dim * 8)
		if e != nil {
			return nil, e
		}
		x := math.Float64frombits(order.Uint64(b[0:8]))
		y := math.Float64frombits(order.Uint64(b[8:16]))
		if math.IsNaN(x) || math.IsNaN(y) || math.IsInf(x, 0) || math.IsInf(y, 0) {
			continue
		}
		pts = append(pts, []float64{x, y})
	}
	return pts, nil
}
func (p *wkbDecoder) geometry(depth int) (geoGeometry, error) {
	if depth > 6 {
		return geoGeometry{}, errors.New("WKB nesting zu tief")
	}
	h, e := p.take(5)
	if e != nil {
		return geoGeometry{}, e
	}
	var order binary.ByteOrder = binary.BigEndian
	if h[0] == 1 {
		order = binary.LittleEndian
	} else if h[0] != 0 {
		return geoGeometry{}, errors.New("WKB endian ungültig")
	}
	typ := order.Uint32(h[1:])
	dim := 2
	// ISO WKB dimensional codes; EWKB flag variants.
	if typ&0x80000000 != 0 {
		dim++
	}
	if typ&0x40000000 != 0 {
		dim++
	}
	hasSRID := typ&0x20000000 != 0
	typ &= 0x1fffffff
	if typ >= 3000 && typ < 4000 {
		dim = 4
		typ -= 3000
	} else if typ >= 2000 && typ < 3000 {
		dim = 3
		typ -= 2000
	} else if typ >= 1000 && typ < 2000 {
		dim = 3
		typ -= 1000
	}
	if hasSRID {
		_, e = p.take(4)
		if e != nil {
			return geoGeometry{}, e
		}
		typ &= ^uint32(0x20000000)
	}
	if dim > 4 {
		return geoGeometry{}, errors.New("WKB Dimension")
	}
	switch typ {
	case 1:
		b, e := p.take(dim * 8)
		if e != nil {
			return geoGeometry{}, e
		}
		return geoGeometry{"Point", []float64{math.Float64frombits(order.Uint64(b[:8])), math.Float64frombits(order.Uint64(b[8:16]))}}, nil
	case 2:
		pts, e := p.line(order, dim)
		return geoGeometry{"LineString", pts}, e
	case 3:
		n, e := p.count(order)
		if e != nil {
			return geoGeometry{}, e
		}
		if n > 500 {
			return geoGeometry{}, errors.New("WKB zu viele Ringe")
		}
		rings := make([][][]float64, 0, n)
		for i := 0; i < n; i++ {
			r, e := p.line(order, dim)
			if e != nil {
				return geoGeometry{}, e
			}
			rings = append(rings, r)
		}
		return geoGeometry{"Polygon", rings}, nil
	case 4, 5, 6, 7:
		n, e := p.count(order)
		if e != nil {
			return geoGeometry{}, e
		}
		if n > 30000 {
			return geoGeometry{}, errors.New("WKB too many collections")
		}
		points := [][]float64{}
		lines := [][][]float64{}
		polys := [][][][]float64{}
		for i := 0; i < n; i++ {
			g, e := p.geometry(depth + 1)
			if e != nil {
				return geoGeometry{}, e
			}
			switch g.Type {
			case "Point":
				points = append(points, g.Coordinates.([]float64))
			case "LineString":
				lines = append(lines, g.Coordinates.([][]float64))
			case "Polygon":
				polys = append(polys, g.Coordinates.([][][]float64))
			}
		}
		if typ == 4 {
			return geoGeometry{"MultiPoint", points}, nil
		}
		if typ == 5 {
			return geoGeometry{"MultiLineString", lines}, nil
		}
		if typ == 6 {
			return geoGeometry{"MultiPolygon", polys}, nil
		}
		return geoGeometry{}, fmt.Errorf("nicht darstellbare Geometriesammlung")
	default:
		return geoGeometry{}, fmt.Errorf("WKB Typ %d nicht unterstützt", typ)
	}
}
