'use strict';
// Classic 2–9 phone keypad, implemented as reliable offline multi-tap.
// This is deliberately NOT a predictive dictionary: place names and technical terms always work.
const t9KeyLayout=['space','1','2','3','erase','case','4','5','6','search','exit','7','8','9','0'];
const t9Chars={'1':'.,!?:;-','2':'abcä','3':'def','4':'ghi','5':'jkl','6':'mnoö','7':'pqrsß','8':'tuvü','9':'wxyz','0':'0'};
let keyboardMode=false, keyboardTarget=null, lastFocusedTextInput=null, t9Upper=false, t9LastDigit='', t9LastAt=0, t9LastPos=-1, t9LastTarget=null, keyboardRequestedAt=0;
function t9Target(){
  if(keyboardTarget && keyboardTarget.isConnected && !keyboardTarget.disabled && !keyboardTarget.readOnly && keyboardTarget.getClientRects().length)return keyboardTarget;
  const a=document.activeElement;
  if(a?.matches('input[type="search"],input[type="text"],textarea') && !a.disabled && !a.readOnly)return a;
  return select('search');
}
function t9ResetCycle(){t9LastDigit='';t9LastPos=-1;t9LastTarget=null;t9LastAt=0;}
function t9StatusUpdate(message){
  const e=select('t9Status');
  if(!e)return;
  e.textContent='TEXTMODUS // '+(message||'2–9 mehrfach drücken · 1: Satzzeichen · LEER · DEL · SUCHE · ZURÜCK')+(t9Upper?' · GROSS':'');
}
function setKeyboardActive(on,notifyBackend=true){
 keyboardMode=!!on;
 if(keyboardMode){
  const a=document.activeElement;
  if(a?.matches('input[type="search"],input[type="text"],textarea')&&!a.disabled&&!a.readOnly)keyboardTarget=a;
  if(!keyboardTarget||!keyboardTarget.isConnected||keyboardTarget.readOnly||!keyboardTarget.getClientRects().length)keyboardTarget=(lastFocusedTextInput?.isConnected&&lastFocusedTextInput.getClientRects().length?lastFocusedTextInput:select('search'));
  keyboardTarget.focus({preventScroll:true});
  t9StatusUpdate();
 }else{keyboardTarget=null;t9ResetCycle();}
 select('t9Status').hidden=!keyboardMode;
 select('keyboardToggle').classList.toggle('t9-on',keyboardMode);
 select('keyboardToggle').textContent=keyboardMode?'⌨ ZURÜCK':'⌨ TEXT';
 select('keyboardToggle').setAttribute('aria-pressed',String(keyboardMode));
 if(notifyBackend&&location.protocol!=='file:'){keyboardRequestedAt=Date.now();fetch('/api/keyboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:keyboardMode})}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);}).catch(()=>t9StatusUpdate('Hardwaremodus nicht erreichbar; Tastatur weiter nutzbar'));}
}
function t9Edit(input,text,cycle){
  const current=input.value||'';
  let start=typeof input.selectionStart==='number'?input.selectionStart:current.length;
  let end=typeof input.selectionEnd==='number'?input.selectionEnd:start;
  if(cycle && t9LastTarget===input && t9LastPos>=0 && start===t9LastPos+1 && end===start){start=t9LastPos;}
  input.setRangeText(text,start,end,'end');
  input.dispatchEvent(new Event('input',{bubbles:true}));
  return start;
}
function t9Command(cmd, notifyBackend=true){
  if(cmd==='exit'){setKeyboardActive(false,notifyBackend);return;}
  let input=t9Target();
  if(cmd==='search'){
    const term=input.value.trim();
    t9ResetCycle();setKeyboardActive(false,notifyBackend);
    if(input===select('search')&&term){arkUnifiedSearch(term);}
    else input.dispatchEvent(new Event('change',{bubbles:true}));
    t9StatusUpdate('Übernommen');return;
  }
  if(cmd==='case'){t9Upper=!t9Upper;t9ResetCycle();t9StatusUpdate(t9Upper?'Großschreibung aktiviert':'Kleinschreibung aktiviert');return;}
  if(cmd==='erase'){
    const start=input.selectionStart??input.value.length, end=input.selectionEnd??start;
    if(start!==end)input.setRangeText('',start,end,'end');
    else if(start>0)input.setRangeText('',start-1,start,'end');
    input.dispatchEvent(new Event('input',{bubbles:true}));t9ResetCycle();t9StatusUpdate('Zeichen gelöscht');return;
  }
  if(cmd==='space'){t9Edit(input,' ',false);t9ResetCycle();t9StatusUpdate('Leerzeichen');return;}
  const chars=t9Chars[cmd]; if(!chars)return;
  const now=Date.now();
  const repeated=cmd===t9LastDigit && input===t9LastTarget && (now-t9LastAt)<1000 && t9LastPos>=0 && (input.selectionStart===t9LastPos+1);
  let letter;
  if(repeated){
    const old=input.value[t9LastPos].toLowerCase();const at=chars.indexOf(old);
    letter=chars[(at+1)%chars.length];
  }else letter=chars[0];
  if(t9Upper)letter=letter.toUpperCase();
  const pos=t9Edit(input,letter,repeated);
  t9LastDigit=cmd;t9LastAt=now;t9LastPos=pos;t9LastTarget=input;
  t9StatusUpdate('Taste '+cmd+' → '+letter+' · dieselbe Taste erneut = nächster Buchstabe');
}
select('keyboardToggle').addEventListener('click',()=>setKeyboardActive(!keyboardMode,true));
document.addEventListener('focusin',e=>{
 if(e.target?.matches('input[type="search"],input[type="text"],textarea')&&!e.target.readOnly){lastFocusedTextInput=e.target;if(keyboardMode){keyboardTarget=e.target;t9ResetCycle();}}
});

function deckCommand(code, from){if(from)select('inputmode').textContent=from.toUpperCase();if(['ark1','ark2','ark3','ark4'].includes(code)){choose({ark1:'foundation',ark2:'knowledge',ark3:'culture',ark4:'systems'}[code]);return;}if(contentFocused()&&chosen==='atlas'&&['up','down','left','right','linkprev','linknext','ok'].includes(code)){try{select('atlasFrame').contentWindow.postMessage({arkControl:code},location.origin)}catch(e){}return;}if(contentFocused()&&chosen==='nrw3d'&&['up','down','left','right','linkprev','linknext','ok'].includes(code)){nrwSend(code);return;}if(!code||code==='empty')return;if(code==='linkprev'){if(!select('arkAppLauncher').hidden){arkStepApp(-1);return;}if(wikiVisible)wikiStepLink(-1);else if(chosen==='culture')mediaStepLink(-1);else if(chosen==='systems')appsStepLink(-1);return;}if(code==='linknext'){if(!select('arkAppLauncher').hidden){arkStepApp(1);return;}if(wikiVisible)wikiStepLink(1);else if(chosen==='culture')mediaStepLink(1);else if(chosen==='systems')appsStepLink(1);return;}if(code==='up'){moveFocus('up');select('lastaction').textContent='MOVE UP';return;}if(code==='down'){moveFocus('down');select('lastaction').textContent='MOVE DOWN';return;}if(code==='left'){moveFocus('left');select('lastaction').textContent='MOVE LEFT';return;}if(code==='right'){moveFocus('right');select('lastaction').textContent='MOVE RIGHT';return;}if(code==='ok'){if(wikiVisible&&wikiActivateSelectedLink()){select('lastaction').textContent='WIKI LINK GEÖFFNET';return;}let active=document.activeElement;if(active?.matches('button, input'))active.click();else if(chosen==='home')focusFirstModule();else if(active!==activeContent())focusElement(activeContent());select('lastaction').textContent='OK';return;}if(code==='back'){goBack();return;}if(code==='forward'){goForward();return;}}
function pressKey(i,from){
 if(i<0||i>=15)return;
 if(i===13 && !keyboardMode){setKeyboardActive(true,false);return;}
 if(i===10 && keyboardMode){setKeyboardActive(false,false);return;}
 if(keyboardMode){t9Command(t9KeyLayout[i]);return;}
 deckCommand(streamDeckLayout[i],from);
}
function sendLayout(){if(!bridgeOnline)return;const keys=streamDeckLayout.map(code=>({label:deckLabels[code]||'',code,selected:false,kind:code==='empty'?'blank':'nav'}));const data=JSON.stringify({bank:0,keys});if(data===lastPosted)return;lastPosted=data;fetch('/api/layout',{method:'POST',headers:{'Content-Type':'application/json'},body:data}).catch(()=>{bridgeOnline=false;paintBridge();});}
document.addEventListener('click',e=>{let m=e.target.closest('[data-module]');if(m)choose(m.dataset.module);});
select('search').addEventListener('input',()=>{mediaSearchSeq++;mediaFileResults=[];renderModules();arkRenderLocalResults(select('search').value);});select('clearSearch').addEventListener('click',()=>{select('search').value='';renderModules();mediaFileResults=[];mediaSearchSeq++;arkRenderLocalResults('');select('search').focus()});
function showHelp(open){select('modal').classList.toggle('show',open);if(open)select('closeHelp').focus();else select('helpbtn').focus();}
select('helpbtn').onclick=()=>showHelp(true);select('closeHelp').onclick=()=>showHelp(false);select('modal').addEventListener('click',e=>{if(e.target.id==='modal')showHelp(false)});
document.addEventListener('keydown',e=>{if(keyboardMode && e.altKey && /^[0-9]$/.test(e.key)){e.preventDefault();t9Command(e.key);return;}if(e.key==='F8'){e.preventDefault();if(!e.repeat)voicePress();return;}if(e.key==='Escape'){e.preventDefault();if(keyboardMode)setKeyboardActive(false,true);else if(select('modal').classList.contains('show'))showHelp(false);else if(e.target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))e.target.blur();else goBack();return;}if(select('modal').classList.contains('show'))return;// Input controls own their keystrokes. Do not route letters, Backspace, arrows or Enter to ARK navigation.
 // In particular: 'h' previously opened HOME while writing in the Argos textarea.
 if(e.target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')){
  if(e.key==='Enter' && e.target.id==='search' && e.target.value.trim()){
   e.preventDefault();arkUnifiedSearch(e.target.value);
  }else if(e.key==='Enter'&&e.target.id==='bibleFilter'){
   e.preventDefault();select('bibleList').querySelector('button')?.focus();
  }else if(e.key==='Enter'&&e.target.id==='micSelect'){
   e.preventDefault();select('micSave').click();
  }
  return;
 }
 // Windows Ctrl/Cmd/Alt shortcuts and IME composition must never act as ARK shortcuts.
 if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;if(e.key==='?'||e.key==='F1'){e.preventDefault();showHelp(true);return;}if(e.key==='PageUp'){e.preventDefault();deckCommand('linkprev','keyboard');return;}if(e.key==='PageDown'){e.preventDefault();deckCommand('linknext','keyboard');return;}if(e.key==='ArrowLeft'){e.preventDefault();deckCommand('left','keyboard');return;}if(e.key==='ArrowRight'){e.preventDefault();deckCommand('right','keyboard');return;}if(e.key==='ArrowUp'){e.preventDefault();deckCommand('up','keyboard');return;}if(e.key==='ArrowDown'){e.preventDefault();deckCommand('down','keyboard');return;}if(e.key==='Enter'){e.preventDefault();deckCommand('ok','keyboard');return;}if(e.key==='Backspace'){e.preventDefault();deckCommand(e.shiftKey?'forward':'back','keyboard');return;}if(e.key.toLowerCase()==='h'){e.preventDefault();choose('home');return;}});
let gpMove=0,gpA=false,gpB=false;
function gamepadTick(t){const pads=navigator.getGamepads?.()||[];const pad=Array.from(pads).find(p=>p&&p.connected);if(pad){const down=i=>Boolean(pad.buttons[i]?.pressed);const a=down(0),b=down(1);if(a&&!gpA)deckCommand('ok','gamepad');if(b&&!gpB)deckCommand('back','gamepad');gpA=a;gpB=b;if(t-gpMove>160){if(down(14)||pad.axes[0]<-.65){deckCommand('left','gamepad');gpMove=t;}else if(down(15)||pad.axes[0]>.65){deckCommand('right','gamepad');gpMove=t;}else if(down(12)||pad.axes[1]<-.65){deckCommand('up','gamepad');gpMove=t;}else if(down(13)||pad.axes[1]>.65){deckCommand('down','gamepad');gpMove=t;}}}else{gpA=gpB=false;}requestAnimationFrame(gamepadTick);}
function paintBridge(){select('sdconn').textContent=bridgeOnline?(deckPresent?'VERBUNDEN':'BEREIT / OHNE DECK'):'NICHT VERBUNDEN';const mode=select('hwMode');if(mode){mode.textContent=bridgeOnline?(deckPresent?'STREAM DECK // VERBUNDEN':'STREAM DECK // NICHT ERKANNT'):'STREAM DECK // TESTMODUS';mode.style.color=deckPresent?'#86edc3':'#edc489';}}
async function bridgePoll(){if(location.protocol==='file:'){paintBridge();return;}try{const res=await fetch('/api/events?after='+bridgeSeq,{cache:'no-store'});if(!res.ok)throw Error('no bridge');const d=await res.json();const was=bridgeOnline;bridgeOnline=true;deckPresent=!!d.deck;paintBridge();if(!was){lastPosted='';sendLayout();}for(const ev of d.events||[]){
  bridgeSeq=Math.max(bridgeSeq,ev.seq);
  if(typeof ev.command==='string' && ev.command){
    // Interpret the command at the instant of the physical press. The hardware
    // may already have switched modes by the time this event is delivered.
    if(ev.text_mode){
      if(!keyboardMode)setKeyboardActive(true,false);
      t9Command(ev.command.startsWith('kbd')?ev.command.slice(3).toLowerCase():ev.command,false);
    }else if(ev.command==='keyboard'){
      setKeyboardActive(true,false);
    }else{
      if(keyboardMode)setKeyboardActive(false,false);
      deckCommand(ev.command,'stream deck');
    }
  }else if(typeof ev.key==='number')pressKey(ev.key,'stream deck');
}if(typeof d.keyboard==='boolean'&&d.keyboard!==keyboardMode&&(Date.now()-keyboardRequestedAt)>1500)setKeyboardActive(d.keyboard,false);}catch(e){bridgeOnline=false;deckPresent=false;paintBridge();}setTimeout(bridgePoll,180);}

// ARK VOICE is an optional system-language recognizer on the local Windows host.
// The microphone is NEVER activated without a user press (physical deck, F8, or touch).
let voiceSeq=-1, pttActive=false;
function voicePress(){if(pttActive)return;pttActive=true;fetch('/api/voice/press',{method:'POST'}).catch(e=>{pttActive=false;voiceMessage('Sprachmodul nicht erreichbar',true);});}
function voiceRelease(){if(!pttActive)return;pttActive=false;fetch('/api/voice/release',{method:'POST',keepalive:true}).catch(()=>voiceMessage('Aufnahmeende fehlgeschlagen',true));}
function voiceMessage(msg,isError=false){const label=select('voiceIndicator');if(label){label.textContent='ARK VOICE // '+msg;label.classList.toggle('error',isError);}select('voicebtn')?.classList.toggle('recording',msg==='Aufnahme läuft – sprechen');}
select('voicebtn').addEventListener('pointerdown',e=>{e.preventDefault();try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}voicePress();});
select('voicebtn').addEventListener('pointerup',e=>{e.preventDefault();voiceRelease();});
select('voicebtn').addEventListener('pointercancel',voiceRelease);
select('voicebtn').addEventListener('lostpointercapture',voiceRelease);
document.addEventListener('keyup',e=>{if(e.key==='F8'){e.preventDefault();voiceRelease();}});
window.addEventListener('blur',voiceRelease);
async function voicePoll(){
 try{
  const response=await fetch('/api/voice/status',{cache:'no-store'});
  if(!response.ok)throw Error('voice-status');
  const v=await response.json();
  if(v.seq!==voiceSeq){
   voiceSeq=v.seq;
   if(v.state==='ready')voiceMessage('Bereit · Stream Deck PTT oder F8 gedrückt halten');
   else if(v.state==='loading')voiceMessage('Lade lokale Spracherkennung ...');
   else if(v.state==='recording')voiceMessage('Aufnahme läuft – sprechen');
   else if(v.state==='processing')voiceMessage('Sprache wird lokal erkannt ...');
   else if(v.state==='empty')voiceMessage('Keine Sprache erkannt – erneut versuchen');
   else if(v.state==='error')voiceMessage(v.error||'Spracherkennung nicht verfügbar',true);
   else if(v.state==='done'){
     voiceMessage('Erkannt: '+v.text);
     select('search').value=v.text||'';
     renderModules();
     select('search').focus();
     // A spoken question goes to Wikipedia if no module matches or Wikipedia is open.
     if((v.text||'').trim())arkUnifiedSearch(v.text);
     select('lastaction').textContent='VOICE SEARCH: '+(v.text||'').slice(0,75);
   }
  }
 }catch(e){if(voiceSeq!==-2){voiceSeq=-2;voiceMessage('Controller nicht erreichbar',true);}}
 setTimeout(voicePoll,250);
}
voicePoll();


