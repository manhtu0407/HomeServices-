import datetime
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(r'C:\ns-fix\kawa02')
OUT = pathlib.Path(__file__).resolve().parent

def run(name, args, cwd=ROOT, timeout=120):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        p = subprocess.run(args, cwd=cwd, text=True, encoding='utf-8', errors='replace', capture_output=True, timeout=timeout)
        code, stdout, stderr = p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired as e:
        code, stdout, stderr = 124, str(e.stdout or ''), str(e.stderr or '')
    (OUT / (name + '.stdout.txt')).write_text(stdout, encoding='utf-8')
    (OUT / (name + '.stderr.txt')).write_text(stderr, encoding='utf-8')
    item = dict(name=name, command=args, cwd=str(cwd), started_at=started, exit_code=code)
    with (OUT / 'commands.jsonl').open('a', encoding='utf-8') as f:
        f.write(json.dumps(item) + '\n')
    print(json.dumps(item), flush=True)
    return code, stdout

def compare_source():
    m = json.loads((OUT / 'deployed-mobile-api-manifest.json').read_text(encoding='utf-8'))
    refs = ['e8b95d2122a8ce802c5504630a778f6e51daa72f', '7e59b91085825a11168b2b2e1c68225a2dcc17f0', '4ee3a732d5ddd724d5055465664f8d5c1b0af0ce']
    changed = subprocess.check_output(['git','diff','--name-only', refs[0],refs[-1],'--','supabase/functions'],cwd=ROOT,text=True).splitlines()
    deployed = {f['path']: f['sha256'] for f in m['files']}
    results=[]
    for path in changed:
        row={'path':path,'deployed_sha256':deployed.get(path),'source_sha256':{},'matches':{}}
        for ref in refs:
            p=subprocess.run(['git','show',ref+':'+path],cwd=ROOT,capture_output=True)
            digest=hashlib.sha256(p.stdout.replace(b'\r\n',b'\n')).hexdigest() if p.returncode==0 else None
            row['source_sha256'][ref]=digest
            row['matches'][ref]=digest is not None and digest==deployed.get(path)
        results.append(row)
    summary={ref:sum(row['matches'][ref] for row in results) for ref in refs}
    packet=dict(normalization=m['normalization'],changed_paths=len(results),matches=summary,files=results)
    (OUT/'source-comparison.json').write_text(json.dumps(packet,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in packet.items() if k!='files'}))

if __name__ == '__main__':
    if sys.argv[1]=='compare': compare_source()
    elif sys.argv[1]=='github':
        queries={
          'pr405':['pr','view','405','--json','number,state,mergedAt,mergeCommit,headRefOid,statusCheckRollup,url'],
          'pr406':['pr','view','406','--json','number,state,mergedAt,mergeCommit,headRefOid,statusCheckRollup,url'],
          'main-ci':['run','view','39877323323','--json','status,conclusion,jobs,headSha,url'],
          'main-release-quality':['run','view','39877323191','--json','status,conclusion,jobs,headSha,url'],
          'prior-release-quality':['run','view','39765592023','--json','status,conclusion,jobs,headSha,url']}
        for name,args in queries.items(): run(name,['gh',*args,'--repo','manhtu0407/HomeServices-'])
        for name,path in {
          'release-switch':'actions/variables/NESTSCOUT_BACKEND_RELEASE_ENABLED',
          'production-protection':'environments/production',
          'rulesets':'rulesets',
          'branch-protection':'branches/main/protection',
          'github-releases':'releases?per_page=5',
          'deployments':'deployments?per_page=10',
          'last-deployment-status':'deployments/7205109179/statuses',
          'production-env-variables':'environments/production/variables',
        }.items(): run(name,['gh','api','repos/manhtu0407/HomeServices-/'+path])
    elif sys.argv[1]=='tests':
        node=r'C:\Program Files\nodejs\node.exe'
        files=[
          'src/__tests__/unit/kael-emergency-electrical-spark-pillar.test.ts',
          'src/__tests__/unit/kael-emergency-standard-remediation-pillar.test.ts',
          'src/__tests__/unit/kael-emergency-context-guards-pillar.test.ts',
          'src/__tests__/unit/kael-requested-work-english-negation-pillar.test.ts',
          'src/__tests__/kael-edge-runtime/domains/kael-case-emergency-playbook-precedence-pillar.test.ts',
          'src/__tests__/kael-edge-runtime/domains/kael-boundary-requested-work-pillar.test.ts',
          'src/__tests__/kael-edge-runtime/domains/kael-boundary-electrical-flag-parity-pillar.test.ts',
          'src/__tests__/kael-edge-runtime/domains/kael-boundary-language-supply-pillar.test.ts',
          'src/__tests__/kael-edge-runtime/domains/kael-approval-boundary-pillar.test.ts',
          'src/__tests__/kael-edge-runtime/domains/kael-emergency-sentinel-matrix-pillar.test.ts',
        ]
        run('baseline-safety-approval',[node,'node_modules/vitest/vitest.mjs','run',*files,'--reporter=json','--outputFile='+str(OUT/'baseline-safety-approval.json')],ROOT/'apps/api',timeout=300)
    elif sys.argv[1]=='gates':
        node=r'C:\Program Files\nodejs\node.exe'
        for name,script in [('structure','scripts/lint-structure.mjs'),('edge-db-source','scripts/check-edge-db-contract.mjs'),('migration-inventory','scripts/harness/migration-inventory.mjs'),('workplan','scripts/check-work-plan.mjs')]:
            run(name,[node,script],timeout=120)
