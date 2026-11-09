package main

import (
 "encoding/json"
 "net"
 "net/http"
 "os"
 "path/filepath"
 "runtime"
 "sort"
 "strings"
 "time"
)

type razielDisk struct { Root string `json:"root"`; ARK bool `json:"ark"`; Media bool `json:"media"`; Sources []string `json:"sources"` }
type razielFound struct { Kind string `json:"kind"`; Path string `json:"path"`; Note string `json:"note"` }
type razielInfo struct {
 ScannedAt string `json:"scanned_at"`; ReadOnly bool `json:"read_only"`; Scope string `json:"scope"`;
 Machine map[string]string `json:"machine"`; Disks []razielDisk `json:"disks"`;
 Found []razielFound `json:"found"`; Services map[string]string `json:"services"`;
}
func rzExists(p string) bool { _,e:=os.Stat(p); return e==nil }
func rzIsDir(p string) bool { i,e:=os.Stat(p);return e==nil && i.IsDir() }
func rzReach(addr string) string { c,e:=net.DialTimeout("tcp",addr,300*time.Millisecond);if e!=nil{return "nicht erreichbar"};_ = c.Close();return "Port erreichbar (kein Funktionstest)" }
func razielReadOnlyInventory() razielInfo {
 name,_:=os.Hostname()
 exe,_:=os.Executable()
 data:=razielInfo{ScannedAt:time.Now().Format(time.RFC3339), ReadOnly:true,
  Scope:"Nur Laufwerkswurzeln und bekannte ARK-Verzeichnisse; keine Vollsuche, keine Installationen",
  Machine:map[string]string{"computer":name,"system":runtime.GOOS,"architektur":runtime.GOARCH,"cpu_kerne":itoaRaziel(runtime.NumCPU()),"prozessor":os.Getenv("PROCESSOR_IDENTIFIER"),"controller_ordner":filepath.Dir(exe)},
  Disks:[]razielDisk{},Found:[]razielFound{},Services:map[string]string{},
 }
 roots:=[]string{}
 if runtime.GOOS=="windows" {
  for c:='A';c<='Z';c++ {r:=string(c)+":\\";if rzIsDir(r){roots=append(roots,r)}}
 } else { roots=[]string{"/"} }
 // Inspect only fixed, predictable paths. Do not walk arbitrary drive trees.
 targets:=[]struct{kind,sub string}{
  {"ARK-Anwendung","ARK - Anonymous Recovery Kit"},
  {"ARK-Medien","Media"},
  {"Buecher","Media\\Bücher"},
  {"Kiwix Wikipedia","Media\\Wikipedia"},
  {"Kiwix Wikibooks","Media\\Wikibooks"},
  {"Geodaten","Media\\Geodaten"},
  {"KI-Modelle","Media\\AI"},
  {"Videos","Media\\Videos"},
  {"Bibel","ARK - Anonymous Recovery Kit\\Bibel"},
 }
 seen:=map[string]bool{}
 for _,root:=range roots {
  d:=razielDisk{Root:root,Sources:[]string{}}
  for _,t:=range targets {
   p:=filepath.Join(root,t.sub)
   if !rzIsDir(p){continue}
   if t.kind=="ARK-Anwendung" {d.ARK=rzExists(filepath.Join(p,"ARK_Controller_Windows_x64.exe"))}
   if t.kind=="ARK-Medien" {d.Media=true}
   d.Sources=append(d.Sources,t.kind)
   key:=strings.ToLower(p)
   if !seen[key] {data.Found=append(data.Found,razielFound{Kind:t.kind,Path:p,Note:"Ordner gefunden; Inhalte nicht geprüft"});seen[key]=true}
  }
  data.Disks=append(data.Disks,d)
 }
 sort.Slice(data.Found,func(i,j int)bool{return data.Found[i].Path<data.Found[j].Path})
 data.Services["Ollama"] = rzReach("127.0.0.1:11434")
 data.Services["Kiwix"] = rzReach("127.0.0.1:8791")
 data.Services["Origin"] = rzReach("127.0.0.1:8876")
 return data
}
func itoaRaziel(i int) string { if i==0{return "0"};var b [20]byte;pos:=len(b);for i>0 {pos--;b[pos]=byte('0'+i%10);i/=10};return string(b[pos:]) }
func registerRazielReadonly(mux *http.ServeMux){
 mux.HandleFunc("/api/raziel/v1/inventory",func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodGet {http.Error(w,"Nur GET",http.StatusMethodNotAllowed);return}
  w.Header().Set("Content-Type","application/json; charset=utf-8")
  w.Header().Set("Cache-Control","no-store")
  w.Header().Set("X-Content-Type-Options","nosniff")
  _=json.NewEncoder(w).Encode(razielReadOnlyInventory())
 })
}
