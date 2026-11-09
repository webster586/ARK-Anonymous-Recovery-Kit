//go:build windows
package main

import (
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "net/http"
 "os"
 "os/exec"
 "path/filepath"
 "strings"
 "syscall"
 "time"
)

func originSimpleScript() (string,error) {
 exe,err:=os.Executable();if err!=nil{return "",err}
 script:=filepath.Join(filepath.Dir(exe),"ORIGIN_AUTOSWITCH","origin_simple_engine.py")
 if fi,err:=os.Lstat(script);err!=nil||!fi.Mode().IsRegular(){return "",fmt.Errorf("Origin-Helfer fehlt oder ist kein reguläres Skript")}
 return script,nil
}
func originSimpleCmd(ctx context.Context,lab,command,id string)(map[string]interface{},error){
 script,err:=originSimpleScript();if err!=nil{return nil,err}
 exe,err:=os.Executable();if err!=nil{return nil,err}
 args:=[]string{"-X","utf8",script,command,"--lab",lab,"--running-root",filepath.Dir(exe)}
 if id!=""{args=append(args,"--id",id)}
 cmd:=exec.CommandContext(ctx,"python",args...)
 cmd.Env=append(os.Environ(),"PYTHONUTF8=1","PYTHONIOENCODING=utf-8")
 output,err:=cmd.CombinedOutput()
 if len(output)>2*1024*1024{return nil,errors.New("Origin-Ausgabe zu gross")}
 var data map[string]interface{}
 if e:=json.Unmarshal(output,&data);e!=nil{return nil,fmt.Errorf("Origin: %s",strings.TrimSpace(string(output)))}
 if err!=nil || data["status"]=="ERROR"{return nil,fmt.Errorf("Origin: %v",data["error"])}
 return data,nil
}
func originSimpleWorker(lab string)error {
 script,err:=originSimpleScript();if err!=nil{return err}
 cmd:=exec.Command("python","-X","utf8",script,"worker","--lab",lab)
 cmd.SysProcAttr=&syscall.SysProcAttr{CreationFlags:0x00000008|0x00000200}
 cmd.Stdin=nil
 cmd.Stdout=nil
 cmd.Stderr=nil
 if err=cmd.Start();err!=nil{return err}
 return cmd.Process.Release()
}
func originSimpleRegister(mux *http.ServeMux){
 mux.HandleFunc("/api/origin/simple/list",func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodGet{http.Error(w,"method",405);return}
  lab,err:=switchRoot();if err!=nil{originJSON(w,400,map[string]interface{}{"error":err.Error()});return}
  ctx,cancel:=context.WithTimeout(r.Context(),100*time.Second);defer cancel()
  data,err:=originSimpleCmd(ctx,lab,"list","");if err!=nil{originJSON(w,500,map[string]interface{}{"error":err.Error()});return}
  originJSON(w,200,data)
 })
 mux.HandleFunc("/api/origin/simple/prepare",func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodPost{http.Error(w,"method",405);return}
  if r.Header.Get("X-ARK-Origin")!="simple-switch"{http.Error(w,"Origin header required",403);return}
  r.Body=http.MaxBytesReader(w,r.Body,2048);defer r.Body.Close()
  var q struct{ID string `json:"id"`;Confirm bool `json:"confirm"`}
  if e:=json.NewDecoder(r.Body).Decode(&q);e!=nil||!q.Confirm{originJSON(w,400,map[string]interface{}{"error":"Bestaetigung erforderlich"});return}
  lab,err:=switchRoot();if err!=nil{originJSON(w,400,map[string]interface{}{"error":err.Error()});return}
  ctx,cancel:=context.WithTimeout(r.Context(),30*time.Minute);defer cancel()
  data,err:=originSimpleCmd(ctx,lab,"prepare",q.ID);if err!=nil{originJSON(w,409,map[string]interface{}{"error":err.Error()});return}
  if err=originSimpleWorker(lab);err!=nil{originJSON(w,500,map[string]interface{}{"error":"Wechsel vorbereitet, aber Hintergrundstarter konnte nicht starten: "+err.Error(),"manual_action_required":true});return}
  originJSON(w,200,data)
 })
 mux.HandleFunc("/api/origin/simple/last",func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodGet{http.Error(w,"method",405);return}
  lab,err:=switchRoot();if err!=nil{originJSON(w,400,map[string]interface{}{"error":err.Error()});return}
  ctx,cancel:=context.WithTimeout(r.Context(),10*time.Second);defer cancel()
  data,err:=originSimpleCmd(ctx,lab,"last","");if err!=nil{originJSON(w,500,map[string]interface{}{"error":err.Error()});return}
  originJSON(w,200,data)
 })
}
