package main

import (
  "archive/zip"
  "fmt"
  "io"
  "os"
  "path/filepath"
  "strings"
)

const arkZIPFileCap = 100000
const arkZIPSizeCap int64 = 256 << 30

// archive creation is non-destructive: it refuses to overwrite output files.
func arkZIPCreate(source,target string) (int,error) {
  src,err:=filepath.Abs(source);if err!=nil{return 0,err}
  dst,err:=filepath.Abs(target);if err!=nil{return 0,err}
  info,err:=os.Lstat(src);if err!=nil{return 0,err}
  if info.Mode()&os.ModeSymlink!=0{return 0,fmt.Errorf("Symbolische Links sind keine gültige Quelle")}
  if strings.ToLower(filepath.Ext(dst))!=".zip"{return 0,fmt.Errorf("Zieldatei muss mit .zip enden")}
  if _,err=os.Stat(dst);err==nil{return 0,fmt.Errorf("Zieldatei existiert bereits") }else if !os.IsNotExist(err){return 0,err}
  if dst==src{return 0,fmt.Errorf("Quell- und Zielpfad sind identisch")}
  if info.IsDir() {
    sub,e:=filepath.Rel(src,dst);if e==nil&&sub!=".."&&!strings.HasPrefix(sub,".."+string(os.PathSeparator)){return 0,fmt.Errorf("ZIP-Ziel darf nicht innerhalb des Quellordners liegen")}
  }
  // Never rename a partially completed archive to the requested output name.
  f,err:=os.CreateTemp(filepath.Dir(dst),".ark-zip-*.tmp");if err!=nil{return 0,err}
  tmp:=f.Name();defer os.Remove(tmp)
  writer:=zip.NewWriter(f)
  written:=0;total:=int64(0)
  include:=func(path string,entry os.FileInfo,name string)error{
    if entry.Mode()&os.ModeSymlink!=0{return nil}
    if !entry.Mode().IsRegular()&&!entry.IsDir(){return nil}
    if entry.IsDir(){return nil}
    written++;if written>arkZIPFileCap{return fmt.Errorf("Grenze von %d Dateien überschritten",arkZIPFileCap)}
    total+=entry.Size();if total>arkZIPSizeCap{return fmt.Errorf("Maximal 256 GiB je Archiv")}
    header,e:=zip.FileInfoHeader(entry);if e!=nil{return e}
    header.Name=filepath.ToSlash(name);header.Method=zip.Deflate
    w,e:=writer.CreateHeader(header);if e!=nil{return e}
    handle,e:=os.Open(path);if e!=nil{return e};_,e=io.Copy(w,handle);ce:=handle.Close();if e!=nil{return e};return ce
  }
  if info.IsDir(){
    err=filepath.Walk(src,func(path string,fi os.FileInfo,e error)error{
      if e!=nil{return e};if fi.Mode()&os.ModeSymlink!=0{return nil}
      relative,e:=filepath.Rel(src,path);if e!=nil{return e};if relative=="."{return nil}
      return include(path,fi,relative)
    })
  }else{err=include(src,info,info.Name())}
  if err!=nil{writer.Close();f.Close();return 0,err}
  if err=writer.Close();err!=nil{f.Close();return 0,err}
  if err=f.Close();err!=nil{return 0,err}
  // Windows's os.Rename does not overwrite an existing destination.
  if _,err=os.Stat(dst);err==nil{return 0,fmt.Errorf("Zieldatei existiert bereits")}
  if err=os.Rename(tmp,dst);err!=nil{return 0,err};return written,nil
}

func arkZIPExtract(source,target string)(int,error){
  src,e:=filepath.Abs(source);if e!=nil{return 0,e}
  dst,e:=filepath.Abs(target);if e!=nil{return 0,e}
  stat,e:=os.Stat(dst);if e!=nil{return 0,fmt.Errorf("Zielordner muss bereits existieren: %w",e)}
  if !stat.IsDir(){return 0,fmt.Errorf("Ziel ist kein Ordner")}
  items,e:=os.ReadDir(dst);if e!=nil{return 0,e}
  if len(items)!=0{return 0,fmt.Errorf("Zielordner muss leer sein – bestehende Dateien bleiben unberührt")}
  reader,e:=zip.OpenReader(src);if e!=nil{return 0,e};defer reader.Close()
  if len(reader.File)>arkZIPFileCap{return 0,fmt.Errorf("Zu viele Dateien im ZIP")}
  var total uint64
  for _,z:=range reader.File{
    // Reject paths that would escape, absolute paths, Windows drive-letter attacks,
    // links, device names, and duplicate names before writing anything.
    clean:=filepath.Clean(filepath.FromSlash(z.Name))
    if z.Name==""||strings.ContainsAny(z.Name,"\\:")||filepath.IsAbs(clean)||clean==".."||strings.HasPrefix(clean,".."+string(os.PathSeparator))||strings.HasPrefix(z.Name,"/"){
      return 0,fmt.Errorf("Unsicherer ZIP-Eintrag: %q",z.Name)
    }
    if z.Mode()&os.ModeSymlink!=0{return 0,fmt.Errorf("Symbolische Links sind im ZIP nicht erlaubt")}
    for _,piece:=range strings.Split(filepath.ToSlash(clean),"/"){
      key:=strings.ToUpper(strings.TrimSuffix(piece,filepath.Ext(piece)))
      if key=="CON"||key=="PRN"||key=="AUX"||key=="NUL"||strings.HasPrefix(key,"COM")&&len(key)==4||strings.HasPrefix(key,"LPT")&&len(key)==4{return 0,fmt.Errorf("Reservierter Dateiname im ZIP")}
    }
    total+=z.UncompressedSize64
    if total>uint64(arkZIPSizeCap){return 0,fmt.Errorf("ZIP nach Entpacken größer als 256 GiB")}
  }
  extracted:=0
  for _,z:=range reader.File{
    name:=filepath.Clean(filepath.FromSlash(z.Name));full:=filepath.Join(dst,name)
    rel,e:=filepath.Rel(dst,full);if e!=nil||rel==".."||strings.HasPrefix(rel,".."+string(os.PathSeparator)){return extracted,fmt.Errorf("ZIP-Pfad außerhalb des Ziels")}
    if z.FileInfo().IsDir(){if e=os.MkdirAll(full,0755);e!=nil{return extracted,e};continue}
    if e=os.MkdirAll(filepath.Dir(full),0755);e!=nil{return extracted,e}
    in,e:=z.Open();if e!=nil{return extracted,e}
    out,e:=os.OpenFile(full,os.O_CREATE|os.O_EXCL|os.O_WRONLY,0644)
    if e!=nil{in.Close();return extracted,e}
    _,e=io.Copy(out,io.LimitReader(in,int64(z.UncompressedSize64)+1));clErr:=out.Close();in.Close()
    if e!=nil{os.Remove(full);return extracted,e}
    if clErr!=nil{os.Remove(full);return extracted,clErr}
    extracted++
  }
  return extracted,nil
}
