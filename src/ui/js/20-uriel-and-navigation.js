'use strict';
let wikiReady=false, wikiVisible=false, wikiHistory=[], wikiHistoryIndex=-1, wikiBook='';

// ARK 5x3 remote: row 2 outer keys step across actual Wikipedia links in the same-origin Kiwix iframe.
// This only changes live browser focus/highlight; no source file or ZIM is modified.
let wikiSelectedIndex=-1, wikiSelectedLink=null, wikiSelectedURL='';
function wikiLinkDocument(){
  const f=select('wikiFrame');
  if(!wikiVisible||!wikiReady||!f||!f.contentDocument)return null;
  try{const d=f.contentDocument;return d?.location?.origin===location.origin?d:null;}
  catch(_){return null;}
}
function wikiLinkCandidates(){
  const d=wikiLinkDocument();if(!d)return [];
  return [...d.querySelectorAll('a[href]')].filter(a=>{
    let u;
    try{u=new URL(a.getAttribute('href'),d.baseURI);}catch(_){return false;}
    if(u.origin!==location.origin||!u.pathname.startsWith('/wiki/'))return false;
    if(!a.getClientRects().length||getComputedStyle(a).visibility==='hidden'||getComputedStyle(a).display==='none')return false;
    return !!((a.innerText||a.textContent||'').trim()||a.querySelector('img')||a.getAttribute('aria-label'));
  });
}
function wikiClearLinkSelection(){
  if(wikiSelectedLink){try{wikiSelectedLink.classList.remove('ark-selected-link');}catch(_){}}
  wikiSelectedLink=null;wikiSelectedIndex=-1;wikiSelectedURL='';
  const badge=select('wikiLinkStatus');if(badge){badge.hidden=true;badge.textContent='';}
}
function wikiStepLink(direction){
  const d=wikiLinkDocument();if(!d){select('lastaction').textContent='WIKI LINK: NO DOCUMENT';return false;}
  const links=wikiLinkCandidates();
  if(!links.length){wikiClearLinkSelection();select('lastaction').textContent='WIKI: KEINE LINKS';return false;}
  let i=wikiSelectedLink?links.indexOf(wikiSelectedLink):-1;
  // First press: NEXT starts at first link; PREVIOUS starts at last link.
  i=i<0?(direction>0?0:links.length-1):(i+direction+links.length)%links.length;
  if(wikiSelectedLink){wikiSelectedLink.classList.remove('ark-selected-link');}
  const styleId='ark-link-focus-style';
  if(!d.getElementById(styleId)){
    const style=d.createElement('style');style.id=styleId;
    style.textContent='a.ark-selected-link{outline:3px solid #d88621!important;outline-offset:3px!important;background:#ffe0a8!important;color:#082524!important;border-radius:2px!important}';
    (d.head||d.documentElement).appendChild(style);
  }
  const a=links[i];a.classList.add('ark-selected-link');
  a.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  wikiSelectedLink=a;wikiSelectedIndex=i;wikiSelectedURL=a.href;
  const label=(a.innerText||a.textContent||a.getAttribute('aria-label')||'Link').trim().replace(/\s+/g,' ').slice(0,95);
  const badge=select('wikiLinkStatus');badge.hidden=false;badge.textContent=`LINK ${i+1}/${links.length} · ${label}`;
  select('lastaction').textContent=`LINK ${i+1}/${links.length}: ${label}`;
  return true;
}
function wikiActivateSelectedLink(){
  const d=wikiLinkDocument();
  if(!d||!wikiSelectedLink||!d.contains(wikiSelectedLink))return false;
  const a=wikiSelectedLink;
  const href=new URL(a.getAttribute('href'),d.baseURI);
  if(href.origin!==location.origin||!href.pathname.startsWith('/wiki/'))return false;
  // Rely on the browser's normal link behavior for Kiwix pages and search results.
  wikiClearLinkSelection();a.click();return true;
}

