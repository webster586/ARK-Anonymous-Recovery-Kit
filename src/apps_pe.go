package main

import (
	"encoding/binary"
	"fmt"
	"os"
)

// Validate an actual portable executable, rather than relying solely on .exe.
// Does NOT execute/read user data other than PE header.
func peMachine(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := make([]byte, 64)
	if _, err = f.ReadAt(h, 0); err != nil {
		return "", err
	}
	if string(h[:2]) != "MZ" {
		return "", fmt.Errorf("kein MZ-Header")
	}
	off := int64(binary.LittleEndian.Uint32(h[0x3c:0x40]))
	if off < 64 || off > 4*1024*1024 {
		return "", fmt.Errorf("unplausibler PE-Header")
	}
	sig := make([]byte, 6)
	if _, err = f.ReadAt(sig, off); err != nil {
		return "", err
	}
	if string(sig[:4]) != "PE\x00\x00" {
		return "", fmt.Errorf("kein PE-Header")
	}
	switch binary.LittleEndian.Uint16(sig[4:6]) {
	case 0x8664:
		return "Windows x64", nil
	case 0x14c:
		return "Windows x86", nil
	case 0xaa64:
		return "Windows ARM64", nil
	default:
		return "", fmt.Errorf("unbekannter PE-Prozessortyp")
	}
}
