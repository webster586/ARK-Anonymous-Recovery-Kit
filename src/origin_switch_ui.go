//go:build windows
package main

import (
 "context"
 "embed"
 "encoding/json"
 "errors"
 "fmt"
 "net/http"
 "os"
 "os/exec"
 "path/filepath"
 "strings"
 "sync"
 "time"
)

//go:embed origin_switch_engine.py
var originSwitchAssets embed.FS

type switchJob struct {
 State string `json:"state"`
 Action string `json:"action,omitempty"`
 Started string `json:"started,omitempty"`
 Error string `json:"error,omitempty"`
 Result json.RawMessage `json:"result,omitempty"`
}
var switchState=struct{sync.Mutex;Job switchJob}{Job:switchJob{State:"idle"}}

func switchRoot() (string,error){
 root:=originDefaultRoot();if root=="" {return "",errors.New("ARKVersionen nicht gefunden")}
 volume:=filepath.VolumeName(root);if volume==""{return "",errors.New("Kein Windows-Datentraeger")}
 lab:=filepath.Join(volume+`\`,"LAB")
 fi,err:=os.Stat(lab);if err!=nil||!fi.IsDir(){return "",errors.New("LAB-Ordner fehlt auf dem Archiv-Laufwerk")}
 return lab,nil
}
func switchRun(ctx context.Context,args ...string)(json.RawMessage,error){
 script,err:=originSwitchAssets.ReadFile("origin_switch_engine.py");if err!=nil{return nil,err}
 f,err:=os.CreateTemp("","ark-origin-switch-*.py");if err!=nil{return nil,err}
 name:=f.Name();defer os.Remove(name)
 if _,err=f.Write(script);err!=nil{f.Close();return nil,err};if err=f.Close();err!=nil{return nil,err}
 command:=exec.CommandContext(ctx,"python",append([]string{"-X","utf8",name},args...)...)
 command.Env=append(os.Environ(),"PYTHONIOENCODING=utf-8","PYTHONUTF8=1")
 data,err:=command.CombinedOutput()
 if !json.Valid(data){return nil,fmt.Errorf("Origin: %s",strings.TrimSpace(string(data)))}
 var response struct{Status string `json:"status"`;Error string `json:"error"`}
 if e:=json.Unmarshal(data,&response);e!=nil{return nil,e}
 if err!=nil || response.Status=="ERROR" {if response.Error!=""{return nil,errors.New(response.Error)};return nil,fmt.Errorf("Origin-Prozess: %v",err)}
 return append(json.RawMessage(nil),data...),nil
}
func switchAPI(mux *http.ServeMux){
 mux.HandleFunc("/api/origin/switch/list",func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodGet{http.Error(w,"method",405);return}
  lab,e:=switchRoot();if e!=nil{originJSON(w,400,map[string]string{"error":e.Error()});return}
  data,e:=switchRun(r.Context(),"list","--lab",lab)
  if e!=nil{originJSON(w,500,map[string]string{"error":e.Error()});return}
  var payload map[string]interface{}
  if e=json.Unmarshal(data,&payload);e!=nil{originJSON(w,500,map[string]string{"error":e.Error()});return}
  builds:=[]string{}
  for _,entry:=range mustReadSwitchBuilds(filepath.Join(originDefaultRoot(),"Origin","Builds")) {builds=append(builds,entry)}
  payload["builds"]=builds
  originJSON(w,200,payload)
 })
 mux.HandleFunc("/api/origin/switch/status",func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodGet{http.Error(w,"method",405);return}
  switchState.Lock();job:=switchState.Job;switchState.Unlock();originJSON(w,200,job)
 })
 mux.HandleFunc("/api/origin/switch/start",func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodPost{http.Error(w,"method",405);return}
  if r.Header.Get("X-ARK-Origin")!="switch"{http.Error(w,"Origin header required",403);return}
  r.Body=http.MaxBytesReader(w,r.Body,4096)
  var q struct{Action string `json:"action"`;Source string `json:"source"`;ID string `json:"id"`}
  if e:=json.NewDecoder(r.Body).Decode(&q);e!=nil{originJSON(w,400,map[string]string{"error":"Ungueltige Anfrage"});return}
  if q.Action!="deploy"&&q.Action!="select"{originJSON(w,400,map[string]string{"error":"Aktion nicht erlaubt"});return}
  lab,e:=switchRoot();if e!=nil{originJSON(w,400,map[string]string{"error":e.Error()});return}
  root:=originDefaultRoot()
  args:=[]string{q.Action,"--lab",lab}
  if q.Action=="deploy"{
   var source string
   // Permits reconstructed ZIPs from Origin/Builds or a selected existing archive.
   if originPatchFileName(q.Source,".zip") {
    source,e=originPatchFindArchive(root,q.Source)
    if e!=nil{
     candidate:=filepath.Join(root,"Origin","Builds",q.Source)
     if fi,er:=os.Lstat(candidate);er==nil&&fi.Mode().IsRegular(){source=candidate;e=nil}
    }
   }else{e=errors.New("Ungueltiger ZIP-Dateiname")}
   if e!=nil{originJSON(w,400,map[string]string{"error":e.Error()});return}
   args=append(args,"--archives",root,"--source",source)
  }else{args=append(args,"--id",q.ID)}
  switchState.Lock()
  if switchState.Job.State=="running"{switchState.Unlock();originJSON(w,409,map[string]string{"error":"Switch-Aufgabe laeuft"});return}
  job:=switchJob{State:"running",Action:q.Action,Started:time.Now().Format(time.RFC3339)}
  switchState.Job=job;switchState.Unlock()
  go func(){
   ctx,cancel:=context.WithTimeout(context.Background(),25*time.Minute);defer cancel()
   result,err:=switchRun(ctx,args...)
   switchState.Lock();defer switchState.Unlock()
   if err!=nil{job.State="error";job.Error=err.Error()}else{job.State="complete";job.Result=result}
   switchState.Job=job
  }()
  originJSON(w,202,map[string]string{"state":"running"})
 })
}

func mustReadSwitchBuilds(folder string) []string {
 out:=[]string{}
 entries,err:=os.ReadDir(folder);if err!=nil{return out}
 for _,e:=range entries{if !e.IsDir()&&e.Type().IsRegular()&&originPatchFileName(e.Name(),".zip"){out=append(out,e.Name())}}
 return out
}
