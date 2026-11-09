//go:build windows
package main

import (
 "os"
 "path/filepath"
 "strings"
)
// installSelected returns only existing, type-compatible user-approved ARK-0 bindings.
// No copy, network activity or implicit access to legacy/backup installations.
func installSelected(id string, directory bool) string {
 p:=installReadBindings(installRoot()).Paths[id]
 if p=="" || !filepath.IsAbs(p) {return ""}
 p=filepath.Clean(p)
 for _,seg:=range strings.Split(strings.ReplaceAll(strings.ToLower(p),"/","\\"),"\\") {
  if strings.HasSuffix(seg,"_alt") || seg=="managerbackups" {return ""}
 }
 fi,err:=os.Stat(p)
 if err!=nil || fi.IsDir()!=directory {return ""}
 return p
}
func installSelectOr(id string, directory bool, fallback string) string {
 if p:=installSelected(id,directory);p!="" {return p};return fallback
}
