#!/usr/bin/env python3
"""ARK Origin V0.3 LAB-only, immutable deployments and selected-version pointer.
No existing deployment or source archive is modified. No automatic EXE launch.
"""
import argparse, hashlib, json, os, re, shutil, sys, tempfile, zipfile
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone

EXE='ARK_Controller_Windows_x64.exe'
MAX_TOTAL=8*1024**3
MAX_MEMBER=3*1024**3
MAX_FILES=100000
BANNED={'CON','PRN','AUX','NUL',*(f'COM{i}' for i in range(1,10)),*(f'LPT{i}' for i in range(1,10))}

def stamp(): return datetime.now(timezone.utc).isoformat()
def digest(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def out(x):print(json.dumps(x,indent=2,ensure_ascii=True))
def atomic_json(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=path.parent,delete=False,suffix='.tmp') as f:
  temp=Path(f.name);json.dump(obj,f,indent=2,ensure_ascii=False);f.write('\n');f.flush();os.fsync(f.fileno())
 os.replace(temp,path)
def validate_name(raw):
 if '\\' in raw or raw.startswith('/') or '\x00' in raw:raise ValueError('Ungueltiger ZIP-Pfad')
 parts=PurePosixPath(raw).parts
 if not parts or any(x in ('','.','..') for x in raw.split('/')):raise ValueError('Ungueltiger ZIP-Pfad: '+raw)
 for p in parts:
  if p.endswith(('.', ' ')) or ':' in p or any(ord(c)<32 for c in p) or p.split('.')[0].upper() in BANNED:
   raise ValueError('Unsicherer Windows-Dateiname: '+p)
 return parts

def zip_entries(zip_path):
 with zipfile.ZipFile(zip_path) as z:
  entries=[i for i in z.infolist() if not i.is_dir()]
  if len(entries)>MAX_FILES: raise ValueError('Zu viele Dateien')
  total=sum(i.file_size for i in entries)
  if total>MAX_TOTAL:raise ValueError('Archiv zu gross')
  allparts=[];seen=set()
  for i in z.infolist():
   # Unix symbolic links and special files cannot be safely extracted on Windows.
   mode=(i.external_attr>>16)&0xffff
   if (mode & 0o170000) not in (0,0o040000,0o100000):raise ValueError('Symbolischer Link/Spezialdatei abgelehnt')
   if i.file_size>MAX_MEMBER:raise ValueError('Datei zu gross')
   parts=validate_name(i.filename.rstrip('/'))
   if not i.is_dir():allparts.append(parts)
  prefix=allparts[0][0] if allparts and all(len(p)>1 and p[0]==allparts[0][0] for p in allparts) else None
  records=[]
  for i in entries:
   parts=validate_name(i.filename)
   if prefix:parts=parts[1:]
   rel='/'.join(parts)
   key=rel.casefold()
   if key in seen:raise ValueError('Doppelte Windows-Pfade: '+rel)
   seen.add(key)
   records.append((i,rel))
  return records,prefix

def lab_root(base):
 base=Path(base).resolve()
 if not base.is_dir():raise ValueError('LAB-Verzeichnis fehlt')
 root=base/'OriginSwitch'
 if root.exists() and root.is_symlink():raise ValueError('OriginSwitch Symlink nicht erlaubt')
 return root

def safe_source(archive,archive_root):
 archive=Path(archive).resolve(strict=True)
 folder=Path(archive_root).resolve(strict=True)
 permitted=[folder,folder/'Legacy',folder/'Origin'/'Builds']
 if archive.parent not in permitted or archive.suffix.lower()!='.zip' or not archive.is_file():
  raise ValueError('Nur ZIPs direkt aus ARKVersionen, Legacy oder Origin/Builds erlaubt')
 return archive

def load_installs(root):
 entries=[]
 folder=root/'versions'
 if folder.exists():
  for d in sorted(folder.iterdir()):
   if d.is_dir() and not d.is_symlink() and (d/'manifest.json').is_file():
    try:
     manifest=json.loads((d/'manifest.json').read_text(encoding='utf-8'))
     if manifest.get('id')==d.name:
      entries.append({k:manifest.get(k) for k in ['id','source_name','source_sha256','file_count','runnable','created_utc']})
    except (OSError,ValueError):pass
 selected=None
 if (root/'selected.json').is_file():
  try:selected=json.loads((root/'selected.json').read_text(encoding='utf-8')).get('id')
  except (OSError,ValueError):pass
 return entries,selected

def deploy(lab,archive_root,source):
 root=lab_root(lab)
 source=safe_source(source,archive_root)
 source_hash=digest(source)
 identity='v_'+source_hash[:16]
 versions=root/'versions';target=versions/identity
 if target.exists():
  manifest=target/'manifest.json'
  if not manifest.is_file():raise ValueError('Vorhandener Versionsordner ohne Manifest: '+str(target))
  j=json.loads(manifest.read_text(encoding='utf-8'))
  if j.get('source_sha256')!=source_hash:raise ValueError('Versions-ID Konflikt')
  return {'status':'EXISTS','id':identity,'path':str(target),'runnable':j.get('runnable',False)}
 records,prefix=zip_entries(source)
 versions.mkdir(parents=True,exist_ok=True)
 temp=Path(tempfile.mkdtemp(prefix='.staging_',dir=versions))
 try:
  file_hashes={}
  with zipfile.ZipFile(source) as z:
   for info,rel in records:
    dest=temp/'files'/Path(*rel.split('/'))
    dest.parent.mkdir(parents=True,exist_ok=True)
    h=hashlib.sha256()
    with z.open(info) as src,open(dest,'xb') as dst:
     while True:
      chunk=src.read(1024*1024)
      if not chunk:break
      h.update(chunk);dst.write(chunk)
    file_hashes[rel]=h.hexdigest()
  runnable=(temp/'files'/EXE).is_file()
  manifest={'id':identity,'source_name':source.name,'source_sha256':source_hash,
   'file_count':len(records),'source_prefix':prefix,'runnable':runnable,
   'files_sha256':file_hashes,'created_utc':stamp()}
  atomic_json(temp/'manifest.json',manifest)
  temp.rename(target)
  return {'status':'DEPLOYED','id':identity,'path':str(target),'files':len(records),'runnable':runnable,'source_sha256':source_hash}
 finally:
  if temp.exists():shutil.rmtree(temp)

def select(lab,identity):
 root=lab_root(lab)
 if not re.fullmatch(r'v_[0-9a-f]{16}',identity):raise ValueError('Ungueltige Versions-ID')
 target=root/'versions'/identity
 if not target.is_dir() or target.is_symlink():raise ValueError('Version nicht vorhanden')
 manifest=json.loads((target/'manifest.json').read_text(encoding='utf-8'))
 if manifest.get('id')!=identity:raise ValueError('Manifest passt nicht zur Version')
 if not manifest.get('runnable'):raise ValueError('Nur Datenarchiv. Keine startfaehige ARK-EXE enthalten')
 exe=target/'files'/EXE
 if not exe.is_file():raise ValueError('ARK-EXE fehlt')
 # No automatic process launch; user must close ARK and use the separate launcher.
 atomic_json(root/'selected.json',{'id':identity,'selected_utc':stamp(),'source_sha256':manifest['source_sha256']})
 return {'status':'SELECTED','id':identity,'exe':str(exe),'note':'ARK ist nicht neu gestartet. Start nur ueber separaten LAB-Launcher.'}

def main():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['list','deploy','select']);p.add_argument('--lab',required=True);p.add_argument('--archives');p.add_argument('--source');p.add_argument('--id');a=p.parse_args()
 if a.action=='list':
  versions,selected=load_installs(lab_root(a.lab));out({'status':'OK','versions':versions,'selected':selected})
 elif a.action=='deploy':
  if not a.source or not a.archives:raise ValueError('--source und --archives notwendig')
  out(deploy(a.lab,a.archives,a.source))
 else:
  if not a.id:raise ValueError('--id erforderlich')
  out(select(a.lab,a.id))
if __name__=='__main__':
 try:main()
 except Exception as e:out({'status':'ERROR','error':str(e)});sys.exit(1)
