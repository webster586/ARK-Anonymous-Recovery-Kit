#!/usr/bin/env python3
"""ARK Origin V0.2.2: verified, adaptive ZIP file patches with block-based binary deltas.
Offline/stdlib-only. No source ZIP is ever modified. Extracted file bytes exact;
not a byte-identical reconstructed ZIP container.
"""
import argparse
import difflib
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import stat
import struct
import sys
import tempfile
import zipfile
import zlib
from datetime import datetime, timezone

CHUNK=1024*1024
BLOCK=4096
MAX_DELTA_FILE=64*1024*1024
SCHEMA='ark-origin-adaptive-patch-0.2.2'
MAGIC=b'ARKD022\0'

def sha_file(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(CHUNK),b''): h.update(b)
    return h.hexdigest()

def sha_data(b):return hashlib.sha256(b).hexdigest()

def safe_name(n):
    if not n or '\\' in n or '\x00' in n or n.startswith('/') or ':' in n or n.endswith('/') or any(p in ('','.','..') for p in n.split('/')):
        raise ValueError('Unsicherer ZIP-Pfad: '+repr(n))
    return n

def zip_inventory(path):
    out={}
    with zipfile.ZipFile(path) as z:
        for inf in z.infolist():
            if inf.is_dir():continue
            n=safe_name(inf.filename)
            if n in out:raise ValueError('Doppelter ZIP-Pfad: '+n)
            mode=(inf.external_attr>>16)&0xffff
            if stat.S_IFMT(mode) not in (0,stat.S_IFREG):raise ValueError('Sonderdatei: '+n)
            if inf.flag_bits & 1:raise ValueError('Verschlüsseltes Archiv: '+n)
            h=hashlib.sha256();size=0
            with z.open(inf) as f:
                while True:
                    b=f.read(CHUNK)
                    if not b:break
                    h.update(b);size+=len(b)
            out[n]={'sha256':h.hexdigest(),'size':size,'date_time':list(inf.date_time),'external_attr':inf.external_attr,'compress_type':inf.compress_type}
    return out

def variants(inv):
    yield '',{n:n for n in inv}
    if inv:
        names={n.split('/')[0] for n in inv}
        if len(names)==1 and all('/' in n for n in inv):
            prefix=next(iter(names))+'/'
            yield prefix,{n[len(prefix):]:n for n in inv}

def alignment(b,t):
    best=(0,0,'','',{n:n for n in b},{n:n for n in t})
    for bp,bmap in variants(b):
        for tp,tmap in variants(t):
            shared=set(bmap)&set(tmap)
            same=sum(b[bmap[k]]['sha256']==t[tmap[k]]['sha256'] for k in shared)
            if (len(shared),same)>best[:2]:best=(len(shared),same,bp,tp,bmap,tmap)
    return best[2:]