// Style only a same-origin local Kiwix document. The original ZIM stays untouched.
const wikiDarkCSS = `
:root{color-scheme:dark!important;--background-color-base:#0b191c;--color-base:#dcece7}
html,body{background:#0b191c!important;color:#dcece7!important}
body,main,article,#content,#mw-content-text,.mw-body,.mw-body-content,.mw-page-container,
.mw-page-container-inner,.mw-content-container,.vector-body,.vector-page,.vector-main-menu,
#mw-navigation,#mw-panel,#mw-head,#mw-page-base,#column-content,#bodyContent,
.searchresults,.searchresults li,.searchResult,.results,.result,.results-list,
.kiwix-search,.searchPage,.search-page,#contentSub,.mw-parser-output,
.mw-parser-output>section{background-color:#0b191c!important;color:#dcece7!important}
body p,body li,body dd,body dt,body figcaption,body label,body h1,body h2,body h3,body h4,
body h5,body h6,body small,body strong,body em{color:#dcece7!important}
a,a:link,.mw-parser-output a{color:#78dfce!important}
a:visited{color:#c4aaf2!important}a:hover,a:focus{color:#f4c07c!important}
input,textarea,select,button{background:#14282b!important;color:#e6f7ef!important;border-color:#527267!important}
pre,code,blockquote,.toc,.toccolours,.navbox,.thumbinner,.mw-collapsible-content,
.infobox,.wikitable,.sidebar,.catlinks,table,.metadata,.noprint,.mw-message-box,
.mw-parser-output .thumb,.mw-parser-output .ambox{
  background-color:#13282c!important;color:#dcece7!important;border-color:#41615a!important}
th,td{background-color:#13282c!important;color:#dcece7!important;border-color:#46665d!important}
tr:nth-child(even) td{background-color:#193137!important}
hr{border-color:#41645c!important}::selection{background:#a96d27!important;color:#fff!important}
/* Keep diagrams, inline images, equation canvases, and video colors unchanged. */
img,video,svg,canvas,picture{filter:none!important}
/* ARK physical Stream Deck link focus. */
a.ark-selected-link{outline:3px solid #e4a84d!important;outline-offset:3px!important;
 background:#564021!important;color:#ffe8ba!important;border-radius:3px!important}
`;
function applyWikiDark(){
 const frame=select('wikiFrame');
 try{
  const doc=wikiLinkDocument();
  if(!doc){frame.classList.add('ark-wiki-dark-ready');return false;}
  let style=doc.getElementById('ark-wiki-dark-style');
  if(!style){style=doc.createElement('style');style.id='ark-wiki-dark-style';style.textContent=wikiDarkCSS;
   (doc.head||doc.documentElement).appendChild(style);}
  // Prevent a white flash on internal link navigation; new page gets styled at load.
  if(!doc.documentElement.dataset.arkNavHandler){
   doc.documentElement.dataset.arkNavHandler='1';
   doc.addEventListener('click',e=>{
    const a=e.target?.closest?.('a[href]');
    if(a && !a.hasAttribute('download') && a.target!=='_blank')frame.classList.remove('ark-wiki-dark-ready');
   },true);
  }
  frame.classList.add('ark-wiki-dark-ready');return true;
 }catch(e){frame.classList.add('ark-wiki-dark-ready');return false;}
}
select('wikiFrame').addEventListener('load',()=>{wikiClearLinkSelection();applyWikiDark();});

