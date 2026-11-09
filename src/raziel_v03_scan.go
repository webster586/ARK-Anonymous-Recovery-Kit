package main

import (
 "context"
 "encoding/json"
 "errors"
 "net/http"
 "os"
 "path/filepath"
 "runtime"
 "sort"
 "strings"
 "sync"
 "time"
)

// Raziel V0.3 scans only locations identified by the existing read-only locator.
// No user-provided file system paths, no writes, and no traversal of symlinks.
type rz3Group struct {
 Module string `json:"module,omitempty"`
 Name string `json:"name"`
 Bytes int64 `json:"bytes"`
 Files int64 `json:"files"`
 Directories int64 `json:"directories"`
}
type rz3Location struct {
 Kind string `json:"kind"`
 Path string `json:"path"`
 Drive string `json:"drive"`
 Module string `json:"module"`
 Bytes int64 `json:"bytes"`
 Files int64 `json:"files"`
 Directories int64 `json:"directories"`
 Errors int64 `json:"errors"`
 Complete bool `json:"complete"`
 Overlaps string `json:"overlaps,omitempty"`
 Groups []rz3Group `json:"groups"`
 Extensions []rz3Group `json:"extensions"`
}
type rz3Snapshot struct {
 Version string `json:"version"`
 State string `json:"state"`
 ReadOnly bool `json:"read_only"`
 StartedAt string `json:"started_at,omitempty"`
 EndedAt string `json:"ended_at,omitempty"`
 CurrentPath string `json:"current_path,omitempty"`
 TotalFiles int64 `json:"total_files"`
 TotalBytes int64 `json:"total_bytes"`
 TotalErrors int64 `json:"total_errors"`
 Locations []rz3Location `json:"locations"`
 Message string `json:"message,omitempty"`
}
type rz3ScanManager struct { mu sync.Mutex; result rz3Snapshot; cancel context.CancelFunc }
var rz3Manager = &rz3ScanManager{result:rz3Snapshot{Version:"0.3.2",State:"idle",ReadOnly:true,Locations:[]rz3Location{}}}

func rz3Module(kind,path string) string {
 s:=strings.ToLower(kind+" "+path)
 switch {
 case strings.Contains(s,"ark-anwendung"):return "ARK-01 Raziel"
 case strings.Contains(s,"ki-modelle"),strings.Contains(s,"\\ai"),strings.Contains(s,"\\qwen"),strings.Contains(s,"\\ollama"):return "ARK-04 Michael"
 case strings.Contains(s,"geodaten"),strings.Contains(s,"wiki"),strings.Contains(s,"wikibooks"),strings.Contains(s,"kiwix"),strings.Contains(s,"buecher"),strings.Contains(s,"bücher"),strings.Contains(s,"bibel"),strings.Contains(s,"fachbuch"):return "ARK-02 Uriel"
 case strings.Contains(s,"ark-medien"):return "ARK-02 / 03 / 04 (gemischt)"
 case strings.Contains(s,"\\spiele"),strings.Contains(s,"\\videos"),strings.Contains(s,"\\filme"),strings.Contains(s,"\\mp3"),strings.Contains(s,"\\bilder"),strings.Contains(s,"\\musik"),strings.Contains(s,"\\3dprint"):return "ARK-03 Gabriel"
 default:return "Unzugeordnet"
 }
}
func rz3ChildModule(parent, child string) string {
 if parent=="ARK-Medien" {
   switch strings.ToLower(child) {
   case "geodaten","wikipedia","wikibooks","bücher","buecher","bibel":return "ARK-02 Uriel"
   case "ai","qwen","ollama":return "ARK-04 Michael"
   case "videos","filme","mp3","spiele","bilder","3dprint":return "ARK-03 Gabriel"
   case "arkversionen","programme":return "ARK-01 Raziel"
   default:return "Unzugeordnet"
   }
 }
 return rz3Module(parent,child)
}

