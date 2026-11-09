# Portable Windows dependency search; does not alter global PATH.
import os as _ark_os
if _ark_os.name == "nt" and hasattr(_ark_os, "add_dll_directory"):
    from pathlib import Path as _ARKPath
    _home = _ARKPath(__file__).resolve().parent / "python"
    for _rel in ("", "DLLs", "Lib/site-packages/torch/lib", "Lib/site-packages/ctranslate2", "Lib/site-packages/onnxruntime/capi"):
        _dll = _home / _rel
        if _dll.is_dir():
            try:
                _ark_os.add_dll_directory(str(_dll))
            except OSError:
                pass

import json, sys, os, traceback

def main():
    import argostranslate.package
    import argostranslate.translate
    data=json.loads(sys.stdin.read().lstrip('\ufeff'))
    action=data.get('action')
    if action == 'status':
        languages=argostranslate.translate.get_installed_languages()
        pairs=[]
        for source in languages:
            for target in languages:
                if source.code==target.code:continue
                try:
                    if source.get_translation(target):pairs.append({'from':source.code,'to':target.code})
                except Exception:pass
        return {'ok':True,'languages':[{'code':l.code,'name':l.name} for l in languages],'pairs':pairs}
    if action in ('import','install'):
        if action == 'import':
            path=os.path.abspath(str(data['path']))
            if not path.lower().endswith('.argosmodel') or not os.path.isfile(path):
                raise ValueError('Invalid .argosmodel file')
        else:
            from_code,to_code=str(data['from']),str(data['to'])
            argostranslate.package.update_package_index()
            matches=[x for x in argostranslate.package.get_available_packages() if x.from_code==from_code and x.to_code==to_code]
            if not matches: raise RuntimeError('No matching language model found online')
            path=matches[0].download()
        argostranslate.package.install_from_path(path)
        return {'ok':True,'message':'model installed'}
    if action=='translate':
        translated=argostranslate.translate.translate(str(data['text']),str(data['from']),str(data['to']))
        return {'ok':True,'translated':translated,'translation':translated,'text':translated}
    raise ValueError('Unknown action')

try:
    result=main()
except Exception as exc:
    result={'ok':False,'error':str(exc)}
print(json.dumps(result,ensure_ascii=False),flush=True)
