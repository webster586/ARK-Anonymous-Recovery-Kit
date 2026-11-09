package main

import (
 "context"
 "encoding/json"
 "net/http"
 "os/exec"
 "os"
 "path/filepath"
 "sort"
 "runtime"
 "strings"
 "time"
)

type razielHardwareV2 struct {
 CPU string `json:"cpu"`
 RAMBytes uint64 `json:"ram_bytes"`
 GPU []string `json:"gpu"`
 Disks []razielPhysicalDisk `json:"disks"`
 Note string `json:"note"`
}
type razielPhysicalDisk struct {
 Device string `json:"device"`
 Label string `json:"label"`
 Type string `json:"type"`
 Serial string `json:"serial"`
 Capacity uint64 `json:"capacity_bytes"`
 Free uint64 `json:"free_bytes"`
}
type razielContentSummary struct {
 DirectFiles int `json:"direct_files"`
 DirectDirectories int `json:"direct_directories"`
 Extensions []string `json:"extensions"`
 ReadError string `json:"read_error,omitempty"`
}
type razielContentLocation struct {
 Kind string `json:"kind"`
 Path string `json:"path"`
 Summary razielContentSummary `json:"summary"`
}
type razielInventoryV2 struct {
 Version string `json:"version"`
 ReadOnly bool `json:"read_only"`
 Inventory razielInfo `json:"inventory"`
 Hardware razielHardwareV2 `json:"hardware"`
 Contents []razielContentLocation `json:"contents"`
}
func razielHardwareReadOnly() razielHardwareV2 {
 v:=razielHardwareV2{GPU:[]string{},Disks:[]razielPhysicalDisk{},Note:"Hardwaredaten nicht verfuegbar"}
 if runtime.GOOS!="windows" { v.Note="Windows-CIM nur auf Windows verfuegbar";return v }
 // These are read-only WMI/CIM queries. No mutation, no network, no arbitrary user-supplied command.
 ps:=`[Console]::OutputEncoding=(New-Object System.Text.UTF8Encoding($false)); $ErrorActionPreference='Stop'; `+
   `$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1; `+
   `$cs=Get-CimInstance Win32_ComputerSystem; `+
   `$gpus=@(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name); `+
   `$logical=@{}; Get-CimInstance Win32_LogicalDisk | ForEach-Object { $logical[$_.DeviceID]= $_ }; `+
   `$disks=@([System.IO.DriveInfo]::GetDrives() | ForEach-Object { `+
   `$d=$_; $id=$d.Name.TrimEnd('\'); $label='';$serial='';$kind='';$size=[uint64]0;$free=[uint64]0; `+
   `if ($logical.ContainsKey($id)) { $label=[string]$logical[$id].VolumeName; $serial=[string]$logical[$id].VolumeSerialNumber; $kind=[string]$logical[$id].DriveType }; `+
   `try {if($d.IsReady) { $size=[uint64]$d.TotalSize; $free=[uint64]$d.AvailableFreeSpace; if(!$label){$label=[string]$d.VolumeLabel} }} catch {} ; `+
   `[pscustomobject]@{device=$id;label=$label;type=$kind;serial=$serial;capacity_bytes=$size;free_bytes=$free} `+
   `}); `+
   `[pscustomobject]@{cpu=[string]$cpu.Name;ram_bytes=[uint64]$cs.TotalPhysicalMemory;gpu=$gpus;disks=$disks} | ConvertTo-Json -Depth 5 -Compress`

 ctx,cancel:=context.WithTimeout(context.Background(),9*time.Second)
 defer cancel()
 out,err:=exec.CommandContext(ctx,"powershell.exe","-NoProfile","-NonInteractive","-Command",ps).Output()
 if err!=nil {v.Note="CIM-Abfrage nicht verfuegbar (Timeout oder Berechtigungen)";return v}
 var raw struct {CPU string `json:"cpu"`;RAM uint64 `json:"ram_bytes"`;GPU []string `json:"gpu"`;Disks []razielPhysicalDisk `json:"disks"`}
 if json.Unmarshal(out,&raw)!=nil {v.Note="CIM-Antwort konnte nicht gelesen werden";return v}
 v.CPU=strings.TrimSpace(raw.CPU);v.RAMBytes=raw.RAM
 if raw.GPU!=nil {v.GPU=raw.GPU};if raw.Disks!=nil {v.Disks=raw.Disks};v.Note="Windows-CIM, nur lesend"
 return v
}
// Inspect only the immediate children of the exact locations already found by the
// V0.1 locator. No recursion, no file content reads, no writes, no arbitrary paths.
func razielContentsReadOnly(in razielInfo) []razielContentLocation {
 out:=make([]razielContentLocation,0,len(in.Found))
 for _,place:=range in.Found {
  loc:=razielContentLocation{Kind:place.Kind,Path:place.Path,Summary:razielContentSummary{Extensions:[]string{}}}
  entries,err:=os.ReadDir(place.Path)
  if err!=nil {loc.Summary.ReadError="Verzeichnis nicht lesbar";out=append(out,loc);continue}
  extensionCount:=map[string]int{}
  for _,entry:=range entries {
   if entry.IsDir() {loc.Summary.DirectDirectories++;continue}
   if !entry.Type().IsRegular() {continue}
   loc.Summary.DirectFiles++
   ext:=strings.ToLower(filepath.Ext(entry.Name()))
   if ext!="" && len(ext)<=12 {extensionCount[ext]++}
  }
  sorted:=make([]string,0,len(extensionCount))
  for ext:=range extensionCount {sorted=append(sorted,ext)}
  sort.Strings(sorted)
  // Limit UI metadata to avoid huge payloads on unusual directories.
  for i,ext:=range sorted {if i>=20 {break};loc.Summary.Extensions=append(loc.Summary.Extensions,ext)}
  out=append(out,loc)
 }
 return out
}
func registerRazielV2(mux *http.ServeMux) {
 mux.HandleFunc("/api/raziel/v2/inventory",func(w http.ResponseWriter,r *http.Request){
   if r.Method!=http.MethodGet {http.Error(w,"Nur GET",http.StatusMethodNotAllowed);return}
   w.Header().Set("Content-Type","application/json; charset=utf-8")
   w.Header().Set("Cache-Control","no-store")
   w.Header().Set("X-Content-Type-Options","nosniff")
   info:=razielReadOnlyInventory()
   _=json.NewEncoder(w).Encode(razielInventoryV2{Version:"0.2.1",ReadOnly:true,Inventory:info,Hardware:razielHardwareReadOnly(),Contents:razielContentsReadOnly(info)})
 })
 mux.HandleFunc("/api/raziel/v2/health",func(w http.ResponseWriter,r *http.Request){
   if r.Method!=http.MethodGet {http.Error(w,"Nur GET",http.StatusMethodNotAllowed);return}
   w.Header().Set("Content-Type","application/json; charset=utf-8")
   _=json.NewEncoder(w).Encode(map[string]any{"module":"ARK-01 Raziel","version":"0.2.1","status":"read_only_ready","write_enabled":false,"checked_at":time.Now().Format(time.RFC3339)})
 })
}
