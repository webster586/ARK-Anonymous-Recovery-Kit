'use strict';
// Scientific expression parser: no eval or dynamic code execution.
function arkCalculate(input,degreeMode){
 const s=input.replace(/π/gi,'pi').replace(/[×⋅]/g,'*').replace(/[÷]/g,'/').replace(/−/g,'-').replace(/\s+/g,'');let i=0;
 function error(){throw Error('Ungültiger Ausdruck bei Position '+(i+1))}
 function match(ch){if(s.startsWith(ch,i)){i+=ch.length;return true}return false}
 function expr(){let x=term();for(;;){if(match('+'))x+=term();else if(match('-'))x-=term();else break}return x}
 function term(){let x=unary();for(;;){if(match('*'))x*=unary();else if(match('/')){const y=unary();if(!y)throw Error('Division durch Null');x/=y}else if(match('%'))x=x*unary()/100;else break}return x}
 function unary(){if(match('+'))return unary();if(match('-'))return -unary();return power()}
 function power(){let x=primary();if(match('^'))x=Math.pow(x,unary());return x}
 function primary(){if(match('(')){let y=expr();if(!match(')'))error();return y}
 const n=s.slice(i).match(/^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?/i);
 if(n){i+=n[0].length;return Number(n[0].replace(',','.'))}
 const name=s.slice(i).match(/^[a-z]+/i);if(name){i+=name[0].length;const key=name[0].toLowerCase();if(key==='pi')return Math.PI;if(key==='e')return Math.E;
 if(!match('('))error();const x=expr();if(!match(')'))error();const rad=degreeMode?x*Math.PI/180:x;
 const fn={sin:()=>Math.sin(rad),cos:()=>Math.cos(rad),tan:()=>Math.tan(rad),asin:()=>degreeMode?Math.asin(x)*180/Math.PI:Math.asin(x),acos:()=>degreeMode?Math.acos(x)*180/Math.PI:Math.acos(x),atan:()=>degreeMode?Math.atan(x)*180/Math.PI:Math.atan(x),sqrt:()=>Math.sqrt(x),ln:()=>Math.log(x),log:()=>Math.log10(x),abs:()=>Math.abs(x),exp:()=>Math.exp(x)}[key];if(!fn)error();return fn();}
 error();}
 const result=expr();if(i!==s.length)error();if(!Number.isFinite(result))throw Error('Ergebnis nicht endlich/außerhalb des Wertebereichs');return result;
}
const ut=id=>document.getElementById(id);
function arkCalcRun(){try{const v=arkCalculate(ut('utCalcExpr').value,ut('utAngle').value==='deg');ut('utCalcOut').textContent=Number.parseFloat(v.toPrecision(13)).toLocaleString('de-DE',{maximumFractionDigits:12})}catch(e){ut('utCalcOut').textContent='Fehler: '+e.message}}
ut('utCalcRun').addEventListener('click',arkCalcRun);
ut('utCalcExpr').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();arkCalcRun()}});
// Both clocks use monotonic performance.now(); no drift from throttled setInterval calls.
let arkTimerRemaining=300000,arkTimerEnd=0,arkTimerRunning=false,arkStopwatchStart=0,arkStopwatchElapsed=0,arkStopwatchRunning=false;
function arkMsLabel(ms){ms=Math.max(0,Math.ceil(ms/1000));const h=Math.floor(ms/3600),m=Math.floor(ms%3600/60),s=ms%60;return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':')}
function arkClockTick(){const now=performance.now();
 if(arkTimerRunning){arkTimerRemaining=Math.max(0,arkTimerEnd-now);if(!arkTimerRemaining){arkTimerRunning=false;ut('utTimerDisplay').textContent='ABGELAUFEN';ut('utTimerDisplay').style.color='#ffcc94';}else {ut('utTimerDisplay').textContent=arkMsLabel(arkTimerRemaining);ut('utTimerDisplay').style.color=''}}
 if(arkStopwatchRunning){const ms=arkStopwatchElapsed+now-arkStopwatchStart;const secs=Math.floor(ms/1000);ut('utStopwatchDisplay').textContent=String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0')+'.'+Math.floor(ms%1000/100)}
}
function arkTimerSet(){const h=Number(ut('utHours').value)||0,m=Number(ut('utMinutes').value)||0,s=Number(ut('utSeconds').value)||0;
 if(h<0||h>99||m<0||m>59||s<0||s>59)return false;arkTimerRemaining=(h*3600+m*60+s)*1000;ut('utTimerDisplay').textContent=arkMsLabel(arkTimerRemaining);return true}
ut('utTimerStart').addEventListener('click',()=>{if(!arkTimerRunning){if(arkTimerRemaining<=0&&!arkTimerSet())return;if(!arkTimerRemaining)return;arkTimerEnd=performance.now()+arkTimerRemaining;arkTimerRunning=true}});
ut('utTimerPause').addEventListener('click',()=>{if(arkTimerRunning){arkTimerRemaining=Math.max(0,arkTimerEnd-performance.now());arkTimerRunning=false}});
ut('utTimerReset').addEventListener('click',()=>{arkTimerRunning=false;arkTimerSet();ut('utTimerDisplay').style.color=''});
for(const key of ['utHours','utMinutes','utSeconds'])ut(key).addEventListener('change',()=>{if(!arkTimerRunning)arkTimerSet()});
ut('utStopwatchStart').addEventListener('click',()=>{if(arkStopwatchRunning){arkStopwatchElapsed+=performance.now()-arkStopwatchStart;arkStopwatchRunning=false;ut('utStopwatchStart').textContent='STOPPUHR START';}else{arkStopwatchStart=performance.now();arkStopwatchRunning=true;ut('utStopwatchStart').textContent='STOPPUHR PAUSE'}});
ut('utStopwatchReset').addEventListener('click',()=>{arkStopwatchElapsed=0;arkStopwatchStart=performance.now();ut('utStopwatchDisplay').textContent='00:00.0'});
setInterval(arkClockTick,150);
// Crypto-strength random password; no Math.random().
ut('utPasswordNew').addEventListener('click',()=>{
 const n=Math.min(80,Math.max(12,Number(ut('utPasswordLen').value)||24)),chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_';let out='';
 const limit=256-Math.floor(256/chars.length)*chars.length;
 while(out.length<n){const b=new Uint8Array(Math.max(16,n));crypto.getRandomValues(b);for(const x of b){if(x>=256-limit)continue;out+=chars[x%chars.length];if(out.length>=n)break}}
 ut('utPasswordOut').value=out;
});
ut('utPasswordCopy').addEventListener('click',async()=>{if(!ut('utPasswordOut').value)return;try{await navigator.clipboard.writeText(ut('utPasswordOut').value);ut('utPasswordCopy').textContent='KOPIERT'}catch(_){ut('utPasswordOut').select();document.execCommand('copy')}});
ut('utHashRun').addEventListener('click',async()=>{
 const file=ut('utHashFile').files?.[0],o=ut('utHashResult');if(!file){o.textContent='Bitte Datei auswählen';return}if(file.size>128*1024*1024){o.textContent='Datei größer als 128 MiB: hier bewusst nicht eingelesen';return}
 o.textContent='Berechne ...';try{const sha=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());o.textContent=[...new Uint8Array(sha)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){o.textContent='Prüfsumme nicht verfügbar: '+e.message}
});
async function arkZipRequest(action){const o=ut('utZipState');o.textContent='ZIP-Vorgang wird ausgeführt ...';try{
 const res=await fetch('/api/utils/zip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,source:ut('utZipSource').value.trim(),target:ut('utZipTarget').value.trim()})});
 const data=await res.json();if(!res.ok)throw Error(data.error||res.statusText);o.textContent=data.message;
 }catch(e){o.textContent='ZIP: '+e.message}}
ut('utZipCreate').addEventListener('click',()=>arkZipRequest('create'));
ut('utZipExtract').addEventListener('click',()=>arkZipRequest('extract'));
function arkZipFloatOpen(){select('arkZipFloat').hidden=false;select('utZipSource').focus({preventScroll:true});}
function arkZipFloatClose(){select('arkZipFloat').hidden=true;}
(function(){
 const win=select('arkZipFloat'),handle=select('arkZipFloatHandle');
 let dragging=false,offX=0,offY=0;
 handle.addEventListener('pointerdown',e=>{
  if(e.target.closest('.ark-float-close'))return;
  dragging=true;try{handle.setPointerCapture(e.pointerId);}catch(_){}
  const r=win.getBoundingClientRect();offX=e.clientX-r.left;offY=e.clientY-r.top;
 });
 handle.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const left=Math.max(4,Math.min(window.innerWidth-win.offsetWidth-4,e.clientX-offX));
  const top=Math.max(4,Math.min(window.innerHeight-win.offsetHeight-4,e.clientY-offY));
  win.style.left=left+'px';win.style.top=top+'px';win.style.right='auto';
 });
 handle.addEventListener('pointerup',e=>{dragging=false;try{handle.releasePointerCapture(e.pointerId);}catch(_){}});
 select('arkZipFloatClose').addEventListener('click',arkZipFloatClose);
})();

