import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseUnifiedDiff } from '../../scripts/lib/unified-diff.mjs';
import { zeroCommentViolations } from '../../scripts/check-comment-discipline.mjs';
const raw=execFileSync('git',['diff','--unified=0','--no-color','origin/main','--','apps','packages','supabase','scripts'],{encoding:'utf8',maxBuffer:1<<28});
const files=parseUnifiedDiff(raw);const violations=[];
for(const file of files){if(file.deleted)continue;const content=readFileSync(file.path,'utf8');violations.push(...zeroCommentViolations(file.path,content,new Set(file.added.map(a=>a.line))).map(v=>({file:file.path,...v})))}
const result={method:'unchanged latest-main exported zeroCommentViolations oracle over the exact pending working-tree diff against origin/main',files:files.length,violations};writeFileSync('.scratch/kawa01-owner-integration-20261021/comment-pending-range.json',JSON.stringify(result,null,2));console.log('latest-main pending-range zero-comment violations:',violations.length);if(violations.length)process.exitCode=1;
