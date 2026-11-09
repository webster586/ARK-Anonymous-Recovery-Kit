package main
import (
 "encoding/binary"
 "math"
 "testing"
)
func TestGpkgPointAndMultipolygon(t *testing.T){
 mk:=func(kind uint32,payload []byte) []byte {
  b:=[]byte{'G','P',0,1,0xe6,0x10,0,0,1}
  n:=make([]byte,4);binary.LittleEndian.PutUint32(n,kind);b=append(b,n...);return append(b,payload...)
 }
 point:=make([]byte,16);binary.LittleEndian.PutUint64(point[:8],math.Float64bits(6.95));binary.LittleEndian.PutUint64(point[8:],math.Float64bits(50.79));g,err:=decodeGPKG(mk(1,point));if err!=nil||g.Type!="Point"{t.Fatalf("point: %+v %v",g,err)}
 p:=make([]byte,0);u32:=func(n uint32){v:=make([]byte,4);binary.LittleEndian.PutUint32(v,n);p=append(p,v...)};f64:=func(n float64){v:=make([]byte,8);binary.LittleEndian.PutUint64(v,math.Float64bits(n));p=append(p,v...)}
 u32(1);p=append(p,1);u32(3);u32(1);u32(4);for _,xy:=range [][2]float64{{0,0},{2,0},{2,2},{0,0}}{f64(xy[0]);f64(xy[1])}
 mp,err:=decodeGPKG(mk(6,p));if err!=nil||mp.Type!="MultiPolygon"{t.Fatalf("multi: %+v %v",mp,err)}
}
