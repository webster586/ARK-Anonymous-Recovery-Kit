//go:build windows

package main

import (
  "bufio"
  "fmt"
  "io"
  "log"
  "os"
  "os/exec"
  "path/filepath"
  "strings"
  "sync"
  "time"
)

// Voice is a local, opt-in push-to-talk engine, based on System.Speech in
// the preinstalled Windows PowerShell / .NET Framework environment.  No
// network, cloud or audio file is used.  The German recognition engine must
// be installed in Windows; otherwise the rest of ARK is unaffected.
type Voice struct {
  mu sync.Mutex
  stdin io.WriteCloser
  cmd *exec.Cmd
  ready bool
  active bool
  state string
  text string
  problem string
  seq uint64
}
type voiceStatus struct {
  State string `json:"state"`
  Text string `json:"text"`
  Error string `json:"error"`
  Seq uint64 `json:"seq"`
  Ready bool `json:"ready"`
}
func newVoice() *Voice {return &Voice{state:"loading"}}
func (v *Voice) setState(state,txt,problem string){
 v.mu.Lock()
 v.state=state;v.text=txt;v.problem=problem;v.seq++
 v.mu.Unlock()
 if problem!=""{log.Printf("ARK VOICE: %s",problem)}
}
func (v *Voice) status() voiceStatus {
 v.mu.Lock();defer v.mu.Unlock()
 return voiceStatus{v.state,v.text,v.problem,v.seq,v.ready}
}
func (v *Voice) send(msg string)error{
 v.mu.Lock();defer v.mu.Unlock()
 if !v.ready||v.stdin==nil{return fmt.Errorf("Spracherkennung nicht verfügbar: %s",v.problem)}
 _,e:=io.WriteString(v.stdin,msg+"\n")
 return e
}
func (v *Voice) press(){
 v.mu.Lock()
 if v.active {v.mu.Unlock();return}
 if !v.ready {err:=v.problem;if err==""{err="Spracherkennung startet noch"};v.mu.Unlock();v.setState("error","",err);return}
 v.active=true
 v.mu.Unlock()
 if e:=v.send("START");e!=nil {v.mu.Lock();v.active=false;v.mu.Unlock();v.setState("error","",e.Error());return}
 v.setState("recording","","")
}
func (v *Voice) release(){
 v.mu.Lock()
 active:=v.active;v.active=false
 v.mu.Unlock()
 if !active{return}
 if e:=v.send("STOP");e!=nil{v.setState("error","",e.Error());return}
 v.setState("processing","","")
}
func (v *Voice) run(){
 exe,e:=os.Executable();if e!=nil{v.setState("error","","Programmverzeichnis nicht gefunden");return}
 script:=filepath.Join(filepath.Dir(exe),"voice_windows.ps1")
 // Prefer the completely local Whisper runtime when it has been prepared.
 // The previously working Windows engine remains an explicit fallback.
 whisperCLI:=filepath.Join(filepath.Dir(exe),"whisper-runtime","whisper-cli.exe")
 small:=filepath.Join(filepath.Dir(exe),"models","ggml-small.bin")
 base:=installSelectOr("whisper",false,filepath.Join(filepath.Dir(exe),"models","ggml-base.bin"))
 if _,err:=os.Stat(whisperCLI);err==nil {
   if _,err:=os.Stat(small);err==nil { script=filepath.Join(filepath.Dir(exe),"whisper_windows.ps1")
   } else if _,err:=os.Stat(base);err==nil {script=filepath.Join(filepath.Dir(exe),"whisper_windows.ps1")}
 }
 if _,e:=os.Stat(script);e!=nil {v.setState("error","","voice_windows.ps1 fehlt im Programmordner");return}
 cmd:=exec.Command("powershell.exe","-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",script)
 cmd.Dir=filepath.Dir(exe)
 input,e:=cmd.StdinPipe();if e!=nil{v.setState("error","",e.Error());return}
 output,e:=cmd.StdoutPipe();if e!=nil{v.setState("error","",e.Error());return}
 cmd.Stderr=os.Stderr
 if e:=cmd.Start();e!=nil{v.setState("error","","PowerShell konnte nicht gestartet werden: "+e.Error());return}
 v.mu.Lock();v.stdin=input;v.cmd=cmd;v.mu.Unlock()
 if filepath.Base(script)=="whisper_windows.ps1" {log.Println("ARK VOICE: lade Whisper.cpp (Deutsch, offline) ...")} else {log.Println("ARK VOICE: Windows-Fallback; Whisper noch nicht installiert") }
 scanner:=bufio.NewScanner(output)
 scanner.Buffer(make([]byte,4096),128*1024)
 for scanner.Scan(){
  line:=strings.TrimSpace(scanner.Text())
  switch {
  case line=="READY":
   v.mu.Lock();v.ready=true;v.mu.Unlock();v.setState("ready","","")
   log.Println("ARK VOICE: Offline-Spracherkennung ist bereit")
  case strings.HasPrefix(line,"TEXT\t"):
   txt:=strings.TrimSpace(strings.TrimPrefix(line,"TEXT\t"))
   if txt=="" {v.setState("empty","","")}else{v.setState("done",txt,"");log.Printf("ARK VOICE erkannt: %q",txt)}
  case line=="EMPTY":v.setState("empty","","")
  case line=="RECORDING":v.setState("recording","","")
  case line=="PROCESSING":v.setState("processing","","")
  case strings.HasPrefix(line,"ERROR\t"):
   v.mu.Lock();v.active=false;v.mu.Unlock()
   v.setState("error","",strings.TrimPrefix(line,"ERROR\t"))
  case line!="":log.Println("ARK VOICE:",line)
  }
 }
 if e:=scanner.Err();e!=nil{log.Println("ARK VOICE helper:",e)}
 if e:=cmd.Wait();e!=nil{log.Println("ARK VOICE exited:",e)}
 v.mu.Lock();v.ready=false;v.active=false;v.stdin=nil;v.mu.Unlock()
 if v.status().State!="error"{v.setState("error","","Sprachmodul wurde beendet")}
}
func (v *Voice) stop(){
 v.mu.Lock();input:=v.stdin;cmd:=v.cmd;v.mu.Unlock()
 if input!=nil{_,_=io.WriteString(input,"QUIT\n");_=input.Close()}
 if cmd!=nil && cmd.Process!=nil {go func(){time.Sleep(time.Second*2);_ = cmd.Process.Kill()}()}
}
