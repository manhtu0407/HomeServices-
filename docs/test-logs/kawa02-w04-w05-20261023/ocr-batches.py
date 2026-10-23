import importlib.util
import json
import pathlib

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('collector',HERE/'collect-evidence.py')
c=importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
plan=json.loads((HERE/'ocr-plan.stdout.txt').read_text(encoding='utf-8'))
print(json.dumps({'snapshot':plan['snapshot'],'reviewable':plan['totals']['reviewable'],'excluded':plan['totals']['excluded'],'batches':len(plan['batches'])}),flush=True)
for batch in plan['batches']:
    code,_=c.run('ocr-batch-'+str(batch['id']),[r'C:\Program Files\nodejs\node.exe','scripts/run.mjs','run-node','scripts/ocr-review.mjs','diff','--from',plan['from'],'--to',plan['snapshot'],*batch['files']])
    if code:raise SystemExit(code)
