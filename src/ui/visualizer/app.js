'use strict';
const $=id=>document.getElementById(id);
const arkEmbedded=new URLSearchParams(location.search).has('ark');
let arkActive=false;
const canvas=$('wave'),ctx=canvas.getContext('2d'),stage=$('stage'),wheel=$('wheel'),mini=$('mini'),mctx=mini.getContext('2d'),settings=$('settings'),fields=$('settingFields'),devices=$('devices');
const base=[['sensitivity','Empfindlichkeit','%',10,200,1],['smoothing','Beruhigung','%',0,95,1]];
const spec={
 koenig:['Königgrätzer · 42 Balken',{color:'#ffffff',sensitivity:100,smoothing:60,gain:100,barWidth:82,rounding:9},[['gain','Balkenhöhe','%',10,300,1],['barWidth','Balkenbreite','%',20,100,1],['rounding','Eckenradius','px',0,30,1]]],
 waveform:['Waveform',{color:'#5de4bd',sensitivity:100,smoothing:55,amplitude:100,lineWidth:2,detail:100},[['amplitude','Amplitude','%',10,300,1],['lineWidth','Linienstärke','px',1,12,.5],['detail','Auflösung','%',10,100,1]]],
 bars:['Bars & Waves',{color:'#5de4bd',sensitivity:100,smoothing:70,gain:100,count:64,gap:3},[['gain','Ausschlag','%',10,300,1],['count','Anzahl Balken','',8,160,1],['gap','Balkenabstand','px',0,12,1]]],
 radial:['Radialspektrum',{color:'#5de4bd',sensitivity:100,smoothing:70,gain:100,count:96,radius:25,lineWidth:3},[['gain','Ausschlag','%',10,300,1],['count','Anzahl Strahlen','',16,180,1],['radius','Innenradius','%',5,42,1],['lineWidth','Strahlenstärke','px',1,12,.5]]],
 alchemy:['Alchemy · Hommage',{color:'#ff66d9',sensitivity:100,smoothing:72,arms:14,turn:30,spread:80},[['arms','Anzahl Lichtarme','',3,48,1],['turn','Drehgeschwindigkeit','°/s',0,180,1],['spread','Ausdehnung','%',10,160,1]]],
 ambience:['Ambience · Hommage',{color:'#39b9ff',sensitivity:100,smoothing:82,layers:7,flow:25,warp:65},[['layers','Farbwellen','',2,15,1],['flow','Fließgeschwindigkeit','%',0,150,1],['warp','Wellenverformung','%',0,200,1]]],
 battery:['Battery · Hommage',{color:'#ffb34c',sensitivity:100,smoothing:65,rings:9,twist:35,thickness:3},[['rings','Anzahl Ringe','',2,24,1],['twist','Verdrehung','°',0,180,1],['thickness','Linienstärke','px',1,12,1]]],
 particle:['Particle · Hommage',{color:'#66f8bd',sensitivity:100,smoothing:60,particles:140,speed:60,size:3},[['particles','Partikelanzahl','',20,500,1],['speed','Partikelgeschwindigkeit','%',0,200,1],['size','Partikelgröße','px',1,12,1]]],
 plenoptic:['Plenoptic · Hommage',{color:'#8ad9ff',sensitivity:100,smoothing:68,grid:11,depth:80,rotation:18},[['grid','Gitterdichte','',4,26,1],['depth','Tiefenwirkung','%',0,200,1],['rotation','Drehgeschwindigkeit','°/s',0,120,1]]],
 spikes:['Spikes · Hommage',{color:'#ff4c99',sensitivity:100,smoothing:68,points:44,height:100,spin:15},[['points','Spitzenanzahl','',8,128,1],['height','Spitzenlänge','%',10,200,1],['spin','Rotation','°/s',0,120,1]]],
 musical:['Musical Colors · Hommage',{color:'#d16bff',sensitivity:100,smoothing:70,petals:12,extent:90,rotation:24},[['petals','Farbsegmente','',3,32,1],['extent','Ausdehnung','%',10,170,1],['rotation','Rotation','°/s',0,120,1]]],
 blazing:['BlazingColors · Hommage',{color:'#ff612e',sensitivity:100,smoothing:70,flames:40,height:110,flow:40},[['flames','Flammenanzahl','',8,120,1],['height','Flammenhöhe','%',10,200,1],['flow','Flackerbewegung','%',0,150,1]]],
 cubes:['ColorCubes · Hommage',{color:'#38d7ff',sensitivity:100,smoothing:70,columns:12,depth:70,angle:24},[['columns','Würfelspalten','',3,26,1],['depth','Würfelhöhe','%',10,200,1],['angle','Drehgeschwindigkeit','°/s',0,120,1]]],
 pulsing:['PulsingColors · Hommage',{color:'#c35aff',sensitivity:100,smoothing:75,rings:14,expansion:110,rotation:20},[['rings','Farbkreise','',3,30,1],['expansion','Ausdehnung','%',10,200,1],['rotation','Drehgeschwindigkeit','°/s',0,120,1]]],
 softie:['Softie the Snowman · Hommage',{color:'#8bdafa',sensitivity:100,smoothing:75,snow:120,snowSpeed:50,bounce:80},[['snow','Schneeflocken','',10,400,1],['snowSpeed','Schneefalltempo','%',0,200,1],['bounce','Figurbewegung','%',0,200,1]]],

 ribbon:['Neon Ribbon Wave',{color:'#19dff6',sensitivity:100,smoothing:78,lines:17,amplitude:95,glow:15,spread:42,drift:12},[['lines','Wellenlinien','',1,45,1],['amplitude','Wellenhöhe','%',5,220,1],['glow','Leuchtstärke','px',0,28,1],['spread','Linienabstand','%',0,100,1],['drift','Wanderung','%',0,100,1]]],
 retroeq:['Retro Rainbow Equalizer',{color:'#ff40d9',sensitivity:100,smoothing:74,columns:32,segments:14,gap:16,reflection:52,height:82},[['columns','Spaltenanzahl','',8,96,1],['segments','Segmentanzahl','',4,30,1],['gap','Segmentabstand','%',0,45,1],['reflection','Spiegelung','%',0,100,1],['height','Balkenhöhe','%',10,130,1]]],
 ring:['Radial Ring Spectrum',{color:'#00e8e8',sensitivity:100,smoothing:75,rings:3,segments:100,radius:19,amplitude:76,rotation:9},[['rings','Ringanzahl','',1,6,1],['segments','Segmente','',24,200,1],['radius','Innenradius','%',5,36,1],['amplitude','Ausschlag','%',5,150,1],['rotation','Drehgeschwindigkeit','°/s',-90,90,1]]],
 terrain:['Wireframe Terrain Flyover',{color:'#30f3ff',sensitivity:100,smoothing:77,speed:38,altitude:54,tilt:21,mountains:90,density:22,distance:80,glow:4,depth:100},[['speed','Fluggeschwindigkeit','Einheiten/s',0,200,1],['altitude','Flughöhe','%',5,150,1],['tilt','Kameraneigung','°',-25,65,1],['mountains','Terrainhöhe','%',0,200,1],['density','Gitterdichte','',8,42,1],['distance','Sichtweite','%',20,150,1],['glow','Leuchtstärke','px',0,15,1],['depth','Tiefenwirkung','%',20,170,1]]],
 mirror:['Mirror Spectrum Landscape',{color:'#ff5255',sensitivity:100,smoothing:78,points:100,height:90,reflection:65,softness:75,horizon:52,glow:9},[['points','Frequenzpunkte','',16,200,1],['height','Wellenhöhe','%',10,180,1],['reflection','Spiegelungsstärke','%',0,100,1],['softness','Kurvenglättung','%',0,100,1],['horizon','Horizontlinie','%',25,75,1],['glow','Leuchtstärke','px',0,25,1]]],
 kaleido:['Kaleidoscope Tunnel',{color:'#ff51b6',sensitivity:100,smoothing:74,segments:14,rings:18,spin:15,zoom:22,warp:75,depth:90},[['segments','Spiegelsegmente','',4,36,2],['rings','Tunnelringe','',4,36,1],['spin','Drehgeschwindigkeit','°/s',-100,100,1],['zoom','Zoomgeschwindigkeit','%',0,150,1],['warp','Audioverzerrung','%',0,200,1],['depth','Tunneltiefe','%',10,150,1]]],
 cyber:['Synthwave Radar / Cyber City',{color:'#22ddf5',sensitivity:100,smoothing:73,rings:4,buildings:55,grid:75,glow:8,pulse:100,horizon:60},[['rings','Spektrumringe','',1,7,1],['buildings','Gebäudeanzahl','',10,100,1],['grid','Bodenraster','%',0,100,1],['glow','Neon-Leuchten','px',0,22,1],['pulse','Bass-Puls','%',0,200,1],['horizon','Horizont','%',35,85,1]]],
 horizon:['Synthwave Horizon',{color:'#f13bb7',sensitivity:100,smoothing:77,sun:28,grid:70,travel:32,stars:95,waveHeight:65,glow:9},[['sun','Sonnengröße','%',10,60,1],['grid','Gitterstärke','%',0,100,1],['travel','Bodenbewegung','%',0,140,1],['stars','Sternenanzahl','',0,200,1],['waveHeight','Waveform-Höhe','%',5,200,1],['glow','Leuchtstärke','px',0,22,1]]],
 yule:['Yule Log · Hommage',{color:'#ff9b31',sensitivity:100,smoothing:70,sparks:95,flame:90,sway:60},[['sparks','Funkenanzahl','',5,300,1],['flame','Flammenhöhe','%',10,200,1],['sway','Flackern','%',0,200,1]]]
};
const ids=Object.keys(spec),values=Object.fromEntries(ids.map(id=>[id,{gradient:'solid',color2:'#1188ff',color3:'#fc31a9',colorSpeed:20,...spec[id][1]}]));
let selected='waveform',highlight='waveform',audioContext=null,stream=null,source=null,analyser=null,samples=null,frequency=null,smoothed=null,changing=false,timer=0,frame=0;
// Die Flugposition wird nur bei tatsächlichem Audiosignal fortgeschrieben.
let terrainTravel=0,lastTerrainFrame=null;
const status=t=>$('status').textContent=t;
// Für 144 Hz: Renderfläche höchstens in CSS-Pixeln. Kein 4-facher Pixelaufwand bei DPR 2.
function resize(){const r=canvas.getBoundingClientRect();const w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}}
new ResizeObserver(resize).observe(canvas);
const level=(f,i,n,p)=>{if(!f)return 0;const idx=Math.min(f.length-1,Math.floor(i/n*(f.length*.70)));return Math.min(1,f[idx]/255*(p.sensitivity/100));};
function hueColor(h){return `hsl(${((h%360)+360)%360} 100% 62%)`}
function mixColor(a,b,r){const x=parseInt(a.slice(1),16),y=parseInt(b.slice(1),16),k=Math.max(0,Math.min(1,r));return '#'+[16,8,0].map(shift=>Math.round(((x>>shift)&255)*(1-k)+((y>>shift)&255)*k).toString(16).padStart(2,'0')).join('');}
// Farbwertberechnung je Renderframe cachen (besonders bei Segment- und Partikeleffekten).
let frameColorCache=new WeakMap();
function paletteColor(p,portion,t){
 const qkey=Math.max(0,Math.min(512,Math.round(portion*512)));
 let cached=frameColorCache.get(p);
 if(!cached){cached=new Map();frameColorCache.set(p,cached)}
 if(cached.has(qkey))return cached.get(qkey);
 const result=paletteColorRaw(p,qkey/512,t);
 cached.set(qkey,result);
 return result;
}
function paletteColorRaw(p,portion,t){
 const q=Math.max(0,Math.min(1,portion)),time=t/1000*(p.colorSpeed||0)*0.25;
 if(p.gradient==='rainbow')return hueColor(q*360+time*30);
 if(p.gradient==='cycle')return hueColor(time*30);
 if(p.gradient==='solid')return p.color;
 if(p.gradient==='two')return mixColor(p.color,p.color2,q);
 return q<.5?mixColor(p.color,p.color2,q*2):mixColor(p.color2,p.color3,(q-.5)*2);
}
function applyPalette(c,p,w,h,t){
 if(p.gradient==='solid'||p.gradient==='cycle'){c.strokeStyle=c.fillStyle=paletteColor(p,0,t);return;}
 const g=c.createLinearGradient(0,0,w,0);
 if(p.gradient==='rainbow'){
  for(let i=0;i<=12;i++)g.addColorStop(i/12,paletteColor(p,i/12,t));
 }else if(p.gradient==='two'){
  g.addColorStop(0,p.color);g.addColorStop(1,p.color2);
 }else{
  g.addColorStop(0,p.color);g.addColorStop(.5,p.color2);g.addColorStop(1,p.color3);
 }
 c.strokeStyle=c.fillStyle=g;
}

