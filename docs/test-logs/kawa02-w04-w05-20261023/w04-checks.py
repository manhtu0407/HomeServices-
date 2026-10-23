import importlib.util
import json
import pathlib
import hashlib

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('collector',HERE/'collect-evidence.py')
c=importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
ROOT=c.ROOT
NODE=r'C:\Program Files\nodejs\node.exe'

def check(name,args,cwd=ROOT,timeout=300):
    return c.run(name,args,cwd=cwd,timeout=timeout)[0]

if __name__=='__main__':
    import sys
    if sys.argv[1]=='mutations':
        path=ROOT/'supabase/functions/mobile-api/_shared/kael/pipeline/workflow-registry.ts'
        original=path.read_bytes()
        text=original.decode('utf-8')
        rows=[]
        mutations={
          'version-overwrite':("if (definitions.has(key)) throw new Error('WORKFLOW_VERSION_EXISTS')", ''),
          'approval-path':("if (node.capabilityId && writes.has(node.capabilityId) && !state.approved) throw new Error('APPROVAL_PATH_REQUIRED')", ''),
          'role-check':("if (definition.roles.some(r => !allowedRoles.includes(r))) throw new Error('CAPABILITY_ROLE_FORBIDDEN')", ''),
        }
        try:
            for name,(before,after) in mutations.items():
                assert text.count(before)==1
                path.write_text(text.replace(before,after),encoding='utf-8',newline='')
                code=check('w04-mutant-'+name,[NODE,'node_modules/vitest/vitest.mjs','run','src/__tests__/unit/workflow-definition-registry-pillar.test.ts','--reporter=json','--outputFile='+str(HERE/('w04-mutant-'+name+'.json'))],ROOT/'apps/api')
                result=json.loads((HERE/('w04-mutant-'+name+'.json')).read_text())
                rows.append(dict(name=name,exit_code=code,failed=result['numFailedTests'],killed=code!=0 and result['numFailedTests']>0))
                path.write_bytes(original)
        finally:
            path.write_bytes(original)
        assert hashlib.sha256(path.read_bytes()).digest()==hashlib.sha256(original).digest()
        assert all(x['killed'] for x in rows), rows
        (HERE/'w04-mutations.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
        check('w04-after-mutations',[NODE,'node_modules/vitest/vitest.mjs','run','src/__tests__/unit/workflow-definition-registry-pillar.test.ts','--reporter=json','--outputFile='+str(HERE/'w04-after-mutations.json')],ROOT/'apps/api')
    elif sys.argv[1]=='types':
        check('w04-api-types',[NODE,'scripts/run.mjs','run-package-script','@nestscout/api','type-check'])
        check('w04-shared-types',[NODE,'scripts/run.mjs','run-package-script','@nestscout/shared','type-check'])
    elif sys.argv[1]=='regression':
        check('w04-api-full',[NODE,'scripts/run.mjs','run-package-script','@nestscout/api','test'],timeout=600)
