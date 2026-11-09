//go:build windows
package main

import (
  "context"
  "embed"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
  "os/exec"
  "strings"
  "time"
)

//go:embed origin_safe_switch.py
var originSafeAsset embed.FS

// SafeSwitch V0.4 intentionally exposes ONLY read/verify actions.
// Selection, launch, registration and pinning remain confined to the separate CLI.
func originSafeRun(ctx context.Context, lab, command string) (string,error) {
  if command != "status" && command != "list" && command != "verify" {return "",fmt.Errorf("Aktion nicht erlaubt")}
  data,err:=originSafeAsset.ReadFile("origin_safe_switch.py");if err!=nil{return "",err}
  f,err:=os.CreateTemp("","ark-origin-safe-ui-*.py");if err!=nil{return "",err}
  name:=f.Name();defer os.Remove(name)
  if _,err=f.Write(data);err!=nil{f.Close();return "",err}
  if err=f.Close();err!=nil{return "",err}
  c:=exec.CommandContext(ctx,"python","-X","utf8",name,"--lab",lab,command)
  c.Env=append(os.Environ(),"PYTHONIOENCODING=utf-8","PYTHONUTF8=1")
  output,err:=c.CombinedOutput()
  // Limit error and successful output to avoid excessive UI data.
  if len(output)>16384{output=append(output[:16384],[]byte("\n[Ausgabe gekuerzt]")...)}
  return strings.TrimSpace(string(output)),err
}
func originSafeUIRegister(mux *http.ServeMux) {
  originSimpleRegister(mux)
  mux.HandleFunc("/api/origin/safe/inspect",func(w http.ResponseWriter,r *http.Request){
    if r.Method!=http.MethodGet{http.Error(w,"Method not allowed",405);return}
    lab,err:=switchRoot();if err!=nil{originJSON(w,400,map[string]interface{}{"ok":false,"error":err.Error()});return}
    ctx,cancel:=context.WithTimeout(r.Context(),3*time.Minute);defer cancel()
    status,se:=originSafeRun(ctx,lab,"status")
    versions,ve:=originSafeRun(ctx,lab,"list")
    if se!=nil||ve!=nil{originJSON(w,500,map[string]interface{}{"ok":false,"error":"SafeSwitch-Status nicht verfuegbar","status":status,"versions":versions});return}
    originJSON(w,200,map[string]interface{}{"ok":true,"status":status,"versions":versions})
  })
  mux.HandleFunc("/api/origin/safe/verify",func(w http.ResponseWriter,r *http.Request){
    if r.Method!=http.MethodPost{http.Error(w,"Method not allowed",405);return}
    if r.Header.Get("X-ARK-Origin")!="safe-verify"{http.Error(w,"Origin header required",403);return}
    r.Body=http.MaxBytesReader(w,r.Body,1024)
    defer r.Body.Close()
    var request struct{Confirm bool `json:"confirm"`}
    if err:=json.NewDecoder(r.Body).Decode(&request);err!=nil||!request.Confirm{originJSON(w,400,map[string]interface{}{"ok":false,"error":"Bestaetigung erforderlich"});return}
    lab,err:=switchRoot();if err!=nil{originJSON(w,400,map[string]interface{}{"ok":false,"error":err.Error()});return}
    ctx,cancel:=context.WithTimeout(r.Context(),15*time.Minute);defer cancel()
    output,err:=originSafeRun(ctx,lab,"verify")
    if err!=nil{originJSON(w,409,map[string]interface{}{"ok":false,"error":"SHA-256-Pruefung fehlgeschlagen","detail":output});return}
    originJSON(w,200,map[string]interface{}{"ok":true,"detail":output})
  })
}