function signalAt(i,n,p){return analyser?level(frequency,((i%n)+n)%n,n,p):0;}
function waveAt(i,n,p){return analyser&&smoothed?Math.abs(smoothed[Math.min(smoothed.length-1,Math.floor(i/n*smoothed.length))])*p.sensitivity/100:0;}
function drawNew(c,id,w,h,t,p,preview){
 const time=t/1000,cx=w/2,cy=h/2,short=Math.min(w,h),stroke=(x=1)=>Math.max(.65,x*(preview?.7:1));
 const colored=(u)=>paletteColor(p,u,t);
 if(id==='ribbon'){
  // Shared signal samples and phases: computed once per frame, not once per ribbon.
  // Avoid Canvas shadowBlur (very costly for multiple full-width strokes at 144 Hz).
  const points=Math.max(48,Math.min(192,Math.round(w/7)));
  const signal=new Float32Array(points+1),xs=new Float32Array(points+1);
  const phaseA=new Float32Array(points+1),phaseB=new Float32Array(points+1);
  const audioScale=h*.29*p.amplitude/100, driftScale=h*.12;
  for(let i=0;i<=points;i++){
   const u=i/points, pos=u*180;
   xs[i]=u*w;
   signal[i]=signalAt(Math.floor(u*90),90,p);
   phaseA[i]=pos*.082+time*p.drift*.03;
   phaseB[i]=pos*.06+time*p.drift*.05;
  }
  const count=Math.max(1,Math.round(p.lines));
  const glow=!preview && p.glow>0;
  for(let j=0;j<count;j++){
   const q=j/Math.max(1,count-1), vOffset=(q-.5)*h*p.spread/200;
   const path=new Path2D();
   for(let i=0;i<=points;i++){
    const v=signal[i];
    const drift=Math.sin(phaseB[i]+j*.18);
    const y=cy+vOffset+Math.sin(phaseA[i]+j*.2)*(h*.015+v*audioScale)+drift*v*driftScale;
    if(i===0)path.moveTo(xs[i],y);else path.lineTo(xs[i],y);
   }
   const color=colored(q);
   if(glow){
    // Soft luminous outline without blur filters or extra canvas allocations.
    c.strokeStyle=color;c.globalAlpha=Math.min(.24,.05+p.glow*.006);
    c.lineWidth=stroke(1.2)+p.glow*.52;c.stroke(path);
   }
   c.globalAlpha=1;c.strokeStyle=color;c.lineWidth=stroke(1.2);c.stroke(path);
  }
 }else if(id==='retroeq'){
  let bw=w/p.columns,baseline=h*(p.reflection>0?.55:.96),maxh=baseline*.88*p.height/100,sh=maxh/p.segments;
  for(let i=0;i<p.columns;i++){let v=signalAt(i,p.columns,p),levels=Math.round(v*p.segments),x=i*bw+bw*.12;for(let j=0;j<levels;j++){let col=colored(i/Math.max(1,p.columns-1));c.fillStyle=col;const y=baseline-j*sh-sh*.87;c.fillRect(x,y,bw*.76,sh*(1-p.gap/100));if(p.reflection){c.globalAlpha=p.reflection/100*(1-j/Math.max(1,p.segments))*.42;c.fillRect(x,baseline+j*sh+3,bw*.76,sh*(1-p.gap/100));c.globalAlpha=1}}}
 }else if(id==='ring'){
  for(let r=0;r<p.rings;r++){c.lineWidth=stroke(1.4+r*.3);let inner=short*(p.radius/100+r*.052);for(let i=0;i<p.segments;i++){const a=i/p.segments*Math.PI*2-Math.PI/2+time*p.rotation*Math.PI/180*(r%2?-1:1),v=signalAt(i+r*13,p.segments,p),out=inner+v*short*.22*p.amplitude/100;c.strokeStyle=colored((i/p.segments+r/p.rings)%1);c.beginPath();c.moveTo(cx+Math.cos(a)*inner,cy+Math.sin(a)*inner);c.lineTo(cx+Math.cos(a)*out,cy+Math.sin(a)*out);c.stroke()}}
 }else if(id==='terrain'){
  const rows=preview?20:Math.round(12+p.density*.85),cols=preview?20:p.density,travel=terrainTravel;
  let horizon=h*(.32+p.tilt/260),length=10*p.distance/80,alt=p.altitude/100*1.9+.18;
  const terrain=(x,z)=>{let band=Math.floor((x+4)/8*85),v=signalAt(band,85,p);return (Math.sin(x*1.1+z*.7)*.26+Math.sin(x*2.2-z*.4)*.12+Math.sin(z*.83+x*.48)*.18+v*.7)*p.mountains/100};
  const project=(x,z)=>{const zz=Math.max(.3,z),persp=p.depth/100;return [cx+x*w*.44/(zz*.43+1)*persp,horizon+h*(.35+(alt-terrain(x,z))*-.24)/(zz*.29+1)+h*.12/zz]};
  c.lineWidth=stroke(1);c.shadowBlur=preview?0:p.glow;c.shadowColor=p.color;
  for(let rz=rows;rz>=1;rz--){let z=.4+Math.pow(rz/rows,1.38)*length,zz=z+travel; c.strokeStyle=colored(1-rz/rows);c.beginPath();for(let j=0;j<=cols;j++){let x=(j/cols-.5)*13,pt=project(x,z),yy=terrain(x,zz),y=pt[1]-yy*h*.18/(z*.3+1);if(j===0)c.moveTo(pt[0],y);else c.lineTo(pt[0],y)}c.stroke()}
  for(let j=0;j<=cols;j++){c.strokeStyle=colored(j/cols);c.beginPath();for(let rz=1;rz<=rows;rz++){let z=.4+Math.pow(rz/rows,1.38)*length,x=(j/cols-.5)*13,pt=project(x,z),y=pt[1]-terrain(x,z+travel)*h*.18/(z*.3+1);if(rz===1)c.moveTo(pt[0],y);else c.lineTo(pt[0],y)}c.stroke()}c.shadowBlur=0;
 }else if(id==='mirror'){
  let baseline=h*p.horizon/100,n=p.points;const arr=[];for(let i=0;i<=n;i++){let f0=signalAt(i,n,p),f1=signalAt(Math.max(0,i-1),n,p),f2=signalAt(Math.min(n-1,i+1),n,p),v=f0*(1-p.softness/100)+(f0+f1+f2)/3*p.softness/100;arr.push([i/n*w,Math.min(h*.46,v*h*.45*p.height/100)])}
  c.shadowBlur=preview?0:p.glow;c.shadowColor=p.color;c.beginPath();c.moveTo(0,baseline);for(const [x,v] of arr)c.lineTo(x,baseline-v);c.lineTo(w,baseline);c.closePath();c.globalAlpha=.76;c.fill();c.globalAlpha=1;c.stroke();if(p.reflection){c.globalAlpha=p.reflection/100*.4;c.beginPath();c.moveTo(0,baseline);for(const [x,v] of arr)c.lineTo(x,baseline+v);c.lineTo(w,baseline);c.closePath();c.fill();c.globalAlpha=1}c.shadowBlur=0;
 }else if(id==='kaleido'){
  c.translate(cx,cy);c.rotate(time*p.spin*Math.PI/180);for(let r=p.rings;r>=1;r--){let z=((r/p.rings+time*p.zoom*.003)%1),rad=short*(.06+z*.9)*p.depth/100;let v=signalAt(r,p.rings,p);c.globalAlpha=.15+v*.7;c.strokeStyle=colored(z);c.lineWidth=stroke(1+v*2);c.beginPath();for(let i=0;i<=p.segments;i++){let a=i/p.segments*Math.PI*2,rr=rad*(1+(i%2?1:-1)*v*p.warp/500);if(!i)c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);else c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}c.stroke()}c.globalAlpha=1;
 }else if(id==='cyber'){
  let horizon=h*p.horizon/100;c.shadowBlur=preview?0:p.glow;c.shadowColor=p.color;c.lineWidth=stroke(1);let base=signalAt(2,12,p);for(let i=0;i<p.buildings;i++){let x=i/p.buildings*w,bw=w/p.buildings*.85,amp=signalAt(i,p.buildings,p),height=h*(.035+amp*.38*p.pulse/100);c.fillStyle=colored(i/p.buildings);c.globalAlpha=.5+amp*.5;c.fillRect(x,horizon-height,bw,height)}c.globalAlpha=1;
  for(let r=0;r<p.rings;r++){let rad=short*(.08+r*.048)*(1+base*.1);for(let i=0;i<96;i++){let a=i/96*Math.PI*2,v=signalAt(i,96,p);c.strokeStyle=colored((i/96+r*.14)%1);c.beginPath();c.moveTo(cx+Math.cos(a)*rad,horizon*.48+Math.sin(a)*rad);c.lineTo(cx+Math.cos(a)*(rad+v*short*.1),horizon*.48+Math.sin(a)*(rad+v*short*.1));c.stroke()}}
  if(p.grid){c.globalAlpha=p.grid/100*.6;c.strokeStyle=p.color;for(let i=-10;i<=10;i++){c.beginPath();c.moveTo(cx,horizon);c.lineTo(cx+i*w*.2,h);c.stroke()}for(let i=1;i<=13;i++){let y=horizon+(h-horizon)*Math.pow(i/13,1.8);c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}c.globalAlpha=1}c.shadowBlur=0;
 }else if(id==='horizon'){
  const horizon=h*.64,sunr=short*p.sun/200;c.fillStyle=colored(.7);c.globalAlpha=.85;c.beginPath();c.arc(cx,horizon-sunr*.68,sunr,0,Math.PI*2);c.fill();c.globalAlpha=1;c.fillStyle='#060a0f';for(let i=0;i<5;i++)c.fillRect(cx-sunr,horizon-sunr*.45+i*sunr*.27,sunr*2,sunr*.045*(i+1));
  for(let i=0;i<p.stars;i++){let x=((i*7919)%997)/997*w,y=((i*2971)%991)/991*horizon*.9;c.fillStyle=colored(i/Math.max(1,p.stars));c.globalAlpha=.25+signalAt(i,90,p)*.5;c.fillRect(x,y,stroke(1),stroke(1))}c.globalAlpha=1;
  c.strokeStyle=p.color;c.globalAlpha=p.grid/100*.8;for(let i=-12;i<=12;i++){c.beginPath();c.moveTo(cx,horizon);c.lineTo(cx+i*w*.15,h);c.stroke()}for(let i=1;i<=15;i++){let phase=(time*p.travel*.025)%1,frac=(i-phase)/15;if(frac<0)continue;let y=horizon+Math.pow(frac,2)*(h-horizon);c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}c.globalAlpha=1;
  c.strokeStyle=colored(.1);c.lineWidth=stroke(2);c.shadowBlur=preview?0:p.glow;c.shadowColor=p.color;c.beginPath();for(let i=0;i<=180;i++){const x=i/180*w,y=horizon-h*.025-signalAt(i,180,p)*h*.15*p.waveHeight/100;if(!i)c.moveTo(x,y);else c.lineTo(x,y)}c.stroke();c.shadowBlur=0;
 }
}

