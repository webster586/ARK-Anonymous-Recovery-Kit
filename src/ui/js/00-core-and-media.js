
'use strict';
// Offline control surface only: no filesystem access, external services or application launches.
const modules = {
 home:{code:'COMMAND',name:'ARK Control Deck',title:'Die mobile Wissenszentrale.',sub:'Vier Bibliothekslaufwerke, Werkzeuge und lokale KI – alles offline.',kicker:'// AUTONOMOUS RECOVERY KIT',hero:'KNOWLEDGE SURVIVES.',body:'Alle Ressourcen in Reichweite: Wissen, Ingenieurwesen, Reparatur, Medien und KI. Wikipedia und Bibel können bereits lokal gelesen werden; die übrigen ARK-Module bleiben Konzepte.',points:['Tastatur, Touch und Stream Deck','Klares Fokusfeld','Datenverknüpfung erst am Ende'],status:'OFFLINE UI // LOCAL ONLY',icon:'⌂'},
 origin:{code:'ARK-00',name:'Origin · Quellarchiv',title:'ARK 0 – Ursprung',sub:'Die vorhandene HDD bleibt Quelllaufwerk bis zur kontrollierten SSD-Migration.',kicker:'// ARCHIVE / LEGACY',hero:'DER URSPRUNG BLEIBT ERHALTEN.',body:'Vorhandenes Archiv: Wikipedia-ZIM, GitHub-Projekte, NRW-GML, Sechtem-3D, Medien, Krisendokumente und Werkzeuge. Kein Scan, keine Umstrukturierung.',points:['Quell-HDD erhalten','GML-Download nicht stören','Nach Migration als Backup denkbar'],status:'BESTAND BEKANNT / NICHT ANALYSIERT',icon:'◫'},
  foundation:{code:'ARK-01',name:'Raziel · Foundation',title:'ARK-01 – Raziel · Systemerkennung',sub:'Hardware, Datentraeger und ARK-Fundorte · lesend',kicker:'// SYSTEM & DATEN',hero:'ARK FINDET SEINE UMGEBUNG.',body:'Raziel erkennt lokale Hardware und bekannte Fundorte, ohne Konfigurationen zu veraendern.',points:['Hardwareinventar','Datentraeger-Scan','ARK-Fundorte erkennen'],status:'LAB-VORSCHAU · NUR LESEND',icon:'▤'},
 settings:{code:'SETTINGS',name:'Einstellungen',title:'Einstellungen',sub:'Mikrofonquelle und ARK-Optionen.',kicker:'// SYSTEM / OPTIONS',hero:'GERÄTE KONFIGURIEREN.',body:'Mikrofonquelle lokal auswählen und für spätere Aufnahmen speichern.',points:['Mikrofonquelle','Vollständig offline'],status:'LOCAL CONFIG',icon:'⚙'},
 bible:{code:'BIBEL',name:'Bibel',title:'Bibel – Offline-Bibliothek',sub:'Bestehende Bibel-Dateien und Unterordner lesen, ohne sie zu verändern.',kicker:'// ARK / BIBEL',hero:'DIE BIBLIOTHEK BLEIBT IM ORIGINAL.',body:'ARK liest den Ordner Bibel direkt neben der ARK-EXE. Dateinamen, Unterordner und Struktur werden nicht verändert; PDF, Text, Bilder und HTML sind direkt lesbar.',points:['Ordnerstruktur bleibt unverändert','Kein Kopieren oder Umbenennen','Weitere Formate als Datei verfügbar'],status:'LOKALER ORDNER / READ ONLY',icon:'✚'},
 knowledge:{code:'ARK-02',name:'Uriel · Knowledge & Maps',title:'ARK-02 – Uriel · Knowledge & Maps',sub:'Freie Wissensquellen, Karten, Reparatur-, Medizin- und Kochwissen.',kicker:'// OFFLINE KNOWLEDGE',hero:'WISSEN IST DIE WICHTIGSTE RESSOURCE.',body:'Wikipedia, Kiwix, OpenStreetMap, Wasser, Erste Hilfe, Kochen, Gartenbau, Handwerk und Lehrmaterial – vollständig lokal nutzbar nach späterer Integration.',points:['Kiwix und Wikibooks','Offline-Karten und GNSS','Fachliteratur und Videos'],status:'5 TB SSD / GEPLANT',icon:'▦'},
 atlas:{code:'ATLAS',name:'World Atlas',title:'World Atlas · Natural Earth',sub:'Weltweite Grundkarte aus der lokalen GeoPackage-Datei.',kicker:'// ARK-02 · WORLD ATLAS',hero:'DIE WELT ALS OFFLINE-KARTE.',body:'Länder, Küsten, Gewässer, Flüsse, Städte, Zoom und lokale Suche. Straßen und Höhenrelief folgen mit separaten Daten.',points:['Natural Earth GPKG','Keine Internet-Kacheln','Originaldaten nur lesen'],status:'OFFLINE-ATLAS',icon:'◎'},
 nrw3d:{code:'NRW-3D',name:'NRW 3D',title:'NRW 3D · Gelände und Gebäude',sub:'Lokale NRW-Höhendaten, LoD2 und OSM als offline 3D-Ansicht.',kicker:'// ARK-02 · GEODATEN',hero:'NRW OFFLINE IN 3D.',body:'3D-Referenzszene Sechtem und schreibgeschützter LoD2-GML-Kachelzugriff. Vollständige V1.3.4-Dioramafunktionen noch nicht übertragen.',points:['LoD2-Gebäude','DGM1/OSM-Testszene','Originaldaten bleiben unverändert'],status:'3D-TESTMODUL',icon:'◭'},
 culture:{code:'ARK-03',name:'Gabriel · Media & Games',title:'ARK-03 – Gabriel · Media & Games',sub:'Unterhaltung und kulturelles Archiv: Musik, Filme, Hörbücher, Retro-Gaming.',kicker:'// CULTURE ARCHIVE',hero:'KULTUR IST AUCH WISSEN.',body:'VLC, Kodi, RetroArch und PCSX2 sind als lokale Werkzeuge vorgesehen. Rechtmäßig nutzbare Medien und BIOS-Dateien werden später eingebunden.',points:['Filme und Musik','Emulatoren bis PS2','Offline ohne Streaming'],status:'5 TB SSD / GEPLANT',icon:'♫'},
 systems:{code:'ARK-04',name:'Michael · Systems & AI',title:'ARK-04 – Michael · Systems & AI',sub:'Bootsysteme, Offline-KI, Datenrettung, Compiler, CAD und Slicer.',kicker:'// SYSTEMS / RECOVERY',hero:'WERKZEUGE. WIEDERHERSTELLUNG. KI.',body:'Kali, Raspberry Pi OS, Treiber, Datenrettung, SolveSpace, OpenSCAD, PrusaSlicer und zwei kleine lokale Sprachmodelle.',points:['KI-Modelle noch nicht gestartet','Rettung und Diagnose','Entwicklung und Geräteansteuerung'],status:'KI-SSD / BESTAND UNGEPRÜFT',icon:'⚙'},
 mobile:{code:'ARK-05',name:'Noah · Mobile Survival Kit',title:'ARK-05 – Noah · Mobile Survival Kit',sub:'Rucksack, Boot-USB, Speicher, Transport und Zubehör.',kicker:'// PORTABLE SYSTEM',hero:'DEINE BIBLIOTHEK. ÜBERALL.',body:'Transportables Kernsystem ohne mitgeführten PC. Später kompakte SSDs statt HDDs. Der 3D-Drucker bleibt als getrenntes Fahrzeugmodul.',points:['Rucksackkonzept separat','Tastatur immer nutzbar','Drucker im Fahrzeug'],status:'TRANSPORTKONZEPT / GEPLANT',icon:'▣'},
 map:{code:'NAV',name:'Offline-Navigation',title:'Navigation & Geodaten',sub:'Offline-Karten, Routenplanung und Position mit einem GNSS-Empfänger.',kicker:'// MAPPING / ROUTING',hero:'WEGE FINDEN – OHNE NETZ.',body:'Lokale OSM-Straßen- und Wegenetzdaten, Routenplanung ohne Cloud und GPS-/Galileo-Empfang mit kompatibler Hardware.',points:['Routenofflineberechnung','GNSS-Hardware optional','NRW-Geodaten als Archiv'],status:'INHALT GEPLANT',icon:'⌖'},
 medicine:{code:'HEALTH',name:'Medizin & Erste Hilfe',title:'Medizin / Erste Hilfe',sub:'Notfallwissen mit geprüften Quellen und nachvollziehbarem Datenstand.',kicker:'// SAFETY / CARE',hero:'VERSTEHEN. NICHT SPEKULIEREN.',body:'Erste Hilfe, Hygiene, anatomische Darstellungen, Substanzwirkung, Nebenwirkungen und dokumentierte Wechselwirkungen mit Arzneimitteln.',points:['Fachinformationen und Quellen','Keine individuelle Therapie','Keine Annahmen als Gewissheit'],status:'INHALT GEPLANT',icon:'+'},
 workshop:{code:'BUILD',name:'Workshop & Konstruktion',title:'Workshop / Materialien',sub:'Aus vorhandenen Rohren, Holz und Werkzeugen sinnvolle Konstruktionen planen.',kicker:'// MAKER / PRACTICAL',hero:'AUS MATERIAL WIRD EINE LÖSUNG.',body:'Werkstoffe, Verbindungstechniken, Maschinenkunde, Zuschnittlisten, Konstruktionen und bebilderte Schritt-für-Schritt-Anleitungen.',points:['Varianten vergleichen','Materialbedarf ermitteln','Traglasten nur mit Prüfwerten'],status:'INHALT GEPLANT',icon:'⚒'},
 electronics:{code:'ELEC',name:'Elektronik & Löten',title:'Elektronik / Mikrocontroller',sub:'Löten, Arduino, ESP32, Raspberry Pi, Fehlersuche und Schaltpläne.',kicker:'// EMBEDDED / POWER',hero:'REPARIEREN STATT WEGWERFEN.',body:'Lötanleitungen, Multimeter, Bauteile, Pinbelegungen, lokale IDEs, Boardpakete und technische Handbücher.',points:['Arduino und ESP32','Raspberry Pi ARM-Images','Messung und Reparatur'],status:'INHALT GEPLANT',icon:'⌁'},
 print3d:{code:'3D',name:'3D-Druck & CAD',title:'3D Fabrication Lab',sub:'CAD, parametrische KI-Konstruktionen, Slicer und G-Code.',kicker:'// FABRICATION',hero:'IDEEN WERDEN ERSATZTEILE.',body:'SolveSpace und OpenSCAD zum Konstruieren; PrusaSlicer zum Exportieren von G-Code. Drucker und Filament werden im Fahrzeug verstaut.',points:['STL und 3MF','Druckerprofile offline','3D-Drucker im Fahrzeug'],status:'INHALT GEPLANT',icon:'⬡'},
 substances:{code:'CHEM',name:'Stoffatlas',title:'Substance Atlas',sub:'Inhaltsstoffe, Wirkung, Anwendungszweck, Neben- und Wechselwirkungen.',kicker:'// DATA / CHEMISTRY',hero:'STOFFE IDENTIFIZIEREN.',body:'Offline recherchierbare Fachinformationen für Medikamente, Pflanzenstoffe und Chemikalien, mit Quellenbezug und Stand der Daten.',points:['Originalquellen erforderlich','Fehlende Daten klar markieren','Keine persönliche Behandlungsentscheidung'],status:'INHALT GEPLANT',icon:'◈'},
 software:{code:'CODE',name:'Software & Device Lab',title:'Software / Device Lab',sub:'Gefundene Hardware identifizieren und mit lokal verfügbaren Werkzeugen nutzbar machen.',kicker:'// CODE / DRIVERS',hero:'DIE HARDWARE NUTZEN.',body:'Drucker, USB-Geräte, Standardtreiber, CUPS/IPP, Compiler und lokale Softwareentwicklung. Keine garantierte Unterstützung proprietärer Geräte.',points:['Vorhandene Treiber bevorzugen','Neue Software nur bei Bedarf','Kompatibilität durch Test prüfen'],status:'INHALT GEPLANT',icon:'⌘'},
 mesh:{code:'RADIO',name:'Funk & Mesh',title:'Funk / Mesh-Netzwerke',sub:'Offline-Kommunikation über Funkgeräte, LoRa und Meshtastic.',kicker:'// COMMS / RADIO',hero:'KOMMUNIKATION OHNE CLOUD.',body:'Funkgrundlagen, Antennen, Meshtastic, lokale Netzwerke und Konfigurationen für kompatible Hardware.',points:['Funkgeräte erforderlich','Regeln und Frequenzbereiche beachten','Nachrichten ohne Internet'],status:'INHALT GEPLANT',icon:'≋'},
 ai:{code:'LLM',name:'Lokale KI',title:'ARK Offline AI',sub:'Zwei kleine Sprachmodelle für Wissen, Planung und Code.',kicker:'// LOCAL INTELLIGENCE',hero:'DIE BIBLIOTHEK SOLL MITDENKEN.',body:'Kleine Offline-Modelle für Gespräch und Technik. Spätere Dokumentenanbindung erst nach Fertigstellung des inhaltlichen Bestands.',points:['Modellgrößen hardwareabhängig','Keine Cloud-API','Quellen später anbinden'],status:'INHALT GEPLANT',icon:'◇'},
 rescue:{code:'RESCUE',name:'Systemrettung',title:'Rescue / Diagnose',sub:'Boot-USB, Datenrettung, SMART, Partitionen und Linux-Images.',kicker:'// RECOVERY / BOOT',hero:'RETTEN. PRÜFEN. WIEDERHERSTELLEN.',body:'TestDisk, PhotoRec, ddrescue, GParted, Betriebssystem-Images und Diagnosewerkzeuge, nur mit bewusster Freigabe für Schreibaktionen.',points:['Keine ungefragten Schreibzugriffe','Eigene/erlaubte Systeme','Separater Boot-Stick'],status:'INHALT GEPLANT',icon:'⊕'},
 recipes:{code:'FOOD',name:'Kochen & Vorräte',title:'Ernährung / Kochen',sub:'Wikibooks-Kochbuch, Konservierung und Lebensmittelwissen.',kicker:'// FOOD / STORAGE',hero:'WISSEN, DAS SATT MACHT.',body:'Rezepte, Brot, Konservieren, Fermentieren, Lagerung und Kochen ohne Strom als eigenständiges ARK-Thema.',points:['Wikibooks-Kochbuch als ZIM','Lagerung und Vorräte','Kochen ohne Strom'],status:'INHALT GEPLANT',icon:'♨'},
 drones:{code:'UAV',name:'Drohnenbau',title:'Drohnenbau / Flugsteuerung',sub:'Baupläne, Elektronik, lokale Firmware und Handbücher.',kicker:'// AERIAL SYSTEMS',hero:'FLUGSYSTEME VERSTEHEN.',body:'QGroundControl, ArduPilot, Konstruktion, Sensorik, Wartung und rechtliche Rahmenbedingungen.',points:['Drohnenhardware erforderlich','Sicherheitsregeln','Offline-Flugplanung'],status:'INHALT GEPLANT',icon:'✣'}
};


