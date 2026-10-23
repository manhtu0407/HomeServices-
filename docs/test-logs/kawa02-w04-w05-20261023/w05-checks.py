import importlib.util
import json
import pathlib
import hashlib
import sys

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('collector',HERE/'collect-evidence.py')
c=importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
ROOT=c.ROOT
NODE=r'C:\Program Files\nodejs\node.exe'

def check(name,args,cwd=ROOT,timeout=300):
    return c.run(name,args,cwd=cwd,timeout=timeout)[0]

if sys.argv[1]=='mutations':
    path=ROOT/'supabase/functions/mobile-api/_shared/kael/pipeline/workflow-shadow-planner.ts'
    original=path.read_bytes()
    text=original.decode('utf-8')
    rows=[]
    mutations={
      'v1-control':('return Object.freeze({ control, shadow: plan(registry, input) })','return Object.freeze({ control: null, shadow: plan(registry, input) })'),
      'approval-stop':("if (node.kind === 'request_approval') return result('approval_required', 'HUMAN_APPROVAL_REQUIRED')", ''),
      'actor-scope':("if (!definition.roles.includes(request.actorRole) || !definition.services.includes(request.service)) return result('rejected', 'ACTOR_SERVICE_FORBIDDEN')", ''),
    }
    try:
        for name,(before,after) in mutations.items():
            assert text.count(before)==1
            path.write_text(text.replace(before,after),encoding='utf-8',newline='')
            code=check('w05-mutant-'+name,[NODE,'node_modules/vitest/vitest.mjs','run','src/__tests__/unit/workflow-shadow-planner-pillar.test.ts','--reporter=json','--outputFile='+str(HERE/('w05-mutant-'+name+'.json'))],ROOT/'apps/api')
            result=json.loads((HERE/('w05-mutant-'+name+'.json')).read_text())
            rows.append(dict(name=name,exit_code=code,failed=result['numFailedTests'],killed=code!=0 and result['numFailedTests']>0))
            path.write_bytes(original)
    finally: path.write_bytes(original)
    assert hashlib.sha256(path.read_bytes()).digest()==hashlib.sha256(original).digest()
    assert all(x['killed'] for x in rows), rows
    (HERE/'w05-mutations.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
    check('w05-after-mutations',[NODE,'node_modules/vitest/vitest.mjs','run','src/__tests__/unit/workflow-definition-registry-pillar.test.ts','src/__tests__/unit/workflow-shadow-planner-pillar.test.ts','--reporter=json','--outputFile='+str(HERE/'w05-after-mutations.json')],ROOT/'apps/api')
elif sys.argv[1]=='final':
    check('final-api-types',[NODE,'scripts/run.mjs','run-package-script','@nestscout/api','type-check'])
    check('final-shared-types',[NODE,'scripts/run.mjs','run-package-script','@nestscout/shared','type-check'])
    check('final-shared-tests',[NODE,'scripts/run.mjs','run-package-script','@nestscout/shared','test'])
    check('final-api-full',[NODE,'scripts/run.mjs','run-package-script','@nestscout/api','test'],timeout=600)
elif sys.argv[1]=='gates':
    package=json.loads((ROOT/'package.json').read_text())
    for name in ['lint:structure','lint:baseline','lint:comments','lint:added-hygiene','lint:test-integrity','lint:test-collection','lint:edge-db','harness:pillars:check']:
        script=package['scripts'][name]
        import shlex
        args=shlex.split(script)
        args[0]=NODE
        if name in ['lint:comments','lint:added-hygiene','lint:test-integrity']:args.append('--working')
        check('final-'+name.replace(':','-'),args)
