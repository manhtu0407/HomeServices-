import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P109-matching-selection-http',
  invariant: 'A Customer choice reserves one durable selection command without inline delivery or invented fallback consent and remains readable after an unknown outcome',
  authority: ['governance/RULES.md #7', 'approved Production Agentic Transaction Readiness plan (durable matching and Customer authority)'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/matching-preference-command.ts',
  layer: 'integration',
  siblings: ['P110-matching-selection-sql', 'P107-confirmation-preference-http'],
  mutation: 'Restore the synchronous broadcast path or force auto_general true; the queued command or explicit consent assertion fails',
} as const satisfies PillarManifest

const JOB='d1090000-0000-4000-8000-000000000001'
const CUSTOMER='d1090000-0000-4000-8000-000000000002'
const REQUEST='d1090000-0000-4000-8000-000000000003'
const WORKER='d1090000-0000-4000-8000-000000000004'
const receipt={
  job_id:JOB,job_status:'awaiting_customer_confirm',request_id:REQUEST,operation_id:'d1090000-0000-4000-8000-000000000005',
  confirmation_operation_id:'d1090000-0000-4000-8000-000000000006',
  state:'queued',mode:'saved_worker_first',preferred_worker_id:WORKER,auto_general:false,
  selected_at:'2026-09-05T17:00:00Z',support_code:'P109TEST',broadcast_sent:false,
}
const input={mode:'saved_worker_first',worker_id:WORKER,auto_general:false,client_request_id:REQUEST}
function setup(options:{role?:'customer'|'admin'|'worker';data?:unknown;error?:{code:string;message:string}}={}) {
  const result={data:options.error?null:options.data??receipt,error:options.error??null}
  const client=makeSequenceClient([],{
    request_job_matching_preference_atomic:[result],
    get_job_matching_preference_receipt:[result],
  },{
    jobs:[{data:{id:JOB,customer_id:CUSTOMER,status:'awaiting_customer_confirm',quote_mode:'rfq',service_type:'plumbing',address_district:'q7'},error:null}],
    job_matching_preferences:[{data:{strategy:'saved_worker_first',auto_general:false,fallback_at:null},error:null}],
    job_broadcasts:[{data:[],error:null}],job_events:[{data:[],error:null}],
    matching_operations:[{data:{state:'queued'},error:null}],
  })
  const handler=createMobileApiHandler({
    authenticate:async()=>({success:true,user:{id:CUSTOMER},role:options.role??'customer',
      supabase:client,privilegedSupabase:client,userSupabase:client}),
    services:createEdgeServices({}),
  })
  return {client,run:(method='POST',body:unknown=input)=>handler(new Request(
    `https://edge.test/jobs/${JOB}/matching-preference${method==='GET'?'/'+REQUEST:''}`,
    {method,...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}))}
}
describe('Customer durable matching selection',()=>{
  installEdgeRuntimeTestHooks()
  it('accepts an unpriced saved-only choice and queues exactly one atomic command without delivery',async()=>{
    const {client,run}=setup()
    const response=await run()
    expect(response.status,pillarWhy(PILLAR)).toBe(202)
    expect(await response.json()).toMatchObject({job_id:JOB,broadcast_sent:false,worker:null,selection:receipt,
      matching_state:{stage:'saved_worker_search',batch:null}})
    const mutations=client.calls.filter(call=>call.table.startsWith('rpc:')&&!call.table.includes('harness'))
    expect(mutations).toHaveLength(1)
    expect(mutations[0]?.operations).toContainEqual(['rpc','request_job_matching_preference_atomic',{
      p_job_id:JOB,p_customer_id:CUSTOMER,p_strategy:'saved_worker_first',p_preferred_worker_id:WORKER,
      p_auto_general:false,p_client_request_id:REQUEST,
    }])
    expect(client.calls.flatMap(call=>call.operations).filter(op=>['insert','update','upsert'].includes(String(op[0])))).toEqual([])
  })
  it('does not invent fallback consent when the client omits it',async()=>{
    const {client,run}=setup()
    const {auto_general:_,...body}=input
    expect((await run('POST',body)).status).toBe(202)
    expect(client.calls.find(call=>call.table==='rpc:request_job_matching_preference_atomic')?.operations[0]?.[2])
      .toMatchObject({p_auto_general:false})
  })
  it.each(['admin','worker'] as const)('denies %s before a selection RPC',async role=>{
    const {client,run}=setup({role})
    expect((await run()).status).toBe(403)
    expect(client.calls.filter(call=>/request_job_matching_preference|get_job_matching_preference/.test(call.table))).toEqual([])
  })
  it('recovers the exact selection receipt through GET after restart without another command',async()=>{
    const {client,run}=setup({data:{...receipt,state:'official_match',broadcast_sent:true}})
    const response=await run('GET')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({selection:{...receipt,state:'official_match',broadcast_sent:true}})
    expect(client.calls.some(call=>call.table==='rpc:request_job_matching_preference_atomic')).toBe(false)
  })
  it.each(['admin','worker'] as const)('denies %s selection receipt reads',async role=>{
    const {client,run}=setup({role})
    expect((await run('GET')).status).toBe(403)
    expect(client.calls.some(call=>call.table==='rpc:get_job_matching_preference_receipt')).toBe(false)
  })
  it.each([
    ['55000','COVERAGE_UNAVAILABLE',409,'COVERAGE_UNAVAILABLE'],
    ['23505','MATCHING_PREFERENCE_REQUEST_CONFLICT',409,'MATCHING_PREFERENCE_REQUEST_CONFLICT'],
    ['42501','MATCHING_PREFERENCE_NOT_OWNED',404,'NOT_FOUND'],
    ['08006','private DB connection details',503,'MATCHING_PREFERENCE_OUTCOME_UNKNOWN'],
  ])('maps %s/%s without exposing private data or claiming final failure',async(code,message,status,safeCode)=>{
    const {run}=setup({error:{code,message}})
    const response=await run()
    expect(response.status).toBe(status)
    const body=await response.json()
    expect(body).toMatchObject({code:safeCode})
    expect(JSON.stringify(body)).not.toContain('private DB connection details')
  })
  it.each([
    ['foreign job',{job_id:'d1090000-0000-4000-8000-000000000099'}],
    ['foreign request',{request_id:'d1090000-0000-4000-8000-000000000099'}],
    ['different Worker',{preferred_worker_id:'d1090000-0000-4000-8000-000000000099'}],
    ['invented consent',{auto_general:true}],
    ['fake delivery',{broadcast_sent:true}],
  ])('rejects a %s receipt as an unknown outcome',async(_name,patch)=>{
    const {run}=setup({data:{...receipt,...patch}})
    const response=await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({code:'MATCHING_PREFERENCE_OUTCOME_UNKNOWN',reconcile_required:true})
  })
})
