//go:build windows

package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// installZIMFiles lists archives within the selected directory and its subfolders.
// Read-only, no system-wide scan; excludes reparse/symlinks and ALT safety fallback.
func installZIMFiles(root string) []string {
	found := []string{}
	root = filepath.Clean(root)
	fi, err := os.Lstat(root)
	if err != nil || !fi.IsDir() || fi.Mode()&os.ModeSymlink != 0 {
		return found
	}
	var walk func(string, int)
	walk = func(dir string, depth int) {
		if depth > 7 || len(found) >= 5000 {
			return
		}
		entries, e := os.ReadDir(dir)
		if e != nil {
			return
		}
		for _, entry := range entries {
			if len(found) >= 5000 {
				break
			}
			name := strings.ToLower(entry.Name())
			if strings.HasSuffix(name, "_alt") || name == "managerbackups" || name == "$recycle.bin" || name == "system volume information" {
				continue
			}
			if entry.Type()&os.ModeSymlink != 0 {
				continue
			}
			p := filepath.Join(dir, entry.Name())
			inf, e := os.Lstat(p)
			if e != nil || inf.Mode()&os.ModeSymlink != 0 || inf.Mode()&os.ModeIrregular != 0 {
				continue
			}
			if inf.IsDir() {
				walk(p, depth+1)
				continue
			}
			if strings.EqualFold(filepath.Ext(p), ".zim") && inf.Mode().IsRegular() {
				found = append(found, p)
			}
		}
	}
	walk(root, 0)
	sort.Strings(found)
	return found
}
