//go:build windows

package main

import (
	"errors"
	"fmt"
)

// TIFF LZW uses early code-width changes (unlike Go's compress/lzw).
// The output limit protects against malformed or malicious strips.
func decodeTIFFLZW(src []byte, limit int) ([]byte, error) {
	if limit < 1 {
		return nil, errors.New("invalid TIFF output limit")
	}
	const clear = 256
	const end = 257
	const maxCodes = 4096
	var prefix [maxCodes]uint16
	var suffix [maxCodes]byte
	var stack [maxCodes]byte
	bitpos := 0
	bits := 9
	next := 258
	prev := -1
	out := make([]byte, 0, min(limit, 1<<20))
	read := func(width int) (int, bool) {
		if bitpos+width > len(src)*8 {
			return 0, false
		}
		v := 0
		for i := 0; i < width; i++ {
			p := bitpos + i
			v = (v << 1) | int((src[p>>3]>>(7-uint(p&7)))&1)
		}
		bitpos += width
		return v, true
	}
	for {
		code, ok := read(bits)
		if !ok {
			return nil, errors.New("TIFF LZW ended without end code")
		}
		if code == clear {
			bits = 9
			next = 258
			prev = -1
			continue
		}
		if code == end {
			return out, nil
		}
		if code > next || (code == next && prev < 0) {
			return nil, fmt.Errorf("invalid TIFF LZW code %d/%d", code, next)
		}
		n := 0
		current := code
		if code == next {
			if prev < 0 {
				return nil, errors.New("TIFF LZW invalid KwKwK")
			}
			current = prev
			for current >= 256 {
				if current >= next || n >= maxCodes-2 {
					return nil, errors.New("TIFF LZW broken dictionary")
				}
				stack[n] = suffix[current]
				n++
				current = int(prefix[current])
			}
			stack[n] = byte(current)
			n++
			first := stack[n-1]
			if len(out)+n+1 > limit {
				return nil, errors.New("TIFF LZW output too large")
			}
			for i := n - 1; i >= 0; i-- {
				out = append(out, stack[i])
			}
			out = append(out, first)
			if next < maxCodes {
				prefix[next] = uint16(prev)
				suffix[next] = first
				next++
				if next == (1<<bits)-1 && bits < 12 {
					bits++
				}
			}
			prev = code
			continue
		}
		for current >= 256 {
			if current >= next || n >= maxCodes-1 {
				return nil, errors.New("TIFF LZW broken dictionary")
			}
			stack[n] = suffix[current]
			n++
			current = int(prefix[current])
		}
		stack[n] = byte(current)
		n++
		first := stack[n-1]
		if len(out)+n > limit {
			return nil, errors.New("TIFF LZW output too large")
		}
		for i := n - 1; i >= 0; i-- {
			out = append(out, stack[i])
		}
		if prev >= 0 && next < maxCodes {
			prefix[next] = uint16(prev)
			suffix[next] = first
			next++
			if next == (1<<bits)-1 && bits < 12 {
				bits++
			}
		}
		prev = code
	}
}