// The browser page owns the portable ARK controller. Closing the final ARK
// tab triggers a graceful server shutdown (including Show Logo + CloseHandle).
// Each page has a unique ID; a reload gets a new one. Heartbeats are local.
const arkPageID=(() => {
 try {return crypto.randomUUID();}
 catch(_) {return 'ark-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
})();
let arkClosing=false;
function arkHeartbeat(){
 if(arkClosing)return;
 fetch('/api/session/ping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:arkPageID}),cache:'no-store'}).catch(()=>{});
}
function arkSignalClose(){
 if(arkClosing)return;
 arkClosing=true;
 const body=JSON.stringify({id:arkPageID});
 try {navigator.sendBeacon('/api/session/bye',new Blob([body],{type:'application/json'}));}
 catch(_){fetch('/api/session/bye',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});}
}
async function arkExit(){
 if(!confirm('ARK beenden und Stream Deck freigeben?'))return;
 arkClosing=true;
 try {
  const r=await fetch('/api/shutdown',{method:'POST'});
  if(!r.ok)throw Error('HTTP '+r.status);
  document.body.innerHTML='<main style="max-width:540px;margin:12vh auto;font:18px Segoe UI,sans-serif;color:#c2e7d6;text-align:center"><h1>ARK beendet</h1><p>Die USB-Verbindung zum Stream Deck wird freigegeben. Du kannst diesen Tab schließen.</p></main>';
 }catch(e){arkClosing=false;alert('ARK konnte nicht beendet werden: '+e.message+'\nBitte das ARK-Konsolenfenster mit Strg+C beenden.');}
}
select('exitArk').addEventListener('click',arkExit);
window.addEventListener('pagehide',arkSignalClose);
window.addEventListener('pageshow',()=>{arkClosing=false;arkHeartbeat();});
arkHeartbeat();
setInterval(arkHeartbeat,2000);

const clock=()=>{const d=new Date();select('clock').textContent=d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})};
clock();setInterval(clock,15000);choose('home');paintBridge();bridgePoll();requestAnimationFrame(gamepadTick);
// V1.4.4: Embedded Bible reading mode; original source files are never edited.
let arkBibleCatalog=[],arkBibleCurrent='',arkBibleFont=19,arkBibleLoading=false;
const arkBibleElm=id=>document.getElementById(id);
function arkBibleShowMessage(s){const frame=arkBibleElm('bibleReaderFrame');frame.srcdoc='<!doctype html><html lang="de"><meta charset="utf-8"><body style="margin:0;padding:50px;background:#0c1d1c;color:#b9e3d2;font:16px Segoe UI,sans-serif">'+s.replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]))+'</body></html>';}
async function arkBibleInit(){
 if(arkBibleLoading)return;arkBibleLoading=true;
 try{
  const res=await fetch('/api/bible/list',{cache:'no-store'});
  if(!res.ok)throw Error('Bibel-Ordner nicht erreichbar');
  const data=await res.json();
  const chapters=(data.entries||[]).filter(e=>!e.dir&&/^[A-Z0-9]+\d{2,3}\.htm$/i.test(e.name));
  const names=new Map();
  try{
   const idx=await fetch('/api/bible/file?path='+encodeURIComponent('index.htm'),{cache:'no-store'});
   if(idx.ok){const doc=new DOMParser().parseFromString(await idx.text(),'text/html');
    for(const a of doc.querySelectorAll('.bookList a[href]')){
     const filename=(a.getAttribute('href')||'').split('/').pop(),key=filename.match(/^(.+?)(\d{2,3})\.htm$/i);
     if(key)names.set(key[1].toUpperCase(),a.textContent.trim());
    }
   }
  }catch(_){}
  const grouped=new Map();
  for(const item of chapters){const found=item.name.match(/^(.+?)(\d{2,3})\.htm$/i);if(!found)continue;
   const key=found[1].toUpperCase();if(!grouped.has(key))grouped.set(key,[]);
   grouped.get(key).push({num:parseInt(found[2],10),path:item.path});
  }
  arkBibleCatalog=[...grouped].map(([key,chapters])=>({key,name:names.get(key)||key,chapters:chapters.sort((a,b)=>a.num-b.num)}));
  arkBibleCatalog.sort((a,b)=>{
   const na=[...names.keys()].indexOf(a.key),nb=[...names.keys()].indexOf(b.key);
   return (na<0?999:na)-(nb<0?999:nb);
  });
  const select=arkBibleElm('bibleBookSelect');select.replaceChildren();
  for(const b of arkBibleCatalog){let o=document.createElement('option');o.value=b.key;o.textContent=b.name;select.append(o);}
  if(!arkBibleCatalog.length){arkBibleShowMessage('Keine Bibelkapitel in diesem Ordner gefunden. Bitte ORDNER einstellen.');return;}
  const wanted=arkBibleCurrent&&arkBibleCatalog.some(b=>b.chapters.some(c=>c.path===arkBibleCurrent))?arkBibleCurrent:arkBibleCatalog[0].chapters[0].path;
  const group=arkBibleCatalog.find(b=>b.chapters.some(c=>c.path===wanted));
  select.value=group.key;arkBibleFillChapters(group.key,wanted);await arkBibleRead(wanted);
 }catch(e){arkBibleShowMessage('Bibel nicht verbunden: '+e.message);}finally{arkBibleLoading=false;}
}
function arkBibleFillChapters(key,wanted){const b=arkBibleCatalog.find(b=>b.key===key);if(!b)return;
 const select=arkBibleElm('bibleChapterSelect');select.replaceChildren();
 for(const chapter of b.chapters){const o=document.createElement('option');o.value=chapter.path;o.textContent=String(chapter.num);select.append(o)}
 select.value=wanted&&b.chapters.some(c=>c.path===wanted)?wanted:b.chapters[0].path;
}
async function arkBibleRead(path){
 if(!path)return;arkBibleCurrent=path;
 const group=arkBibleCatalog.find(b=>b.chapters.some(c=>c.path===path));
 if(!group)return;arkBibleElm('bibleBookSelect').value=group.key;
 arkBibleFillChapters(group.key,path);
 const chapter=group.chapters.find(c=>c.path===path);
 arkBibleElm('bibleChapterLabel').textContent=group.name+' · Kapitel '+chapter.num;
 arkBibleShowMessage('Kapitel wird geladen ...');
 try{
  const result=await fetch('/api/bible/file?path='+encodeURIComponent(path),{cache:'no-store'});
  if(!result.ok)throw Error('HTTP '+result.status);
  const doc=new DOMParser().parseFromString(await result.text(),'text/html');
  const main=doc.querySelector('.main');if(!main)throw Error('Kein Bibeltext in dieser Datei');
  const forbidden=['script','style','iframe','object','embed','form','button','img','picture','video','audio','svg','link','meta'];
  for(const el of main.querySelectorAll(forbidden.join(',')))el.remove();
  for(const el of main.querySelectorAll('*')){
   for(const at of [...el.attributes])if(!['class','id'].includes(at.name))el.removeAttribute(at.name);
   if(el.tagName==='A'){const s=doc.createElement('span');s.className=el.className;s.textContent=el.textContent;el.replaceWith(s)}
  }
  const body=main.innerHTML;
  const stylesheet=`:root{color-scheme:dark}*{box-sizing:border-box}html{background:#0d1e1d;color:#e6ebe3}body{margin:0;padding:clamp(20px,4vw,56px) clamp(17px,6vw,65px);font-family:Georgia,'Times New Roman',serif;font-size:${arkBibleFont}px;line-height:1.9}article{max-width:810px;margin:auto}.mt{font-size:1.45em;color:#f0d2a2;font-weight:700;line-height:1.45}.chapterlabel{font-size:2.15em;color:#94e2b5;font-weight:700;line-height:1.5;margin:.5em 0}.p,.q,.q1,.q2{margin:0 0 1em}.s,.s1,.s2{color:#d9c5a0;font-weight:700;font-size:1.12em}.verse{font:.75em/1.6 system-ui,sans-serif;color:#8ad2b2;margin-right:2px;font-weight:750}.q,.q1,.q2{padding-left:1.3em}a{color:#91e0c5}hr{border:0;border-top:1px solid #456457}::selection{background:#4b775e}::-webkit-scrollbar{width:12px}::-webkit-scrollbar-track{background:#132422}::-webkit-scrollbar-thumb{background:#42695d;border-radius:10px}`;
  const html='<!doctype html><html lang="de"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>'+stylesheet+'</style></head><body><article>'+body+'</article></body></html>';
  arkBibleElm('bibleReaderFrame').srcdoc=html;
 }catch(e){arkBibleShowMessage('Lesefehler: '+e.message)}
}
function arkBibleStep(delta){const all=arkBibleCatalog.flatMap(g=>g.chapters.map(c=>c.path));const i=all.indexOf(arkBibleCurrent);if(i<0)return;
 const target=all[i+delta];if(target)arkBibleRead(target);}
arkBibleElm('bibleBookSelect').addEventListener('change',e=>{const b=arkBibleCatalog.find(x=>x.key===e.target.value);if(b)arkBibleRead(b.chapters[0].path)});
arkBibleElm('bibleChapterSelect').addEventListener('change',e=>arkBibleRead(e.target.value));
arkBibleElm('biblePrevChapter').addEventListener('click',()=>arkBibleStep(-1));
arkBibleElm('bibleNextChapter').addEventListener('click',()=>arkBibleStep(1));
arkBibleElm('bibleFontDown').addEventListener('click',()=>{arkBibleFont=Math.max(13,arkBibleFont-2);arkBibleRead(arkBibleCurrent)});
arkBibleElm('bibleFontUp').addEventListener('click',()=>{arkBibleFont=Math.min(30,arkBibleFont+2);arkBibleRead(arkBibleCurrent)});
// Run original initialization only after Bible is selected. This intentionally does not touch original files.
const arkBibleOriginalShow=bibleShow;
bibleShow=async function(){await arkBibleOriginalShow();await arkBibleInit();};
const arkBibleOriginalSave=arkBibleElm('bibleSave').onclick;
arkBibleElm('bibleSave').addEventListener('click',()=>setTimeout(arkBibleInit,350));