// Curated, editable topic starters. Each button performs a LIVE query in the user's local ZIM.
// Terms are NOT cached answers and never pretend an article exists.
const wikiTopics = {"origin":["Langzeitarchivierung","Datensicherung","Versionsverwaltung","Geoinformationssystem","Digitalisierung","Wikipedia"],"foundation":["Dateisystem","Solid-State-Drive","Datensicherung","Git","Geodaten","Datenarchivierung"],"knowledge":["Enzyklopädie","Kartografie","Trinkwasser","Erste Hilfe","Bücher","Wetterkunde","OpenStreetMap","Wasseraufbereitung"],"culture":["Filmgeschichte","Musik","Computerspiel","Videospielkonsole","Emulator","Hörbuch","Kulturgeschichte"],"systems":["Betriebssystem","Linux","Künstliche Intelligenz","Compiler","Datenrettung","Computerhardware","Treiber"],"mobile":["Notfallvorsorge","Rucksack","Solarzelle","Akkumulator","Satellitennavigation","Erste Hilfe","Camping"],"map":["Global Positioning System","Galileo Satellitennavigation","Kartografie","Navigation","OpenStreetMap","Geodäsie","Topografische Karte"],"medicine":["Erste Hilfe","Herz-Lungen-Wiederbelebung","Verbrennung","Wundversorgung","Hygiene","Arzneimittelwechselwirkung","Anatomie"],"workshop":["Holzverbindung","Stahl","Schweißen","Werkbank","Schraubverbindung","Zugfestigkeit","Metallbearbeitung","Materialkunde"],"electronics":["Löten","Mikrocontroller","Elektronik","Arduino","Raspberry Pi","Multimeter","Elektrischer Strom","Leiterplatte"],"print3d":["3D-Druck","CAD","Fused Deposition Modeling","Stereolithografie","Kunststoff","Rapid Prototyping","G-Code"],"substances":["Toxikologie","Pharmakologie","Arzneimittel","Nebenwirkung","Gefahrstoff","Pflanzenheilkunde","Chemie"],"software":["Programmiersprache","Drucker","Universal Serial Bus","Gerätetreiber","Betriebssystem","Python","Softwareentwicklung"],"mesh":["Mesh-Netzwerk","LoRa","Amateurfunk","Funktechnik","Antenne","Kommunikationsprotokoll","Funknetz"],"ai":["Sprachmodell","Maschinelles Lernen","Künstliche Intelligenz","Spracherkennung","Informatik","Künstliches neuronales Netz"],"rescue":["Datenrettung","Partition Datenträger","Booten","Festplatte","S.M.A.R.T.","Datensicherung","Dateisystem"],"recipes":["Kochen","Brot","Lebensmittelkonservierung","Fermentation","Lebensmittel","Haltbarkeit","Backen","Vorratshaltung"],"drones":["Unbemanntes Luftfahrzeug","Flugsteuerung","Quadrocopter","Elektromotor","Sensor","Aerodynamik","Autopilot"]};