function render(c,id,w,h,t,preview=false){const p=values[id],f=frequency,active=!!analyser,scale=w/1200;
 c.fillStyle='#060a0f';c.fillRect(0,0,w,h);c.save();c.lineCap='round';c.lineJoin='round';applyPalette(c,p,w,h,t);
 const cx=w/2,cy=h/2,short=Math.min(w,h),time=t/1000,amp=active?1:0;
 if(['ribbon','retroeq','ring','terrain','mirror','kaleido','cyber','horizon'].includes(id)){drawNew(c,id,w,h,t,p,preview);
 }else if(id==='koenig'){
 if(active){const bars=42,bw=w/bars,gap=bw*(1-p.barWidth/100),hMax=h*.465;for(let i=0;i<bars;i++){const v=Math.min(1,level(f,i,bars,p)*p.gain/100);const bh=v*hMax;const x=i*bw+gap/2;const y=cy-bh;const radius=Math.min(p.rounding*(preview?.5:Math.max(.7,scale)),(bw-gap)/2,bh);c.fillStyle=paletteColor(p,i/(bars-1),t);c.beginPath();if(c.roundRect)c.roundRect(x,y,Math.max(.5,bw-gap),bh*2,radius);else c.rect(x,y,Math.max(.5,bw-gap),bh*2);c.fill();}}
 }else if(id==='waveform'){
 c.strokeStyle='#263039';c.lineWidth=1;c.beginPath();c.moveTo(0,cy);c.lineTo(w,cy);c.stroke();if(active){applyPalette(c,p,w,h,t);c.lineWidth=Math.max(.7,p.lineWidth*(preview?0.8:Math.max(1,scale)));c.beginPath();const n=Math.max(2,Math.floor(smoothed.length*p.detail/100));for(let x=0;x<w;x+=Math.max(1,w/1200)){const i=Math.min(n-1,Math.floor(x/w*n)),y=cy-Math.max(-1,Math.min(1,smoothed[i]*p.amplitude/100))*h*.46;if(x===0)c.moveTo(x,y);else c.lineTo(x,y)}c.stroke()}
 }else if(id==='bars'){
 if(active){const count=p.count,bw=w/count,gap=p.gap*(preview?.4:Math.max(1,scale));for(let i=0;i<count;i++){let v=level(f,i,count,p)*p.gain/100;c.fillRect(i*bw+gap/2,h-Math.min(h,v*h),Math.max(.5,bw-gap),Math.min(h,v*h))}}
 }else if(id==='radial'){
 if(active){c.lineWidth=p.lineWidth*(preview?.6:Math.max(1,scale));c.beginPath();for(let i=0;i<p.count;i++){const a=i*2*Math.PI/p.count-Math.PI/2,inn=short*p.radius/100,outer=inn+level(f,i,p.count,p)*short*.44*p.gain/100;c.moveTo(cx+Math.cos(a)*inn,cy+Math.sin(a)*inn);c.lineTo(cx+Math.cos(a)*outer,cy+Math.sin(a)*outer)}c.stroke()}
 }else if(id==='alchemy'){
 const count=p.arms;for(let k=0;k<count;k++){const v=level(f,k,count,p),a=k*Math.PI*2/count+time*p.turn*Math.PI/180,rad=short*(.12+v*.48*p.spread/100);c.globalAlpha=.2+v*.8;c.strokeStyle=paletteColor(p,k/count,t);c.lineWidth=Math.max(1,short*.004);c.beginPath();c.moveTo(cx,cy);c.quadraticCurveTo(cx+Math.cos(a+.7)*rad*.5,cy+Math.sin(a+.7)*rad*.5,cx+Math.cos(a)*rad,cy+Math.sin(a)*rad);c.stroke()}
 }else if(id==='ambience'){
 for(let k=0;k<p.layers;k++){const v=level(f,k,p.layers,p),phase=time*p.flow/100+k*.8;c.beginPath();for(let x=0;x<=w;x+=Math.max(2,w/150)){let y=cy+(k-(p.layers-1)/2)*h*.075+Math.sin(x/w*8+phase)*h*.12*v*p.warp/100;if(!x)c.moveTo(x,y);else c.lineTo(x,y)}c.strokeStyle=paletteColor(p,k/p.layers,t);c.lineWidth=Math.max(1,h*.025);c.stroke()}
 }else if(id==='battery'){
 for(let k=0;k<p.rings;k++){const v=level(f,k,p.rings,p),r=short*(.08+k/p.rings*.40)*(1+v*.30),angle=(k%2?-1:1)*(p.twist*Math.PI/180+time*.11);c.save();c.translate(cx,cy);c.rotate(angle);c.globalAlpha=.15+.75*v;c.lineWidth=Math.max(1,p.thickness*(preview?.5:1));c.strokeRect(-r,-r*.65,2*r,1.3*r);c.restore()}
 }else if(id==='particle'){
 for(let k=0;k<p.particles;k++){const band=k%64,v=level(f,band,64,p),ang=k*2.399963+time*(.05+p.speed/500)*(k%2?1:-1),dist=Math.sqrt(k/p.particles)*short*.57*(.65+v*.7),x=cx+Math.cos(ang)*dist,y=cy+Math.sin(ang)*dist;c.globalAlpha=.08+v*.85;c.beginPath();c.arc(x,y,Math.max(.4,p.size*(preview?.45:1)*(.5+v)),0,Math.PI*2);c.fill()}
 }else if(id==='plenoptic'){
 c.translate(cx,cy);c.rotate(time*p.rotation*Math.PI/180);for(let i=0;i<p.grid;i++)for(let j=0;j<p.grid;j++){const v=level(f,(i*7+j*11)%64,64,p),space=short*.8/p.grid,x=(i-(p.grid-1)/2)*space,y=(j-(p.grid-1)/2)*space,r=space*(.12+v*.5*p.depth/100);c.globalAlpha=.08+v*.8;c.strokeRect(x-r,y-r,r*2,r*2)}
 }else if(id==='spikes'){
 c.translate(cx,cy);c.rotate(time*p.spin*Math.PI/180);c.beginPath();for(let k=0;k<=p.points;k++){const i=k%p.points,v=level(f,i,p.points,p),a=k*Math.PI*2/p.points,r=short*(.10+v*.42*p.height/100);if(k===0)c.moveTo(r*Math.cos(a),r*Math.sin(a));else c.lineTo(r*Math.cos(a),r*Math.sin(a))}c.closePath();c.lineWidth=Math.max(1,short*.004);c.stroke();
 }else if(id==='blazing'){
 for(let k=0;k<p.flames;k++){const v=level(f,k,p.flames,p),x=k*w/p.flames,fl=h*(.08+v*.82*p.height/100);c.globalAlpha=.12+v*.85;c.strokeStyle=paletteColor(p,k/p.flames,t);c.lineWidth=Math.max(2,w/p.flames*.85);c.beginPath();c.moveTo(x,h);c.quadraticCurveTo(x+Math.sin(time*2*p.flow/100+k)*w*.03,h-fl*.5,x+Math.sin(time*p.flow/100+k)*w*.07,h-fl);c.stroke()}
 }else if(id==='cubes'){
 const cols=p.columns,sz=Math.min(w/cols,h/8)*.85;for(let row=0;row<8;row++)for(let col=0;col<cols;col++){const v=level(f,(col+row*cols)%(cols*8),cols*8,p),x=(col+.5)*w/cols,y=(row+.5)*h/8,depth=sz*v*p.depth/100;c.globalAlpha=.1+v*.8;c.strokeStyle=paletteColor(p,col/cols,t);c.strokeRect(x-sz/2,y-sz/2-depth/2,sz,sz);c.beginPath();c.moveTo(x-sz/2,y-sz/2-depth/2);c.lineTo(x-sz/2+depth*.5,y-sz/2-depth);c.lineTo(x+sz/2+depth*.5,y-sz/2-depth);c.lineTo(x+sz/2,y-sz/2-depth/2);c.stroke()}
 }else if(id==='pulsing'){
 for(let k=p.rings-1;k>=0;k--){const v=level(f,k,p.rings,p),r=short*(.035+k/p.rings*.47)*(1+v*.40*p.expansion/100);c.globalAlpha=.08+v*.8;c.strokeStyle=paletteColor(p,k/p.rings,t);c.lineWidth=Math.max(1,short*.008);c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke()}
 }else if(id==='softie'){
 const bass=level(f,2,64,p),bounce=bass*short*.10*p.bounce/100,sr=short*.095;c.fillStyle='#d4ecfa';c.globalAlpha=.3+.65*bass;for(let k=0;k<3;k++){c.beginPath();c.arc(cx,cy+short*.21-k*sr*1.5-bounce,sr*(1.25-k*.23),0,Math.PI*2);c.fill()}c.fillStyle='#111d30';for(const side of [-1,1]){c.beginPath();c.arc(cx+side*sr*.3,cy+short*.21-2*sr*1.5-bounce-sr*.1,sr*.09,0,Math.PI*2);c.fill()}for(let k=0;k<p.snow;k++){const v=level(f,k%64,64,p),x=((k*137.508)%w+w)%w,y=((k*71.3+time*(8+p.snowSpeed*.5)*(1+v))%h+h)%h;c.fillStyle=paletteColor(p,k/Math.max(1,p.snow||p.sparks||100),t);c.globalAlpha=.14+v*.8;c.beginPath();c.arc(x,y,Math.max(.6,short*.0025*(.4+v)),0,Math.PI*2);c.fill()}
 }else if(id==='yule'){
 const bass=level(f,3,64,p);c.fillStyle='#50301b';c.fillRect(w*.21,h*.76,w*.58,h*.13);for(let k=0;k<45;k++){const v=level(f,k,45,p),x=w*(.3+k/45*.4),fh=h*(.06+v*.64*p.flame/100);c.strokeStyle=paletteColor(p,k/45,t);c.globalAlpha=.25+v*.75;c.lineWidth=Math.max(3,w/65);c.beginPath();c.moveTo(x,h*.76);c.quadraticCurveTo(x+Math.sin(time*(1+p.sway/80)+k)*w*.025,h*.76-fh*.65,x,h*.76-fh);c.stroke()}for(let k=0;k<p.sparks;k++){const v=level(f,k%64,64,p),x=w*(.30+((k*31)%100)/250)+Math.sin(time+k)*w*.025,y=h*.75-((k*37+time*(15+v*90))%(h*.6));c.fillStyle=paletteColor(p,k/Math.max(1,p.snow||p.sparks||100),t);c.globalAlpha=.12+v*.8;c.fillRect(x,y,Math.max(1,w*.002),Math.max(1,w*.002))}
 }else if(id==='musical'){
 c.translate(cx,cy);c.rotate(time*p.rotation*Math.PI/180);for(let k=0;k<p.petals;k++){const v=level(f,k,p.petals,p),a=k*Math.PI*2/p.petals,r=short*(.09+v*.45*p.extent/100);c.globalAlpha=.08+.75*v;c.fillStyle=paletteColor(p,k/p.petals,t);c.beginPath();c.moveTo(0,0);c.arc(0,0,r,a,a+Math.PI*1.7/p.petals);c.closePath();c.fill()}
 }
 c.restore();}
