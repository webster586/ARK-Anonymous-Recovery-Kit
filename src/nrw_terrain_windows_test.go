//go:build windows

package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

// buildTestDGMTiff creates a minimal single-strip, uncompressed, 16-bit
// unsigned grayscale TIFF where every pixel in TIFF row r has the value
// rowValue(r) (constant across the row), so the north/south orientation of
// readNRWTerrain's output grid can be checked unambiguously.
func buildTestDGMTiff(w, h int, rowValue func(row int) uint16) []byte {
	const (
		ifdOffset  = 8
		numEntries = 9
		ifdSize    = 2 + numEntries*12 + 4
		pixOffset  = ifdOffset + ifdSize
	)
	order := binary.LittleEndian
	buf := make([]byte, pixOffset+w*h*2)
	buf[0], buf[1] = 'I', 'I'
	order.PutUint16(buf[2:], 42)
	order.PutUint32(buf[4:], ifdOffset)
	order.PutUint16(buf[ifdOffset:], numEntries)

	type entry struct {
		tag, typ uint16
		count    uint32
		value    uint32 // SHORT values occupy the low 16 bits; LONG uses all 32.
		isLong   bool
	}
	entries := []entry{
		{256, 3, 1, uint32(w), false}, // ImageWidth
		{257, 3, 1, uint32(h), false}, // ImageLength
		{258, 3, 1, 16, false},        // BitsPerSample
		{259, 3, 1, 1, false},         // Compression = none
		{273, 4, 1, pixOffset, true},  // StripOffsets
		{277, 3, 1, 1, false},         // SamplesPerPixel
		{278, 3, 1, uint32(h), false}, // RowsPerStrip
		{279, 4, 1, uint32(w * h * 2), true}, // StripByteCounts
		{339, 3, 1, 1, false},         // SampleFormat = unsigned int
	}
	p := ifdOffset + 2
	for _, e := range entries {
		order.PutUint16(buf[p:], e.tag)
		order.PutUint16(buf[p+2:], e.typ)
		order.PutUint32(buf[p+4:], e.count)
		if e.isLong {
			order.PutUint32(buf[p+8:], e.value)
		} else {
			order.PutUint16(buf[p+8:], uint16(e.value))
		}
		p += 12
	}
	order.PutUint32(buf[p:], 0) // next IFD offset: none

	for r := 0; r < h; r++ {
		v := rowValue(r)
		for c := 0; c < w; c++ {
			off := pixOffset + (r*w+c)*2
			order.PutUint16(buf[off:], v)
		}
	}
	return buf
}

// DGM1 GeoTIFFs store row 0 as the NORTH edge (standard north-up raster), but
// scene.js's terrainTriangles() expects heights[0] to be the SOUTH edge
// (matching its Z-axis convention, shared with the GML/road renderer, where
// increasing Z/row means increasing northing). readNRWTerrain must flip rows
// while reading so its output matches that contract, or the rendered terrain
// ends up mirrored north/south relative to roads and buildings.
func TestNRWTerrainRowOrientationNorthSouth(t *testing.T) {
	const w, h = 4, 4
	// TIFF row 0 (north edge) = 1000, row h-1 (south edge) = 4000.
	raw := buildTestDGMTiff(w, h, func(row int) uint16 { return uint16(1000 + row*1000) })
	dir := t.TempDir()
	path := filepath.Join(dir, "dgm1_test.tif")
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	out, err := readNRWTerrain(path, 355, 5628)
	if err != nil {
		t.Fatalf("readNRWTerrain: %v", err)
	}
	if out.N < 2 {
		t.Fatalf("unexpected grid size n=%d", out.N)
	}
	n := out.N
	// sy=0 in the output grid must be the SOUTH edge of the real-world tile,
	// i.e. the TIFF's LAST row (h-1), which we set to the highest value.
	south := out.Heights[0*n+0]
	wantSouth := float32(1000 + (h-1)*1000)
	if south != wantSouth {
		t.Errorf("south edge (out.Heights[0]) = %v, want %v (TIFF row %d) — rows may not be flipped correctly", south, wantSouth, h-1)
	}
	// sy=n-1 in the output grid must be the NORTH edge of the real-world
	// tile, i.e. the TIFF's FIRST row (0), which we set to the lowest value.
	north := out.Heights[(n-1)*n+0]
	wantNorth := float32(1000)
	if north != wantNorth {
		t.Errorf("north edge (out.Heights[(n-1)*n]) = %v, want %v (TIFF row 0) — rows may not be flipped correctly", north, wantNorth)
	}
}
