//go:build windows

package main

// Origin V0.1: explicit, read-only ZIP inventory. Does not touch ARK application services.
import (
 "archive/zip"
 "context"
 "crypto/sha256"
 "encoding/hex"
 "encoding/json"
 "fmt"
 "hash/crc32"
 "io"
 "net/http"
 "os"
 "path/filepath"
 "sort"
 "strings"
 "sync"
 "time"
)

type originEntry struct { Path string `json:"path"`; SHA256 string `json:"sha256,omitempty"`; Size int64 `json:"size"`; Error string `json:"error,omitempty"` }
type originArchive struct { ComparedTo string `json:"compared_to,omitempty"`; Added int `json:"added"`; Changed int `json:"changed"`; Removed int `json:"removed"`; Unchanged int `json:"unchanged"`; Name string `json:"name"`; Size int64 `json:"size"`; SHA256 string `json:"sha256,omitempty"`; Entries int `json:"entries"`; UniqueBytes int64 `json:"unique_bytes"`; Error string `json:"error,omitempty"`; Files []originEntry `json:"files"` }
type originReport struct { Schema int `json:"schema"`; Timestamp string `json:"timestamp"`; Root string `json:"root"`; Count int `json:"archive_count"`; TotalBytes int64 `json:"total_zip_bytes"`; UniqueFiles int `json:"unique_file_contents"`; RawBytes int64 `json:"raw_uncompressed_bytes"`; UniqueBytes int64 `json:"unique_uncompressed_bytes"`; DuplicatedBytes int64 `json:"duplicate_uncompressed_bytes"`; Archives []originArchive `json:"archives"`; Warnings []string `json:"warnings"` }
type originStatus struct { State string `json:"state"`; Root string `json:"root"`; Current string `json:"current"`; Processed int `json:"processed"`; Total int `json:"total"`; Error string `json:"error,omitempty"`; Started string `json:"started,omitempty"`; Completed string `json:"completed,omitempty"`; Report string `json:"report,omitempty"`; Summary *originReport `json:"summary,omitempty"` }
var originState = struct { sync.Mutex; status originStatus; cancel context.CancelFunc }{status:originStatus{State:"idle"}}

