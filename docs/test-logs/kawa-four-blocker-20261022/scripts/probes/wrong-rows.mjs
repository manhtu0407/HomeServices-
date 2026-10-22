import { pathToFileURL } from "node:url";
const SHARED = "C:/ns-fix/b4/supabase/functions/mobile-api/_shared/";
const boundary = await import(pathToFileURL(SHARED + "kael/kael-guardrails/boundary-guard.ts").href);
const registry = await import(pathToFileURL(SHARED + "kael/learning/playbooks/registry.ts").href);
const ACTOR = "39800000-0000-4000-8000-000000000001";
const FLAGS_ON = Object.fromEntries(["ELECTRICAL","PLUMBING","CLEANING","HVAC","UPHOLSTERY","HANDYMAN"].map((n)=>[`KAEL_PLAYBOOK_${n}_ENABLED`,"true"]));
const verdict=(text,flags,service="electrical")=>{globalThis.Deno={env:{get:(k)=>(flags==="on"?FLAGS_ON:{})[k]}};const d=boundary.evaluateMessageBoundary(text,service,{actorId:ACTOR,semanticInjectionClassifierEnabled:true,language:"vi",electricalPlaybookEnabled:Boolean(registry.getEnabledKaelPlaybook(service,ACTOR))});return d.ok?"ok":d.reason;};
const cap=(v)=>v[0].toUpperCase()+v.slice(1);
const strip=(v)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D");
const forms=[(v)=>v,strip,(v)=>v.toUpperCase()];
const name="máy giặt";const faults=["không vắt được","kẹt cửa"];
const fc=[(f)=>`${cap(name)} ${f}.`,(f)=>`${cap(name)} nhà mình ${f}, cần thợ đến xem.`,(f)=>`Nhờ thợ qua coi giúp, ${name} ${f}.`,(f)=>`${cap(name)} ${f}, ai sửa được không?`];
const rc=[`Cần thợ đến xem ${name} giúp mình.`,`Nhờ thợ sửa ${name} giúp mình.`,`Bên bạn có sửa ${name} không?`,`Mình cần bảo trì ${name} định kỳ.`];
const rows=[];for(const f of faults)for(const c of fc)for(const w of forms)rows.push(w(c(f)));for(const c of rc)for(const w of forms)rows.push(w(c));
for(const t of rows){const a=verdict(t,"off"),b=verdict(t,"on");if(a!=="out_of_scope"||b!=="out_of_scope")console.log(a,b,t);}
