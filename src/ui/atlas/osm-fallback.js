// ARK offline vector tiles: lightweight self-contained MVT Canvas renderer.
// No CDN, npm, MapLibre, fonts or external assets required.  Read-only GETs.
'use strict';
function pb(bytes){let i=0; const n=bytes.length; function v(){let x=0,k=0;for(let t=0;t<10;t++){if(i>=n)throw Error('truncated protobuf');const b=bytes[i++];x+=(b&127)*2**k;if(!(b&128))return x;k+=7}throw Error('oversized varint')} return {v, bytes, get i(){return i}, set i(a){i=a}, get n(){return n}}}
function fields(bytes,fn){const r=pb(bytes);while(r.i<r.n){const key=r.v(),wire=key&7,id=key>>>3;let val;if(wire===0)val=r.v();else if(wire===2){const len=r.v(),start=r.i;if(start+len>r.n)throw Error('invalid protobuf length');val=r.bytes.subarray(start,start+len);r.i=start+len}else if(wire===1){val=r.bytes.subarray(r.i,r.i+8);r.i+=8}else if(wire===5){val=r.bytes.subarray(r.i,r.i+4);r.i+=4}else throw Error('unsupported protobuf wire type');fn(id,val,wire)}}
const utf=new TextDecoder();
function scalar(raw){let v='';fields(raw,(id,x,w)=>{if(id===1&&w===2)v=utf.decode(x);else if(id===4&&w===0)v=x;else if(id===5&&w===0)v=x;else if(id===6&&w===0)v=x;else if(id===7&&w===0)v=!!x;else if(id===2&&w===5)v=new DataView(x.buffer,x.byteOffset,x.byteLength).getFloat32(0,true);else if(id===3&&w===1)v=new DataView(x.buffer,x.byteOffset,x.byteLength).getFloat64(0,true)});return v}
function packed(a){if(!a)return[];const p=pb(a),o=[];while(p.i<p.n)o.push(p.v());return o}
function geom(commands){let x=0,y=0,idx=0,parts=[],part=null;const zig=n=>n%2?-(n+1)/2:n/2;while(idx<commands.length){const c=commands[idx++],op=c&7,count=c>>>3;if(!count)break;if(op===1||op===2){for(let j=0;j<count&&idx+1<commands.length;j++){x+=zig(commands[idx++]);y+=zig(commands[idx++]);if(op===1){part=[];parts.push(part)}if(!part){part=[];parts.push(part)}part.push([x,y])}}else if(op===7){for(let j=0;j<count;j++){if(part&&part.length>1)part.push(part[0])}}else break}return parts}
function vectorTile(buf){const out=[];fields(new Uint8Array(buf),(id,raw,w)=>{if(id!==3||w!==2)return;let name='',extent=4096,keys=[],values=[],rawFeatures=[];fields(raw,(tag,x,wire)=>{if(tag===1&&wire===2)name=utf.decode(x);else if(tag===2&&wire===2)rawFeatures.push(x);else if(tag===3&&wire===2)keys.push(utf.decode(x));else if(tag===4&&wire===2)values.push(scalar(x));else if(tag===5&&wire===0)extent=x});const feats=[];for(const rawF of rawFeatures){let type=0,tags=[],g=[];fields(rawF,(tag,x,w)=>{if(tag===2&&w===2)tags=packed(x);else if(tag===3&&w===0)type=x;else if(tag===4&&w===2)g=packed(x)});const props={};for(let j=0;j+1<tags.length;j+=2){if(keys[tags[j]]!==undefined)props[keys[tags[j]]]=values[tags[j+1]]}feats.push({type,props,parts:geom(g)})}out.push({name,extent,feats})});return out}
const styles={earth:['fill','#15302c'],landcover:['fill','#1c3b32'],landuse:['fill','#22463c'],water:['fill','#184f68'],buildings:['fill','#3a5a52'],roads:['line','#74e0bc'],boundaries:['line','#f8ba70'],places:['point','#f4c48e'],pois:['point','#e3e9d7']};
// ARK road level-of-detail: suppress geometry BEFORE Canvas path construction.
// Protomaps road kind_detail normally contains OSM hierarchy; kind is fallback.
// Unknown categories are conservative (Z12), so distant maps stay uncluttered.
export function roadMinZoom(props={}) {
 const detail=String(props.kind_detail||props.kind||'').toLowerCase().replace(/[- ]/g,'_');
 const k=detail.endsWith('_link')?detail.slice(0,-5):detail;
 if(k==='motorway'||k==='trunk'||k==='highway')return 5;
 if(k==='primary')return 6;
 if(k==='secondary'||k==='major_road')return 7;
 if(k==='tertiary')return 9;
 if(k==='unclassified'||k==='minor_road')return 11;
 if(k==='residential'||k==='living_street'||k==='street'||k==='road')return 12;
 if(k==='service'||k==='pedestrian')return 13;
 if(k==='track'||k==='path'||k==='cycleway'||k==='bridleway')return 14;
 if(k==='footway'||k==='steps'||k==='sidewalk'||k==='corridor')return 15;
 return 12;
}
export function roadVisible(props,zoom){return zoom>=roadMinZoom(props)}
function merc(lng,lat){lat=Math.max(-85,Math.min(85,lat));return [(lng+180)/360,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2]}
function invMerc(x,y){return [x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI]}
export class NavigationControl{}
export class Map{
 constructor(opts){this.root=typeof opts.container==='string'?document.getElementById(opts.container):opts.container;this.root.replaceChildren();this.canvas=document.createElement('canvas');this.canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none;cursor:grab';this.root.appendChild(this.canvas);this.ctx=this.canvas.getContext('2d');this.center=opts.center||[4,10];this.zoom=opts.zoom||1;this.style=opts.style;this.events={};this.cache=new globalThis.Map();this.pending=new Set();this.visibility={};this.dirty=0;this.frameQueued=false;this.dpr=1;this.failed=0;this.warnings=0;this.bind();this.resize();this.emit('load');}
 on(name,fn){(this.events[name]??=[]).push(fn);if(name==='load')queueMicrotask(()=>fn());return this}
 emit(name,event){for(const f of this.events[name]||[])f(event)}
 addControl(){return this}
 getLayer(id){return this.style.layers.find(l=>l.id===id)||null}
 setLayoutProperty(id,key,value){if(key==='visibility'){this.visibility[id]=value;this.scheduleDraw()}return this}
 resize(){const dpr=Math.min(2,devicePixelRatio||1);this.w=this.root.clientWidth||800;this.h=this.root.clientHeight||500;this.canvas.width=Math.round(this.w*dpr);this.canvas.height=Math.round(this.h*dpr);this.dpr=dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);this.scheduleDraw()}
 bind(){let down=null;this.canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY,...merc(...this.center)];this.canvas.setPointerCapture(e.pointerId);this.canvas.style.cursor='grabbing'});this.canvas.addEventListener('pointermove',e=>{if(!down)return;const n=2**this.zoom*512;const x=down[2]-(e.clientX-down[0])/n,y=down[3]-(e.clientY-down[1])/n;this.center=invMerc((x%1+1)%1,Math.max(.001,Math.min(.999,y)));this.scheduleDraw()});for(const k of ['pointerup','pointercancel'])this.canvas.addEventListener(k,()=>{down=null;this.canvas.style.cursor='grab'});this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(0,Math.min(15,this.zoom+(e.deltaY<0?.5:-.5)));this.scheduleDraw()},{passive:false})}
 tileUrl(z,x,y){return '/api/atlas/basemap/tile?z='+z+'&x='+x+'&y='+y}
 fetchTile(z,x,y){const k=z+'/'+x+'/'+y;if(this.cache.has(k)||this.pending.has(k))return;this.pending.add(k);fetch(this.tileUrl(z,x,y)).then(async r=>{if(!r.ok)throw Error('tile HTTP '+r.status);const buf=await r.arrayBuffer();this.cache.set(k,vectorTile(buf));if(this.cache.size>160){this.cache.delete(this.cache.keys().next().value)}}).catch(e=>{this.failed++;if(this.warnings++<3)console.warn('ARK OSM tile',k,e)}).finally(()=>{this.pending.delete(k);this.scheduleDraw()})}
 scheduleDraw(){
  if(this.frameQueued)return;
  this.frameQueued=true;
  requestAnimationFrame(()=>{this.frameQueued=false;this.draw()});
 }
 draw(){
  if(!this.w||!this.h)return;
  const c=this.ctx;
  c.fillStyle='#07171b';c.fillRect(0,0,this.w,this.h);
  const z=Math.max(0,Math.min(15,Math.floor(this.zoom)));
  const world=2**z,scale=2**(this.zoom-z),tilePx=512*scale;
  const [mx,my]=merc(...this.center),cx=mx*world,cy=my*world;
  const startX=Math.floor(cx-this.w/(2*tilePx))-1,endX=Math.ceil(cx+this.w/(2*tilePx))+1;
  const startY=Math.max(0,Math.floor(cy-this.h/(2*tilePx))-1);
  const endY=Math.min(world-1,Math.ceil(cy+this.h/(2*tilePx))+1);
  // Paint EVERY visible tile in global passes. Water polygons must always be
  // behind all streets (including bridges), even when tiles load out of order.
  // Labels render as the final pass, never underneath another tile's water.
  const visibleTiles=[];
  let count=0,loaded=0;
  for(let y=startY;y<=endY;y++){
   for(let x=startX;x<=endX;x++){
    if(++count>60)break;
    const tx=((x%world)+world)%world,key=z+'/'+tx+'/'+y;
    const screenX=this.w/2+(x-cx)*tilePx,screenY=this.h/2+(y-cy)*tilePx;
    const layers=this.cache.get(key);
    if(!layers){this.fetchTile(z,tx,y);continue}
    loaded++;
    visibleTiles.push({screenX,screenY,layers});
   }
   if(count>60)break;
  }
  // Consistent z-order across ALL tiles; OSM bridge segments overlay water.
  // Unknown layers remain skipped as before. Geometry is still filtered by LOD.
  const layerOrder=['earth','landcover','landuse','water','buildings','boundaries','roads','pois','places'];
  for(const layerName of layerOrder){
   for(const tile of visibleTiles){
    const layer=tile.layers.find(l=>l.name===layerName);
    if(!layer||this.visibility[layer.name]==='none')continue;
    if(layer.name==='buildings'&&this.zoom<12)continue;
    if(layer.name==='pois'&&this.zoom<14)continue;
    const st=styles[layer.name];if(!st)continue;
    const factor=tilePx/layer.extent;
    c.save();c.beginPath();c.rect(tile.screenX,tile.screenY,tilePx,tilePx);c.clip();
    c.translate(tile.screenX,tile.screenY);
    c.scale(factor,factor);c.fillStyle=st[1];c.strokeStyle=st[1];
    c.lineWidth=1/(this.dpr*factor);
    const isLine=st[0]==='line';
    if(isLine)c.beginPath();
    const tolerance=.8/(this.dpr*factor),tolerance2=tolerance*tolerance;
    for(const feat of layer.feats){
     if(layer.name==='roads'&&!roadVisible(feat.props,this.zoom))continue;
     if(!isLine)c.beginPath();
     let hasPath=false;
     for(const part of feat.parts){
      if(!part.length)continue;
      let x0=part[0][0],y0=part[0][1];
      c.moveTo(x0,y0);hasPath=true;
      for(let i=1;i<part.length;i++){
       const xx=part[i][0],yy=part[i][1],dx=xx-x0,dy=yy-y0;
       if(i<part.length-1&&dx*dx+dy*dy<tolerance2)continue;
       c.lineTo(xx,yy);x0=xx;y0=yy;
      }
      if(feat.type===3)c.closePath();
     }
     if(!hasPath)continue;
     if(!isLine){
      if(feat.type===3&&st[0]==='fill')c.fill('evenodd');
      else if(feat.type===2)c.stroke();
      else if(feat.type===1&&this.zoom>=3){
       for(const part of feat.parts){if(!part.length)continue;c.beginPath();c.arc(part[0][0],part[0][1],2/factor,0,Math.PI*2);c.fill()}
      }
     }
    }
    if(isLine)c.stroke();
    c.restore();
   }
  }
  // Final global label pass: labels are NOT clipped by source tile boundaries,
  // and neither waterways nor bridges can paint over town/city names.
  if(this.zoom>=3&&this.visibility.places!=='none'){
   c.font='11px Segoe UI,Arial';c.fillStyle='#f6e6c8';
   const seen=[];let labels=0;
   for(const tile of visibleTiles){
    const layer=tile.layers.find(l=>l.name==='places');if(!layer)continue;
    const factor=tilePx/layer.extent;
    for(const f of layer.feats){
     if(f.type!==1||!f.parts[0]?.[0])continue;
     const name=f.props['name:de']||f.props.name;if(!name)continue;
     const [px,py]=f.parts[0][0];
     const x=tile.screenX+px*factor+3,y=tile.screenY+py*factor;
     if(x<0||x>this.w-5||y<12||y>this.h-4)continue;
     if(seen.some(p=>Math.abs(p[0]-x)<36&&Math.abs(p[1]-y)<13))continue;
     seen.push([x,y]);c.fillText(String(name),x,y);
     if(++labels>=160)break;
    }
    if(labels>=160)break;
   }
  }
  if(!loaded&&this.failed){
   c.fillStyle='#f8ba70';c.font='13px Consolas';
   c.fillText('OSM: Kachel konnte nicht geladen werden (Konsole pruefen)',20,40);
  }
 }
}