def encode_delta(base,target):
    """COPY from base and INSERT target bytes, exact 4-KiB matches.
    Only for reasonably sized binaries. A fallback to full payload handles shifted files.
    """
    bh=[hashlib.blake2s(base[i:i+BLOCK],digest_size=12).digest() for i in range(0,len(base)//BLOCK*BLOCK,BLOCK)]
    th=[hashlib.blake2s(target[i:i+BLOCK],digest_size=12).digest() for i in range(0,len(target)//BLOCK*BLOCK,BLOCK)]
    matcher=difflib.SequenceMatcher(None,bh,th,autojunk=False)
    out=io.BytesIO()
    out.write(MAGIC)
    out.write(struct.pack('<QQ',len(base),len(target)))
    cursor=0
    for m in matcher.get_matching_blocks():
        to=m.b*BLOCK
        if to>cursor:
            chunk=target[cursor:to]
            out.write(b'I'+struct.pack('<Q',len(chunk))+chunk)
        if m.size:
            off=m.a*BLOCK;length=m.size*BLOCK
            # Hash matches are never trusted without comparing actual bytes.
            if base[off:off+length] == target[to:to+length]:
                out.write(b'C'+struct.pack('<QQ',off,length))
            else:
                chunk=target[to:to+length]
                out.write(b'I'+struct.pack('<Q',len(chunk))+chunk)
        cursor=(m.b+m.size)*BLOCK
    if cursor<len(target):
        tail=target[cursor:]
        out.write(b'I'+struct.pack('<Q',len(tail))+tail)
    out.write(b'E')
    return out.getvalue()

def apply_delta(base,encoded,expected_size):
    f=io.BytesIO(encoded)
    if f.read(len(MAGIC))!=MAGIC:raise ValueError('Ungültiger Delta-Header')
    head=f.read(16)
    if len(head)!=16:raise ValueError('Delta abgeschnitten')
    bsize,tsize=struct.unpack('<QQ',head)
    if bsize!=len(base) or tsize!=expected_size:raise ValueError('Delta-Basis/Zielgröße falsch')
    out=io.BytesIO();count=0
    while True:
        command=f.read(1)
        if command==b'E':break
        if command==b'C':
            raw=f.read(16)
            if len(raw)!=16:raise ValueError('COPY abgeschnitten')
            offset,length=struct.unpack('<QQ',raw)
            if offset>len(base) or length>len(base)-offset or length>tsize-count:raise ValueError('COPY außerhalb Datei')
            out.write(base[offset:offset+length]);count+=length
        elif command==b'I':
            raw=f.read(8)
            if len(raw)!=8:raise ValueError('INSERT abgeschnitten')
            (length,)=struct.unpack('<Q',raw)
            if length>tsize-count:raise ValueError('INSERT zu groß')
            data=f.read(length)
            if len(data)!=length:raise ValueError('INSERT-Daten abgeschnitten')
            out.write(data);count+=length
        else:raise ValueError('Ungültiges Delta-Kommando')
    if count!=tsize or f.read(1):raise ValueError('Deltalänge oder Endmarker falsch')
    return out.getvalue()

def compressed(data):return zlib.compress(data,6)

def uncompressed(encoded,expected):
    obj=zlib.decompressobj()
    # Cap decompressed data to declared expected length to prevent expansion bombs.
    result=obj.decompress(encoded,expected+1)
    if len(result)!=expected or not obj.eof or obj.unused_data or obj.unconsumed_tail:
        raise ValueError('Payload ist beschädigt oder hat unerwartete Größe')
    return result

def make(args):
    base=Path(args.base).resolve();target=Path(args.target).resolve();dest=Path(args.output).resolve()
    if not base.is_file() or not target.is_file():raise ValueError('ZIP-Basis oder -Ziel fehlt')
    if dest.exists():raise ValueError('Ausgabe existiert bereits: '+str(dest))
    if dest in (base,target):raise ValueError('Quellarchive dürfen nicht überschrieben werden')
    b=zip_inventory(base);t=zip_inventory(target)
    bp,tp,bmap,tmap=alignment(b,t)
    bk=set(bmap);tk=set(tmap)
    added=sorted(tmap[k] for k in tk-bk)
    removed=sorted(bmap[k] for k in bk-tk)
    modified_keys=sorted(k for k in bk&tk if b[bmap[k]]['sha256']!=t[tmap[k]]['sha256'])
    unchanged_keys=sorted(k for k in bk&tk if b[bmap[k]]['sha256']==t[tmap[k]]['sha256'])
    unchanged={tmap[k]:bmap[k] for k in unchanged_keys}
    payload={};total_full=0;total_selected=0
    with zipfile.ZipFile(base) as bz,zipfile.ZipFile(target) as tz:
        for name in added:
            raw=tz.read(name);packed=compressed(raw)
            payload[name]={'method':'full','data':packed,'source':None,'compressed_bytes':len(packed),'full_compressed_bytes':len(packed)}
            total_full+=len(packed);total_selected+=len(packed)
        for key in modified_keys:
            new_name=tmap[key];old_name=bmap[key]
            raw=tz.read(new_name);full=compressed(raw);chosen=full;method='full'
            if len(raw)<=MAX_DELTA_FILE and b[old_name]['size']<=MAX_DELTA_FILE:
                old=bz.read(old_name)
                delta=compressed(encode_delta(old,raw))
                # Keep delta only when substantially smaller; account for small metadata costs.
                if len(delta)+128 < len(full):chosen=delta;method='delta'
            payload[new_name]={'method':method,'data':chosen,'source':old_name if method=='delta' else None,'compressed_bytes':len(chosen),'full_compressed_bytes':len(full)}
            total_full+=len(full);total_selected+=len(chosen)
    entries={name:{'method':v['method'],'base_name':v['source'],'compressed_bytes':v['compressed_bytes'],'full_compressed_bytes':v['full_compressed_bytes']} for name,v in payload.items()}
    manifest={'schema':SCHEMA,'created_utc':datetime.now(timezone.utc).isoformat(),'base_filename':base.name,
      'base_zip_sha256':sha_file(base),'target_filename':target.name,
      'target_files':t,'unchanged_source_map':unchanged,'payload_entries':entries,
      'added':added,'modified':sorted(tmap[k] for k in modified_keys),'removed':removed,
      'base_prefix':bp,'target_prefix':tp,
      'note':'Reconstructed extracted files match SHA-256; ZIP container may differ.'}
    dest.parent.mkdir(parents=True,exist_ok=True)
    try:
        with zipfile.ZipFile(dest,'x',compression=zipfile.ZIP_STORED,allowZip64=True) as zp:
            for name,v in sorted(payload.items()):zp.writestr('payload/'+name,v['data'])
            zp.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf-8'))
    except BaseException:
        if dest.exists():dest.unlink()
        raise
    summary={'status':'CREATED','base':base.name,'target':target.name,'patch':str(dest),
      'base_bytes':base.stat().st_size,'target_bytes':target.stat().st_size,'patch_bytes':dest.stat().st_size,
      'added':len(added),'modified':len(modified_keys),'removed':len(removed),'unchanged':len(unchanged),
      'full_payloads':sum(x['method']=='full' for x in payload.values()),
      'binary_deltas':sum(x['method']=='delta' for x in payload.values()),
      'full_payload_compressed_bytes':total_full,'selected_payload_compressed_bytes':total_selected,
      'saved_vs_target_bytes':target.stat().st_size-dest.stat().st_size,
      'saved_vs_target_percent':round((1-dest.stat().st_size/target.stat().st_size)*100,2) if target.stat().st_size else None,
      'patch_sha256':sha_file(dest)}
    if args.report:
        report_path=Path(args.report).resolve()
        if report_path.exists():raise ValueError('Bericht existiert bereits: '+str(report_path))
        report_path.parent.mkdir(parents=True,exist_ok=True)
        report_path.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

def restore(args):
    base=Path(args.base).resolve();patch=Path(args.patch).resolve();out=Path(args.output).resolve()
    if out.exists():raise ValueError('Ziel existiert bereits: '+str(out))
    with zipfile.ZipFile(patch) as zp:
        names=zp.namelist()
        if names.count('manifest.json')!=1 or len(names)!=len(set(names)):raise ValueError('Doppelte Patch-Einträge')
        m=json.loads(zp.read('manifest.json'))
        if m.get('schema')!=SCHEMA:raise ValueError('Patchschema nicht unterstützt')
        if sha_file(base)!=m['base_zip_sha256']:raise ValueError('FALSCHE BASIS: SHA-256 stimmt nicht überein')
        target=m['target_files'];payload=m['payload_entries'];unchanged=m['unchanged_source_map']
        for n in list(target)+list(payload)+list(unchanged)+list(unchanged.values()):safe_name(n)
        if set(payload)&set(unchanged) or set(payload)|set(unchanged)!=set(target):raise ValueError('Manifest unvollständig')
        if set(names)!=set(['manifest.json']+['payload/'+n for n in payload]):raise ValueError('Patch-Einträge unerwartet')
        binv=zip_inventory(base)
        for dst,src in unchanged.items():
            if src not in binv or binv[src]['sha256']!=target[dst]['sha256'] or binv[src]['size']!=target[dst]['size']:
                raise ValueError('Basiseintrag passt nicht: '+dst)
        out.parent.mkdir(parents=True,exist_ok=True)
        partial=out.with_name(out.name+'.partial')
        if partial.exists():raise ValueError('Temporäre Datei existiert: '+str(partial))
        try:
            with zipfile.ZipFile(base) as bz,zipfile.ZipFile(partial,'x',allowZip64=True) as result:
                for name,meta in target.items():
                    if name in unchanged:
                        f=bz.open(unchanged[name]);buffer=None
                    else:
                        p=payload[name]
                        data=uncompressed(zp.read('payload/'+name),meta['size'] if p['method']=='full' else min(MAX_DELTA_FILE*2+1024,MAX_DELTA_FILE*3)) if p['method']=='full' else None
                        if p['method']=='delta':
                            src=p['base_name']
                            if src not in binv:raise ValueError('Delta-Basis fehlt: '+name)
                            old=bz.read(src)
                            if len(old)>MAX_DELTA_FILE:raise ValueError('Delta-Basis zu groß')
                            # Delta encoded stream may be larger than target due to command overhead.
                            compressed_delta=zp.read('payload/'+name)
                            dec=zlib.decompressobj()
                            encoded=dec.decompress(compressed_delta,MAX_DELTA_FILE*3+1)
                            if not dec.eof or dec.unconsumed_tail or dec.unused_data:raise ValueError('Delta-Daten ungültig')
                            data=apply_delta(old,encoded,meta['size'])
                        elif p['method']!='full':raise ValueError('Unbekannte Patch-Methode')
                        f=io.BytesIO(data)
                    zi=zipfile.ZipInfo(name,tuple(meta['date_time']))
                    zi.compress_type=meta['compress_type'] if meta['compress_type'] in (0,8,12,14) else 8
                    zi.external_attr=meta['external_attr']
                    h=hashlib.sha256();size=0
                    with f, result.open(zi,'w',force_zip64=True) as w:
                        while True:
                            chunk=f.read(CHUNK)
                            if not chunk:break
                            w.write(chunk);h.update(chunk);size+=len(chunk)
                    if h.hexdigest()!=meta['sha256'] or size!=meta['size']:
                        raise ValueError('SHA-256 Rekonstruktion fehlgeschlagen: '+name)
            verified=zip_inventory(partial)
            if set(verified)!=set(target) or any(verified[n]['sha256']!=v['sha256'] or verified[n]['size']!=v['size'] for n,v in target.items()):
                raise ValueError('Zielarchivprüfung fehlgeschlagen')
            partial.rename(out)
        finally:
            if partial.exists():partial.unlink()
    print(json.dumps({'status':'VERIFIED','output':str(out),'files':len(target),'zip_sha256':sha_file(out),
      'note':'Entpackte Dateiinhalte bytegenau SHA-256-geprüft; ZIP-Container kann abweichen.'},ensure_ascii=False,indent=2))

def main():
    ap=argparse.ArgumentParser(description='ARK Origin V0.2.2 – Adaptive file/binary ZIP patches')
    sub=ap.add_subparsers(dest='command',required=True)
    c=sub.add_parser('create');c.add_argument('--base',required=True);c.add_argument('--target',required=True);c.add_argument('--output',required=True);c.add_argument('--report',help='Optionaler JSON-Speicherbericht')
    r=sub.add_parser('restore');r.add_argument('--base',required=True);r.add_argument('--patch',required=True);r.add_argument('--output',required=True)
    a=ap.parse_args()
    try:
        if a.command=='create':make(a)
        else:restore(a)
    except Exception as exc:
        print('ABBRUCH: '+str(exc),file=sys.stderr)
        return 1
    return 0
if __name__=='__main__':sys.exit(main())
