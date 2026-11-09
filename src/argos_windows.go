//go:build windows

package main

import (
 "bytes"
 "context"
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

// Prefer an ARK-contained Python 3.11 runtime, independent of system Python and drive letter.
// All translation text is passed via subprocess stdin, never a network API.
// Python and models are downloaded ONLY after explicit user action.
type arkArgos struct {
 mu sync.Mutex
 busy bool
 message string
}
func (a *arkArgos) paths()(string,string,string){
 exe,_:=os.Executable()
 base:=filepath.Join(filepath.Dir(exe),"tools","argos")
 portable:=filepath.Join(base,"python","python.exe")
 if p:=installSelected("python",false);p!="" {portable=p} else if info,err:=os.Stat(portable);err==nil&&!info.IsDir(){} else {portable=filepath.Join(base,".venv","Scripts","python.exe")}
 return base,portable,installSelectOr("argos_worker",false,filepath.Join(base,"ark_argos_worker.py"))
}
func (a *arkArgos) available()bool{_,p,w:=a.paths();s,err:=os.Stat(p);if err!=nil || s.IsDir(){return false};_,err=os.Stat(w);return err==nil}
func (a *arkArgos) execWorker(ctx context.Context,req any)(map[string]any,error){
 base,python,worker:=a.paths()
 b,_:=json.Marshal(req)
 cmd:=exec.CommandContext(ctx,python,"-X","utf8",worker)
 cmd.Dir=base
 cmd.Env=append(os.Environ(),"ARGOS_PACKAGES_DIR="+installSelectOr("argos_models",true,filepath.Join(base,"models")),"ARGOS_CHUNK_TYPE=ARGOSTRANSLATE","XDG_DATA_HOME="+filepath.Join(base,"runtime","arg-data"),"XDG_CACHE_HOME="+filepath.Join(base,"runtime","arg-cache"),"XDG_CONFIG_HOME="+filepath.Join(base,"runtime","arg-config"),"PYTHONUTF8=1","PYTHONIOENCODING=utf-8","PYTHONNOUSERSITE=1")
 if filepath.Clean(python)==filepath.Clean(filepath.Join(base,"python","python.exe")) {
   home:=filepath.Join(base,"python")
   // Environment overrides any host Python installation or inherited PYTHONPATH.
   vars:=[]string{"PYTHONHOME=","PYTHONPATH=","PYTHONHOME="+home,"PYTHONPATH="+strings.Join([]string{filepath.Join(home,"Lib"),filepath.Join(home,"DLLs"),filepath.Join(home,"Lib","site-packages")},string(os.PathListSeparator))}
   cmd.Env=append(cmd.Env,vars...)
 }
 cmd.Stdin=bytes.NewReader(b)
 var stdout,stderr bytes.Buffer
 cmd.Stdout=&stdout;cmd.Stderr=&stderr
 err:=cmd.Run()
 if ctx.Err()!=nil{return nil,fmt.Errorf("Argos Zeitlimit: %w",ctx.Err())}
 var result map[string]any
 if len(stdout.Bytes())>128*1024 {return nil,errors.New("Argos-Antwort zu groß")}
 if e:=json.Unmarshal(stdout.Bytes(),&result);e!=nil{
  suffix:=strings.TrimSpace(stderr.String());if len(suffix)>350{suffix=suffix[len(suffix)-350:]}
  return nil,fmt.Errorf("Argos-Prozessfehler: %v %s",err,suffix)
 }
 if result["ok"]!=true {return nil,errors.New(fmt.Sprint(result["error"]))}
 if err!=nil{return nil,fmt.Errorf("Argos-Worker: %w",err)}
 return result,nil
}
func (a *arkArgos) state()(bool,string){a.mu.Lock();defer a.mu.Unlock();return a.busy,a.message}
func (a *arkArgos) start(f func() error)error{
 a.mu.Lock();if a.busy {a.mu.Unlock();return errors.New("Argos führt bereits eine Operation aus")}
 a.busy=true;a.message="Einrichtung/Modellinstallation läuft …";a.mu.Unlock()
 go func(){err:=f();a.mu.Lock();a.busy=false;if err!=nil{a.message="Fehler: "+err.Error()}else{a.message="Fertig – lokale Modelle prüfen"};a.mu.Unlock()}()
 return nil
}
func argosRespond(w http.ResponseWriter,code int, value any){w.Header().Set("Content-Type","application/json; charset=utf-8");w.Header().Set("Cache-Control","no-store");w.WriteHeader(code);_ = json.NewEncoder(w).Encode(value)}
func argosError(w http.ResponseWriter,code int,msg string){argosRespond(w,code,map[string]any{"error":msg})}
func registerARKArgos(mux *http.ServeMux,address string){
 a:= &arkArgos{}
 mux.HandleFunc("/api/argos/status",func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodGet {argosError(w,405,"Nur GET");return}
  busy,msg:=a.state();res:=map[string]any{"ready":a.available(),"busy":busy,"message":msg,"pairs":[]any{},"languages":[]any{}}
  if !a.available(){if msg=="" {res["message"]="Argos-Runtime nicht eingerichtet. Einmalig einrichten."};argosRespond(w,200,res);return}
  if busy {argosRespond(w,200,res);return}
  ctx,cancel:=context.WithTimeout(r.Context(),25*time.Second);defer cancel()
  data,err:=a.execWorker(ctx,map[string]any{"action":"status"})
  if err!=nil {res["ready"]=false;res["message"]=err.Error()} else {res["pairs"]=data["pairs"];res["languages"]=data["languages"];if msg=="" {res["message"]="Bereit"}}
  argosRespond(w,200,res)
 })
 mux.HandleFunc("/api/argos/translate",func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodPost||!sameOrigin(r,address){argosError(w,403,"Nicht erlaubt");return}
  if !a.available(){argosError(w,503,"Argos noch nicht eingerichtet");return}
  busy,_:=a.state();if busy {argosError(w,409,"Argos installiert gerade Modelle");return}
  var in struct{Text string `json:"text"`;From string `json:"from"`;To string `json:"to"`}
  if e:=json.NewDecoder(http.MaxBytesReader(w,r.Body,32*1024)).Decode(&in);e!=nil{argosError(w,400,"Ungültige Eingabe");return}
  if strings.TrimSpace(in.Text)==""||len([]rune(in.Text))>8000{argosError(w,400,"Bitte Text mit maximal 8000 Zeichen eingeben");return}
  valid:=func(s string)bool{if len(s)<2||len(s)>3{return false};for _,c:=range s {if c<'a'||c>'z'{return false}};return true}
  if !valid(in.From)||!valid(in.To)||in.From==in.To{argosError(w,400,"Ungültiges Sprachpaar");return}
  ctx,cancel:=context.WithTimeout(r.Context(),100*time.Second);defer cancel()
  data,e:=a.execWorker(ctx,map[string]any{"action":"translate","text":in.Text,"from":in.From,"to":in.To})
  if e!=nil{argosError(w,422,e.Error());return};argosRespond(w,200,data)
 })
 mux.HandleFunc("/api/argos/setup",func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodPost||!sameOrigin(r,address){argosError(w,403,"Nicht erlaubt");return}
  if a.available(){
   ctx,cancel:=context.WithTimeout(r.Context(),25*time.Second)
   _,err:=a.execWorker(ctx,map[string]any{"action":"status"})
   cancel()
   if err==nil{argosRespond(w,200,map[string]any{"message":"Argos-Engine ist bereits eingerichtet"});return}
   // A partial/failed pip installation may leave python.exe behind. Re-run setup.
  }
  base,_,_:=a.paths();script:=filepath.Join(base,"ARK_ARGOS_EINRICHTEN.ps1")
  if _,err:=os.Stat(script);err!=nil{argosError(w,500,"Einrichtungsskript fehlt");return}
  if err:=a.start(func()error{
   ctx,cancel:=context.WithTimeout(context.Background(),20*time.Minute);defer cancel()
   cmd:=exec.CommandContext(ctx,"powershell.exe","-NoProfile","-ExecutionPolicy","Bypass","-File",script)
   cmd.Dir=base
   out,err:=cmd.CombinedOutput()
   if err!=nil {v:=string(out);if len(v)>600{v=v[len(v)-600:]};return fmt.Errorf("Setup fehlgeschlagen: %v %s",err,v)}
   if !a.available(){return errors.New("Setup meldete Erfolg, Python-Runtime fehlt")}
   return nil
  });err!=nil{argosError(w,409,err.Error());return}
  argosRespond(w,202,map[string]any{"message":"Argos-Einrichtung wurde gestartet. Status aktualisiert sich automatisch."})
 })
 handleInstall:=func(action string)http.HandlerFunc{return func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodPost||!sameOrigin(r,address){argosError(w,403,"Nicht erlaubt");return}
  if !a.available(){argosError(w,503,"Argos noch nicht eingerichtet");return}
  var req struct{From string `json:"from"`;To string `json:"to"`;Path string `json:"path"`}
  if e:=json.NewDecoder(http.MaxBytesReader(w,r.Body,4096)).Decode(&req);e!=nil{argosError(w,400,"Ungültige Eingabe");return}
  payload:=map[string]any{"action":action}
  if action=="install"{
   if !(req.From=="de"&&req.To=="en")&&!(req.From=="en"&&req.To=="de"){argosError(w,400,"Onlineinstallation nur Deutsch ↔ Englisch");return}
   payload["from"]=req.From;payload["to"]=req.To
  }else{
   if req.Path==""||!strings.EqualFold(filepath.Ext(req.Path),".argosmodel"){argosError(w,400,"Pfad zur .argosmodel-Datei benötigt");return}
   if st,e:=os.Stat(req.Path);e!=nil||st.IsDir()||st.Size()>1024*1024*1024{argosError(w,400,"Modellpfad ungültig oder Datei zu groß");return}
   payload["path"]=req.Path
  }
  if err:=a.start(func()error{
   ctx,cancel:=context.WithTimeout(context.Background(),12*time.Minute);defer cancel()
   _,err:=a.execWorker(ctx,payload);return err
  });err!=nil{argosError(w,409,err.Error());return}
  argosRespond(w,202,map[string]any{"message":"Modellinstallation gestartet. Bitte Status abwarten."})
 }}
 mux.HandleFunc("/api/argos/install",handleInstall("install"))
 mux.HandleFunc("/api/argos/import",handleInstall("import"))
}