// ARK 1.4.5 – Argos offline translation; other ARK-04 tools unchanged.
const argosEl=id=>document.getElementById(id);
const argosLocaleNames={de:'Deutsch',en:'Englisch',fr:'Französisch',es:'Spanisch',it:'Italienisch',pt:'Portugiesisch',nl:'Niederländisch',pl:'Polnisch',ru:'Russisch',uk:'Ukrainisch',tr:'Türkisch',ar:'Arabisch',zh:'Chinesisch',ja:'Japanisch'};
function argosSetMessage(msg){argosEl('argosMessage').textContent=msg;}
async function argosAPI(path,body=null){const cfg=body===null?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};const res=await fetch('/api/argos/'+path,cfg);let data;try{data=await res.json()}catch(_){throw Error('Server antwortet nicht mit JSON')};if(!res.ok)throw Error(data.error||data.message||'HTTP '+res.status);return data;}
let argosOperationBusy=false, argosLastBusy=false;
function argosLanguages(codes,pairs){
 const fromEl=argosEl('argosFrom'),toEl=argosEl('argosTo'),beforeFrom=fromEl.value,beforeTo=toEl.value;
 const all=[...new Set(['de','en',...(codes||[])])];
 function options(el,chosen){el.replaceChildren();for(const key of all){let o=new Option(argosLocaleNames[key]||key.toUpperCase(),key);el.add(o)}el.value=all.includes(chosen)?chosen:all[0]}
 options(fromEl,beforeFrom);options(toEl,beforeTo);
 argosEl('argosPairs').textContent=(pairs||[]).length?'Installiert: '+pairs.map(p=>(argosLocaleNames[p.from]||p.from)+' → '+(argosLocaleNames[p.to]||p.to)).join(' · '):'Keine installierten Sprachpaare.';
}
async function argosRefresh(){try{
 const data=await argosAPI('status');
 argosLastBusy=!!data.busy;
 argosEl('argosEngineStatus').textContent=data.busy?'Einrichtung/Modellinstallation läuft …':data.ready?'Argos installiert – offline bereit':'Argos nicht installiert – einmalige Einrichtung erforderlich';
 if(data.busy){argosSetMessage(data.message||'Installation läuft …');}
 else if(data.message && data.message!=='Bereit'){argosSetMessage(data.message)}
 argosLanguages(data.languages||[],data.pairs||[]);
 return data;
}catch(e){argosEl('argosEngineStatus').textContent='Argos nicht erreichbar';argosSetMessage(e.message);return null}}
async function argosAction(path,payload,success){if(argosOperationBusy)return;argosOperationBusy=true;argosEl('argosTranslate').disabled=true;
 try{argosSetMessage('Bitte prüfen …');const data=await argosAPI(path,payload);argosSetMessage(data.message||success||'Fertig');if(data.text!==undefined){argosEl('argosOutput').value=data.text;}await argosRefresh();}
 catch(e){argosSetMessage('Argos: '+e.message)}finally{argosOperationBusy=false;argosEl('argosTranslate').disabled=false}}
