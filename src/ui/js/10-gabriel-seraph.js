'use strict';
// Music library, queue and direct audio-element visualizer (one audio output only).
let musicTracks=[],musicIndex=-1,musicShuffle=false,musicRepeat='off';
let musicCtx=null,musicAnalyser=null,musicFrame=0,musicLoadSeq=0,musicCurrentPath='';
let musicPlayerNode=null,musicMicStream=null,musicMicNode=null,musicMixAnalyser=null,musicMicAnalyser=null,musicVisualMix=null,musicSourceMode='seraph';
const musicAudio=select('musicAudio'),musicList=select('musicList');
const musicPlayable=new Set(['.mp3','.wav','.ogg','.flac','.m4a']);
function musicFilename(name){return String(name||'').replace(/\.(mp3|wav|ogg|flac|m4a)$/i,'');}
function musicSetState(message){select('musicState').textContent=message;}
function musicGetVisualizer(){try{return select('musicVisualizer').contentWindow.ARKVisualizer||null;}catch(_){return null;}}
function musicSyncVisualizer(){
 const v=musicGetVisualizer();if(!v)return;
 const micActive=!!(musicMicStream&&musicMicStream.getAudioTracks().some(t=>t.readyState==='live'));
 const source=musicSourceMode==='seraph'?musicAnalyser:(musicSourceMode==='mikrofon'?musicMicAnalyser:musicMixAnalyser);
 if(source&&musicCtx)v.attach(source,musicCtx);
 const playerActive=!musicAudio.paused&&!musicAudio.ended;
 v.setActive((musicSourceMode==='seraph'?playerActive:(musicSourceMode==='mikrofon'?micActive:(playerActive||micActive)))&&chosen==='culture'&&!select('mediaPanel').hidden&&!document.hidden);
}
function musicUpdateAudioMode(){
 const b=select('musicAudioMode');const labels={seraph:'◉ SERAPH',mikrofon:'◉ MIKROFON',mix:'◉ MIX'};
 b.textContent=labels[musicSourceMode];b.setAttribute('aria-label','David-Audioquelle: '+musicSourceMode);
 b.setAttribute('aria-pressed',String(musicSourceMode!=='seraph'));
 b.title=musicSourceMode==='seraph'?'David: Wiedergabe aus Seraph (kein Windows-Loopback)':musicSourceMode==='mikrofon'?'David: Aufnahmegerät aus ARK-Einstellungen':'David: Seraph und Aufnahmegerät gemeinsam';
}
function musicReleaseMic(){
 if(musicMicNode){try{musicMicNode.disconnect();}catch(_){}musicMicNode=null;}
 if(musicMicStream){musicMicStream.getTracks().forEach(t=>t.stop());musicMicStream=null;}
}
async function musicEnsureMic(){
 if(musicMicStream&&musicMicStream.getAudioTracks().some(t=>t.readyState==='live'))return;
 if(!navigator.mediaDevices?.getUserMedia||!navigator.mediaDevices.enumerateDevices)throw Error('Mikrofonzugriff im Browser nicht verfügbar.');
 const r=await fetch('/api/audio/devices',{cache:'no-store'});
 if(!r.ok)throw Error('ARK-Audioeinstellungen nicht erreichbar (HTTP '+r.status+').');
 const config=await r.json(),requested=(config.selected?.name||'').trim();
 // Trigger browser permission once to expose audio device labels, without guessing Windows numeric IDs.
 let probe=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
 try{
  const inputs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
  const wanted=requested.toLocaleLowerCase('de');
  const normalize=n=>n.toLocaleLowerCase('de').replace(/\s+/g,' ').trim();
  const candidates=(config.selected?.id===-1)?[]:inputs.filter(d=>{const label=normalize(d.label),name=normalize(wanted);return label===name||(name.length>=12&&label.includes(name))||(label.length>=12&&name.includes(label));});
  const match=candidates.length===1?candidates[0]:null;
  if(candidates.length>1)throw Error('Mehrere passende Mikrofone erkannt. Bitte ARK-Einstellungen prüfen.');
  if(config.selected?.id!==-1&&!match)throw Error('Gewähltes Aufnahmegerät nicht im Browser gefunden: '+requested+'. Browserfreigabe und Windows-Geräte prüfen.');
  if(match){probe.getTracks().forEach(t=>t.stop());probe=null;
   probe=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:match.deviceId},echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});}
  await musicStartVisual();
  if(!musicCtx)throw Error('Web Audio kann nicht gestartet werden.');
  musicMicStream=probe;probe=null;
  musicMicNode=musicCtx.createMediaStreamSource(musicMicStream);
  musicMicNode.connect(musicMicAnalyser);musicMicNode.connect(musicVisualMix); // Analysis only; never connected to destination (feedback prevention).
  musicMicStream.getAudioTracks().forEach(t=>t.addEventListener('ended',()=>{musicReleaseMic();musicSetState('Audioeingang getrennt – bitte Quelle erneut wählen.');musicSyncVisualizer();},{once:true}));
 }finally{if(probe)probe.getTracks().forEach(t=>t.stop());}
}
async function musicSetSourceMode(next){
 if(next===musicSourceMode)return;
 const previous=musicSourceMode;
 try{
  if(next!=='seraph')await musicEnsureMic();
  if(next==='seraph')musicReleaseMic();
  musicSourceMode=next;musicUpdateAudioMode();musicSyncVisualizer();
  musicSetState('DAVID // Audioquelle: '+({seraph:'Seraph-Wiedergabe',mikrofon:'ARK-Mikrofon',mix:'Seraph + ARK-Mikrofon'}[next]));
 }catch(e){musicSourceMode=previous;musicUpdateAudioMode();musicSyncVisualizer();musicSetState('Audioquelle nicht gewechselt: '+(e.message||e));if(previous==='seraph')musicReleaseMic();}
}
function musicDrawEmpty(){musicSyncVisualizer();}
function musicVisualFrame(){musicFrame=0;musicSyncVisualizer();}
async function musicStartVisual(){
 if(!musicCtx){
  try{
   const AC=window.AudioContext||window.webkitAudioContext;
   if(!AC){musicSetState('Visualizer: Web Audio wird von diesem Browser nicht unterstützt.');return;}
   musicCtx=new AC();musicAnalyser=musicCtx.createAnalyser();
   musicAnalyser.fftSize=2048;musicAnalyser.smoothingTimeConstant=.78;
   musicMixAnalyser=musicCtx.createAnalyser();musicMixAnalyser.fftSize=2048;musicMixAnalyser.smoothingTimeConstant=.78;
   musicVisualMix=musicCtx.createGain();musicVisualMix.connect(musicMixAnalyser);
   musicMicAnalyser=musicCtx.createAnalyser();musicMicAnalyser.fftSize=2048;musicMicAnalyser.smoothingTimeConstant=.78;
   musicPlayerNode=musicCtx.createMediaElementSource(musicAudio);
   musicPlayerNode.connect(musicAnalyser);musicAnalyser.connect(musicCtx.destination);
   // Split for visualization only: DO NOT connect the mix to output speakers.
   musicPlayerNode.connect(musicVisualMix);
  }catch(e){musicSetState('Audioanalyse nicht verfügbar: '+e.message);return;}
 }
 try{if(musicCtx.state==='suspended')await musicCtx.resume();}catch(_){/* player remains usable */}
 musicSyncVisualizer();
}
function musicStopVisual(){if(musicFrame){cancelAnimationFrame(musicFrame);musicFrame=0;}musicSyncVisualizer();}
function musicLoadVisualizerModes(){
 const v=musicGetVisualizer();if(!v)return;
 const list=v.getModes(),picker=select('musicView');picker.replaceChildren();
 for(const m of list){const opt=document.createElement('option');opt.value=m.id;opt.textContent=m.name;picker.append(opt);}
 picker.value='waveform';musicSyncVisualizer();
}
select('musicVisualizer').addEventListener('load',musicLoadVisualizerModes);
function musicUpdateSelected(){
 for(const btn of musicList.querySelectorAll('button[data-music-path]')){
  const active=btn.dataset.musicPath===musicCurrentPath;btn.classList.toggle('music-current',active);btn.setAttribute('aria-current',active?'true':'false');
 }
}
function musicRender(){
 const filter=select('musicFilter').value.trim().toLocaleLowerCase('de');musicList.replaceChildren();
 const filtered=musicTracks.filter(t=>((t.name||'')+' '+(t.folder||'')).toLocaleLowerCase('de').includes(filter));
 const show=filtered.slice(0,250);
 for(const t of show){const b=document.createElement('button');b.type='button';b.dataset.musicPath=t.path;
  const strong=document.createElement('strong');strong.textContent='♫ '+musicFilename(t.name);
  const small=document.createElement('small');small.textContent=t.folder||'MP3';b.append(strong,small);
  b.addEventListener('click',()=>musicSelect(t,true));musicList.append(b);
 }
 if(!show.length){const p=document.createElement('span');p.textContent='Keine passenden Musiktitel.';musicList.append(p);}
 const extra=filtered.length>show.length?' · '+show.length+' angezeigt':'';
 select('musicCount').textContent=musicTracks.length+' Titel'+extra;
 musicUpdateSelected();
}
async function musicLoad(){
 const seq=++musicLoadSeq;
 try{
  const r=await fetch('/api/media/music',{cache:'no-store'});
  if(!r.ok)throw Error('Musikbibliothek ist nicht verfügbar');const d=await r.json();
  if(seq!==musicLoadSeq)return;
  musicTracks=d.tracks||[];musicIndex=musicTracks.findIndex(t=>t.path===musicCurrentPath);
  musicRender();
  if(!d.ready)musicSetState('Ordner D:\\ARK-Media\\MP3 noch nicht erreichbar.');
  else if(d.partial)musicSetState('Musikliste begrenzt – weitere Titel im Media-Dateibrowser öffnen.');
  else if(!musicTracks.length)musicSetState('Keine Audiodateien im Ordner MP3 gefunden.');
  else if(!musicCurrentPath)musicSetState('Titel auswählen. Audio und Visualizer funktionieren offline.');
 }catch(e){if(seq!==musicLoadSeq)return;musicSetState(e.message);}
}
async function musicSelect(track,autoPlay=true){
 if(!track||!track.path)return;
 const changed=track.path!==musicCurrentPath;
 musicCurrentPath=track.path;musicIndex=musicTracks.findIndex(t=>t.path===musicCurrentPath);
 select('musicTitle').textContent=musicFilename(track.name);
 select('musicFolder').textContent=track.folder||'MP3';
 if(changed){musicAudio.src='/api/media/file?path='+encodeURIComponent(track.path);musicAudio.load();}
 musicUpdateSelected();
 if(autoPlay){
  try{await musicStartVisual();await musicAudio.play();musicSetState('WIEDERGABE // '+track.name);musicSyncVisualizer();}
  catch(e){musicSetState('Wiedergabe nicht möglich: '+e.message);}
 }
}
function musicStep(delta,ended=false){
 if(!musicTracks.length){musicSetState('Keine Titel in der Bibliothek.');return;}
 let next=musicIndex;
 if(musicShuffle&&musicTracks.length>1){next=Math.floor(Math.random()*(musicTracks.length-1));if(next>=musicIndex&&musicIndex>=0)next++;}
 else next=(musicIndex<0?0:musicIndex+delta);
 if(next<0||next>=musicTracks.length){
  if(musicRepeat==='all')next=(next+musicTracks.length)%musicTracks.length;
  else if(ended){musicStopVisual();musicSetState('Wiedergabeliste beendet.');return;}
  else next=(next+musicTracks.length)%musicTracks.length;
 }
 musicSelect(musicTracks[next],true);
}
musicAudio.addEventListener('ended',()=>{if(musicRepeat==='one'){musicAudio.currentTime=0;musicAudio.play().catch(e=>musicSetState(e.message));}else musicStep(1,true);});
musicAudio.addEventListener('pause',musicStopVisual);
musicAudio.addEventListener('play',()=>{musicStartVisual();});
musicAudio.addEventListener('error',()=>{musicStopVisual();musicSetState('Audioformat nicht abspielbar oder Datei nicht erreichbar.');});
select('musicPrev').addEventListener('click',()=>musicStep(-1));
select('musicNext').addEventListener('click',()=>musicStep(1));
select('musicShuffle').addEventListener('click',()=>{musicShuffle=!musicShuffle;const b=select('musicShuffle');b.textContent='ZUFALL: '+(musicShuffle?'AN':'AUS');b.setAttribute('aria-pressed',String(musicShuffle));});
select('musicRepeat').addEventListener('click',()=>{musicRepeat=musicRepeat==='off'?'all':musicRepeat==='all'?'one':'off';select('musicRepeat').textContent='WIEDERHOLEN: '+({off:'AUS',all:'ALLE',one:'EINZEL'}[musicRepeat]);});
select('musicAudioMode').addEventListener('click',()=>{const next={seraph:'mikrofon',mikrofon:'mix',mix:'seraph'}[musicSourceMode];musicSetSourceMode(next);});
musicUpdateAudioMode();
window.addEventListener('pagehide',musicReleaseMic);
select('musicView').addEventListener('change',()=>musicGetVisualizer()?.setMode(select('musicView').value));
select('musicOptions').addEventListener('click',()=>musicGetVisualizer()?.toggleSettings());
select('musicFullscreen').addEventListener('click',async()=>{try{const e=select('musicVisualizer');if(document.fullscreenElement===e)await document.exitFullscreen();else await e.requestFullscreen();}catch(err){musicSetState('Vollbild nicht verfügbar: '+err.message);}});
select('musicFilter').addEventListener('input',musicRender);
select('musicReload').addEventListener('click',musicLoad);
window.addEventListener('resize',()=>{if(!musicFrame)musicDrawEmpty();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)musicStopVisual();else if(!musicAudio.paused&&chosen==='culture')musicStartVisual();});


