// Only explicitly typed reasoning bodies are eligible. Keep immutable automation
// snapshots, native session history and every non-reasoning item intact.
const {createHash}=require('node:crypto');
const {owned,root}=require('../core/workforce/topic-task.cjs');
const {readRun}=require('./run-text-store.cjs');
const {clearedReasoning,reasoningFields}=require('./run-patches.cjs');
const acceptance=require('../core/workforce/acceptance.cjs');
const KEY='workforce.spaces.v1';
const AGE=90*24*60*60*1000;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function bytes(value){
 if(typeof value==='string')return Buffer.byteLength(value);
 return Array.isArray(value)?value.reduce((sum,item)=>sum+bytes(item),0):0;
}
function latest(...dates){
 if(!dates.some(Boolean))return NaN;
 return Math.max(...dates.filter(Boolean).map(Date.parse));
}
function closed(plan){return plan.status==='completed'&&plan.packages.every(p=>p.status==='accepted'&&!p.stale);}
function scan(db,{exclude=[]}={},apply){
 const cutoff=Date.now()-AGE,excluded=new Set(exclude);
 const state=JSON.parse(db.prepare('SELECT data FROM settings WHERE key=?').get(KEY)?.data||'{}');
 const spaces=state.spaces||[],requests=state.requests||[],plans=state.plans||[];
 const topicState={requests,plans,taskDrafts:state.taskDrafts||[]};
 const topicActivity=new Map();
 for(const r of requests){
  const key=root(topicState,r.spaceId,r.id);
  const time=latest(r.createdAt,r.updatedAt,r.host?.finishedAt,r.host?.activity?.lastProgressAt,r.host?.activity?.finishedAt,
   ...(r.host?.steps||[]).map(step=>step.at),...(r.followups||[]).map(f=>f.createdAt));
  topicActivity.set(key,Math.max(topicActivity.get(key)??0,time));
 }
 function archivedTopic(spaceId,requestId){
  if(!spaces.some(s=>s.id===spaceId&&s.archivedAt))return false;
  const topic=owned(topicState,spaceId,requestId);
  const activity=topicActivity.get(root(topicState,spaceId,requestId));
  return (activity===undefined||activity<cutoff)&&!topic.drafts.length&&topic.plans.every(eligiblePlan);
 }
 function eligiblePlan(plan){return closed(plan)&&(!plan.updatedAt||Date.parse(plan.updatedAt)<cutoff);}
 const stats={run:0,host:0,snapshot:0},candidates=[],updates=[];
 const textRefs=db.prepare("SELECT field,length,revision FROM run_texts WHERE run_id=? AND collection='messages' AND item_key=? ORDER BY field");
 const rows=db.prepare("SELECT item_key,turn_key,data FROM run_items WHERE run_id=? AND collection='messages' ORDER BY position");
 const update=db.prepare("UPDATE run_items SET data=? WHERE run_id=? AND collection='messages' AND item_key=?");
 const drop=db.prepare("DELETE FROM run_texts WHERE run_id=? AND collection='messages' AND item_key=? AND field=?");
 const selected=new Set(apply||[]);
 let cleanBytes=0,hostChanged=false;
 function candidate(kind,id,title,time,bodySize,version){
  const token=digest([kind,id,title,time,version]);
  candidates.push({kind,id,title,at:new Date(time).toISOString(),bytes:bodySize,token});
  if(!selected.delete(token))return false;
  cleanBytes+=bodySize;return true;
 }
 for(const row of db.prepare("SELECT data FROM runs WHERE EXISTS (SELECT 1 FROM run_items WHERE run_id=runs.id AND collection='messages' AND json_extract(data,'$.kind')='reasoning')").iterate()){
  const run=JSON.parse(row.data),id=run.id;
  const related=plans.filter(p=>p.packages.some(w=>w.attempts?.some(a=>a.runId===id||run.collaboration?.requestId&&a.requestId===run.collaboration.requestId)));
  const request=requests.find(r=>r.id===run.collaboration?.requestId||r.participants?.some(p=>p.runId===id));
  const spaceId=run.collaboration?.spaceId||request?.spaceId||related[0]?.spaceId;
  const archivedAt=spaceId?spaces.find(s=>s.id===spaceId)?.archivedAt:run.archivedAt;
  const ownedByArchive=spaceId
   ? (request||related.length)&&(!request||request.spaceId===spaceId)&&archivedTopic(spaceId,request?.id)&&related.every(p=>p.spaceId===spaceId&&eligiblePlan(p))
   : !run.collaboration;
  let time=latest(run.createdAt,run.updatedAt);
  const turns=new Map(),items=[];
  for(const item of rows.iterate(id)){
   const m=JSON.parse(item.data);
   if(!turns.has(item.turn_key))turns.set(item.turn_key,{});
   const turn=turns.get(item.turn_key);
   if(m.role==='user'&&m.id===item.turn_key){
    turn.user=true;turn.outcome=m.timing?.outcome;
    if(m.timing?.finishedAt)time=Math.max(time,Date.parse(m.timing.finishedAt));
   }
   if(m.role!=='assistant')continue;
   if(m.kind==='reasoning'){
    const refs=textRefs.all(id,item.item_key).filter(r=>reasoningFields.includes(JSON.parse(r.field)[0]));
    const length=reasoningFields.reduce((sum,k)=>sum+bytes(m[k]),0)+refs.reduce((sum,r)=>sum+r.length*2,0);
    stats.run+=length;
    if(length)items.push({item,m,refs,length,turn});
   }else if(!m.kind&&(!m.phase||m.phase==='final_answer')){
    const hasText=!!m.text?.trim()||textRefs.all(id,item.item_key).some(r=>r.field==='["text"]'&&r.length>0);
    if(m.phase==='final_answer'||!turn.explicitFinal)turn.final=hasText;
    if(m.phase==='final_answer')turn.explicitFinal=true;
   }
  }
  if(!ownedByArchive||!Number.isFinite(Date.parse(archivedAt))||!Number.isFinite(time)||time>=cutoff||run.status!=='completed'||excluded.has(id)||run.originHandoff||run.saveIssue||!items.length)continue;
  // Legacy document references can survive without their originating request.
  if(!spaceId&&state.documents?.some(d=>d.sourceRunId===id||d.versions?.some(v=>v.sourceRunId===id)))continue;
  const eligible=items.filter(i=>i.turn.user&&i.turn.final&&(!i.turn.outcome||i.turn.outcome==='completed'));
  if(!eligible.length)continue;
  const length=eligible.reduce((sum,i)=>sum+i.length,0);
  const version=eligible.map(i=>[i.item.item_key,digest(i.item.data),i.refs.map(r=>r.revision)]);
  if(!candidate('run',id,run.title||id,time,length,[archivedAt,version]))continue;
  const before=related.length?acceptance.resultHash(readRun(db,id)):null;
  for(const {m,item,refs} of eligible){
   update.run(JSON.stringify(clearedReasoning(m)),id,item.item_key);
   for(const r of refs)drop.run(id,item.item_key,r.field);
  }
  if(before){
   run.reasoningEvidence={before,after:acceptance.rawResultHash(readRun(db,id))};
   db.prepare('UPDATE runs SET data=? WHERE id=?').run(JSON.stringify(run),id);
  }
  updates.push({id,messages:eligible.map(i=>i.item.item_key),evidence:run.reasoningEvidence});
 }
 for(const request of requests){
  const host=request.host,activity=host?.activity;
  if(!activity?.reasoning)continue;
  const length=bytes(activity.reasoning);stats.host+=length;
  const time=latest(request.createdAt,request.updatedAt,host.finishedAt,activity.lastProgressAt,activity.finishedAt,...host.steps.map(s=>s.at));
  if(!archivedTopic(request.spaceId,request.id)||host.status!=='completed'||!host.steps.at(-1)?.text?.trim()||!(time<cutoff))continue;
  if(!candidate('host',request.id,request.title||request.prompt?.slice(0,120)||request.id,time,length,[spaces.find(s=>s.id===request.spaceId)?.archivedAt,digest(host)]))continue;
  activity.reasoning='';activity.reasoningCleared=true;hostChanged=true;
 }
 if(hostChanged)db.prepare('UPDATE settings SET data=? WHERE key=?').run(JSON.stringify(state),KEY);
 if(apply)return {updates,hostChanged,bytes:cleanBytes,skipped:selected.size};
 stats.snapshot=db.prepare(`SELECT coalesce(sum(length(CAST(json_extract(m.value,'$.text') AS BLOB))),0) AS n
 FROM automation_turns a JOIN conversation_identities c ON c.id=a.conversation_id AND c.kind='run'
 JOIN json_each(a.data,'$.messages') m
 JOIN run_items i ON i.run_id=c.record_id AND i.collection='messages' AND i.item_key=json_extract(m.value,'$.id') AND i.turn_key=a.turn_id
 WHERE json_extract(i.data,'$.kind')='reasoning' AND json_extract(i.data,'$.role')='assistant'`).get().n;
 return {stats,candidates:candidates.sort((a,b)=>a.at.localeCompare(b.at))};
}
function exclude(runtime){return [...runtime.pendingRecords.keys(),...runtime.dirtyRuns.keys(),...[...runtime.contexts.values()].map(c=>c.run?.id||c.requestRunId)];}
async function clean(runtime,spaces,database,tokens){
 if(!Array.isArray(tokens)||!tokens.length||tokens.some(t=>typeof t!=='string'||!/^[a-f0-9]{64}$/.test(t)))throw Error('请先预览清理范围');
 if(runtime.editing||runtime.closing||runtime.historyMaintenance)throw Error('请等待当前操作结束');
  const work=Promise.all([runtime.writes,spaces.queue]).then(async()=>{
   const result=await database.call('cleanHistoricalReasoning',{tokens,exclude:exclude(runtime)});
   for(const {id,messages,evidence} of result.updates){
    const run=runtime.runs.find(r=>r.id===id);if(!run)continue;
    const ids=new Set(messages);
    run.messages=run.messages.map(m=>ids.has(m.id)?clearedReasoning(m):m);
    if(evidence)run.reasoningEvidence=evidence;
    runtime.publishRun(run);
   }
   if(result.hostChanged)spaces.publish();
   return {bytes:result.bytes,skipped:result.skipped};
  });
  runtime.historyMaintenance=runtime.writes=spaces.queue=work.catch(()=>{});
  try{return await work;}finally{delete runtime.historyMaintenance;}
}
module.exports={scan,clean,exclude};