const arkTopicSupplement={
 origin:['Digitale Langzeitarchivierung','Open Source'],foundation:['Ordnerstruktur','Datenintegrität'],
 culture:['Film'],systems:['Raspberry Pi'],mobile:['Bushcraft'],map:['Entfernungsmessung'],
 medicine:['Gesundheitsschutz'],print3d:['CAD-Modell'],substances:['Wechselwirkung'],
 software:['C++'],mesh:['Frequenz'],ai:['Whisper','Computerlinguistik'],
 rescue:['GParted'],drones:['Akkumulator']
};
const arkTopicExtras={
 culture:['3D-Druck','Fotografie','Buch','Film','Musik','Software','Video','Videospiel'],
 atlas:['Weltatlas','Topografische Karte','OpenStreetMap','Kartografie','Kontinent','Gebirge','Stadt','Geografie'],
 nrw3d:['Nordrhein-Westfalen','3D-Stadtmodell','Geländemodell','Gebäude','DGM','Geodäsie','Diorama','Höhenprofil'],
 bible:['Bibel','Altes Testament','Neues Testament','Genesis','Psalmen','Evangelium','Apostelgeschichte','Bibelübersetzung'],
 settings:['Mikrofon','Spracherkennung','Audioaufnahme','Gerätetreiber','Benutzeroberfläche','Datenschutz','Bedienung','Softwarekonfiguration'],
 home:['Wissen','Karten','Erste Hilfe','Löten','Kochen','Navigation','Datenrettung','3D-Druck']
};
const arkLocalAliases={
 atlas:'maps map karte karten weltkarte weltatlas atlas globus global welt world street straßenkarte strassenkarte topografie topographisch topo geografie',
 nrw3d:'maps map karte karten stadtkarte nrw 3d dreidimensional gebäude gebaeude citygml gml lod2 dgm dgm1 köln koeln düsseldorf duesseldorf diorama gelände terrain stl',
 map:'navigation route routing routenplaner gps gnss karte karten maps map osm geodaten wege',
 knowledge:'wikipedia lexikon wissen wiki enzyklopädie information recherchieren',
 bible:'bibel bibeltext bibelverse testament genesis psalm jesus christentum',
 foundation:'foundation git github archiv ssd dateien backups projekt quellcode',
 origin:'ark0 archiv archivierung quelllaufwerk hdd datagrabber geodaten',
 culture:'filme videos musik mp3 retro emulator spiele ps1 ps2 media games 3dprint bilder bücher programme',
 systems:'systems system betriebsystem betriebssystem linux kali ki künstliche intelligenz ollama localtoolbox toolbox local toolbox nfc nfcmanager manager',
 mobile:'rucksack survival notfallvorsorge solar powerbank mobile survival kit',
 workshop:'schweißen schweissen metall holz eisen handwerk konstruktion bauen rohre',
 electronics:'löten loeten lötkolben elektronik arduino raspberry esp32 microcontroller',
 print3d:'3d drucker druck cad slicer stl 3mf openscad',
 medicine:'medizin gesundheit erste hilfe reanimation verbrennung wundversorgung',
 substances:'stoff stoffe inhaltsstoffe nikotin medikament chemie toxikologie nebenwirkung',
 software:'programm software code drucker windows treiber usb python',
 mesh:'funk lora mesh radio meshtastic netzwerk antenna antenne',
 ai:'ki ai ollama llm sprachmodell neuronales netz',
 rescue:'recovery backup datenrettung reparatur wiederherstellen boot rescue',
 recipes:'kochen rezepte lebensmittel brot essen vorrat',
 drones:'drohne drohnenbau quadrocopter flugsteuerung'
};
function folded(s){return String(s||'').toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();}
function arkLocalMatches(query){
 const q=folded(query);if(q.length<2)return [];
 const words=q.split(/\s+/).filter(Boolean);
 return Object.entries(arkLocalAliases).map(([id,aliases])=>{
  const m=modules[id],keys=folded([m.name,m.title,m.sub,aliases].join(' '));
  const a=folded(aliases).split(/\s+/);
  let score=0;
  if(folded(m.name)===q||folded(m.title)===q)score+=100;
  if(a.includes(q))score+=75;
  if(keys.includes(q))score+=35;
  for(const w of words){if(a.includes(w))score+=13;else if(keys.includes(w))score+=5;else if(w.length>3&&a.some(x=>x.startsWith(w)))score+=3;}
  if(id==='atlas' && /^(maps?|kart(e|en)|weltkarte|atlas|globus|topo)/.test(q))score+=60;
  return {id,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
}

// Fixed local tools only; no arbitrary file execution from the browser.
// Fixed, approved EXEs only. This panel never pretends to embed the EXE's internal functions.
// In-place refresh keeps hardware/link focus stable while checking running state.
async function appsRefresh(){
 const list=select('appsList');const message=select('appsState');
 if(!list.children.length)message.textContent='Programme werden geprüft ...';
 try{
  const r=await fetch('/api/apps/list',{cache:'no-store'});
  if(!r.ok)throw Error('Windows-Programmübersicht ist nicht erreichbar');
  const data=await r.json();
  for(const app of data.apps||[]){
   let card=list.querySelector('[data-app-id="'+app.id+'"]');
   if(!card){
    card=document.createElement('div');card.className='ark-app-item';card.dataset.appId=app.id;
    const name=document.createElement('strong');name.className='ark-app-name';
    const path=document.createElement('small');path.className='ark-app-path';
    const info=document.createElement('small');info.className='ark-app-info';
    const status=document.createElement('small');status.className='ark-app-live';status.setAttribute('aria-live','polite');
    const button=document.createElement('button');button.type='button';button.className='ark-app-launch';
    button.addEventListener('click',async()=>{
     button.disabled=true;message.textContent=(name.textContent||'Programm')+' – Aufruf läuft ...';
     try{
      const resp=await fetch('/api/apps/launch?id='+encodeURIComponent(app.id),{method:'POST',headers:{'X-ARK-Launch':'1'}});
      if(!resp.ok)throw Error((await resp.text()).trim());
      const result=await resp.json();
      message.textContent=result.already_running?(result.focused?'Bereits geöffnetes Fenster wurde aktiviert.':'Programm läuft bereits (PID '+result.pid+'). Fenster ggf. über die Windows-Taskleiste wählen.'):(result.name+' an Windows übergeben (PID '+result.pid+').');
     }catch(error){message.textContent='Programmstart: '+error.message;}
     finally{button.disabled=false;appsRefresh();}
    });
    card.append(name,path,info,status,button);list.append(card);
   }
   card.querySelector('.ark-app-name').textContent=app.name;
   card.querySelector('.ark-app-path').textContent=app.path;
   card.querySelector('.ark-app-info').textContent=app.exists?((app.size_bytes/1048576).toFixed(1)+' MiB · '+(app.pe_type||'Dateityp unbekannt')+' · '+(app.modified||'')):'Nicht am angegebenen Ort gefunden';
   card.querySelector('.ark-app-live').textContent=app.running?('● Läuft seit Start durch ARK · PID '+app.pid):app.exists?(app.valid_pe?'● Bereit':'● EXE-Header nicht lesbar'):'● Datei fehlt';
   const btn=card.querySelector('.ark-app-launch');btn.disabled=!app.exists||!app.valid_pe;btn.textContent=app.running?'FENSTER ANZEIGEN':app.exists?'PROGRAMM STARTEN':'DATEI FEHLT';
  }
  arkSetAppVisibility();
  message.dataset.lastCheck=new Date().toLocaleTimeString('de-DE');
  if(!message.textContent||/werden geprüft|nicht verfügbar|nicht erreichbar/.test(message.textContent))message.textContent=(data.apps||[]).filter(a=>a.exists&&a.valid_pe).length+' von '+(data.apps||[]).length+' Windows-Programmen startbereit.';
 }catch(e){message.textContent='Windows-Programme nicht verfügbar: '+e.message;}
}
setInterval(()=>{if(chosen==='systems'&&!document.hidden)appsRefresh();},4500);


let mediaReady=false,mediaRoot='',mediaCurrent='',mediaEntries=[],mediaSearchSeq=0,mediaFileResults=[];
const mediaFolderNames=['3DPrint','Bilder','Bücher','Filme','MP3','Programme','Videos','Spiele'];
async function mediaCheck(){
 try{const r=await fetch('/api/media/status',{cache:'no-store'});if(!r.ok)throw Error('Medienverzeichnis nicht zugänglich');const d=await r.json();
  mediaReady=!!d.ready;mediaRoot=d.root||'';select('mediaRoot').value=mediaRoot;
  select('mediaStatus').textContent=mediaReady?'LOKALE DATEIEN // '+mediaRoot:'MEDIENORDNER FEHLT // Pfad wählen';
  select('mediaSetup').hidden=mediaReady||!['files','videos','games','books'].includes(arkCurrentApp);
  const btns=select('mediaSections');btns.replaceChildren();
  for(const name of mediaFolderNames){const btn=document.createElement('button');btn.type='button';btn.textContent='▣ '+name;
   const exists=(d.sections||[]).some(x=>folded(x)===folded(name));btn.disabled=!exists;btn.title=exists?'Vorhandenen Ordner öffnen':'Ordner nicht vorhanden';
   btn.addEventListener('click',()=>mediaBrowse(name));btns.append(btn);
  }
  return mediaReady;
 }catch(e){select('mediaStatus').textContent='MEDIA OFFLINE // '+e.message;mediaReady=false;return false;}
}
async function mediaBrowse(path=''){
 mediaCurrent=path;mediaReaderCleanup();select('mediaPreview').hidden=true;select('mediaContent').replaceChildren();
 select('mediaPath').textContent='/Media'+(path?'/'+path:'');
 if(!mediaReady){const ready=await mediaCheck();if(!ready)return;}
 try{const r=await fetch('/api/media/list?path='+encodeURIComponent(path));if(!r.ok)throw Error(await r.text());const d=await r.json();
  mediaEntries=d.entries||[];const list=select('mediaList');list.replaceChildren();
  if(!mediaEntries.length){const t=document.createElement('span');t.textContent='Dieser Ordner ist leer.';list.append(t);return;}
  for(const ent of mediaEntries){const btn=document.createElement('button');btn.type='button';
   const strong=document.createElement('strong');strong.textContent=(ent.dir?'▣ ':'▤ ')+ent.name;
   const small=document.createElement('small');small.textContent=ent.dir?'UNTERORDNER':(ent.ext||'Datei').toUpperCase();btn.append(strong,small);
   btn.addEventListener('click',()=>ent.dir?mediaBrowse(ent.path):mediaOpen(ent));list.append(btn);
  }
 }catch(e){select('mediaStatus').textContent='MEDIENVERZEICHNIS: '+e.message;}
}
function mediaViewer(){choose('culture');arkOpenApp('files');}
// The media reader is an independent local book viewer. No EPUB is extracted
// to the user drive; the Go backend returns sanitized read-only chapters.
let mediaBook=null,mediaBookPath='',mediaBookIndex=0,mediaBookFont=19,mediaReaderEnabled=false,mediaBookLoadSerial=0;
function mediaReaderEnd(){
 const preview=select('mediaPreview');mediaReaderEnabled=false;preview.classList.remove('reading');
 if(document.fullscreenElement===preview)document.exitFullscreen().catch(()=>{});
}
function mediaReaderCleanup(){mediaBookLoadSerial++;mediaReaderEnd();mediaBook=null;mediaBookPath='';select('mediaBookChapter').replaceChildren();select('mediaReaderFullscreen').hidden=true;select('mediaReaderControls').hidden=true;select('mediaBookStatus').textContent='';}
function mediaReaderClose(){mediaReaderCleanup();select('mediaPreview').hidden=true;select('mediaContent').replaceChildren();}
async function mediaReaderFullscreen(){
 const preview=select('mediaPreview');if(!mediaReaderEnabled){
  mediaReaderEnabled=true;preview.classList.add('reading');select('mediaReaderFullscreen').textContent='⤢ LESEANSICHT BEENDEN';
  try{if(preview.requestFullscreen)await preview.requestFullscreen();}catch(_){/* immersive CSS reader remains available */}
 }else {mediaReaderEnd();select('mediaReaderFullscreen').textContent='⛶ VOLLBILD LESEN';}
}
function mediaBookChapter(n){
 if(!mediaBook||n<0||n>=mediaBook.chapters.length)return;
 mediaBookIndex=n;select('mediaBookChapter').value=String(n);
 select('mediaBookPrev').disabled=n===0;select('mediaBookNext').disabled=n===mediaBook.chapters.length-1;
 select('mediaBookStatus').textContent=(n+1)+' / '+mediaBook.chapters.length;
 const f=document.createElement('iframe');f.title=mediaBook.title+' – '+mediaBook.chapters[n].title;
 f.setAttribute('sandbox','allow-same-origin');f.referrerPolicy='no-referrer';
 f.src='/api/media/epub/chapter?path='+encodeURIComponent(mediaBookPath)+'&chapter='+n+'&size='+mediaBookFont;
 select('mediaContent').replaceChildren(f);
}
async function mediaOpen(ent){
 const path=ent.path,name=ent.name,ext=(ent.ext||'').toLowerCase(),uri='/api/media/file?path='+encodeURIComponent(path);
 if(chosen!=='culture')mediaViewer();
 if(!['files','videos','games','books'].includes(arkCurrentApp))arkOpenApp('files');
 mediaReaderCleanup();
 const loadSerial=mediaBookLoadSerial;
 const c=select('mediaContent');c.replaceChildren();select('mediaFilename').textContent=name;
 select('mediaDownload').href=uri;select('mediaDownload').download=name;select('mediaPreview').hidden=false;
 const readable=['.pdf','.epub','.txt','.md','.csv'].includes(ext);
 select('mediaReaderFullscreen').hidden=!readable;
 select('mediaReaderFullscreen').textContent='⛶ VOLLBILD LESEN';
 if(ext==='.epub'){
  const status=document.createElement('p');status.textContent='EPUB wird gelesen …';c.append(status);
  try{
   const response=await fetch('/api/media/epub/info?path='+encodeURIComponent(path),{cache:'no-store'});
   if(!response.ok)throw Error((await response.text()).trim());
   const book=await response.json();if(loadSerial!==mediaBookLoadSerial)return;mediaBook=book;mediaBookPath=path;mediaBookIndex=0;
   if(!Array.isArray(mediaBook.chapters)||!mediaBook.chapters.length)throw Error('EPUB enthält keine lesbaren Kapitel');
   select('mediaFilename').textContent=mediaBook.title+(mediaBook.author?' · '+mediaBook.author:'');
   select('mediaReaderControls').hidden=false;
   const sel=select('mediaBookChapter');sel.replaceChildren();mediaBook.chapters.forEach((ch,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=(i+1)+'. '+ch.title;sel.append(option);});
   mediaBookChapter(0);
  }catch(e){if(loadSerial!==mediaBookLoadSerial)return;mediaBook=null;c.textContent='EPUB kann nicht gelesen werden: '+e.message;select('mediaReaderFullscreen').hidden=true;}
 }else if(['.txt','.md','.csv'].includes(ext)){
  try{if(ent.size>8*1024*1024)throw Error('Textdatei über 8 MB – bitte extern öffnen.');const r=await fetch(uri);if(!r.ok)throw Error(await r.text());const pre=document.createElement('pre');pre.textContent=await r.text();c.append(pre);}catch(e){c.textContent=e.message;}
 }else if(ext==='.pdf'){
  const frame=document.createElement('iframe');frame.title=name;frame.src=uri;c.append(frame);
 }else if(['.jpg','.jpeg','.png','.webp','.gif'].includes(ext)){
  const img=document.createElement('img');img.src=uri;img.alt=name;c.append(img);
 }else if(musicPlayable.has(ext)){
  select('mediaPreview').hidden=true;arkOpenApp('music');
  await musicSelect({name,path,folder:path.split('/').slice(0,-1).join('/'),ext},true);
  select('arkMusic').scrollIntoView({block:'nearest'});return;
 }else if(['.mp4','.webm'].includes(ext)){
  const video=document.createElement('video');video.controls=true;video.preload='none';video.src=uri;c.append(video);
 }else{const p=document.createElement('p');p.textContent='Keine integrierte Vorschau. Die Datei kann über ORIGINAL ÖFFNEN / SPEICHERN zur passenden Offline-Anwendung übergeben werden.';c.append(p);}
 if(!select('mediaPreview').hidden)select('mediaPreview').scrollIntoView({block:'nearest'});
}
async function mediaSearchLocal(query){
 const seq=++mediaSearchSeq;
 const q=query.trim();if(q.length<2){mediaFileResults=[];return;}
 try{const r=await fetch('/api/media/search?q='+encodeURIComponent(q),{cache:'no-store'});if(!r.ok)throw Error(await r.text());const d=await r.json();
  if(seq!==mediaSearchSeq||select('search').value.trim()!==q)return;mediaFileResults=d.entries||[];arkRenderLocalResults(q);
 }catch(e){if(seq!==mediaSearchSeq)return;mediaFileResults=[];arkRenderLocalResults(q);}
}
function arkRenderLocalResults(query){
 const results=arkLocalMatches(query),files=(mediaFileResults||[]),panel=select('arkLocalResults'),grid=select('arkLocalItems');
 panel.hidden=!query.trim()||(!results.length&&!files.length);
 grid.replaceChildren();if(panel.hidden)return;
 select('arkLocalCount').textContent=results.length+' ARK-Funktionen · '+files.length+' lokale Datei-/Ordnernamen';
 for(const r of results){
  const m=modules[r.id],btn=document.createElement('button');btn.type='button';btn.className='ark-result';btn.dataset.localModule=r.id;
  const icon=document.createElement('span');icon.className='ark-result-icon';icon.textContent=m.icon;
  const label=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small');
  title.textContent=m.name;
  detail.textContent=r.id==='atlas'?'Lokalen Weltatlas öffnen':r.id==='nrw3d'?'NRW-3D-Ansicht öffnen':r.id==='bible'?'Lokale Bibel-Dateien öffnen':r.id==='knowledge'?'Offline-Wikipedia öffnen':r.id==='culture'?'Media-Archiv öffnen':'ARK-Modul öffnen · '+m.status;
  label.append(title,detail);btn.append(icon,label);btn.addEventListener('click',()=>choose(r.id));grid.append(btn);
 }
 for(const file of files){const b=document.createElement('button');b.type='button';b.className='ark-result ark-local-file';
  const glyph=document.createElement('span');glyph.className='ark-result-icon';glyph.textContent=file.dir?'▣':'▤';
  const label=document.createElement('span'),t=document.createElement('strong'),detail=document.createElement('small');
  t.textContent=file.name;detail.textContent='MEDIA / '+file.path;label.append(t,detail);b.append(glyph,label);
  b.addEventListener('click',async()=>{choose('culture');arkOpenApp('files');await mediaCheck();
   if(file.dir)await mediaBrowse(file.path);else {const parts=file.path.split('/');parts.pop();await mediaBrowse(parts.join('/'));await mediaOpen(file);}
  });grid.append(b);
 }
}
function arkRenderTopics(id){
 const panel=select('arkQuickTopics'),grid=select('arkTopicRows');
 const terms=[...(arkTopicExtras[id]||wikiTopics[id]||[]),...(arkTopicSupplement[id]||[])];
 grid.replaceChildren();panel.hidden=!id||id==='home'||!terms.length;
 if(panel.hidden)return;
 // Always exactly two rows of four chips on the 13-inch primary layout.
 const list=terms.slice(0,8);
 while(list.length<8)list.push('Wikipedia');
 for(const term of list){const b=document.createElement('button');b.type='button';b.className='ark-topic';b.textContent=term;
  b.title='In lokaler Wikipedia suchen: '+term;
  b.addEventListener('click',()=>{select('search').value=term;arkUnifiedSearch(term);});grid.append(b);
 }
}
function arkUnifiedSearch(term){
 const q=String(term||'').trim();mediaSearchSeq++;mediaFileResults=[];arkRenderLocalResults(q);
 if(q.length>=2)mediaSearchLocal(q);
 if(!q)return;
 // Keep the current ARK module open, while presenting local matches AND the actual Kiwix results.
 if(chosen==='home')choose('knowledge');
 wikiSearch(q,true);
 document.body.classList.add('ark-wiki-search-mode');arkSetAppVisibility();
 select('atlasPanel').hidden=true;select('nrw3dPanel').hidden=true;
 if(chosen==='bible')select('biblePanel').hidden=true;
 if(chosen==='settings')select('settingsPanel').hidden=true;
 if(chosen==='culture')select('mediaPanel').hidden=true;
 focusElement(select('search'));
}
function topicsShow(id){
 const panel=select('topicsPanel');
 const terms=wikiTopics[id]||[];
 panel.hidden=terms.length===0;
 if(panel.hidden)return;
 select('topicsTitle').textContent=(modules[id]?.code||'ARK')+' // WIKIPEDIA · STICHWORTE';
 const grid=select('topicsGrid');grid.replaceChildren();
 for(const term of terms){
  const button=document.createElement('button');button.className='topic-button';
  button.type='button';button.textContent=term;
  button.dataset.topic=term;
  button.addEventListener('click',()=>{
   grid.querySelectorAll('.topic-button').forEach(b=>b.classList.remove('selected'));
   button.classList.add('selected');
   select('search').value=term;
   wikiSearch(term,true);
  });
  grid.append(button);
 }
}

const moduleList=['knowledge','atlas','nrw3d','map','workshop','medicine','electronics','print3d','software','mesh','substances','ai','culture','rescue','recipes','drones','foundation','mobile'];
const streamDeckLayout=['ark1','ark2','up','ark3','ark4','linkprev','left','ok','right','linknext','back','voice','down','keyboard','forward'];
const deckLabels={keyboard:'TEXT',ark1:'I',ark2:'II',ark3:'III',ark4:'IV',up:'HOCH',down:'RUNTER',left:'LINKS',right:'RECHTS',ok:'OK',back:'ZURÜCK',forward:'VOR',voice:'PTT',linkprev:'VOR LINK',linknext:'NÄCH LINK',empty:''};
const select=id=>document.getElementById(id);
// App launchers separate the icon page from real, already implemented modules.
// No external apps are added: only Local Toolbox and NFC Manager remain approved EXEs.
const arkAppCatalog={
 knowledge:[
  {id:'wiki',label:'Wikipedia',note:'Offline-Lexikon',icon:'book',shade:'#39715c'},
  {id:'atlas',label:'Weltatlas',note:'Offline-Karten',icon:'globe',shade:'#267d83'},
  {id:'nrw3d',label:'NRW 3D',note:'3D-Karten',icon:'mountain',shade:'#596c98'},
  {id:'bible',label:'Bibel',note:'Bibel-Lesemodus',icon:'bookOpen',shade:'#826a41'}],
 culture:[
  {id:'music',label:'Musikplayer',note:'24 Visualizer',icon:'music',shade:'#256f63'},
  {id:'videos',label:'Videoplayer',note:'Media / Videos',icon:'film',shade:'#37568c'},
  {id:'books',label:'Bücher',note:'EPUB · PDF · Text',icon:'bookOpen',shade:'#716a49'},
  {id:'downloader',label:'Media Downloader',note:'Video & MP3',icon:'download',shade:'#6c6541'},
  {id:'files',label:'Dateibrowser',note:'Media-Ordner',icon:'folder',shade:'#387d6b'},
  {id:'games',label:'Spielearchiv',note:'Gesicherte ROMs',icon:'gamepad',shade:'#604c8c'}],
 systems:[
  {id:'argos',label:'Übersetzer',note:'Argos Translate',icon:'languages',shade:'#32765e'},
  {id:'calc',label:'Taschenrechner',note:'Wissenschaftlich',icon:'calculator',shade:'#325d85'},
  {id:'timer',label:'Timer & Stoppuhr',note:'Zeitmessung',icon:'clock',shade:'#7c5e37'},
  {id:'password',label:'Passwörter',note:'Generator',icon:'lock',shade:'#7b4c69'},
  {id:'hash',label:'Prüfsummen',note:'SHA-256',icon:'hash',shade:'#3d6871'},
  {id:'zip',label:'ZIP-Manager',note:'Packen & Entpacken',icon:'archive',shade:'#6d7140'},
  {id:'toolbox',label:'Local Toolbox',note:'Windows-EXE',icon:'tool',shade:'#58755e'},
  {id:'nfc',label:'NFC Manager',note:'Windows-EXE',icon:'radio',shade:'#336e80'},
  {id:'retroarch',label:'RetroArch',note:'Emulator bis PS2',icon:'gamepad',shade:'#604c8c'},
  {id:'ollama',label:'Ollama · Lokale KI',note:'Chat & Modelle',icon:'chip',shade:'#3d6871'}]
};
const arkVectorIcons={
 book:'<path d="M4 5.5c0-1 1-2 2-2h14v17H6c-1.2 0-2-1-2-2z"/><path d="M4 17.5c0-1.5 1-2.5 2.5-2.5H20"/><path d="M8 7h8M8 11h6"/>',
 bookOpen:'<path d="M12 6c-2-2-5-2-9-2v15c4 0 7 0 9 2 2-2 5-2 9-2V4c-4 0-7 0-9 2z"/><path d="M12 6v15"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18M12 3c-5 5-5 13 0 18"/>',
 mountain:'<path d="m2 19 6-11 4 7 3-5 7 9z"/><path d="m6 12 2 2 2-2"/>',
 music:'<path d="M9 18V5l12-2v13"/><ellipse cx="6" cy="18.5" rx="3" ry="2"/><ellipse cx="18" cy="16.5" rx="3" ry="2"/>',
 film:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 8h4M3 16h4M17 8h4M17 16h4"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 17v3h16v-3"/>',
 folder:'<path d="M3 7V5h7l2 3h9v11H3z"/>',
 gamepad:'<path d="M7 8h10c3 0 5 2 5 5 0 5-2 7-5 4l-2-2H9l-2 2c-3 3-5 1-5-4 0-3 2-5 5-5z"/><path d="M7 10v5M4.5 12.5h5"/><circle cx="16" cy="11" r=".5"/><circle cx="19" cy="13" r=".5"/>',
 languages:'<path d="M3 5h12M9 3v3M5 8c2 5 4 7 9 10M13 8c-2 5-5 8-9 10"/><path d="m15 20 4-10 4 10m-7-3h6"/>',
 calculator:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/>',
 hash:'<path d="M8 3 5 21M17 3l-3 18M3 9h18M2 16h18"/>',
 archive:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M3 3h18v4H3zM9 12h6"/>',
 tool:'<path d="M14 5a6 6 0 0 0-7 8L3 17l4 4 4-4a6 6 0 0 0 8-7l-4 4-4-4z"/>',
 radio:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M12 10V4M9 6a4 4 0 0 1 6 0M5 3a10 10 0 0 1 14 0"/><circle cx="12" cy="16" r="2"/>',
 chip:'<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>'
};
let arkCurrentApp='',arkAppFromKnowledge=false;
const arkToolCards=[['arkArgosPanel','argos'],['utCalcRun','calc'],['utTimerStart','timer'],['utPasswordNew','password'],['utHashRun','hash'],['ollamaReload','ollama']];
function arkAppTileFocus(){return [...select('arkAppGrid').querySelectorAll('button.ark-icon-tile')];}
function arkFillAppLauncher(id){
 const grid=select('arkAppGrid');grid.replaceChildren();select('arkAppHeading').textContent=(modules[id]?.code||'ARK')+' // APPS';
 for(const app of arkAppCatalog[id]||[]){const b=document.createElement('button');b.type='button';b.className='ark-icon-tile';b.dataset.arkOpen=app.id;
  const mark=document.createElement('span');mark.className='ark-icon-graphic';mark.style.setProperty('--app-shade',app.shade);
  mark.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+arkVectorIcons[app.icon]+'</svg>';
  const name=document.createElement('span');name.className='ark-icon-label';name.textContent=app.label;
  const sub=document.createElement('small');sub.textContent=app.note;
  b.append(mark,name,sub);b.title='Öffnen: '+app.label;b.addEventListener('click',()=>arkOpenApp(app.id));grid.append(b);
 }
}
function arkSetAppVisibility(){
 const wikiSearch=document.body.classList.contains('ark-wiki-search-mode');
 const landing=!!arkAppCatalog[chosen]&&!arkCurrentApp&&!wikiSearch;
 const split=(chosen==='systems'||chosen==='culture')&&!!arkCurrentApp&&!wikiSearch;
 select('arkAppLauncher').hidden=!(landing||split);
 document.querySelector('.main').classList.toggle('ark-split',split);
 document.body.dataset.arkApp=arkCurrentApp||'';
 const mediaActive=chosen==='culture'&&!!arkCurrentApp&&!document.body.classList.contains('ark-wiki-search-mode');
 select('mediaPanel').hidden=!mediaActive;
 if(chosen==='culture'){
  const files=['files','videos','games','books'].includes(arkCurrentApp);
  for(const id of ['mediaStatus','mediaHome','mediaUp']){} // existing toolbar managed below
  select('mediaPanel').querySelector('.ark-media-toolbar').hidden=!files;
  select('mediaSetup').hidden=!files||mediaReady;
  select('arkDownloader').hidden=arkCurrentApp!=='downloader';
  select('arkMusic').hidden=arkCurrentApp!=='music';
  for(const id of ['mediaSections','mediaPath','mediaList'])select(id).hidden=!files;
  select('mediaPreview').hidden=!files||select('mediaContent').childElementCount===0;
 }
 const sysActive=chosen==='systems'&&!!arkCurrentApp&&!document.body.classList.contains('ark-wiki-search-mode');
 select('appsPanel').hidden=!sysActive;
 if(chosen==='systems'){
  const exe=['toolbox','nfc','retroarch'].includes(arkCurrentApp);
  select('appsList').hidden=!exe;select('appsState').hidden=!exe;
  select('retroarchGuide').hidden=arkCurrentApp!=='retroarch';
  select('arkToolCurrent').hidden=!sysActive;select('arkToolCurrent').textContent='ARK-04 / '+(arkAppCatalog.systems.find(a=>a.id===arkCurrentApp)?.label||'');
  for(const [childId,id] of arkToolCards){const el=id==='argos'?select(childId):select(childId).closest('section.ark-util-card');el.hidden=arkCurrentApp!==id;}
  for(const card of select('appsList').querySelectorAll('.ark-app-item'))card.hidden=!(arkCurrentApp==='toolbox'&&card.dataset.appId==='localtoolbox'||arkCurrentApp==='nfc'&&card.dataset.appId==='nfcmanager'||arkCurrentApp==='retroarch'&&card.dataset.appId==='retroarch');
 }
 if(chosen==='knowledge'&&!document.body.classList.contains('ark-wiki-search-mode')){
  if(arkCurrentApp==='wiki'){if(!wikiVisible)wikiShow();}
  else if(wikiVisible)wikiHide();
 }
}
function arkOpenApp(id){
 if(mediaReaderEnabled)mediaReaderEnd();
 if(!(arkAppCatalog[chosen]||[]).some(a=>a.id===id))return;
 if(chosen==='knowledge'&&['atlas','nrw3d','bible'].includes(id)){
  arkAppFromKnowledge=true;choose(id);return;
 }
 if(chosen==='systems'&&id==='zip'){arkZipFloatOpen();return;}
 arkCurrentApp=id;arkSetAppVisibility();
 if(chosen==='culture'){
  if(id==='books')mediaBrowse('Bücher');
  else if(id==='videos')mediaBrowse('Videos');
  else if(id==='games')mediaBrowse('Spiele');
  else if(id==='files')mediaBrowse('');
  else if(id==='downloader'){select('arkDownloader').open=true;dlRefresh();}
  else if(id==='music'){musicSyncVisualizer();}
 }else if(chosen==='systems'&&['nfc','toolbox','retroarch'].includes(id))appsRefresh();
 const inputForApp={argos:'argosInput',calc:'utCalcExpr',hash:'utHashFile',zip:'utZipSource',downloader:'dlUrl',music:'musicFilter'}[id];
 const focus=inputForApp?select(inputForApp):(chosen==='knowledge'?select('wikiFrame'):(chosen==='systems'?select('appsPanel'):select('mediaPanel')));
 if(focus){focus.tabIndex=0;focus.focus({preventScroll:true});}
 document.querySelector('.main')?.scrollTo({top:0});
}
function arkCloseApp(){if(!arkCurrentApp)return false;
 if(keyboardMode)setKeyboardActive(false,true);
 const previous=arkCurrentApp;arkCurrentApp='';
 if(chosen==='knowledge'&&previous==='wiki')wikiHide();
 arkSetAppVisibility();document.querySelector('.main')?.scrollTo({top:0});
 const b=select('arkAppGrid').querySelector('[data-ark-open="'+previous+'"]');(b||select('arkAppLauncher')).focus({preventScroll:true});
 if(previous==='music')musicSyncVisualizer();
 return true;
}
function arkStepApp(delta){const tiles=arkAppTileFocus();if(select('arkAppLauncher').hidden||!tiles.length)return false;
 let i=tiles.indexOf(document.activeElement);i=i<0?(delta>0?0:tiles.length-1):(i+delta+tiles.length)%tiles.length;
 tiles[i].focus({preventScroll:true});tiles[i].scrollIntoView({block:'nearest'});return true;
}