/* ARK v1.4.2 Media Downloader: playlist opt-in and per-item progress. */
let dlInit=false, dlLastRunning=false, dlPolling=false;
const dlSelect=(id)=>document.getElementById(id);
function dlOptions(){dlSelect('dlVideoRow').hidden=!dlSelect('dlVideo').checked;dlSelect('dlMP3Row').hidden=!dlSelect('dlMP3').checked;}
async function dlFetch(url,opts){const r=await fetch(url,opts);if(!r.ok)throw Error((await r.text()).trim().slice(0,280)||'HTTP '+r.status);return r.json();}
async function dlRefresh(){
 if(dlPolling)return;dlPolling=true;
 try{
  const d=await dlFetch('/api/downloader/status',{cache:'no-store'});const st=d.state||{},ts=d.tools||{};
  if(!dlInit){dlSelect('dlVideoDir').value=st.video_dir||'D:\\ARK-Media\\Videos';dlSelect('dlMP3Dir').value=st.mp3_dir||'D:\\ARK-Media\\MP3';dlInit=true;}
  dlSelect('dlToolState').textContent=ts.yt_dlp&&ts.ffmpeg?'yt-dlp + FFmpeg bereit':(!ts.yt_dlp?'yt-dlp fehlt · ':'')+(!ts.ffmpeg?'FFmpeg fehlt':'');
  const busy=!!(st.running||st.installing);
  dlSelect('dlStart').disabled=busy || !ts.yt_dlp || !ts.ffmpeg;dlSelect('dlInstall').disabled=busy;dlSelect('dlCancel').disabled=!st.running;
  dlSelect('dlProgressBar').style.width=Math.max(0,Math.min(100,Number(st.percent)||0))+'%';
  dlSelect('dlMessage').textContent=(st.phase||'bereit').toUpperCase()+' // '+(st.playlist&&st.total>0?'Titel '+st.item+'/'+st.total+' · ':'')+(st.message||'Bereit');
  const lines=st.lines||[];dlSelect('dlLog').hidden=lines.length===0;dlSelect('dlLog').textContent=lines.join('\n');
  if(dlLastRunning&&!busy&&st.phase==='fertig'&&chosen==='culture'){musicLoad();mediaBrowse(mediaCurrent||'');}
  dlLastRunning=busy;
 }catch(e){dlSelect('dlMessage').textContent='Downloader-Status: '+e.message;}
 finally{dlPolling=false}
}
async function dlStart(){
 if(!dlSelect('dlVideo').checked&&!dlSelect('dlMP3').checked){dlSelect('dlMessage').textContent='Bitte Video und/oder MP3 auswählen.';return;}
 const body={url:dlSelect('dlUrl').value.trim(),video:dlSelect('dlVideo').checked,mp3:dlSelect('dlMP3').checked,playlist:dlSelect('dlPlaylist').checked,video_dir:dlSelect('dlVideoDir').value,mp3_dir:dlSelect('dlMP3Dir').value};
 try{await dlFetch('/api/downloader/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});await dlRefresh();}
 catch(e){dlSelect('dlMessage').textContent='Start fehlgeschlagen: '+e.message;}
}
async function dlBrowse(kind){
 const field=dlSelect(kind==='mp3'?'dlMP3Dir':'dlVideoDir');
 dlSelect('dlMessage').textContent='Windows-Ordnerauswahl öffnen ...';
 try{const data=await dlFetch('/api/downloader/folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initial:field.value})});if(data.path)field.value=data.path;dlSelect('dlMessage').textContent=data.path?'Zielordner: '+data.path:'Ordnerauswahl abgebrochen.';}
 catch(e){dlSelect('dlMessage').textContent='Ordnerauswahl: '+e.message;}
}
dlSelect('dlVideo').addEventListener('change',dlOptions);
dlSelect('dlMP3').addEventListener('change',dlOptions);
dlSelect('dlStart').addEventListener('click',dlStart);
dlSelect('dlBrowseVideo').addEventListener('click',()=>dlBrowse('video'));
dlSelect('dlBrowseMP3').addEventListener('click',()=>dlBrowse('mp3'));
dlSelect('dlCancel').addEventListener('click',async()=>{try{await dlFetch('/api/downloader/cancel',{method:'POST'});await dlRefresh();}catch(e){dlSelect('dlMessage').textContent=e.message;}});
dlSelect('dlInstall').addEventListener('click',async()=>{try{await dlFetch('/api/downloader/install',{method:'POST'});await dlRefresh();}catch(e){dlSelect('dlMessage').textContent='Einrichtung: '+e.message;}});
dlSelect('arkDownloader').addEventListener('toggle',()=>{if(dlSelect('arkDownloader').open)dlRefresh();});
setInterval(()=>{if(chosen==='culture'&&dlSelect('arkDownloader').open)dlRefresh();},1200);
dlOptions();

let appsLinkIndex=-1;
function appsStepLink(delta){
 const buttons=[...select('appsPanel').querySelectorAll('.ark-app-item button:not(:disabled)')].filter(b=>b.getClientRects().length);
 if(!buttons.length)return false;
 let i=buttons.indexOf(document.activeElement);
 i=i<0?(delta>0?0:buttons.length-1):(i+delta+buttons.length)%buttons.length;
 appsLinkIndex=i;buttons.forEach(b=>b.classList.remove('ark-media-focus'));
 const b=buttons[i];b.classList.add('ark-media-focus');b.focus({preventScroll:true});b.scrollIntoView({block:'nearest'});return true;
}
let mediaLinkIndex=-1;
function mediaStepLink(delta){
 const buttons=[...select('mediaPanel').querySelectorAll('.ark-downloader summary,.ark-downloader button:not(:disabled),.ark-music-list button,.ark-music-transport button,.ark-music-transport select,.ark-media-sections button:not(:disabled),.ark-media-list button,.ark-media-preview-bar button')].filter(b=>b.getClientRects().length);
 if(!buttons.length)return false;
 let i=buttons.indexOf(document.activeElement);i=i<0?(delta>0?0:buttons.length-1):(i+delta+buttons.length)%buttons.length;
 mediaLinkIndex=i;buttons.forEach(b=>b.classList.remove('ark-media-focus'));
 const b=buttons[i];b.classList.add('ark-media-focus');b.focus({preventScroll:true});b.scrollIntoView({block:'nearest'});return true;
}
select('mediaHome').addEventListener('click',()=>mediaBrowse(''));
select('mediaUp').addEventListener('click',()=>mediaBrowse(mediaCurrent.split('/').slice(0,-1).join('/')));
select('mediaPreviewClose').addEventListener('click',mediaReaderClose);
select('mediaReaderFullscreen').addEventListener('click',mediaReaderFullscreen);
select('mediaBookPrev').addEventListener('click',()=>mediaBookChapter(mediaBookIndex-1));
select('mediaBookNext').addEventListener('click',()=>mediaBookChapter(mediaBookIndex+1));
select('mediaBookChapter').addEventListener('change',e=>mediaBookChapter(Number(e.target.value)));
select('mediaBookLess').addEventListener('click',()=>{mediaBookFont=Math.max(13,mediaBookFont-2);mediaBookChapter(mediaBookIndex);});
select('mediaBookMore').addEventListener('click',()=>{mediaBookFont=Math.min(36,mediaBookFont+2);mediaBookChapter(mediaBookIndex);});
document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement!==select('mediaPreview')&&mediaReaderEnabled){mediaReaderEnd();select('mediaReaderFullscreen').textContent='⛶ VOLLBILD LESEN';}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&select('mediaPreview').classList.contains('reading')){e.stopImmediatePropagation();e.preventDefault();mediaReaderEnd();select('mediaReaderFullscreen').textContent='⛶ VOLLBILD LESEN';}},true);
select('mediaSetRoot').addEventListener('click',async()=>{try{
 const r=await fetch('/api/media/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({root:select('mediaRoot').value})});
 if(!r.ok)throw Error(await r.text());await mediaCheck();await mediaBrowse('');await musicLoad();
 }catch(e){select('mediaStatus').textContent='Ordner ungültig: '+e.message;}});

let chosen='home', bridgeSeq=0, bridgeOnline=false, deckPresent=false, lastPosted='';
let historyStack=['home'], historyIndex=0;
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function navModules(){return [...select('modulegrid').querySelectorAll('.module')];}
function renderModules(){
  const q=select('search').value.toLowerCase().trim();
  const items=moduleList.filter(id=>{let m=modules[id];return !q||(`${m.name} ${m.sub} ${m.body} ${m.code}`).toLowerCase().includes(q)});
  select('modcount').textContent=' / '+items.length+' TREFFER';select('modulegrid').innerHTML=items.length?items.map(id=>{let m=modules[id];return `<button class="module ${chosen===id?'active':''}" data-module="${id}"><span class="micon">${esc(m.icon)}</span><span><strong>${esc(m.name)}</strong><small>${esc(m.sub)}</small><span class="mstatus">${esc(m.code)} // ${id==='foundation'?'SSD GEPLANT':'KONZEPT'}</span></span></button>`}).join(''):'<div class="empty">Keine passenden Module. Suche zurücksetzen.</div>';
}


let bibleVisible=false,biblePath='',bibleEntries=[],bibleReady=false;
function bibleMessage(msg,error=false){const e=select('bibleStatus');e.textContent=msg;e.style.color=error?'#f3af96':'#a3bbb5';}
async function bibleCheck(){
 try{const response=await fetch('/api/bible/status',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
 const data=await response.json();bibleReady=!!data.ready;bibleMessage(data.message||'Bibel-Ordner nicht gefunden',!data.ready);
 if(select('bibleRoot')!==document.activeElement) select('bibleRoot').value=data.root||'';
 if(!data.ready)select('bibleSettings').hidden=false;
 return bibleReady;
 }catch(e){bibleReady=false;bibleMessage('Bibel-Dienst nicht erreichbar',true);return false;}
}
async function bibleShow(){bibleVisible=true;select('biblePanel').hidden=false;
 
 if(await bibleCheck())await bibleLoad(biblePath);
}
function bibleHide(){bibleVisible=false;select('biblePanel').hidden=true;}
async function bibleLoad(path=''){
 try{const response=await fetch('/api/bible/list?path='+encodeURIComponent(path),{cache:'no-store'});if(!response.ok)throw Error(await response.text());
 const data=await response.json();biblePath=data.path||'';bibleEntries=data.entries||[];
 select('bibleBreadcrumb').textContent='/Bibel'+(biblePath?'/'+biblePath:'');
 select('biblePreview').hidden=true;select('bibleFilter').value='';bibleRender();
 bibleMessage(bibleEntries.length+' Einträge · Originalstruktur unverändert');
 }catch(e){bibleMessage('Ordner nicht lesbar: '+e.message,true);select('bibleList').innerHTML='<p class="bible-msg">Kein Zugriff. Bitte Ordnerpfad kontrollieren.</p>';}
}
function bibleRender(){const q=select('bibleFilter').value.trim().toLocaleLowerCase('de');
 const found=bibleEntries.filter(x=>x.name.toLocaleLowerCase('de').includes(q));
 const list=select('bibleList');list.textContent='';
 if(!found.length){const el=document.createElement('p');el.className='bible-msg';el.textContent='Keine passenden Dateinamen in diesem Ordner.';list.append(el);return;}
 for(const item of found){let b=document.createElement('button');b.type='button';b.className='bible-item';
 let glyph=document.createElement('span');glyph.className='bible-item-icon';glyph.textContent=item.dir?'▣':({'pdf':'▤','txt':'≡','md':'≡','mp3':'♫','jpg':'▧','png':'▧','epub':'▤'}[item.kind?.replace('.','')]||'□');
 let txt=document.createElement('span');txt.textContent=item.name;b.append(glyph,txt);b.addEventListener('click',()=>item.dir?bibleLoad(item.path):bibleOpenFile(item));list.append(b);}
}
async function bibleOpenFile(item){
 const c=select('bibleContent');c.replaceChildren();select('biblePreview').hidden=false;select('bibleFilename').textContent=item.name;
 const uri='/api/bible/file?path='+encodeURIComponent(item.path);
 const download=select('bibleDownload');download.href=uri;download.setAttribute('download',item.name);
 const ext=(item.kind||'').toLowerCase();
 if(['.txt','.md','.csv'].includes(ext)){
  try{if(item.size>8*1024*1024)throw Error('Datei zu groß für die Textvorschau (8 MB).');
   const r=await fetch(uri);if(!r.ok)throw Error(await r.text());const pre=document.createElement('pre');pre.textContent=await r.text();c.append(pre);
  }catch(e){c.textContent=e.message;}
 }else if(['.pdf','.html','.htm'].includes(ext)){
  const f=document.createElement('iframe');f.title=item.name;f.src=uri;
  if(ext!=='.pdf')f.setAttribute('sandbox','');c.append(f);
 }else if(['.jpg','.jpeg','.png','.gif','.webp'].includes(ext)){
  const img=document.createElement('img');img.src=uri;img.alt=item.name;c.append(img);
 }else if(['.mp3','.wav','.ogg'].includes(ext)){
  const a=document.createElement('audio');a.controls=true;a.preload='none';a.src=uri;c.append(a);
 }else if(['.mp4','.webm'].includes(ext)){
  const v=document.createElement('video');v.controls=true;v.preload='none';v.src=uri;c.append(v);
 }else{
  const p=document.createElement('p');p.className='bible-msg';p.textContent='Für diesen Dateityp gibt es noch keine integrierte Vorschau. Über „DATEI ÖFFNEN / SPEICHERN“ kannst du die Originaldatei mit einer passenden Offline-Anwendung öffnen.';c.append(p);
 }
 select('biblePreview').scrollIntoView({block:'nearest'});
}

select('bibleClose').addEventListener('click',()=>choose('home'));
select('bibleChange').addEventListener('click',()=>{select('bibleSettings').hidden=false;select('bibleRoot').focus();});
select('bibleSave').addEventListener('click',async()=>{
 try{const r=await fetch('/api/bible/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({root:select('bibleRoot').value})});
 if(!r.ok)throw Error(await r.text());select('bibleSettings').hidden=true;biblePath='';await bibleCheck();await bibleLoad('');
 }catch(e){bibleMessage('Ordnerpfad ungültig: '+e.message,true);}
});
select('bibleHome').addEventListener('click',()=>bibleLoad(''));
select('bibleUp').addEventListener('click',()=>{const segments=biblePath.split('/').filter(Boolean);segments.pop();bibleLoad(segments.join('/'));});
select('biblePreviewClose').addEventListener('click',()=>{select('biblePreview').hidden=true;select('bibleContent').replaceChildren();});
select('bibleFilter').addEventListener('input',bibleRender);

