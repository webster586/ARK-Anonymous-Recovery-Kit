#!/usr/bin/env python3
"""ARK Origin V0.4.1 LAB-only discovery, guarded preparation and detached start supervision.
Do not overwrite production, fallback, source ZIPs or ARK executables.
"""
import argparse, ctypes, hashlib, json, os, re, shutil, socket, subprocess, sys, time, zipfile
from pathlib import Path
from datetime import datetime, timezone
import origin_safe_switch as safe
import origin_switch_engine as sw

EXE='ARK_Controller_Windows_x64.exe'
MAX_CANDIDATES=1500

def output(obj): print(json.dumps(obj,ensure_ascii=False))
def stamp(): return datetime.now(timezone.utc).isoformat()
def digest_id(kind, p):return hashlib.sha256((kind+'|'+str(p).casefold()).encode('utf-8')).hexdigest()[:20]
def islink(p):return p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction())
def drive_roots(lab):
    roots=[]
    if os.name=='nt':
        mask=ctypes.windll.kernel32.GetLogicalDrives()
        for i in range(26):
            if mask & (1<<i):
                drive=Path(chr(65+i)+':/')
                # DRIVE_FIXED=3, REMOVABLE=2; no network shares, optical drive or disconnected drives
                typ=ctypes.windll.kernel32.GetDriveTypeW(str(drive))
                if typ in (2,3):roots.append(drive)
    else: roots.append(lab.anchor and Path(lab.anchor) or lab)
    return roots[:26]

def zip_origin(path):
    try:
        with zipfile.ZipFile(path) as z:
            names=z.namelist()
            if len(names)>100000:return False
            base={n.replace('\\','/').lower().split('/')[-1] for n in names if not n.endswith('/')}
            return (EXE.lower() in base and ('origin.go' in base or 'origin_safe_ui.go' in base or 'origin_switch_ui.go' in base))
    except (OSError,zipfile.BadZipFile,RuntimeError):return False

def installed_origin(path):
    return (path.is_dir() and not islink(path) and (path/EXE).is_file() and (path/'src'/'origin.go').is_file())

def discover(lab, running):
    entries=[];seen=set();count=0
    def add(kind,path,label):
        nonlocal count
        if count>=MAX_CANDIDATES or str(path).casefold() in seen:return
        seen.add(str(path).casefold());count+=1
        entries.append({'id':digest_id(kind,path),'kind':kind,'path':str(path),'label':label,'current':path==running,'selectable':path!=running})
    # Only known ARK directory patterns; do not recursively walk entire disks.
    for disk in drive_roots(lab):
        archive=disk/'ARKVersionen'
        for folder in (archive,archive/'Legacy',archive/'Origin'/'Builds',disk/'Media'/'ARKVersionen',disk/'Media'/'ARKVersionen'/'Origin'/'Builds'):
            if count>=MAX_CANDIDATES:break
            if not folder.is_dir() or islink(folder):continue
            try: files=list(folder.iterdir())[:3000]
            except OSError:continue
            for path in files:
                if count>=MAX_CANDIDATES:break
                if path.suffix.lower()=='.zip' and path.is_file() and not islink(path) and zip_origin(path):
                    add('zip',path,path.stem+' · ZIP')
        for base in (disk/'LAB',):
            if not base.is_dir() or islink(base):continue
            try:folders=list(base.iterdir())[:300]
            except OSError:continue
            for folder in folders:
                if folder.name.lower().startswith('ark_') and installed_origin(folder):add('installed',folder,folder.name+' · installiert')
    if installed_origin(running):add('installed',running,running.name+' · aktuell')
    return entries

def fallback_check(lab):
    lab,root=safe.paths(lab); state=safe.load_state(root)
    exe=safe.fallback_info(lab,state,full=True)
    return lab,root,state,exe

def stage(lab,running,chosen):
    entries=discover(lab,running)
    item=next((e for e in entries if e['id']==chosen),None)
    if item is None or not item['selectable']:raise ValueError('Auswahl nicht gefunden, veraltet oder aktuell laufend')
    lab,root,state,fb=fallback_check(lab)
    source=Path(item['path'])
    if islink(source):raise ValueError('Verlinkte Quelle blockiert')
    if item['kind']=='zip':
        # Complete ZIP extraction using existing V0.3 engine, with ZIP path and size validation.
        if not zip_origin(source):raise ValueError('Kein startfaehiges ARK-Origin-Archiv')
        if source.parent.name=='Builds':root_archive=source.parent.parent.parent
        elif source.parent.name=='Legacy':root_archive=source.parent.parent
        else:root_archive=source.parent
        result=sw.deploy(lab,root_archive,source)
        vid=result['id'];exe,manifest=safe.version_info(root,vid,full=True)
    else:
        if not installed_origin(source) or source.parent!=lab:raise ValueError('Installierte Version liegt nicht direkt im LAB')
        vid,_=safe.register_existing(lab,root,source,state.get('fallback'))
        exe,manifest=safe.registered_info(lab,root,vid,full=True)
    if fb.parent==exe.parent:raise ValueError('Rueckfallversion kann nicht gewechselt werden')
    if not safe.port_available(8765):
        # Expected: the ARK instance doing the request is running. Worker waits until it exits.
        pass
    auto=root/'AutoSwitch';auto.mkdir(exist_ok=True)
    # A pre-existing unprocessed switch must not be silently overwritten.
    pending=auto/'pending.json'
    if pending.exists():raise ValueError('Bereits ein Versionswechsel vorbereitet. Zuerst Status klaeren.')
    token=os.urandom(16).hex()
    record={'token':token,'target_id':vid,'target_name':item['label'],'source':item['path'],
            'fallback':str(fb),'prepared_utc':stamp(),'status':'PREPARED','running_root':str(running)}
    safe.atomic_json(pending,record)
    safe.log(root,'auto-switch-prepare','OK',id=vid,source=str(source))
    return {'status':'PREPARED','name':item['label'],'id':vid,'files':len(manifest['files_sha256']),
            'message':'Alle Ziel-Dateien und die Rueckfallversion verifiziert. Nach Beenden von ARK startet der externe Wechselprozess.'}