// Vorschau: maximal 12 FPS. Fehler dort dürfen die Hauptanimation nicht stoppen.
let lastMiniFrame=-Infinity,brokenPreview=null;
function draw(t){
  frame=requestAnimationFrame(draw); // Kein künstliches 60-FPS-Limit: 144-Hz-Displays werden bedient.
  if(document.hidden||(arkEmbedded&&!arkActive))return; // Nur sichtbaren/aktivierten ARK-Visualizer rendern.
  frameColorCache=new WeakMap();
  try {
    if(analyser){const p=values[selected];if(analyser.smoothingTimeConstant!==p.smoothing/100)analyser.smoothingTimeConstant=p.smoothing/100;if(selected==='waveform'||selected==='terrain'||highlight==='waveform'||highlight==='terrain')analyser.getFloatTimeDomainData(samples);
      analyser.getByteFrequencyData(frequency);
      if(selected==='waveform'||highlight==='waveform'){
        const blend=Math.max(.03,1-p.smoothing/100);
        for(let i=0;i<samples.length;i++)smoothed[i]+=(samples[i]*p.sensitivity/100-smoothed[i])*blend;
      }}
    // RMS aus echten PCM-Samples. Stille und reines Grundrauschen bewegen den Flyover nicht.
    // Zeitdifferenz begrenzen: kein Sprung nach Tabwechsel / Minimierung.
    const dt=lastTerrainFrame===null?0:Math.min(.05,Math.max(0,(t-lastTerrainFrame)/1000));
    lastTerrainFrame=t;
    if(selected==='terrain' && analyser && samples && audioContext?.state==='running'){
      let sum=0;for(let i=0;i<samples.length;i++)sum+=samples[i]*samples[i];
      const rms=Math.sqrt(sum/samples.length);
      if(rms>=0.012)terrainTravel+=dt*values.terrain.speed*.065;
    }
    render(ctx,selected,canvas.width,canvas.height,t);
  } catch(e){status('Darstellungsfehler ('+selected+'): '+e.message);console.error('Visualizer',selected,e);}
  // Nur sichtbare Vorschau rendern; niemals in der ausgeblendeten Vollbild-Leiste.
  const previewVisible=!arkEmbedded&&(document.fullscreenElement!==stage||stage.classList.contains('show-ui'));
  if(previewVisible&&t-lastMiniFrame>=83){
    lastMiniFrame=t;
    if(brokenPreview!==highlight){
      try {render(mctx,highlight,mini.width,mini.height,t,true)}
      catch(e){brokenPreview=highlight;console.error('Vorschau',highlight,e);status('Vorschaufehler ('+highlight+'): '+e.message)}
    }
  }
}
function release(){lastTerrainFrame=null;if(source){source.disconnect();source=null}if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}analyser=null;samples=null;frequency=null;smoothed=null}
async function listInputs(preferred){if(!navigator.mediaDevices?.enumerateDevices)return;const inputs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');devices.replaceChildren();inputs.forEach((d,i)=>{const opt=document.createElement('option');opt.value=d.deviceId;opt.textContent=d.label||`Audioeingang ${i+1}`;devices.append(opt)});devices.disabled=!inputs.length;if(preferred&&inputs.some(d=>d.deviceId===preferred))devices.value=preferred}
async function activate(deviceId){if(changing)return;changing=true;$('start').disabled=true;devices.disabled=true;let fresh=null;try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Audiozugriff nicht verfügbar: HTTPS oder localhost verwenden.');const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('Web Audio API fehlt.');fresh=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:2},...(deviceId?{deviceId:{exact:deviceId}}:{})},video:false});if(!audioContext)audioContext=new AC();await audioContext.resume();release();stream=fresh;fresh=null;source=audioContext.createMediaStreamSource(stream);analyser=audioContext.createAnalyser();analyser.fftSize=2048;source.connect(analyser);samples=new Float32Array(analyser.fftSize);smoothed=new Float32Array(analyser.fftSize);frequency=new Uint8Array(analyser.frequencyBinCount);await listInputs(stream.getAudioTracks()[0]?.getSettings()?.deviceId||deviceId);$('stop').disabled=false;status('Aktiv: '+(devices.selectedOptions[0]?.textContent||stream.getAudioTracks()[0]?.label||'Audioeingang'))}catch(e){if(fresh)fresh.getTracks().forEach(track=>track.stop());status('Audioeingang nicht gestartet: '+(e.message||String(e)));if(!stream)$('stop').disabled=true}finally{changing=false;$('start').disabled=false;devices.disabled=!devices.options.length}}
function buildSettings(){const [name,,extra]=spec[selected],p=values[selected];$('settingsTitle').textContent=name+' – Einstellungen';fields.replaceChildren();const label=document.createElement('label'),color=document.createElement('input');label.textContent='Farbe';color.type='color';color.value=p.color;color.setAttribute('aria-label','Farbe');color.addEventListener('input',()=>p.color=color.value);fields.append(label,color);
 const modeLabel=document.createElement('label'),mode=document.createElement('select');
 modeLabel.textContent='Farbmodus';modeLabel.htmlFor='gradient-mode';mode.id='gradient-mode';
 for(const [value,name] of [['solid','Einfarbig'],['two','Verlauf: 2 Farben'],['three','Verlauf: 3 Farben'],['rainbow','Rainbow (wandernd)'],['cycle','Automatischer Farbwechsel']]){
  const option=document.createElement('option');option.value=value;option.textContent=name;mode.append(option);
 }
 mode.value=p.gradient;fields.insertBefore(modeLabel,label);fields.insertBefore(mode,label);
 const secondary=[];
 for(const [key,title] of [['color2','Farbe 2'],['color3','Farbe 3']]){
  const l=document.createElement('label'),control=document.createElement('input');l.textContent=title;control.type='color';control.value=p[key];control.setAttribute('aria-label',title);control.addEventListener('input',()=>p[key]=control.value);fields.append(l,control);secondary.push([key,l,control]);
 }
 const speedLabel=document.createElement('label'),speedOutput=document.createElement('output'),speed=document.createElement('input');
 speedLabel.textContent='Farbwechselgeschwindigkeit';speedLabel.htmlFor='color-speed';speedOutput.textContent=p.colorSpeed+' %';speedLabel.append(speedOutput);speed.id='color-speed';speed.type='range';speed.min=0;speed.max=100;speed.value=p.colorSpeed;speed.addEventListener('input',()=>{p.colorSpeed=Number(speed.value);speedOutput.textContent=p.colorSpeed+' %';});fields.append(speedLabel,speed);
 const updateColors=()=>{const two=p.gradient==='two'||p.gradient==='three';for(const [key,l,control] of secondary){const visible=(key==='color2'&&two)||(key==='color3'&&p.gradient==='three');l.hidden=control.hidden=!visible;}speedLabel.hidden=speed.hidden=!(p.gradient==='rainbow'||p.gradient==='cycle');label.hidden=color.hidden=p.gradient==='rainbow'||p.gradient==='cycle';};
 mode.addEventListener('change',()=>{p.gradient=mode.value;updateColors()});updateColors();
 for(const [key,title,unit,min,max,step] of [...base,...extra]){const l=document.createElement('label'),out=document.createElement('output'),input=document.createElement('input');l.textContent=title;out.textContent=p[key]+(unit?' '+unit:'');l.htmlFor='param-'+key;l.append(out);input.type='range';input.id='param-'+key;input.min=min;input.max=max;input.step=step;input.value=p[key];input.addEventListener('input',()=>{p[key]=Number(input.value);out.textContent=p[key]+(unit?' '+unit:'')});fields.append(l,input)}}
function showSettings(){buildSettings();settings.classList.add('open');showToolbar()}
function closeSettings(){settings.classList.remove('open');scheduleHide()}
function select(id){if(!spec[id])return;selected=id;highlight=id;if(smoothed)smoothed.fill(0);buildWheel();showSettings()}
function centerItem(b){if(!b)return;const target=b.offsetLeft-(wheel.clientWidth-b.offsetWidth)/2;wheel.scrollTo({left:Math.max(0,target),behavior:'smooth'})}
function buildWheel(){wheel.replaceChildren();for(const id of ids){const b=document.createElement('button');b.type='button';b.textContent=spec[id][0];b.className=(id===selected?'selected ':'')+(id===highlight?'highlight':'');b.setAttribute('aria-label','Visualizer: '+spec[id][0]);b.dataset.visualizer=id;b.addEventListener('pointerenter',()=>setHighlight(id,false));b.addEventListener('focus',()=>setHighlight(id,false));b.addEventListener('click',()=>select(id));wheel.append(b)}$('previewName').textContent=spec[highlight][0];requestAnimationFrame(()=>centerItem(wheel.querySelector('button.highlight')))}
function setHighlight(id,center=true){if(!spec[id])return;highlight=id;brokenPreview=null;lastMiniFrame=-Infinity;$('previewName').textContent=spec[id][0];for(const b of wheel.children)b.classList.toggle('highlight',b.dataset.visualizer===id);if(center)centerItem(wheel.querySelector('button.highlight'))}
function navigate(dir){const next=ids[(ids.indexOf(highlight)+dir+ids.length)%ids.length];setHighlight(next,true)}
function showToolbar(){if(document.fullscreenElement!==stage)return;stage.classList.add('show-ui');scheduleHide()}
function scheduleHide(){clearTimeout(timer);if(!settings.classList.contains('open'))timer=setTimeout(()=>stage.classList.remove('show-ui'),2400)}
$('start').addEventListener('click',()=>activate(devices.disabled?'':devices.value));devices.addEventListener('change',()=>activate(devices.value));$('stop').addEventListener('click',()=>{release();$('stop').disabled=true;status('Gestoppt. Kein Audioeingang aktiv.')});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement===stage)await document.exitFullscreen();else await stage.requestFullscreen()}catch(e){status('Vollbild nicht verfügbar: '+e.message)}});$('leave').addEventListener('click',()=>document.exitFullscreen());
$('prev').addEventListener('click',()=>navigate(-1));$('next').addEventListener('click',()=>navigate(1));$('options').addEventListener('click',()=>settings.classList.contains('open')?closeSettings():showSettings());$('closeSettings').addEventListener('click',closeSettings);$('reset').addEventListener('click',()=>{values[selected]={gradient:'solid',color2:'#1188ff',color3:'#fc31a9',colorSpeed:20,...spec[selected][1]};buildSettings()});
stage.addEventListener('pointermove',showToolbar);stage.addEventListener('pointerdown',showToolbar);$('toolbar').addEventListener('pointerenter',()=>clearTimeout(timer));$('toolbar').addEventListener('pointerleave',scheduleHide);settings.addEventListener('pointerenter',()=>clearTimeout(timer));
document.addEventListener('fullscreenchange',()=>{const active=document.fullscreenElement===stage;$('fullscreen').textContent=active?'Vollbild beenden':'Vollbild';if(active)showToolbar();else{closeSettings();stage.classList.remove('show-ui')}resize()});
window.addEventListener('pagehide',()=>{release();if(audioContext&&!arkEmbedded)audioContext.close();cancelAnimationFrame(frame);clearTimeout(timer)});

