//go:build windows
package main

import (
 "bytes"
 "encoding/json"
 "fmt"
 "os"
 "os/exec"
 "path/filepath"
 "time"
 "context"
)
type audioInput struct { ID int `json:"id"`; Name string `json:"name"` }
func audioPath() string { exe,err:=os.Executable();if err!=nil{return "audio.json"};return filepath.Join(filepath.Dir(exe),"audio.json") }
func readAudioConfig() audioInput {
 c:=audioInput{-1,"Windows-Standardmikrofon"}
 b,err:=os.ReadFile(audioPath());if err!=nil{return c}
 if json.Unmarshal(b,&c)!=nil||c.ID < -1 {return audioInput{-1,"Windows-Standardmikrofon"}}
 if c.ID==-1{c.Name="Windows-Standardmikrofon"}
 return c
}
func writeAudioConfig(c audioInput)error{
 if c.ID < -1 {return fmt.Errorf("ungueltige Mikrofon-ID")}
 b,err:=json.MarshalIndent(c,"","  ");if err!=nil{return err}
 p:=audioPath();tmp:=p+".tmp"
 if err=os.WriteFile(tmp,append(b,'\n'),0600);err!=nil{return err}
 if err=os.Rename(tmp,p);err!=nil {os.Remove(tmp);return err}
 return nil
}
func listAudioDevices()([]audioInput,error){
 exe,err:=os.Executable();if err!=nil{return nil,err}
 ctx,cancel:=context.WithTimeout(context.Background(),12*time.Second);defer cancel()
 script:=filepath.Join(filepath.Dir(exe),"mic_devices.ps1")
 cmd:=exec.CommandContext(ctx,"powershell.exe","-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",script)
 cmd.Dir=filepath.Dir(exe)
 output,err:=cmd.CombinedOutput()
 if ctx.Err()!=nil{return nil,fmt.Errorf("Zeitlimit beim Lesen der Audiogeraete")}
 if err!=nil{return nil,fmt.Errorf("%s",bytes.TrimSpace(output))}
 var decoded struct{ Devices []audioInput `json:"devices"` }
 if err=json.Unmarshal(bytes.TrimSpace(output),&decoded);err!=nil{return nil,fmt.Errorf("Mikrofonausgabe unlesbar: %v",err)}
 return decoded.Devices,nil
}