function wikiMessage(msg,err=false){const el=select('wikiStatus');el.textContent=msg;el.style.color=err?'#f3af96':'#a3bbb5';}
function wikiShow(){wikiVisible=true;select('wikiPanel').hidden=false;wikiCheck();}
function wikiHide(){wikiVisible=false;select('wikiPanel').hidden=true;wikiClearLinkSelection();}
function wikiNavigate(path, record=true){
 if(!wikiReady){wikiMessage('Wikipedia noch nicht bereit',true);return;}
 if(!path.startsWith('/wiki/'))return;
 if(record){wikiHistory=wikiHistory.slice(0,wikiHistoryIndex+1);wikiHistory.push(path);wikiHistoryIndex=wikiHistory.length-1;}
 wikiClearLinkSelection();select('wikiFrame').classList.remove('ark-wiki-dark-ready');select('wikiFrame').src=path;
}
function wikiSearch(q,stayInModule=false){q=(q||'').trim();if(!stayInModule && chosen!=='knowledge')choose('knowledge');else wikiShow();if(!q){wikiNavigate('/wiki/');return;}
 const u='/wiki/search?books.filter.lang=deu&pattern='+encodeURIComponent(q);
 wikiNavigate(u);select('lastaction').textContent='WIKIPEDIA: '+q.slice(0,65);
}
async function wikiCheck(){
 try{
 const r=await fetch('/api/wiki/status',{cache:'no-store'});
 if(!r.ok)throw Error('HTTP '+r.status);
 const v=await r.json();wikiReady=!!v.ready;wikiBook=v.book||'';
 wikiMessage(v.message||'Nicht eingerichtet',v.configured&&!v.ready);
 if(select('zimPath')!==document.activeElement && v.zim)select('zimPath').value=v.zim;
 select('wikiSettings').hidden=wikiReady;
 if(wikiReady && wikiVisible && !select('wikiFrame').getAttribute('src'))wikiNavigate('/wiki/');
 return v;
 }catch(e){wikiReady=false;wikiMessage('Kiwix-Status nicht erreichbar',true);}
}
async function wikiSave(){const val=select('zimPath').value.trim();try{
 const r=await fetch('/api/wiki/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({zim:val})});
 if(!r.ok)throw Error(await r.text());wikiMessage('Kiwix wird gestartet ...');setTimeout(wikiCheck,1300);
 }catch(e){wikiMessage('Pfadfehler: '+e.message,true);}
}
let micDevices=[];
function micStatus(text,error=false){const e=select('micMessage');e.textContent=text;e.classList.toggle('error',error);}
async function micRefresh(){
 micStatus('Aufnahmegeräte werden gesucht ...');
 try{
  const r=await fetch('/api/audio/devices',{cache:'no-store'});
  if(!r.ok)throw Error((await r.text()).trim());
  const info=await r.json(); micDevices=info.devices||[];
  const dropdown=select('micSelect');dropdown.replaceChildren();
  const all=[{id:-1,name:'Windows-Standardmikrofon'},...micDevices];
  for(const entry of all){const o=document.createElement('option');o.value=String(entry.id);o.textContent=entry.name;dropdown.append(o);}
  const selected=info.selected||{id:-1};
  const match=all.find(x=>x.id===selected.id && (x.id===-1 || x.name===selected.name));
  dropdown.value=String(match?match.id:-1);
  micStatus(match ? 'Aktuelle Quelle: '+match.name : 'Gespeichertes Mikrofon nicht angeschlossen. Bitte neu auswählen.',!match);
 }catch(e){micStatus('Mikrofonliste nicht verfügbar: '+e.message,true);}
}
async function micSave(){
 const id=Number(select('micSelect').value);
 const option=id===-1?{id:-1,name:'Windows-Standardmikrofon'}:micDevices.find(x=>x.id===id);
 if(!option){micStatus('Bitte ein verfügbares Mikrofon auswählen.',true);return;}
 micStatus('Speichere Aufnahmequelle ...');
 try{
  const r=await fetch('/api/audio/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(option)});
  if(!r.ok)throw Error((await r.text()).trim());
  micStatus('Gespeichert: '+option.name+' · gilt ab der nächsten Aufnahme');
 }catch(e){micStatus('Konnte nicht speichern: '+e.message,true);}
}

let micIdentifyTimer=null;
async function startMicIdentify(){
 const btn=select('micIdentify');
 if(btn.disabled)return;
 btn.disabled=true;
 select('micIdentifyResults').hidden=true;
 select('micIdentifyResults').replaceChildren();
 select('micIdentifyStatus').textContent='Aufnahmegeräte werden vorbereitet ...';
 try{
  const r=await fetch('/api/audio/identify/start',{method:'POST'});
  if(!r.ok)throw Error((await r.text()).trim());
  await pollMicIdentify();
 }catch(e){select('micIdentifyStatus').textContent='Identifizierung fehlgeschlagen: '+e.message;btn.disabled=false;}
}
async function pollMicIdentify(){
 const status=select('micIdentifyStatus'),btn=select('micIdentify');
 try{
  const r=await fetch('/api/audio/identify/status',{cache:'no-store'});
  if(!r.ok)throw Error((await r.text()).trim());
  const d=await r.json();
  const messages={preparing:'Mikrofone werden geöffnet ...',quiet:'Jetzt bitte 1 Sekunde still sein (Rauschmessung).',speaking:'Jetzt deutlich sprechen: „ARK, teste mein Mikrofon.“',analyzing:'Aufnahme beendet. Quellen werden verglichen ...'};
  if(d.running){status.textContent=messages[d.phase]||'Mikrofontest läuft ...';micIdentifyTimer=setTimeout(pollMicIdentify,300);return;}
  btn.disabled=false;
  if(d.error){status.textContent='Identifizierung fehlgeschlagen: '+d.error;return;}
  renderMicIdentification(d.result||{});
 }catch(e){status.textContent='Mikrofontest: '+e.message;btn.disabled=false;}
}
function renderMicIdentification(result){
 const status=select('micIdentifyStatus'),out=select('micIdentifyResults');out.replaceChildren();out.hidden=false;
 const matches=(result.candidates||[]).filter(x=>x.detected);
 const suggestion=result.suggested;
 if(!suggestion){status.textContent='Keine eindeutige Sprachaktivität erkannt. Bitte erneut testen und deutlich sprechen.';}
 else if(result.confidence==='likely'){status.textContent='Wahrscheinlich richtige Aufnahmequelle erkannt. Bitte Vorschlag prüfen und übernehmen.';}
 else {status.textContent='Mehrere Quellen sind aktiv – eine eindeutige Zuordnung ist nicht möglich. Bitte manuell prüfen.';}
 for(const item of (result.candidates||[])){
  const line=document.createElement('div');line.className='mic-identify-result';
  const label=document.createElement('span');label.textContent=item.name;
  const meter=document.createElement('small');meter.textContent=item.detected?('Aktivität '+item.activity.toFixed(0)+' % · '+item.levelDb+' dBFS'):'Kein hinreichendes Signal';
  line.append(label,meter);out.append(line);
 }
 if(suggestion){
  const button=document.createElement('button');button.type='button';button.className='cleanbtn';
  button.textContent='VORSCHLAG ÜBERNEHMEN: '+suggestion.name;
  button.addEventListener('click',async()=>{
   const r=await fetch('/api/audio/devices',{cache:'no-store'});
   if(!r.ok){micStatus('Mikrofone bitte aktualisieren.',true);return;}
   const d=await r.json();
   micDevices=d.devices||[];
   const valid=micDevices.find(x=>x.id===suggestion.id&&x.name===suggestion.name);
   if(!valid){micStatus('Dieses Mikrofon wurde entfernt. Bitte erneut testen.',true);return;}
   const selectEl=select('micSelect');
   selectEl.replaceChildren();
   for(const device of [{id:-1,name:'Windows-Standardmikrofon'},...micDevices]){
    const o=document.createElement('option');o.value=String(device.id);o.textContent=device.name;selectEl.append(o);
   }
   selectEl.value=String(valid.id);
   await micSave();
  });
  out.append(button);
 }
}
select('micIdentify').addEventListener('click',startMicIdentify);
select('micRefresh').addEventListener('click',micRefresh);
select('micSave').addEventListener('click',micSave);
select('wikiSearchButton').addEventListener('click',()=>arkUnifiedSearch(select('search').value));
select('wikiClose').addEventListener('click',()=>choose('home'));
select('wikiChange').addEventListener('click',()=>{select('wikiSettings').hidden=false;select('zimPath').focus();});
select('wikiHome').addEventListener('click',()=>wikiNavigate('/wiki/'));
select('wikiBack').addEventListener('click',()=>{if(wikiHistoryIndex>0){wikiHistoryIndex--;wikiNavigate(wikiHistory[wikiHistoryIndex],false);}});
select('wikiForward').addEventListener('click',()=>{if(wikiHistoryIndex<wikiHistory.length-1){wikiHistoryIndex++;wikiNavigate(wikiHistory[wikiHistoryIndex],false);}});
select('wikiFocus').addEventListener('click',()=>{try{select('wikiFrame').contentWindow.focus();}catch(_){select('wikiFrame').focus();}});
select('wikiSave').addEventListener('click',wikiSave);
wikiCheck();setInterval(wikiCheck,2400);
function recordHistory(id){if(historyStack[historyIndex]===id)return;historyStack=historyStack.slice(0,historyIndex+1);historyStack.push(id);historyIndex=historyStack.length-1;}
let previousModule='';
select('nrw3dOpen').addEventListener('click',()=>choose('nrw3d'));
select('atlasOpen').addEventListener('click',()=>choose('atlas'));
select('atlasClose').addEventListener('click',()=>choose('home'));
select('nrw3dClose').addEventListener('click',()=>choose('home'));
function nrwSend(code){try{select('nrw3dFrame').contentWindow.postMessage({arkControl:code},location.origin);}catch(e){}}
function choose(id,record=true){
  if(id==='foundation')setTimeout(function(){if(typeof razielRefresh==='function')razielRefresh();},0);
 const m=modules[id];if(!m)return;
 if(keyboardMode)setKeyboardActive(false,true);
 chosen=id;
 arkCurrentApp="";
 if(id!=="atlas"&&id!=="nrw3d"&&id!=="bible"&&id!=="knowledge")arkAppFromKnowledge=false;
 document.querySelectorAll('.ark-content-focus').forEach(x=>x.classList.remove('ark-content-focus'));
 if(record)recordHistory(id);
 const active=id!=='home';
 document.body.classList.toggle('module-mode',active);
 document.body.classList.remove('ark-wiki-search-mode');
 select('arkLocalResults').hidden=true;
 document.body.dataset.activeModule=id;
 select('path').textContent='ARK:/CONSOLE/'+m.code;
 select('pagetitle').textContent=active?m.name:'Die mobile Wissenszentrale.';
 select('pagesub').textContent=active?'':'Vier Bibliothekslaufwerke, Werkzeuge und lokale KI – alles offline.';
 select('lastaction').textContent=m.code+' SELECTED';
 if(id!=='knowledge')wikiHide();
 if(id!=='bible')bibleHide();
 select('appsPanel').hidden=id!=='systems';
 if(id==='systems')appsRefresh();
 select('mediaPanel').hidden=id!=='culture';
 if(id==='culture'){mediaCheck().then(ready=>{if(ready){mediaBrowse('');musicLoad();musicDrawEmpty();}});if(!musicAudio.paused)musicStartVisual();}else if(musicFrame)musicStopVisual();
 select('nrw3dPanel').hidden=id!=='nrw3d';
 select('atlasPanel').hidden=id!=='atlas';
 select('settingsPanel').hidden=id!=='settings';
 select('originPanel').hidden=id!=='origin';
  select('razielPanel').hidden=id!=='foundation';
 if(id==='origin')window.installRefresh?.();
 if(id==='settings')micRefresh();
 const placeholder=select('modulePlaceholder');
 select("topicsPanel").hidden=true;
 arkRenderTopics(id);
 placeholder.hidden=true;
 select('search').placeholder=active?(id==='knowledge'?'Wikipedia durchsuchen ...':'In ARK suchen ...'):'Module suchen ...';
 if(active && id!=='knowledge')select('search').value='';
 document.querySelectorAll('.sidebtn').forEach(b=>b.classList.toggle('selected',b.dataset.module===id));
 renderModules();
 if(id==='knowledge')wikiShow();
 if(id==='bible')bibleShow();
 arkFillAppLauncher(id);arkSetAppVisibility();
 select('moduleBack').hidden=!active;
 select('main')?.scrollTo({top:0});
 if(active){setTimeout(()=>{const focus=id==='knowledge'?select('search'):id==='bible'?select('bibleFilter'):select('moduleBack');focus?.focus({preventScroll:true});},0);}
 else {setTimeout(()=>focusFirstModule(),0);}
 sendLayout();
}
function goBack(){if(!select('arkZipFloat').hidden){arkZipFloatClose();return;}if(mediaReaderEnabled){mediaReaderEnd();select('mediaReaderFullscreen').textContent='⛶ VOLLBILD LESEN';return;}if(!select('mediaPreview').hidden&&chosen==='culture'&&['files','books','videos','games'].includes(arkCurrentApp)){mediaReaderClose();return;}if(keyboardMode)setKeyboardActive(false,true);if(document.body.classList.contains('ark-wiki-search-mode')){document.body.classList.remove('ark-wiki-search-mode');arkSetAppVisibility();if(chosen!=='knowledge')wikiHide();return;}if(arkCloseApp())return;if(arkAppFromKnowledge&&['atlas','nrw3d','bible'].includes(chosen)){arkAppFromKnowledge=false;choose('knowledge');return;}if(chosen!=='home'){previousModule=chosen;choose('home',false);select('lastaction').textContent='MODULE OVERVIEW';}else if(historyIndex>0){historyIndex--;choose('home',false);}}
function goForward(){if(chosen==='home'&&previousModule){choose(previousModule,false);}else if(historyIndex<historyStack.length-1){historyIndex++;choose(historyStack[historyIndex],false);}}
select('moduleBack').addEventListener('click',goBack);
document.addEventListener('pointerdown',e=>{const area=activeContent();if(area&&e.target===area)focusElement(area);});
document.addEventListener('focusin',e=>{const area=activeContent();if(area&&area.contains(e.target)&&e.target!==select('search'))area.classList.add('ark-content-focus');});
function focusFirstModule(){
 const el=navModules()[0];if(el)focusElement(el);else if(chosen!=='home')focusElement(select('search'));
}
const arkside=()=>[...document.querySelectorAll('.sidebar .sidebtn')];
function activeContent(){
 if(!select('arkAppLauncher').hidden)return select('arkAppLauncher');
 if(wikiVisible && !select('wikiPanel').hidden && document.body.classList.contains('ark-wiki-search-mode'))return select('wikiPanel');
 if(wikiVisible && !select('wikiPanel').hidden && chosen!=='atlas' && chosen!=='nrw3d' && chosen!=='settings' && chosen!=='bible')return select('wikiPanel');
 const target={knowledge:'wikiPanel',bible:'biblePanel',culture:'mediaPanel',systems:'appsPanel',settings:'settingsPanel',atlas:'atlasPanel',nrw3d:'nrw3dPanel',foundation:'razielPanel'}[chosen]||'modulePlaceholder';
 const el=select(target);
 return el&&!el.hidden?el:null;
}
function focusElement(el){
 if(!el)return;
 document.querySelectorAll('.ark-content-focus').forEach(x=>x.classList.remove('ark-content-focus'));
 if(el===activeContent()){el.tabIndex=0;el.classList.add('ark-content-focus');}
 el.focus({preventScroll:true});
 if(el.classList?.contains('sidebtn')||el.classList?.contains('module'))el.scrollIntoView({block:'nearest',inline:'nearest'});
}
function contentFocused(){
 const content=activeContent();
 const active=document.activeElement;
 // Includes content's own inputs/buttons, including manually tapped elements.
 return Boolean(content&&(active===content||content.contains(active)||active?.tagName==='IFRAME'&&content.contains(active)));
}
function scrollCurrentContent(direction){
 const px=Math.max(125,Math.round(window.innerHeight*.55))*(direction==='up'?-1:1);
 if(activeContent()?.id==='wikiPanel'){
  const f=select('wikiFrame');
  try{
   const w=f.contentWindow,doc=f.contentDocument;
   const el=doc?.scrollingElement||doc?.documentElement||doc?.body;
   if(el){el.scrollTop+=px;return;}
   w?.scrollBy(0,px);return;
  }catch(_){/* fallback to outer panel if iframe is not same-origin */}
 }
 if(chosen==='bible'){
  const preview=select('bibleContent');
  const inner=preview?.querySelector('iframe');
  if(inner&&!select('biblePreview').hidden){try{inner.contentWindow.scrollBy(0,px);return;}catch(_){}}
  const list=select('bibleList');
  if(list&&select('biblePreview').hidden && list.scrollHeight>list.clientHeight){list.scrollTop+=px;return;}
 }
 const el=activeContent();
 if(el&&el.scrollHeight>el.clientHeight+2){el.scrollTop+=px;return;}
 document.querySelector('.main')?.scrollBy({top:px,behavior:'auto'});
}
function moveOverview(direction){
 const modules=navModules(); const side=arkside(); const cur=document.activeElement;
 if(side.includes(cur)){
  let i=side.indexOf(cur);
  if(direction==='up'||direction==='down')focusElement(side[Math.max(0,Math.min(side.length-1,i+(direction==='down'?1:-1)))]);
  else if(direction==='right')focusElement(modules[0]||select('search'));
  return;
 }
 if(cur===select('search')){
  if(direction==='left'||direction==='up')focusElement(side.find(b=>b.classList.contains('selected'))||side[0]);
  else if(direction==='right'||direction==='down')focusElement(modules[0]);
  return;
 }
 const i=modules.indexOf(cur);
 if(i<0){focusElement(modules[0]||select('search'));return;}
 const r=cur.getBoundingClientRect(); const rx=r.left+r.width/2, ry=r.top+r.height/2;
 const horizontal=direction==='left'||direction==='right',sign=(direction==='left'||direction==='up')?-1:1;
 let best=null,score=Infinity;
 for(const b of modules){if(b===cur)continue;
  const q=b.getBoundingClientRect(),x=q.left+q.width/2,y=q.top+q.height/2;
  const delta=(horizontal?x-rx:y-ry)*sign;
  if(delta<8)continue;
  const offset=Math.abs(horizontal?y-ry:x-rx);
  const s=delta+offset*3;
  if(s<score){best=b;score=s;}
 }
 if(best)focusElement(best);
 else if(direction==='left')focusElement(side.find(b=>b.classList.contains('selected'))||side[0]);
 else if(direction==='up')focusElement(select('search'));
}
function moveFocus(direction){
 if(chosen==='home'){moveOverview(direction);return;}
 const side=arkside(),cur=document.activeElement,content=activeContent();
 const topics=[...select('arkTopicRows').querySelectorAll('button')];
 const results=select('arkLocalResults').hidden?[]:[...select('arkLocalItems').querySelectorAll('button')];
 const inTopics=topics.indexOf(cur),inResults=results.indexOf(cur);
 const launcher=select('arkAppLauncher'),tiles=arkAppTileFocus();
 if(!launcher.hidden&&(cur===launcher||launcher.contains(cur))){
  if(cur===launcher){focusElement(tiles[0]);return;}
  const horizontal=direction==='left'||direction==='right',sgn=direction==='left'||direction==='up'?-1:1;
  const r=cur.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  let best=null,score=Infinity;
  for(const tile of tiles){if(tile===cur)continue;const q=tile.getBoundingClientRect();
   const dx=q.left+q.width/2-x,dy=q.top+q.height/2-y;
   const primary=(horizontal?dx:dy)*sgn;if(primary<9)continue;
   const penalty=Math.abs(horizontal?dy:dx);const n=primary+penalty*3;if(n<score){score=n;best=tile;}}
  if(best)focusElement(best);else if(direction==='up')focusElement(select('search'));
  else if(direction==='left')focusElement(side.find(b=>b.classList.contains('selected'))||side[0]);
  return;
 }

 if(side.includes(cur)){
  let i=side.indexOf(cur);
  if(direction==='up'||direction==='down')focusElement(side[Math.max(0,Math.min(side.length-1,i+(direction==='down'?1:-1)))]);
  else if(direction==='right')focusElement(select('search'));
  return;
 }
 if(cur===select('search')||cur===select('moduleBack')){
  if(direction==='left'||direction==='up')focusElement(side.find(b=>b.classList.contains('selected'))||side[0]);
  else if(direction==='down'||direction==='right')focusElement(topics[0]||results[0]||content);
  return;
 }
 if(inTopics>=0){
  if(direction==='left'&&inTopics%4!==0)focusElement(topics[inTopics-1]);
  else if(direction==='right'&&inTopics%4!==3)focusElement(topics[inTopics+1]);
  else if(direction==='up')focusElement(inTopics>=4?topics[inTopics-4]:select('search'));
  else if(direction==='down')focusElement(inTopics<4?topics[inTopics+4]:(results[Math.min(inTopics-4,results.length-1)]||content));
  else if(direction==='left')focusElement(select('search'));
  else if(direction==='right')focusElement(content);
  return;
 }
 if(inResults>=0){
  if(direction==='left')focusElement(inResults>0?results[inResults-1]:topics[4]||select('search'));
  else if(direction==='right')focusElement(results[inResults+1]||content);
  else if(direction==='up')focusElement(topics[4+Math.min(inResults,3)]||select('search'));
  else if(direction==='down')focusElement(content);
  return;
 }
 if(contentFocused()){
  if(direction==='up'||direction==='down'){scrollCurrentContent(direction);return;}
  if(direction==='left')focusElement(results[0]||topics[0]||select('search'));
  else if(direction==='right')focusElement(select('moduleBack'));
  return;
 }
 focusElement(select('search'));
}
