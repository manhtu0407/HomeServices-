from pathlib import Path
import subprocess,json,uuid,time,datetime
r=Path(r'C:\ns-fix\kawa02'); name='supabase_db_nestscout-kawa06-20261023'
base=['docker','exec','-i',name,'psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1']
def sql(text):
 p=subprocess.run(base,input=text,text=True,capture_output=True,encoding='utf-8',timeout=20)
 if p.returncode: raise RuntimeError(p.stderr[:800])
 return p.stdout.strip()
def call(req,discard=False):
 query="set request.jwt.claim.role='service_role'; select public.kael_workflow_checkpoint_v1('"+json.dumps(req,separators=(',',':')).replace("'","''")+"'::jsonb);"
 if discard:
  p=subprocess.run(base,input=query,text=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=20); assert p.returncode==0
  return
 return json.loads(sql(query))
labels=json.loads(subprocess.check_output(['docker','inspect',name,'--format','{{json .Config.Labels}}'],text=True))
assert labels.get('com.supabase.cli.project')=='nestscout-kawa06-20261023',labels
assert sql('select count(*) from supabase_migrations.schema_migrations;')=='456'
d=json.loads(sql("select definition from private.kael_workflow_definitions where workflow_id='checkpoint_race_fixture' and definition_version=2;"))
ident={'instanceId':str(uuid.uuid4()),'actorId':'d4360000-0000-4000-8000-000000000001','actorRole':'customer','jobId':None,'caseId':None}
c={**ident,'operation':'create','idempotencyKey':str(uuid.uuid4()),'definition':d,'deadlineAt':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=4)).isoformat()}
assert call(c)['instance_version']==0
t={**ident,'operation':'transition','expectedVersion':0,'idempotencyKey':str(uuid.uuid4()),'action':'advance','nextNode':'middle'}
call(t,True); replay=call(t); assert replay['instance_version']==1
load={**ident,'operation':'load'}; before=call(load)
start_before=sql('select pg_postmaster_start_time();')
subprocess.run(['docker','restart','--time','10',name],check=True,stdout=subprocess.DEVNULL,timeout=40)
for _ in range(40):
 try:
  after=call(load); break
 except RuntimeError: time.sleep(.5)
else: raise AssertionError('owned database did not recover')
assert after==before
assert start_before!=sql('select pg_postmaster_start_time();')
next_req={**t,'expectedVersion':1,'idempotencyKey':str(uuid.uuid4()),'nextNode':'done'}
app='w06_interrupted_'+uuid.uuid4().hex
query="set application_name='"+app+"'; set request.jwt.claim.role='service_role'; begin; select public.kael_workflow_checkpoint_v1('"+json.dumps(next_req).replace("'","''")+"'::jsonb); select pg_sleep(10); commit;"
p=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8'); p.stdin.write(query); p.stdin.close(); p.stdin=None
backend=''
for _ in range(30):
 backend=sql("select pid from pg_stat_activity where application_name='"+app+"' and state='active' and wait_event='PgSleep';")
 if backend: break
 time.sleep(.1)
assert backend.isdigit()
assert sql('select pg_terminate_backend('+backend+');')=='t'
stdout,stderr=p.communicate(timeout=15); assert p.returncode!=0
assert call(load)==before
call(next_req,True); final=call(next_req); assert final['status']=='succeeded' and final['instance_version']==2
terminal=call(load); assert len(terminal['checkpoints'])==3
result={'target':name,'migrationCount':456,'serverRestartProved':True,'restoredPinnedVersion':terminal['state']['definition_version'],'discardedCreateResultRecovery':False,'discardedTransitionResultRecovery':True,'interruptedTransactionRolledBack':True,'idempotentReplayAfterCommit':True,'terminalStatus':final['status'],'checkpointCount':len(terminal['checkpoints']),'instanceId':ident['instanceId']}
(r/'.scratch/w06-restart-recovery.json').write_text(json.dumps(result,indent=2),encoding='utf-8'); print(json.dumps(result))
