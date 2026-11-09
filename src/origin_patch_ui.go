//go:build windows

package main

import (
    "context"
    "crypto/sha256"
    "embed"
    "encoding/hex"
    "encoding/json"
    "errors"
    "fmt"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "sort"
    "strings"
    "sync"
    "time"
)

//go:embed origin_patch_engine.py
var originPatchAssets embed.FS

type originPatchJob struct {
    State string `json:"state"`
    Action string `json:"action,omitempty"`
    Started string `json:"started,omitempty"`
    Completed string `json:"completed,omitempty"`
    Error string `json:"error,omitempty"`
    Output string `json:"output,omitempty"`
    Result json.RawMessage `json:"result,omitempty"`
}
var originPatcher = struct {
    sync.Mutex
    Job originPatchJob
    Cancel context.CancelFunc
}{Job: originPatchJob{State:"idle"}}

type originPatchList struct {
    Root string `json:"root"`
    Archives []string `json:"archives"`
    Patches []string `json:"patches"`
}

func originPatchFileName(n string, ext string) bool {
    if n=="" || n=="." || n==".." || filepath.Base(n)!=n || strings.ContainsAny(n,"/\\:\x00") {return false}
    return strings.EqualFold(filepath.Ext(n),ext)
}
func originPatchFindArchive(root,n string) (string,error) {
    if !originPatchFileName(n,".zip") {return "",errors.New("ungueltiger ZIP-Dateiname")}
    for _,dir:= range []string{root,filepath.Join(root,"Legacy")} {
        path:=filepath.Join(dir,n)
        if info,e:=os.Lstat(path);e==nil && info.Mode().IsRegular(){return path,nil}
    }
    return "",errors.New("Archiv im freigegebenen Ordner nicht gefunden")
}
func originPatchFindPatch(root,n string)(string,error){
    if !originPatchFileName(n,".arkpatch") {return "",errors.New("ungueltiger Patch-Name")}
    path:=filepath.Join(root,"Origin","Patches",n)
    if info,e:=os.Lstat(path);e==nil && info.Mode().IsRegular(){return path,nil}
    return "",errors.New("Patch nicht gefunden")
}
func originPatchListFiles(root string) originPatchList {
    out:=originPatchList{Root:root,Archives:[]string{},Patches:[]string{}}
    for _,dir:=range []string{root,filepath.Join(root,"Legacy")}{
        entries,e:=os.ReadDir(dir);if e!=nil {continue}
        for _,en:=range entries {if !en.IsDir() && en.Type().IsRegular() && originPatchFileName(en.Name(),".zip") {out.Archives=append(out.Archives,en.Name())}}
    }
    entries,_:=os.ReadDir(filepath.Join(root,"Origin","Patches"))
    for _,en:=range entries {if !en.IsDir() && en.Type().IsRegular() && originPatchFileName(en.Name(),".arkpatch") {out.Patches=append(out.Patches,en.Name())}}
    sort.Strings(out.Archives);sort.Strings(out.Patches);return out
}
func originPatchSnapshot()originPatchJob{originPatcher.Lock();defer originPatcher.Unlock();return originPatcher.Job}
func originPatchDone(job originPatchJob) {originPatcher.Lock();originPatcher.Job=job;originPatcher.Cancel=nil;originPatcher.Unlock()}
func originPatchRegister(mux *http.ServeMux){
    mux.HandleFunc("/api/origin/patch/list",func(w http.ResponseWriter,r *http.Request){
        if r.Method!=http.MethodGet {http.Error(w,"method",405);return}
        root:=originDefaultRoot();if root=="" {originJSON(w,404,map[string]string{"error":"ARKVersionen nicht gefunden"});return}
        originJSON(w,200,originPatchListFiles(root))
    })
    mux.HandleFunc("/api/origin/patch/status",func(w http.ResponseWriter,r *http.Request){
        if r.Method!=http.MethodGet {http.Error(w,"method",405);return};originJSON(w,200,originPatchSnapshot())
    })
    mux.HandleFunc("/api/origin/patch/start",func(w http.ResponseWriter,r *http.Request){
        if r.Method!=http.MethodPost {http.Error(w,"method",405);return}
        if r.Header.Get("X-ARK-Origin")!="patch" {http.Error(w,"origin header required",403);return}
        r.Body=http.MaxBytesReader(w,r.Body,8192)
        var q struct{ Action string `json:"action"`; Base string `json:"base"`; Target string `json:"target"`; Patch string `json:"patch"` }
        if e:=json.NewDecoder(r.Body).Decode(&q);e!=nil {originJSON(w,400,map[string]string{"error":"Ungueltige Anfrage"});return}
        if q.Action!="create" && q.Action!="restore" {originJSON(w,400,map[string]string{"error":"Unbekannte Aktion"});return}
        root:=originDefaultRoot();if root=="" {originJSON(w,404,map[string]string{"error":"ARKVersionen nicht gefunden"});return}
        base,e:=originPatchFindArchive(root,q.Base);if e!=nil {originJSON(w,400,map[string]string{"error":e.Error()});return}
        var other string
        if q.Action=="create" {other,e=originPatchFindArchive(root,q.Target);if e==nil && other==base {e=errors.New("Basis und Ziel sind gleich")}} else {other,e=originPatchFindPatch(root,q.Patch)}
        if e!=nil {originJSON(w,400,map[string]string{"error":e.Error()});return}
        originPatcher.Lock()
        if originPatcher.Job.State=="running" {originPatcher.Unlock();originJSON(w,409,map[string]string{"error":"Patch-Aufgabe laeuft bereits"});return}
        ctx,cancel:=context.WithCancel(context.Background());originPatcher.Cancel=cancel
        job:=originPatchJob{State:"running",Action:q.Action,Started:time.Now().Format(time.RFC3339)}
        originPatcher.Job=job;originPatcher.Unlock()
        go originPatchRun(ctx,root,q.Action,base,other,job)
        originJSON(w,202,map[string]string{"state":"running"})
    })
    mux.HandleFunc("/api/origin/patch/cancel",func(w http.ResponseWriter,r *http.Request){
        if r.Method!=http.MethodPost || r.Header.Get("X-ARK-Origin")!="patch" {http.Error(w,"method",405);return}
        originPatcher.Lock();if originPatcher.Cancel!=nil {originPatcher.Cancel()};originPatcher.Unlock()
        originJSON(w,200,map[string]bool{"ok":true})
    })
}
func originPatchRun(ctx context.Context,root,action,base,other string,job originPatchJob){
    finish:=func(state,errMsg string,data []byte){
        job.State=state;job.Error=errMsg;job.Completed=time.Now().Format(time.RFC3339)
        if json.Valid(data) {job.Result=append(json.RawMessage(nil),data...)}
        originPatchDone(job)
    }
    script,e:=originPatchAssets.ReadFile("origin_patch_engine.py")
    if e!=nil {finish("error",e.Error(),nil);return}
    f,e:=os.CreateTemp("","ark-origin-v022-*.py")
    if e!=nil {finish("error",e.Error(),nil);return}
    scriptPath:=f.Name();defer os.Remove(scriptPath)
    if _,e=f.Write(script);e!=nil {f.Close();finish("error",e.Error(),nil);return};if e=f.Close();e!=nil {finish("error",e.Error(),nil);return}
    stamp:=time.Now().Format("20060102_150405.000000000")
    digest:=sha256.Sum256([]byte(base+"|"+other+"|"+stamp))
    id:=hex.EncodeToString(digest[:])[:12]
    var args []string
    if action=="create" {
        patchdir:=filepath.Join(root,"Origin","Patches")
        reportdir:=filepath.Join(root,"Origin","Reports")
        if e=os.MkdirAll(patchdir,0755);e!=nil {finish("error",e.Error(),nil);return}
        if e=os.MkdirAll(reportdir,0755);e!=nil {finish("error",e.Error(),nil);return}
        out:=filepath.Join(patchdir,"ARK_"+stamp+"_"+id+".arkpatch")
        report:=filepath.Join(reportdir,"ARK_"+stamp+"_"+id+".json")
        job.Output=out
        args=[]string{"-X","utf8",scriptPath,"create","--base",base,"--target",other,"--output",out,"--report",report}
    }else{
        builddir:=filepath.Join(root,"Origin","Builds")
        if e=os.MkdirAll(builddir,0755);e!=nil {finish("error",e.Error(),nil);return}
        out:=filepath.Join(builddir,"ARK_RECONSTRUCTED_"+stamp+"_"+id+".zip")
        job.Output=out
        args=[]string{"-X","utf8",scriptPath,"restore","--base",base,"--patch",other,"--output",out}
    }
    // The prototype uses the user's installed local Python. No network, shell or production writes.
    cmd:=exec.CommandContext(ctx,"python",args...)
    cmd.Env=append(os.Environ(),"PYTHONIOENCODING=utf-8","PYTHONUTF8=1")
    data,e:=cmd.CombinedOutput()
    if e!=nil {if ctx.Err()!=nil {finish("cancelled","Durch Benutzer abgebrochen",nil)}else{finish("error",fmt.Sprintf("%v: %s",e,strings.TrimSpace(string(data))),nil)};return}
    if !json.Valid(data) {finish("error","Unlesbare Generatorantwort: "+string(data),nil);return}
    finish("complete","",data)
}