def port_ready(port=8765):
    with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as s:
        s.settimeout(0.4)
        return s.connect_ex(('127.0.0.1',port))==0

def worker(lab):
    lab,root=safe.paths(lab);auto=root/'AutoSwitch';pending=auto/'pending.json';statusfile=auto/'last_result.json'
    if not pending.is_file():return
    record=safe.json_read(pending)
    def status(s,**extra):
        safe.atomic_json(statusfile,{'status':s,'utc':stamp(),'target_id':record['target_id'],**extra})
        safe.log(root,'auto-switch',s,id=record['target_id'],**extra)
    proc=None
    try:
        status('WAITING_FOR_ARK_EXIT')
        deadline=time.monotonic()+600
        while port_ready():
            if time.monotonic()>deadline:raise RuntimeError('ARK wurde innerhalb von 10 Minuten nicht geschlossen')
            time.sleep(1)
        # Wait for port to stay down before any new launch.
        time.sleep(2)
        if port_ready():raise RuntimeError('Port wieder belegt')
        fallback_check(lab)
        exe,manifest=safe.selected_info(lab,root,record['target_id'],full=True)
        if str(exe.parent).casefold()==str(Path(record['fallback']).parent).casefold():raise RuntimeError('Rueckfallversion als Ziel')
        status('STARTING',exe=str(exe))
        proc=subprocess.Popen([str(exe)],cwd=str(exe.parent),close_fds=True)
        # Process must stay alive and the ARK port must become reachable.
        deadline=time.monotonic()+90
        consecutive=0
        while time.monotonic()<deadline:
            if proc.poll() is not None:raise RuntimeError('ARK-Zielprozess vorzeitig beendet, Code '+str(proc.returncode))
            if port_ready():
                consecutive+=1
                if consecutive>=15:break
            else:consecutive=0
            time.sleep(1)
        else:raise RuntimeError('Zielversion erreicht keine stabile lokale Portbereitschaft')
        status('START_READY_NOT_FUNCTION_TESTED',pid=proc.pid,info='Port 8765 bereit; Modulfunktionen nicht getestet')
    except Exception as exc:
        status('FAILED',error=str(exc))
        if proc and proc.poll() is None:
            proc.terminate()
            try:proc.wait(timeout=15)
            except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=10)
        try:
            _,_,st,fb=fallback_check(lab)
            if port_ready():raise RuntimeError('Port 8765 noch belegt; kein paralleler Rueckfallstart')
            subprocess.Popen([str(fb)],cwd=str(fb.parent),close_fds=True)
            status('FALLBACK_START_REQUESTED',fallback=str(fb),cause=str(exc))
        except Exception as fb_exc:status('FALLBACK_FAILED',error=str(fb_exc),cause=str(exc))
    finally:
        # do not delete pending before result is durably written
        try: pending.unlink()
        except OSError:pass

def main():
    p=argparse.ArgumentParser()
    p.add_argument('command',choices=['list','prepare','worker','last'])
    p.add_argument('--lab',required=True);p.add_argument('--running-root');p.add_argument('--id')
    a=p.parse_args();lab=Path(a.lab).resolve()
    if a.command=='worker':worker(lab);return
    if a.command=='last':
        path=lab/'OriginSwitch'/'AutoSwitch'/'last_result.json'
        output(safe.json_read(path) if path.exists() else {'status':'NONE'});return
    running=Path(a.running_root).resolve(strict=True)
    if a.command=='list':
        items=discover(lab,running)
        state=safe.load_state(lab/'OriginSwitch')
        output({'status':'OK','running':running.name,'entries':items,'fallback':(state.get('fallback') or {}).get('directory'),
                'fallback_files':len((state.get('fallback') or {}).get('files_sha256',{}))})
    else:
        if not a.id or not re.fullmatch(r'[0-9a-f]{20}',a.id):raise ValueError('Ungueltige Versionsauswahl')
        output(stage(lab,running,a.id))

if __name__=='__main__':
    try:main()
    except Exception as exc:
        output({'status':'ERROR','error':str(exc)});sys.exit(1)
