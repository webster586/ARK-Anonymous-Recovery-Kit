package main
import("os";"path/filepath";"testing";"archive/zip")
func TestARKZIPRoundTrip(t *testing.T){d:=t.TempDir();src:=filepath.Join(d,"quelle");os.MkdirAll(filepath.Join(src,"unter"),0755);os.WriteFile(filepath.Join(src,"unter","beispiel.txt"),[]byte("Bibel und ARK"),0644)
 dest:=filepath.Join(d,"test.zip");if n,e:=arkZIPCreate(src,dest);e!=nil||n!=1{t.Fatalf("create: %d %v",n,e)}
 tar:=filepath.Join(d,"ziel");os.Mkdir(tar,0755);if n,e:=arkZIPExtract(dest,tar);e!=nil||n!=1{t.Fatalf("extract: %d %v",n,e)}
 got,e:=os.ReadFile(filepath.Join(tar,"unter","beispiel.txt"));if e!=nil||string(got)!="Bibel und ARK"{t.Fatalf("content: %s %v",got,e)}
 if _,e:=arkZIPCreate(src,dest);e==nil{t.Fatal("must not overwrite existing ZIP")}
 if _,e:=arkZIPExtract(dest,tar);e==nil{t.Fatal("must not overwrite extracted files")}
}
func TestARKZIPTraversal(t *testing.T){d:=t.TempDir();zpath:=filepath.Join(d,"bad.zip");f,_:=os.Create(zpath);w:=zip.NewWriter(f);o,_:=w.Create("../../outside.txt");o.Write([]byte("bad"));w.Close();f.Close();target:=filepath.Join(d,"dest");os.Mkdir(target,0755)
 if _,err:=arkZIPExtract(zpath,target);err==nil{t.Fatal("zip slip allowed")}
 if _,err:=os.Stat(filepath.Join(d,"outside.txt"));!os.IsNotExist(err){t.Fatal("wrote outside target")}
}