func originDefaultRoot() string {
 exe,err:=os.Executable();if err!=nil{return ""}
 base:=filepath.Dir(exe)
 candidates:=[]string{
  filepath.Join(filepath.Dir(base),"Media","ARKVersionen"),
  filepath.Join(filepath.Dir(filepath.Dir(base)),"Media","ARKVersionen"),
  filepath.Join(base,"Media","ARKVersionen"),
 }
 for _,p:=range candidates {if st,e:=os.Stat(p);e==nil&&st.IsDir(){return p}}
 return ""
}
func originSnapshot() originStatus {originState.Lock();defer originState.Unlock();return originState.status}
func originUpdate(f func(*originStatus)) {originState.Lock();f(&originState.status);originState.Unlock()}
func originJSON(w http.ResponseWriter,code int,v any){w.Header().Set("Content-Type","application/json; charset=utf-8");w.Header().Set("Cache-Control","no-store");w.WriteHeader(code);_ = json.NewEncoder(w).Encode(v)}
func originRegister(mux *http.ServeMux) {
 mux.HandleFunc("/api/origin/status",func(w http.ResponseWriter,r *http.Request){if r.Method!="GET" {http.Error(w,"method",405);return};s:=originSnapshot();if s.Root=="" {s.Root=originDefaultRoot()};originJSON(w,200,s)})
 mux.HandleFunc("/api/origin/start",func(w http.ResponseWriter,r *http.Request){
  if r.Method!="POST" {http.Error(w,"method",405);return}
  if r.Header.Get("X-ARK-Origin")!="scan" {http.Error(w,"origin header required",403);return}
  root:=originDefaultRoot()
  if root=="" {originJSON(w,404,map[string]string{"error":"ARKVersionen nicht automatisch gefunden: erwarteter Ordner neben ARK-Installation / unter Media"});return}
  originState.Lock()
  if originState.status.State=="running" {originState.Unlock();originJSON(w,409,map[string]string{"error":"Scan läuft bereits"});return}
  ctx,cancel:=context.WithCancel(context.Background());originState.cancel=cancel
  originState.status=originStatus{State:"running",Root:root,Started:time.Now().Format(time.RFC3339)}
  originState.Unlock()
  go originScan(ctx,root)
  originJSON(w,202,map[string]string{"state":"running","root":root})
 })
 mux.HandleFunc("/api/origin/cancel",func(w http.ResponseWriter,r *http.Request){
  if r.Method!="POST" ||r.Header.Get("X-ARK-Origin")!="scan" {http.Error(w,"method",405);return}
  originState.Lock();if originState.cancel!=nil{originState.cancel()};originState.Unlock()
  originJSON(w,200,map[string]bool{"ok":true})
 })
}
func originHash(ctx context.Context,r io.Reader)(string,error){
 h:=sha256.New();buf:=make([]byte,1024*1024)
 for {if err:=ctx.Err();err!=nil{return "",err};n,err:=r.Read(buf);if n>0 {_,_=h.Write(buf[:n])};if err==io.EOF {return hex.EncodeToString(h.Sum(nil)),nil};if err!=nil{return "",err}}
}
func originZipPaths(root string)([]string,error){
 var files []string
 for _,folder:=range []string{root,filepath.Join(root,"Legacy")} {
  list,err:=os.ReadDir(folder);if os.IsNotExist(err){continue};if err!=nil{return nil,err}
  for _,x:=range list {if x.IsDir(){continue};if strings.EqualFold(filepath.Ext(x.Name()),".zip"){files=append(files,filepath.Join(folder,x.Name()))}}
 }
 sort.Strings(files);return files,nil
}
func originNormalName(n string)string{
 // Retain archive paths literally for forensic comparisons; sanitize only separators.
 return strings.ReplaceAll(n,"\\","/")
}
func originScan(ctx context.Context,root string){
 report:=originReport{Schema:1,Timestamp:time.Now().Format(time.RFC3339),Root:root}
 paths,err:=originZipPaths(root)
 if err!=nil {originFinish("error",err.Error(),"",nil);return}
 originUpdate(func(s *originStatus){s.Total=len(paths)})
 report.Count=len(paths)
 seen:=make(map[string]struct{})
 var previous map[string]string
 var previousName string
 for i,path:=range paths {
  if ctx.Err()!=nil {originFinish("cancelled","Abgebrochen; vorhandene Archive unverändert","",nil);return}
  rel,_:=filepath.Rel(root,path)
  originUpdate(func(s *originStatus){s.Current=rel;s.Processed=i})
  a:=originArchive{Name:rel}
  st,er:=os.Stat(path);if er!=nil {a.Error=er.Error();report.Archives=append(report.Archives,a);continue}
  a.Size=st.Size();report.TotalBytes+=st.Size()
  f,e:=os.Open(path);if e!=nil{a.Error=e.Error();report.Archives=append(report.Archives,a);continue}
  a.SHA256,e=originHash(ctx,f);_ = f.Close();if e!=nil{a.Error=e.Error();report.Archives=append(report.Archives,a);continue}
  z,e:=zip.OpenReader(path);if e!=nil{a.Error="ZIP: "+e.Error();report.Archives=append(report.Archives,a);continue}
  for _,zf:=range z.File {
   if ctx.Err()!=nil{break}
   if zf.FileInfo().IsDir(){continue}
   en:=originEntry{Path:originNormalName(zf.Name),Size:int64(zf.UncompressedSize64)}
   a.Entries++
   if zf.UncompressedSize64 > (1<<40) {en.Error="Einzeldatei > 1 TiB: Sicherheitslimit";a.Files=append(a.Files,en);continue}
   rc,e:=zf.Open();if e!=nil{en.Error=e.Error();a.Files=append(a.Files,en);continue}
   h:=sha256.New();crc:=crc32.NewIEEE();_,e=io.Copy(io.MultiWriter(h,crc),&originContextReader{ctx:ctx,r:rc});_ = rc.Close()
   if e!=nil{en.Error=e.Error()}else if crc.Sum32()!=zf.CRC32{en.Error="CRC-32 mismatch"}else{
    en.SHA256=hex.EncodeToString(h.Sum(nil));report.RawBytes+=en.Size
    key:=en.SHA256+fmt.Sprintf(":%d",en.Size)
    if _,exists:=seen[key];!exists{seen[key]=struct{}{};report.UniqueBytes+=en.Size;a.UniqueBytes+=en.Size}
   }
   a.Files=append(a.Files,en)
  }
  _=z.Close()
  for _,en:=range a.Files{if en.Error!=""{a.Error="Mindestens ein ZIP-Eintrag fehlerhaft";break}}
  // Per-file comparison is against previous archive in filename-sorted order.
  current:=make(map[string]string)
  for _,en:=range a.Files {if en.SHA256!="" {current[en.Path]=en.SHA256}}
  if previous!=nil {
   a.ComparedTo=previousName
   for name,hash:=range current {if old,exists:=previous[name];!exists{a.Added++}else if old!=hash{a.Changed++}else{a.Unchanged++}}
   for name:=range previous {if _,exists:=current[name];!exists{a.Removed++}}
  }
  if a.Error=="" {previous=current;previousName=a.Name}
  report.Archives=append(report.Archives,a)
  originUpdate(func(s *originStatus){s.Processed=i+1})
 }
 if ctx.Err()!=nil {originFinish("cancelled","Scan abgebrochen","",nil);return}
 report.UniqueFiles=len(seen);report.DuplicatedBytes=report.RawBytes-report.UniqueBytes
 report.Warnings=[]string{"Speichereinsparung ist ein theoretischer unkomprimierter Inhaltsvergleich, keine vorhergesagte ZIP-Delta-Groesse.","Archive wurden ausschliesslich gelesen. ZIP-Inhalte mit Fehlern gelten nicht als verifiziert.","Versionsvergleich erfolgt in Dateinamen-Sortierung; eine tatsächliche historische Versionsreihenfolge wird damit nicht nachgewiesen."}
 outDir:=filepath.Join(root,"Origin")
 for _,name:=range []string{"Manifests","Logs","Reports"}{if err=os.MkdirAll(filepath.Join(outDir,name),0755);err!=nil{originFinish("error",err.Error(),"",nil);return}}
 id:=time.Now().Format("20060102_150405")
 reportPath:=filepath.Join(outDir,"Manifests","origin_scan_"+id+".json")
 b,e:=json.MarshalIndent(report,"","  ");if e!=nil{originFinish("error",e.Error(),"",nil);return}
 if e=os.WriteFile(reportPath,b,0644);e!=nil{originFinish("error",e.Error(),"",nil);return}
 txt:=fmt.Sprintf("ARK-00 Origin V0.1 | %s\nArchive: %d\nZIP-Gesamtgroesse: %d Bytes\nEntpackte Inhalte: %d Bytes\nEinzigartige Inhalte: %d Bytes\nDoppelte Inhalte (unkomprimiert): %d Bytes\n\n",report.Timestamp,report.Count,report.TotalBytes,report.RawBytes,report.UniqueBytes,report.DuplicatedBytes)
 for _,a:=range report.Archives {txt+=fmt.Sprintf("%s | %d Bytes | %d Dateien | %s\n",a.Name,a.Size,a.Entries,a.Error)}
 _=os.WriteFile(filepath.Join(outDir,"Reports","origin_scan_"+id+".txt"),[]byte(txt),0644)
 _=os.WriteFile(filepath.Join(outDir,"Logs","origin_scan_"+id+".log"),[]byte(fmt.Sprintf("%s scan complete\nroot=%s\narchives=%d\n",report.Timestamp,root,report.Count)),0644)
 // Only a lightweight summary is returned to the UI; the full manifest stays on disk.
 for i:=range report.Archives {report.Archives[i].Files=nil}
 originFinish("complete","",reportPath,&report)
}
type originContextReader struct{ctx context.Context;r io.Reader}
func (x *originContextReader)Read(p []byte)(int,error){if err:=x.ctx.Err();err!=nil{return 0,err};return x.r.Read(p)}
func originFinish(state,reason,path string,summary *originReport){originUpdate(func(s *originStatus){s.State=state;s.Error=reason;s.Report=path;s.Summary=summary;s.Completed=time.Now().Format(time.RFC3339);s.Current=""});originState.Lock();originState.cancel=nil;originState.Unlock()}
