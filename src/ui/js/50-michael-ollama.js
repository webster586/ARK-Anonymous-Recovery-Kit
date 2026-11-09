'use strict';
// ARK 1.4.5.3 – Ollama lokale KI: Chat + Modell-Verwaltung + RAM-Erkennung.
// Backend-Quelle (ollama.go-artige Erweiterung) war nicht mehr auffindbar; hier anhand
// der UEBERGABE-Screenshots neu aufgebaut, gegen die echte lokale Ollama-Instanz getestet.
const ollamaEl=id=>document.getElementById(id);
let ollamaModels=[],ollamaChatHistory=[],ollamaChatBusy=false,ollamaPullActive=false,ollamaLastPoll=0;
function ollamaFmtGB(bytes){return (bytes/1024/1024/1024).toFixed(1).replace('.',',')+' GB';}
async function ollamaAPI(path,body=null,launch=false){
 const cfg=body===null?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json',...(launch?{'X-ARK-Launch':'1'}:{})},body:JSON.stringify(body)};
 const res=await fetch('/api/ollama/'+path,cfg);
 let data;try{data=await res.json()}catch(_){throw Error('Server antwortet nicht mit JSON')}
 if(!res.ok||data.ok===false)throw Error(data.error||'HTTP '+res.status);
 return data;
}
function ollamaAddMessage(role,text){
 const log=ollamaEl('ollamaChatLog'),div=document.createElement('div');
 div.className='ark-ollama-msg '+role;div.textContent=text;log.append(div);log.scrollTop=log.scrollHeight;
 return div;
}
async function ollamaRefreshModels(){
 try{
  const data=await ollamaAPI('models');
  ollamaModels=data.models||[];
  const sel=ollamaEl('ollamaModelSelect'),before=sel.value;
  sel.replaceChildren();
  if(!ollamaModels.length)sel.add(new Option('Noch keine Modelle erkannt',''));
  for(const m of ollamaModels)sel.add(new Option(m.name+' · '+ollamaFmtGB(m.size_bytes),m.name));
  if([...sel.options].some(o=>o.value===before&&before!==''))sel.value=before;
 }catch(e){/* Statuszeile meldet den eigentlichen Fehler bereits */}
}
async function ollamaRefreshStatus(){
 try{
  const data=await ollamaAPI('status');
  const line=ollamaEl('ollamaStatusLine');
  if(data.reachable){
   line.textContent='Ollama läuft'+(ollamaModels.length?' · '+ollamaModels.length+' Modell(e) lokal installiert':'')+(data.ram_gb?' · dieses System hat ca. '+String(data.ram_gb).replace('.',',')+' GB RAM':'');
  }else{
   line.textContent='Ollama nicht erreichbar – wird automatisch gestartet …';
   await ollamaAPI('ensure',{},true).catch(()=>{});
  }
  return data;
 }catch(e){ollamaEl('ollamaStatusLine').textContent='Ollama nicht erreichbar: '+e.message;return null}
}
async function ollamaRefresh(){await ollamaRefreshModels();await ollamaRefreshStatus();}
async function ollamaPollPull(){
 try{
  const data=await ollamaAPI('pull/status');
  ollamaPullActive=!!data.active;
  const out=ollamaEl('ollamaPullState');
  if(data.active){
   const pct=data.total>0?Math.round(data.completed/data.total*100):0;
   out.textContent='Lade „'+data.name+'" … '+(data.status||'')+' · '+pct+'% ('+ollamaFmtGB(data.completed)+' / '+ollamaFmtGB(data.total)+')';
  }else if(data.error){
   out.textContent='Download fehlgeschlagen: '+data.error;
  }else if(data.done&&data.name&&data.status==='success'){
   out.textContent='„'+data.name+'" ist installiert.';
   await ollamaRefreshModels();
  }
 }catch(e){}
}
ollamaEl('ollamaReload').addEventListener('click',()=>ollamaRefresh());
ollamaEl('ollamaDelete').addEventListener('click',async()=>{
 const name=ollamaEl('ollamaModelSelect').value;
 if(!name){ollamaEl('ollamaPullState').textContent='Bitte zuerst ein Modell auswählen.';return}
 if(!confirm('Modell "'+name+'" wirklich lokal löschen? Die Modelldatei wird dauerhaft entfernt.'))return;
 try{await ollamaAPI('delete',{name},true);ollamaEl('ollamaPullState').textContent='„'+name+'" gelöscht.';await ollamaRefreshModels();}
 catch(e){ollamaEl('ollamaPullState').textContent='Löschen fehlgeschlagen: '+e.message}
});
function ollamaStartPull(){
 const name=ollamaEl('ollamaPullName').value.trim();
 if(!name){ollamaEl('ollamaPullState').textContent='Bitte zuerst einen Modellnamen eingeben.';return}
 ollamaAPI('pull',{name},true).then(()=>{ollamaEl('ollamaPullState').textContent='Download gestartet …';ollamaPollPull()})
  .catch(e=>{ollamaEl('ollamaPullState').textContent='Start fehlgeschlagen: '+e.message});
}
ollamaEl('ollamaPullBtn').addEventListener('click',ollamaStartPull);
ollamaEl('ollamaPullName').addEventListener('keydown',e=>{if(e.key==='Enter')ollamaStartPull()});
async function ollamaSendChat(){
 if(ollamaChatBusy)return;
 const input=ollamaEl('ollamaChatInput'),text=input.value.trim();
 if(!text)return;
 const model=ollamaEl('ollamaModelSelect').value;
 if(!model){ollamaAddMessage('error','Bitte zuerst ein Modell auswählen.');return}
 ollamaChatBusy=true;ollamaEl('ollamaChatSend').disabled=true;input.value='';
 ollamaAddMessage('user',text);ollamaChatHistory.push({role:'user',text});
 const pending=ollamaAddMessage('assistant','… wird generiert …');
 try{
  const data=await ollamaAPI('chat',{model,message:text},true);
  pending.textContent=data.reply||'(keine Antwort)';
  ollamaChatHistory.push({role:'assistant',text:data.reply||''});
 }catch(e){pending.className='ark-ollama-msg error';pending.textContent='Fehler: '+e.message}
 finally{ollamaChatBusy=false;ollamaEl('ollamaChatSend').disabled=false;ollamaEl('ollamaChatLog').scrollTop=ollamaEl('ollamaChatLog').scrollHeight}
}
ollamaEl('ollamaChatSend').addEventListener('click',ollamaSendChat);
ollamaEl('ollamaChatInput').addEventListener('keydown',e=>{if(e.key==='Enter')ollamaSendChat()});
ollamaEl('ollamaChatClear').addEventListener('click',()=>{ollamaChatHistory=[];ollamaEl('ollamaChatLog').replaceChildren();ollamaEl('ollamaPullState').textContent='Verlauf geleert.'});
setInterval(()=>{
 if(document.hidden||ollamaEl('ollamaPanel').offsetParent===null)return;
 if(ollamaPullActive){ollamaPollPull();return}
 if(Date.now()-ollamaLastPoll>=30000){ollamaLastPoll=Date.now();ollamaRefresh()}
},2000);
ollamaRefresh();