func rz3Drive(path string) string {if len(path)>=2 && path[1]==':' {return strings.ToUpper(path[:2])};return "?"}
func rz3IsUnder(child,parent string) bool {
 c:=strings.ToLower(filepath.Clean(child));p:=strings.ToLower(filepath.Clean(parent))
 return c!=p && strings.HasPrefix(c,p+string(os.PathSeparator))
}
func rz3SortedGroups(m map[string]*rz3Group, limit int) []rz3Group {
 out:=make([]rz3Group,0,len(m));for _,v:=range m {out=append(out,*v)}
 sort.Slice(out,func(i,j int)bool {if out[i].Bytes==out[j].Bytes{return out[i].Name<out[j].Name};return out[i].Bytes>out[j].Bytes})
 if len(out)>limit {out=out[:limit]};return out
}
func (m *rz3ScanManager) snapshot() rz3Snapshot {
 m.mu.Lock();defer m.mu.Unlock()
 r:=m.result
 r.Locations=append([]rz3Location(nil),m.result.Locations...)
 return r
}
func (m *rz3ScanManager) update(fn func(*rz3Snapshot)) {m.mu.Lock();fn(&m.result);m.mu.Unlock()}
func (m *rz3ScanManager) start() bool {
 m.mu.Lock();defer m.mu.Unlock()
 if m.result.State=="running" {return false}
 ctx,cancel:=context.WithTimeout(context.Background(),30*time.Minute)
 m.cancel=cancel
 m.result=rz3Snapshot{Version:"0.3.2",State:"running",ReadOnly:true,StartedAt:time.Now().Format(time.RFC3339),Locations:[]rz3Location{}}
 go m.run(ctx,cancel)
 return true
}
func (m *rz3ScanManager) run(ctx context.Context, cancel context.CancelFunc) {
 defer cancel()
 info:=razielReadOnlyInventory()
 // Existing locator decides paths. Ignore duplicates and non-absolute paths.
 seen:=map[string]bool{}
 places:=make([]rz3Location,0,len(info.Found))
 for _,p:=range info.Found {
  if !filepath.IsAbs(p.Path) {continue}
  cleaned:=filepath.Clean(p.Path);key:=strings.ToLower(cleaned)
  if seen[key] {continue};seen[key]=true
  places=append(places,rz3Location{Kind:p.Kind,Path:cleaned,Drive:rz3Drive(cleaned),Module:rz3Module(p.Kind,cleaned),Groups:[]rz3Group{},Extensions:[]rz3Group{}})
 }
 for i:=range places {for j:=range places {if i!=j && rz3IsUnder(places[i].Path,places[j].Path){places[i].Overlaps=places[j].Path;break}}}
 m.update(func(s *rz3Snapshot){s.Locations=places})
 cancelled:=false
 const maxEntriesPerLocation int64 = 2000000
 for i:=range places {
  if ctx.Err()!=nil {cancelled=true;break}
  root:=places[i].Path
  groups:=map[string]*rz3Group{}
  extensions:=map[string]*rz3Group{}
  var entries int64
  loc:=places[i]
  walkErr:=filepath.WalkDir(root,func(path string,d os.DirEntry,err error) error {
   if ctx.Err()!=nil{return ctx.Err()}
   if entries>=maxEntriesPerLocation{return errors.New("limit: too many entries")}
   entries++
   if err!=nil {loc.Errors++;return nil}
   if d.Type()&os.ModeSymlink!=0 {return nil}
   if path==root {return nil}
   rel,relErr:=filepath.Rel(root,path);if relErr!=nil {loc.Errors++;return nil}
   first:=strings.SplitN(rel,string(os.PathSeparator),2)[0]
   g:=groups[first];if g==nil {g=&rz3Group{Name:first,Module:rz3ChildModule(loc.Kind,first)};groups[first]=g}
   if d.IsDir(){loc.Directories++;g.Directories++} else if d.Type().IsRegular() {
    fi,e:=d.Info();if e!=nil {loc.Errors++;return nil}
    n:=fi.Size();if n<0 {n=0}
    loc.Files++;loc.Bytes+=n;g.Files++;g.Bytes+=n
    ext:=strings.ToLower(filepath.Ext(d.Name()));if ext=="" {ext="(ohne Endung)"};if len(ext)>24 {ext="(sonstige)"}
    x:=extensions[ext];if x==nil {x=&rz3Group{Name:ext};extensions[ext]=x};x.Bytes+=n;x.Files++
   }
   if entries%250==0 {
    m.update(func(s *rz3Snapshot){
     s.CurrentPath=path;s.Locations[i].Bytes=loc.Bytes;s.Locations[i].Files=loc.Files
     s.Locations[i].Directories=loc.Directories;s.Locations[i].Errors=loc.Errors
     s.TotalFiles=0;s.TotalBytes=0;s.TotalErrors=0
     for _,v:=range s.Locations{s.TotalFiles+=v.Files;s.TotalBytes+=v.Bytes;s.TotalErrors+=v.Errors}
    })
   }
   return nil
  })
  if walkErr==nil {loc.Complete=true}else if ctx.Err()!=nil {cancelled=true}else {loc.Errors++;m.update(func(s *rz3Snapshot){s.Message="Mindestens ein Verzeichnis konnte nicht vollstaendig gelesen werden oder erreichte das Sicherheitslimit"})}
  loc.Groups=rz3SortedGroups(groups,100)
  loc.Extensions=rz3SortedGroups(extensions,32)
  m.update(func(s *rz3Snapshot){s.Locations[i]=loc;s.TotalBytes=0;s.TotalFiles=0;s.TotalErrors=0;for _,v:=range s.Locations{s.TotalBytes+=v.Bytes;s.TotalFiles+=v.Files;s.TotalErrors+=v.Errors}})
  if cancelled {break}
 }
 m.update(func(s *rz3Snapshot){
  s.EndedAt=time.Now().Format(time.RFC3339);s.CurrentPath=""
  if cancelled {s.State="cancelled";s.Message="Scan abgebrochen; angezeigte Ergebnisse sind unvollstaendig"} else if s.TotalErrors>0 {s.State="partial";if s.Message=="" {s.Message="Einige Dateien oder Ordner waren nicht lesbar"}} else {s.State="complete"}
 })
}
func registerRazielV3(mux *http.ServeMux) {
 // Explicitly loopback-only to avoid exposing local drive paths to LAN browsers.
 local:=func(w http.ResponseWriter,r *http.Request)bool {ip:=strings.Split(r.RemoteAddr,":")[0];_ = ip
  host:=r.RemoteAddr
  if strings.HasPrefix(host,"127.0.0.1:")||strings.HasPrefix(host,"[::1]:") {return true}
  http.Error(w,"Nur lokal",http.StatusForbidden);return false
 }
 respond:=func(w http.ResponseWriter,s rz3Snapshot){w.Header().Set("Content-Type","application/json; charset=utf-8");w.Header().Set("Cache-Control","no-store");w.Header().Set("X-Content-Type-Options","nosniff");_ = json.NewEncoder(w).Encode(s)}
 mux.HandleFunc("/api/raziel/v3/scan/status",func(w http.ResponseWriter,r *http.Request){if !local(w,r){return};if r.Method!="GET"{http.Error(w,"Nur GET",405);return};respond(w,rz3Manager.snapshot())})
 mux.HandleFunc("/api/raziel/v3/scan/start",func(w http.ResponseWriter,r *http.Request){if !local(w,r){return};if r.Method!="POST"{http.Error(w,"Nur POST",405);return};if r.Header.Get("Origin")!="" && r.Header.Get("Origin")!="http://127.0.0.1:8765" && r.Header.Get("Origin")!="http://localhost:8765"{http.Error(w,"Origin nicht erlaubt",403);return};if !rz3Manager.start(){http.Error(w,"Scan laeuft",409);return};respond(w,rz3Manager.snapshot())})
 mux.HandleFunc("/api/raziel/v3/scan/cancel",func(w http.ResponseWriter,r *http.Request){if !local(w,r){return};if r.Method!="POST"{http.Error(w,"Nur POST",405);return};if r.Header.Get("Origin")!="" && r.Header.Get("Origin")!="http://127.0.0.1:8765" && r.Header.Get("Origin")!="http://localhost:8765"{http.Error(w,"Origin nicht erlaubt",403);return};rz3Manager.mu.Lock();if rz3Manager.cancel!=nil&&rz3Manager.result.State=="running" {rz3Manager.cancel()};rz3Manager.mu.Unlock();respond(w,rz3Manager.snapshot())})
 mux.HandleFunc("/api/raziel/v3/health",func(w http.ResponseWriter,r *http.Request){if !local(w,r){return};if r.Method!="GET"{http.Error(w,"Nur GET",405);return};respond(w,rz3Manager.snapshot())})
}
var _ = runtime.GOOS
