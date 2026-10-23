from pathlib import Path
import subprocess,json,hashlib,shutil
r=Path(r'C:\ns-fix\kawa02'); out=r/'.scratch/w06-mutations'; out.mkdir(exist_ok=True)
container='supabase_db_nestscout-kawa06-20261023'
def run(name,args,stdin=None):
 p=subprocess.run(args,cwd=r,input=stdin,text=True,encoding='utf-8',errors='replace',capture_output=True,timeout=120)
 (out/(name+'.stdout.txt')).write_text(p.stdout,encoding='utf-8'); (out/(name+'.stderr.txt')).write_text(p.stderr,encoding='utf-8')
 return p.returncode
src=r/'supabase/functions/mobile-api/_shared/domains/kael-chat/workflow-checkpoints.ts'; raw=src.read_bytes(); report=[]
try:
 text=raw.decode('utf-8'); assert ').strict()' in text
 src.write_text(text.replace('}).strict()','})',1),encoding='utf-8')
 code=run('strict-input-mutant',[shutil.which('corepack.cmd'),'pnpm','--filter','@nestscout/api','exec','vitest','run','src/__tests__/unit/workflow-durable-checkpoints-pillar.test.ts','--reporter=json','--outputFile='+str(out/'strict-input-mutant.json')])
 report.append({'mutation':'remove strict scope validation','exitCode':code,'killed':code!=0})
finally: src.write_bytes(raw)
m=(r/'supabase/migrations/20261023020137_kael_workflow_durable_checkpoints.sql').read_text(encoding='utf-8')
f=m[m.index('create function public.kael_workflow_checkpoint_v1'):]; f=f[:f.index('$$;')+3].replace('create function public.','create or replace function public.',1)
psql=['docker','exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
for name,old,new,sqlfile in [
 ('cas-mutant',"if v_instance.instance_version is distinct from (p_request->>'expectedVersion')::integer then",'if false then','workflow_checkpoint_concurrency_verification.sql'),
 ('idempotency-mutant','if v_prior.request_hash <> v_hash then','if false then','workflow_durable_checkpoints_verification.sql')]:
 assert old in f
 try:
  assert run(name+'-install',psql,f.replace(old,new,1))==0
  code=run(name,['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File','docker/scripts/run-sql-tests.ps1','--container',container,'--filter',sqlfile])
  report.append({'mutation':name,'exitCode':code,'killed':code!=0})
 finally: assert run(name+'-restore',psql,f)==0
report.append({'restoredAdapterSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'sourceRestored':src.read_bytes()==raw})
(out/'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
assert all(x.get('killed',True) for x in report)
