//go:build windows

package main

import (
 "encoding/json"
 "net/http"
 "net/http/httptest"
 "os"
 "path/filepath"
 "testing"
)

func TestARKMusicCatalogueAndRanges(t *testing.T) {
 root:=t.TempDir()
 music:=filepath.Join(root,"MP3")
 if err:=os.MkdirAll(filepath.Join(music,"Mix"),0755);err!=nil {t.Fatal(err)}
 for rel,content:=range map[string]string{"MP3\u002ftest.mp3":"abcdefghij","MP3\u002fMix\u002fsecond.wav":"testwave","MP3\u002fMix\u002fnotes.txt":"ignore"} {
   if err:=os.WriteFile(filepath.Join(root,filepath.FromSlash(rel)),[]byte(content),0644);err!=nil{t.Fatal(err)}
 }
 m:=&mediaService{root:root,appDir:root}
 rr:=httptest.NewRecorder();m.music(rr,httptest.NewRequest("GET","/api/media/music",nil))
 if rr.Code!=200 {t.Fatalf("catalog status=%d: %s",rr.Code,rr.Body.String())}
 var response struct {Ready bool `json:"ready"`; Tracks []struct{Path string `json:"path"`;Ext string `json:"ext"`} `json:"tracks"`}
 if err:=json.Unmarshal(rr.Body.Bytes(),&response);err!=nil{t.Fatal(err)}
 if !response.Ready||len(response.Tracks)!=2{t.Fatalf("expected two readable tracks: %+v",response)}
 for _,tr:=range response.Tracks {if tr.Ext==".txt" {t.Fatalf("txt file included in music catalogue")}}
 rr=httptest.NewRecorder()
 request:=httptest.NewRequest("GET","/api/media/file?path=MP3%2Ftest.mp3",nil)
 request.Header.Set("Range","bytes=2-5")
 m.file(rr,request)
 if rr.Code!=http.StatusPartialContent||rr.Body.String()!="cdef"{t.Fatalf("range status=%d body=%q",rr.Code,rr.Body.String())}
 if rr.Header().Get("Content-Type")!="audio/mpeg"{t.Fatalf("wrong MIME: %q",rr.Header().Get("Content-Type"))}
 rr=httptest.NewRecorder();m.file(rr,httptest.NewRequest("GET","/api/media/file?path=..%2Fsecret.mp3",nil))
 if rr.Code!=400 {t.Fatalf("path traversal status=%d",rr.Code)}
 rr=httptest.NewRecorder();m.music(rr,httptest.NewRequest("POST","/api/media/music",nil))
 if rr.Code!=405 {t.Fatalf("unexpected POST allowed: %d",rr.Code)}
}
