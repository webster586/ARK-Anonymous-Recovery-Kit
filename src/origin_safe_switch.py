#!/usr/bin/env python3
"""ARK Origin 0.3.3 - independent, offline, non-destructive LAB launch controller.
Only reads installed LAB versions from Origin V0.3 and writes its own settings and logs.
Never modifies binaries, archives or production installations.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

EXE = 'ARK_Controller_Windows_x64.exe'
VERSION_RE = re.compile(r'^v_[0-9a-f]{16}$')
REGISTERED_RE = re.compile(r'^r_[0-9a-f]{16}$')


def utc():
    return datetime.now(timezone.utc).isoformat()


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def json_read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def atomic_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.safe_', suffix='.tmp', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def log(root, action, status, **fields):
    folder = root / 'logs'
    folder.mkdir(parents=True, exist_ok=True)
    payload = {'utc': utc(), 'action': action, 'status': status, **fields}
    with open(folder / 'safe_switch.jsonl', 'a', encoding='utf-8') as f:
        f.write(json.dumps(payload, ensure_ascii=False) + '\n')


def inside(child, parent):
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def is_linklike(path):
    return path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction())


def check_no_symlinks(path, stop):
    # Prevent substitution of a component after initial deployment.
    p = path
    while p != stop.parent:
        if is_linklike(p):
            raise ValueError('Symlink/Junction nicht erlaubt: ' + str(p))
        if p == stop:
            break
        if p == p.parent:
            raise ValueError('Pfad liegt ausserhalb des LAB')
        p = p.parent


def paths(lab):
    lab = Path(lab).resolve(strict=True)
    if not lab.is_dir():
        raise ValueError('LAB-Ordner fehlt')
    root = lab / 'OriginSwitch'
    root.mkdir(exist_ok=True)
    check_no_symlinks(root, lab)
    return lab, root


def version_info(root, version_id, full=True):
    if not VERSION_RE.fullmatch(version_id):
        raise ValueError('Ungueltige Versions-ID')
    version = root / 'versions' / version_id
    manifest_path = version / 'manifest.json'
    if not manifest_path.is_file():
        raise ValueError('Version oder Manifest fehlt: ' + version_id)
    check_no_symlinks(version, root)
    m = json_read(manifest_path)
    if m.get('id') != version_id or not m.get('runnable'):
        raise ValueError('Version nicht startfaehig oder falsche Manifest-ID')
    hashes = m.get('files_sha256')
    if not isinstance(hashes, dict) or not hashes:
        raise ValueError('Keine Datei-Hashes im Manifest vorhanden')
    if EXE not in hashes:
        raise ValueError('EXE nicht im Datei-Manifest')
    files = version / 'files'
    if not files.is_dir():
        raise ValueError('Versionsdateien fehlen')
    expected = set()
    for name, expected_hash in hashes.items():
        if not isinstance(name, str) or not isinstance(expected_hash, str) or not re.fullmatch(r'[0-9a-f]{64}', expected_hash):
            raise ValueError('Ungueltige Manifestdatei oder Hash')
        # no path traversal, no Windows absolute names, no alternate data streams
        parts = name.split('/')
        if not parts or any(p in ('', '.', '..') or '\\' in p or ':' in p for p in parts):
            raise ValueError('Unsicherer Manifestpfad')
        dest = files.joinpath(*parts)
        check_no_symlinks(dest, root)
        if not dest.is_file() or (full and sha256(dest) != expected_hash):
            raise ValueError('Datei fehlt oder SHA-256 abweichend: ' + name)
        expected.add(name)
    actual = set()
    for parent, dirs, filenames in os.walk(files, followlinks=False):
        for d in dirs:
            candidate = Path(parent) / d
            if candidate.is_symlink():
                raise ValueError('Symlink im Versionsverzeichnis')
        for file in filenames:
            candidate = Path(parent) / file
            check_no_symlinks(candidate, root)
            actual.add(candidate.relative_to(files).as_posix())
    if actual != expected:
        raise ValueError('Zusaetzliche oder fehlende Dateien in Version')
    exe = files / EXE
    return exe, m


def registered_info(lab, root, version_id, full=True):
    if not REGISTERED_RE.fullmatch(version_id):
        raise ValueError('Ungueltige registrierte ID')
    manifest_path = root / 'registered' / (version_id + '.json')
    if not manifest_path.is_file() or is_linklike(manifest_path):
        raise ValueError('Registrierungsmanifest fehlt')
    m = json_read(manifest_path)
    if m.get('id') != version_id or m.get('kind') != 'registered' or not m.get('runnable'):
        raise ValueError('Registrierung ungueltig')
    folder = Path(m.get('directory', ''))
    # Register only direct children of LAB, not production, nested version stores or fallback.
    if not folder.is_absolute() or folder.parent != lab or folder == root or folder.name in ('OriginSwitch',):
        raise ValueError('Registrierter Pfad ist kein direkter LAB-Ordner')
    if not folder.is_dir() or is_linklike(folder):
        raise ValueError('Registrierter LAB-Ordner fehlt oder ist verlinkt')
    hashes = m.get('files_sha256')
    if not isinstance(hashes, dict) or EXE not in hashes or not hashes:
        raise ValueError('Dateiliste unvollstaendig')
    actual = {}
    for parent, dirs, filenames in os.walk(folder, followlinks=False):
        for name in dirs:
            item = Path(parent) / name
            if is_linklike(item):
                raise ValueError('Verlinkter Unterordner: ' + str(item))
        for name in filenames:
            item = Path(parent) / name
            if is_linklike(item) or not item.is_file():
                raise ValueError('Nicht reguläre Datei: ' + str(item))
            rel = item.relative_to(folder).as_posix()
            if rel not in hashes:
                raise ValueError('Zusaetzliche Datei seit Registrierung: ' + rel)
            if full and sha256(item) != hashes[rel]:
                raise ValueError('SHA-256 abweichend: ' + rel)
            actual[rel] = True
    if set(actual) != set(hashes):
        raise ValueError('Dateien seit Registrierung entfernt')
    exe = folder / EXE
    if not exe.is_file() or is_linklike(exe):
        raise ValueError('ARK-EXE fehlt')
    return exe, m


def selected_info(lab, root, version_id, full=True):
    if REGISTERED_RE.fullmatch(version_id or ''):
        return registered_info(lab, root, version_id, full=full)
    return version_info(root, version_id, full=full)


def register_existing(lab, root, folder, fallback):
    folder = Path(folder)
    if not folder.is_absolute():
        raise ValueError('Registrierung benoetigt absoluten LAB-Pfad')
    folder = folder.absolute()
    if folder.parent != lab or folder == root or folder.name in ('OriginSwitch',):
        raise ValueError('Nur direkte Unterordner des LAB-Verzeichnisses erlaubt')
    if not folder.is_dir() or is_linklike(folder):
        raise ValueError('LAB-Ordner fehlt oder ist verlinkt')
    if fallback and str(folder).casefold() == str(fallback.get('directory', '')).casefold():
        raise ValueError('Rueckfallversion darf nicht als Wechselversion registriert werden')
    exe = folder / EXE
    if not exe.is_file() or is_linklike(exe):
        raise ValueError('Keine startfaehige ARK-EXE im Verzeichnis')
    hashes = {}
    for parent, dirs, filenames in os.walk(folder, followlinks=False):
        for name in dirs:
            item = Path(parent) / name
            if is_linklike(item):
                raise ValueError('Verlinkter Unterordner verboten: ' + str(item))
        for name in filenames:
            item = Path(parent) / name
            if is_linklike(item) or not item.is_file():
                raise ValueError('Nicht regulaere Datei: ' + str(item))
            rel = item.relative_to(folder).as_posix()
            if rel in hashes:
                raise ValueError('Doppelter Dateiname')
            hashes[rel] = sha256(item)
    content_key = json.dumps({'path': str(folder).casefold(), 'files': hashes}, sort_keys=True, ensure_ascii=False)
    vid = 'r_' + hashlib.sha256(content_key.encode('utf-8')).hexdigest()[:16]
    manifest = {'id': vid, 'kind': 'registered', 'directory': str(folder), 'source_name': folder.name,
                'registered_utc': utc(), 'runnable': True, 'files_sha256': hashes}
    dst = root / 'registered' / (vid + '.json')
    if not dst.exists():
        atomic_json(dst, manifest)
    # Immediately perform a second hash pass before claiming registered.
    registered_info(lab, root, vid, full=True)
    return vid, len(hashes)


def snapshot_folder(folder, lab):
    """Hash the entire fallback directory without writing to it."""
    if folder.parent != lab or not folder.is_dir() or is_linklike(folder):
        raise ValueError('Rueckfallversion muss direkter, unverlinkter LAB-Unterordner sein')
    hashes = {}
    for parent, dirs, filenames in os.walk(folder, followlinks=False):
        for name in dirs:
            item = Path(parent) / name
            if is_linklike(item):
                raise ValueError('Verlinkter Rueckfall-Unterordner: ' + str(item))
        for name in filenames:
            item = Path(parent) / name
            if is_linklike(item) or not item.is_file():
                raise ValueError('Keine regulaere Rueckfall-Datei: ' + str(item))
            rel = item.relative_to(folder).as_posix()
            if rel in hashes:
                raise ValueError('Doppelter Rueckfall-Dateiname')
            hashes[rel] = sha256(item)
    if EXE not in hashes:
        raise ValueError('Rueckfall-EXE fehlt')
    return hashes


def fallback_info(lab, state, full=True):
    pin = state.get('fallback')
    if not isinstance(pin, dict):
        raise ValueError('Rueckfallversion noch nicht festgelegt; zuerst pin-fallback')
    folder = Path(pin.get('directory', ''))
    if not folder.is_absolute() or folder.parent != lab or is_linklike(folder) or not folder.is_dir():
        raise ValueError('Rueckfallordner muss direkter, unverlinkter LAB-Unterordner sein')
    exe = folder / EXE
    if not exe.is_file() or is_linklike(exe):
        raise ValueError('Rueckfall-EXE fehlt')
    if sha256(exe) != pin.get('exe_sha256'):
        raise ValueError('Rueckfall-EXE wurde seit Sicherung veraendert')
    hashes = pin.get('files_sha256')
    if not isinstance(hashes, dict):
        if full:
            raise ValueError('ALTES RUECKFALL-MANIFEST: nur EXE geschuetzt. Zuerst Menue 9 (Upgrade), ohne Aenderung der EXE.')
        return exe
    if EXE not in hashes or hashes[EXE] != pin['exe_sha256']:
        raise ValueError('Rueckfall-Manifest/EXE ungueltig')
    if full:
        current = snapshot_folder(folder, lab)
        if set(current) != set(hashes):
            missing = set(hashes) - set(current)
            added = set(current) - set(hashes)
            raise ValueError('Rueckfall-Dateibestand veraendert: ' + str(len(missing)) + ' entfernt, ' + str(len(added)) + ' hinzugefuegt')
        for name, digest in hashes.items():
            if not re.fullmatch(r'[0-9a-f]{64}', digest) or current[name] != digest:
                raise ValueError('Rueckfall-SHA-256 abweichend: ' + name)
    return exe


def upgrade_fallback(lab, root, state):
    pin = state.get('fallback')
    if not isinstance(pin, dict):
        raise ValueError('Zuerst Rueckfallversion festlegen')
    if 'files_sha256' in pin:
        fallback_info(lab, state, full=True)
        print('Rueckfallversion bereits vollstaendig geschuetzt: ' + str(len(pin['files_sha256'])) + ' Dateien.')
        return
    # The legacy EXE digest is a fixed trust anchor. Never replace its digest silently.
    exe = fallback_info(lab, state, full=False)
    folder = exe.parent
    first = snapshot_folder(folder, lab)
    if first.get(EXE) != pin['exe_sha256']:
        raise ValueError('Rueckfall-EXE-SHA-256 weicht vom bisherigen Pin ab')
    second = snapshot_folder(folder, lab)
    if second != first:
        raise ValueError('Rueckfall-Dateien haben sich waehrend der Registrierung veraendert')
    upgraded = dict(pin)
    upgraded['files_sha256'] = first
    upgraded['full_pinned_utc'] = utc()
    updated = dict(state)
    updated['fallback'] = upgraded
    # Atomic state file write: original legacy pin retained if validation fails.
    save_state(root, updated)
    state.update(updated)
    log(root, 'upgrade-fallback', 'OK', files=len(first), directory=str(folder))
    print('Rueckfall-Schutz erweitert: ' + str(len(first)) + ' Dateien SHA-256-verifiziert.')
    print('Bisherige EXE-Pruefsumme unveraendert uebernommen.')

def load_state(root):
    path = root / 'safe_switch_state.json'
    return json_read(path) if path.exists() else {'mode': 'fallback', 'fallback': None}


def save_state(root, state):
    atomic_json(root / 'safe_switch_state.json', state)


def port_available(port):
    # Port is checked against both IPv4/IPv6 loopback to avoid accidentally launching
    # a second server; this is a preflight, not an exclusive OS-level port reservation.
    for host, family in [('127.0.0.1', socket.AF_INET), ('::1', socket.AF_INET6)]:
        with socket.socket(family, socket.SOCK_STREAM) as s:
            s.settimeout(0.25)
            if s.connect_ex((host, port)) == 0:
                return False
    return True


def run(args):
    lab, root = paths(args.lab)
    state = load_state(root)
    if args.command == 'status':
        print('ARK Origin SafeSwitch V0.3.3')
        print('LAB: ' + str(lab))
        print('Modus: ' + state.get('mode', 'unbekannt'))
        print('Fallback: ' + (state.get('fallback') or {}).get('directory', 'NICHT FESTGELEGT'))
        print('Auswahl: ' + str(state.get('selected_id', 'keine')))
        print('Fallback-Schutz: ' + (str(len((state.get('fallback') or {}).get('files_sha256', {}))) + ' Dateien' if 'files_sha256' in (state.get('fallback') or {}) else 'ALT: nur EXE; Menue 9 ausfuehren'))
        print('Port 8765: ' + ('frei' if port_available(args.port) else 'belegt'))
        return
    if args.command == 'list':
        count = 0
        versions = root / 'versions'
        if versions.is_dir():
            for folder in sorted(versions.iterdir()):
                if not VERSION_RE.fullmatch(folder.name) or not folder.is_dir() or is_linklike(folder):
                    continue
                count += 1
                try:
                    _, m = version_info(root, folder.name, full=False)
                    print(folder.name + ' | ' + str(m.get('source_name')) + ' | startfaehig (bereitgestellt)')
                except Exception as err:
                    print(folder.name + ' | GESPERRT: ' + str(err))
        reg = root / 'registered'
        if reg.is_dir():
            for item in sorted(reg.glob('r_*.json')):
                count += 1
                try:
                    _, m = registered_info(lab, root, item.stem, full=False)
                    print(item.stem + ' | ' + str(m.get('source_name')) + ' | startfaehig (registriert)')
                except Exception as err:
                    print(item.stem + ' | GESPERRT: ' + str(err))
        if count == 0:
            print('Noch keine LAB-Versionen vorhanden.')
        return
    if args.command == 'register':
        fallback_info(lab, state, full=True)
        vid, count = register_existing(lab, root, args.directory, state.get('fallback'))
        log(root, 'register', 'OK', id=vid, directory=str(args.directory), files=count)
        print('Vorhandene LAB-Installation registriert: ' + vid)
        print('Dateien SHA-256-geprueft: ' + str(count))
        print('Noch nicht ausgewaehlt oder gestartet.')
        return
    if args.command == 'pin-fallback':
        folder = Path(args.directory) if args.directory else lab / 'ARK_ORIGIN_V03'
        if not folder.is_absolute() or not inside(folder, lab) or folder == lab or is_linklike(folder):
            raise ValueError('Fallback muss ein eigener Ordner unter LAB sein')
        exe = folder / EXE
        if not exe.is_file() or is_linklike(exe):
            raise ValueError('ARK-EXE im Rueckfallordner fehlt')
        if (root / 'versions') in folder.parents:
            raise ValueError('Fallback darf keine wechselbare OriginSwitch-Version sein')
        hashes = snapshot_folder(folder, lab)
        if snapshot_folder(folder, lab) != hashes:
            raise ValueError('Rueckfall-Dateien haben sich bei der Sicherung veraendert')
        newpin = {'directory': str(folder), 'exe_sha256': hashes[EXE], 'files_sha256': hashes, 'pinned_utc': utc()}
        if state.get('fallback') and not args.force:
            raise ValueError('Fallback bereits festgelegt; Wechsel nur mit --force')
        state['fallback'] = newpin
        state['mode'] = 'fallback'
        save_state(root, state)
        log(root, 'pin-fallback', 'OK', directory=str(folder), sha256=newpin['exe_sha256'])
        print('Rueckfallversion festgelegt, ' + str(len(hashes)) + ' Dateien SHA-256-gesichert: ' + str(folder))
        return
    if args.command == 'upgrade-fallback':
        upgrade_fallback(lab, root, state)
        return
    if args.command == 'select':
        exe, manifest = selected_info(lab, root, args.id)
        fallback_info(lab, state)
        state['selected_id'] = args.id
        state['mode'] = 'selected'
        save_state(root, state)
        log(root, 'select', 'OK', id=args.id, exe_sha256=manifest['files_sha256'][EXE])
        print('Version ausgewaehlt (noch nicht gestartet): ' + args.id)
        return
    if args.command == 'fallback':
        exe = fallback_info(lab, state)
        state['mode'] = 'fallback'
        save_state(root, state)
        log(root, 'fallback', 'OK', exe=str(exe))
        print('Rueckfallversion aktiv gewaehlt: ' + str(exe.parent))
        return
    if args.command == 'verify':
        if state.get('mode') == 'selected':
            exe, m = selected_info(lab, root, state.get('selected_id', ''))
            print('Alle ' + str(len(m['files_sha256'])) + ' Versionsdateien SHA-256-verifiziert.')
        else:
            exe = fallback_info(lab, state)
            print('Alle ' + str(len(state['fallback']['files_sha256'])) + ' Rueckfall-Dateien SHA-256-verifiziert.')
        log(root, 'verify', 'OK', exe=str(exe))
        return
    if args.command == 'start':
        if not port_available(args.port):
            raise ValueError('Port ' + str(args.port) + ' ist belegt. Andere ARK-Instanzen beenden.')
        if state.get('mode') == 'selected':
            exe, m = selected_info(lab, root, state.get('selected_id', ''))
        else:
            exe = fallback_info(lab, state)
        if not args.yes:
            print('Pruefung bestanden; starte nur nach ausdruecklicher Bestaetigung.')
            ans = input('ARK aus ' + str(exe.parent) + ' starten? [ja/NEIN]: ').strip().lower()
            if ans != 'ja':
                print('Abgebrochen.')
                return
        log(root, 'start', 'REQUESTED', exe=str(exe))
        subprocess.Popen([str(exe)], cwd=str(exe.parent), close_fds=True)
        print('Start angefordert: ' + str(exe))
        print('Hinweis: Nur der Start wurde angestossen, kein Funktionstest bestaetigt.')
        return
    raise ValueError('Unbekannter Befehl')


def main():
    p = argparse.ArgumentParser(description='ARK Origin V0.3.3 - SafeSwitch LAB')
    p.add_argument('--lab', default=r'I:\LAB', help='LAB-Stammordner')
    p.add_argument('--port', default=8765, type=int)
    sub = p.add_subparsers(dest='command', required=True)
    for c in ('status', 'list', 'fallback', 'verify', 'upgrade-fallback'):
        sub.add_parser(c)
    pin = sub.add_parser('pin-fallback')
    pin.add_argument('--directory')
    pin.add_argument('--force', action='store_true')
    reg = sub.add_parser('register')
    reg.add_argument('--directory', required=True)
    sel = sub.add_parser('select')
    sel.add_argument('--id', required=True)
    start = sub.add_parser('start')
    start.add_argument('--yes', action='store_true', help='Nur fuer automatische LAB-Tests')
    a = p.parse_args()
    try:
        run(a)
    except Exception as e:
        try:
            lab, root = paths(a.lab)
            log(root, a.command, 'ERROR', error=str(e))
        except Exception:
            pass
        print('ABBRUCH: ' + str(e), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
