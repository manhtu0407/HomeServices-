import importlib.util
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('collector',HERE/'collect-evidence.py')
collector=importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
run=collector.run
ROOT=collector.ROOT

run('latest-quality-failure-log',['gh','run','view','39877323191','--repo','manhtu0407/HomeServices-','--log-failed'])
run('prior-quality-failure-log',['gh','run','view','39765592023','--repo','manhtu0407/HomeServices-','--log-failed'])
run('rpc-name-compatibility',[r'C:\Program Files\nodejs\node.exe','scripts/check-edge-db-contract.mjs','--functions',str(HERE/'hosted-rpc-names.json'),'--json'])
e=json.loads((HERE/'production-readonly-audit.json').read_text())
i=json.loads((ROOT/'config/harness/migration-inventory.json').read_text())
aliases={v:g['canonicalVersion'] for g in i['migrationEquivalences']['groups'] for v in g['versions']}
local={aliases.get(x['version'],x['version']) for x in i['entries']}
hosted={aliases.get(x['version'],x['version']) for x in e['schema']['applied_migrations']}
report=dict(local_raw=len(i['entries']),hosted_raw=len(e['schema']['applied_migrations']),local_canonical=len(local),hosted_canonical=len(hosted),missing=sorted(local-hosted),unrecognized=sorted(hosted-local))
(HERE/'migration-comparison.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))

try:
    from PIL import Image,ImageOps,ImageDraw
    pages=[Image.open(x).convert('RGB') for x in sorted(HERE.glob('kawa-page-*.png'))]
    contact=Image.new('RGB',(4*560,2*810),'#cccccc')
    for n,p in enumerate(pages):
        p.thumbnail((550,780))
        contact.paste(p,((n%4)*560+5,(n//4)*810+24))
        ImageDraw.Draw(contact).text(((n%4)*560+10,(n//4)*810+5),'Page '+str(n+1),fill='black')
    contact.save(HERE/'kawa-contact-sheet.png')
except ImportError:
    print('PIL unavailable; rendered pages retained')
