package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPEValidAndInvalid(t *testing.T) {
	d := t.TempDir()
	for _, tc := range []struct {
		name    string
		machine uint16
		valid   bool
	}{
		{"win64", 0x8664, true}, {"win32", 0x14c, true}, {"winarm", 0xaa64, true}, {"unknown", 0xFFFF, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(d, tc.name+".exe")
			p := make([]byte, 256)
			copy(p[:2], "MZ")
			binary.LittleEndian.PutUint32(p[0x3c:0x40], 128)
			copy(p[128:132], "PE\x00\x00")
			binary.LittleEndian.PutUint16(p[132:134], tc.machine)
			if err := os.WriteFile(path, p, 0600); err != nil {
				t.Fatal(err)
			}
			typ, err := peMachine(path)
			if tc.valid && (err != nil || !strings.HasPrefix(typ, "Windows")) {
				t.Fatalf("%s %v", typ, err)
			}
			if !tc.valid && err == nil {
				t.Fatalf("unexpected %s", typ)
			}
		})
	}
	p := filepath.Join(d, "wrong.exe")
	if err := os.WriteFile(p, []byte("fake EXE"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := peMachine(p); err == nil {
		t.Fatal("fake exe accepted")
	}
	if _, err := peMachine(filepath.Join(d, "not-exist")); err == nil {
		t.Fatal("nonexistent accepted")
	}
}
