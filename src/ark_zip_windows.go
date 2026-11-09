//go:build windows
package main

import (
  "encoding/json"
  "fmt"
  "net/http"
  "os"
  "path/filepath"
  "strings"
  "sync"
)

var arkZipMu sync.Mutex
func arkWithinMedia(root,path string,exists bool)error{
  if path==""||!filepath.IsAbs(path){return fmt.Errorf("Absoluten Pfad angeben")}
  cleanRoot,e:=filepath.EvalSymlinks(root);if e!=nil{return fmt.Errorf("Media-Verzeichnis nicht gefunden: %w",e)}
  check:=path
  if !exists{check=filepath.Dir(path)}
  real,e:=filepath.EvalSymlinks(check);if e!=nil{return e}
  rel,e:=filepath.Rel(cleanRoot,real)
  if e!=nil||rel==".."||strings.HasPrefix(rel,".."+string(os.PathSeparator)){return fmt.Errorf("ZIP-Pfade müssen innerhalb des konfigurierten Media-Ordners liegen")}
  return nil
}
func registerARKZip(mux *http.ServeMux,address string){
  media:=newMedia()
  mux.HandleFunc("/api/utils/zip",func(w http.ResponseWriter,r *http.Request){
    w.Header().Set("Cache-Control","no-store")
    if r.Method!="POST"||!sameOrigin(r,address){http.Error(w,"Zugriff verboten",403);return}
    var req struct{Action string `json:"action"`;Source string `json:"source"`;Target string `json:"target"`}
    if e:=json.NewDecoder(http.MaxBytesReader(w,r.Body,4096)).Decode(&req);e!=nil{http.Error(w,"Ungültige Eingabe",400);return}
    if !arkZipMu.TryLock(){w.WriteHeader(409);writeJSON(w,map[string]string{"error":"ZIP-Vorgang läuft bereits"});return};defer arkZipMu.Unlock()
    req.Source=filepath.Clean(strings.Trim(req.Source," \""));req.Target=filepath.Clean(strings.Trim(req.Target," \""))
    for _,v:=range []string{req.Source,req.Target}{if v=="."||v==""{w.WriteHeader(400);writeJSON(w,map[string]string{"error":"Quelle und Ziel eingeben"});return}}
    if e:=arkWithinMedia(media.rootPath(),req.Source,true);e!=nil{w.WriteHeader(400);writeJSON(w,map[string]string{"error":e.Error()});return}
    if e:=arkWithinMedia(media.rootPath(),req.Target,req.Action=="extract");e!=nil{w.WriteHeader(400);writeJSON(w,map[string]string{"error":e.Error()});return}
    if req.Action=="extract"{if info,e:=os.Stat(req.Source);e!=nil||info.IsDir()||strings.ToLower(filepath.Ext(req.Source))!=".zip"{w.WriteHeader(400);writeJSON(w,map[string]string{"error":"ZIP-Quelldatei fehlt"});return}}
    var n int;var e error
    switch req.Action{case "create":n,e=arkZIPCreate(req.Source,req.Target);case "extract":n,e=arkZIPExtract(req.Source,req.Target);default:e=fmt.Errorf("Unbekannte Aktion")}
    if e!=nil{w.WriteHeader(400);writeJSON(w,map[string]string{"error":e.Error()});return}
    writeJSON(w,map[string]any{"ok":true,"count":n,"message":fmt.Sprintf("Fertig: %d Dateien %s · %s",n,map[string]string{"create":"gepackt","extract":"entpackt"}[req.Action],req.Target)})
  })
}