argosEl('argosReload').addEventListener('click',()=>argosRefresh());
argosEl('argosSwap').addEventListener('click',()=>{const f=argosEl('argosFrom'),t=argosEl('argosTo');[f.value,t.value]=[t.value,f.value];[argosEl('argosInput').value,argosEl('argosOutput').value]=[argosEl('argosOutput').value,argosEl('argosInput').value]});
argosEl('argosTranslate').addEventListener('click',()=>{const text=argosEl('argosInput').value.trim();if(!text){argosSetMessage('Bitte zuerst Text eingeben.');return}if(argosEl('argosFrom').value===argosEl('argosTo').value){argosSetMessage('Quell- und Zielsprache müssen verschieden sein.');return}argosAction('translate',{text,from:argosEl('argosFrom').value,to:argosEl('argosTo').value},'Übersetzung abgeschlossen')});
argosEl('argosCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(argosEl('argosOutput').value);argosSetMessage('Übersetzung kopiert')}catch(e){argosSetMessage('Kopieren nicht möglich: '+e.message)}});
argosEl('argosClear').addEventListener('click',()=>{argosEl('argosInput').value='';argosEl('argosOutput').value='';argosSetMessage('Eingabe geleert')});
argosEl('argosSetup').addEventListener('click',async()=>{if(!confirm('Argos einmalig einrichten? Dabei werden Python-Runtime und Argos-Pakete ausschließlich auf ausdrücklichen Klick aus dem Internet geladen.'))return;await argosAction('setup',{},'Einrichtung gestartet')});
argosEl('argosInstallDeEn').addEventListener('click',()=>{if(confirm('Sprachmodell Deutsch → Englisch jetzt einmalig herunterladen und lokal installieren?'))argosAction('install',{from:'de',to:'en'},'Modellinstallation gestartet')});
argosEl('argosInstallEnDe').addEventListener('click',()=>{if(confirm('Sprachmodell Englisch → Deutsch jetzt einmalig herunterladen und lokal installieren?'))argosAction('install',{from:'en',to:'de'},'Modellinstallation gestartet')});
argosEl('argosInstallFile').addEventListener('click',()=>{const path=argosEl('argosModelPath').value.trim();if(!path){argosSetMessage('Pfad zur vorhandenen .argosmodel-Datei eingeben');return}argosAction('import',{path},'Modellinstallation gestartet')});
// Poll status only while the installation is ongoing, including after page reload.
let argosLastPoll=0;
setInterval(()=>{if(!document.hidden && Date.now()-argosLastPoll>=(argosLastBusy?3500:60000) && argosEl('arkArgosPanel').offsetParent!==null){argosLastPoll=Date.now();argosRefresh();}},5000);
argosRefresh();