// ARK bridge: this frame never requests microphone access or routes sound twice.
// The parent owns the <audio> element, creates exactly ONE MediaElementAudioSource,
// connects it to speakers and shares only its AnalyserNode with this renderer.
if(arkEmbedded){
 $('start').disabled=true;devices.disabled=true;
 const arkModes=ids.map(id=>({id,name:spec[id][0]}));
 window.ARKVisualizer={
   getModes:()=>arkModes,
   getSelected:()=>selected,
   attach:(node,context)=>{
     if(!node||!context)return false;
     if(analyser!==node){analyser=node;audioContext=context;
       samples=new Float32Array(node.fftSize);smoothed=new Float32Array(node.fftSize);
       frequency=new Uint8Array(node.frequencyBinCount);
       lastTerrainFrame=null;
     }
     return true;
   },
   setActive:(value)=>{arkActive=!!value;if(!arkActive){lastTerrainFrame=null;ctx.fillStyle='#030c0e';ctx.fillRect(0,0,canvas.width,canvas.height);}},
   setMode:(id)=>{if(!spec[id])return false;selected=highlight=id;lastTerrainFrame=null;
     if(smoothed)smoothed.fill(0);buildWheel();return true;},
   toggleSettings:()=>{if(settings.classList.contains('open'))closeSettings();else showSettings();},
   status:()=>({attached:!!analyser,active:arkActive,mode:selected,fft:analyser?.fftSize||0}),
 };
}

buildWheel();resize();frame=requestAnimationFrame(draw);
