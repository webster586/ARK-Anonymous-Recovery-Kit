//go:build windows
package main
import (
  "net/http"
  "net/http/httptest"
  "strings"
  "testing"
)
func TestInstallExplorerLocalGETWithoutOrigin(t *testing.T) {
  const addr = "127.0.0.1:8765"
  mux := http.NewServeMux(); installRegister(mux,addr)
  request := httptest.NewRequest(http.MethodGet,"http://"+addr+"/api/install/explore",nil)
  response := httptest.NewRecorder();mux.ServeHTTP(response,request)
  if response.Code!=200 {t.Fatalf("local GET: %d %s",response.Code,response.Body.String())}
  if !strings.Contains(response.Body.String(),`"entries"`){t.Fatal("no entries")}
}
func TestInstallExplorerCrossOriginRejected(t *testing.T) {
  const addr="127.0.0.1:8765"
  mux:=http.NewServeMux();installRegister(mux,addr)
  for _,tc:=range []struct{host,origin string}{
    {"malicious.example",""},
    {addr,"https://malicious.example"},
  }{
    req:=httptest.NewRequest(http.MethodGet,"http://"+addr+"/api/install/explore",nil)
    req.Host=tc.host;if tc.origin!=""{req.Header.Set("Origin",tc.origin)}
    rec:=httptest.NewRecorder();mux.ServeHTTP(rec,req)
    if rec.Code!=http.StatusForbidden{t.Errorf("host=%s origin=%s got %d",tc.host,tc.origin,rec.Code)}
  }
}
func TestInstallExplorerRejectsWriteMethod(t *testing.T){
  mux:=http.NewServeMux();installRegister(mux,"127.0.0.1:8765")
  req:=httptest.NewRequest(http.MethodPost,"http://127.0.0.1:8765/api/install/explore",nil)
  rec:=httptest.NewRecorder();mux.ServeHTTP(rec,req)
  if rec.Code!=http.StatusMethodNotAllowed{t.Fatalf("unexpected status: %d",rec.Code)}
}
