const {createHash}=require('node:crypto');
const Repair=require('../ui/managed-repair.cjs');
const failure=(code,message=code)=>Object.assign(Error(message),{code});
// Host-owned outbox: a confirmed form answer is a durable user input, not an approval.
const schema=`CREATE TABLE IF NOT EXISTS chat_inputs(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,state TEXT NOT NULL,data TEXT NOT NULL);CREATE INDEX IF NOT EXISTS chat_inputs_pending ON chat_inputs(state);CREATE TABLE IF NOT EXISTS chat_input_policies(run_id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE IF NOT EXISTS managed_repair_leases(project_key TEXT PRIMARY KEY,input_id TEXT NOT NULL,state TEXT NOT NULL);`;
function handlers(db,transaction){
 const get=id=>{const row=db.prepare('SELECT data FROM chat_inputs WHERE id=?').get(id);return row?JSON.parse(row.data):null;};
 const put=item=>db.prepare('INSERT INTO chat_inputs VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data').run(item.id,item.runId,item.state,JSON.stringify(item));
 const policy=runId=>{const row=db.prepare('SELECT data FROM chat_input_policies WHERE run_id=?').get(runId);return row?JSON.parse(row.data):{paused:false,generation:0};};
 const setPolicy=(runId,value)=>db.prepare('INSERT INTO chat_input_policies VALUES (?,?) ON CONFLICT(run_id) DO UPDATE SET data=excluded.data').run(runId,JSON.stringify(value));
 return {chatInput({action,id,item,state,error,target,runId,deliveryIds,expectedGeneration,clientMutationId,replaces,outcome}){return transaction(()=>{
  if(action==='recover'){
   for(const row of db.prepare("SELECT data FROM chat_inputs WHERE state='dispatching'").all()){const v=JSON.parse(row.data);put({...v,state:'unknown',error:'OUTCOME_UNKNOWN'});}
   for(const row of db.prepare('SELECT input_id FROM managed_repair_leases').all()){const v=get(row.input_id);if(v)put({...v,repairStatus:'reviewRequired',error:'上次受管修复的执行结果需要重新审查；不会自动重放。'});}
   db.prepare("UPDATE managed_repair_leases SET state='unknown'").run();
   for(const row of db.prepare("SELECT data FROM chat_inputs WHERE state='queued'").all()){const v=JSON.parse(row.data);if(v.managedRepair)put({...v,held:true,error:v.error||'应用已重启；请核对基线后明确继续，或重新审查。'});}
   return;
  }
  if(action==='repairLeases')return db.prepare('SELECT input_id,state FROM managed_repair_leases').all().map(row=>({state:row.state,item:get(row.input_id)})).filter(row=>row.item);
  if(action==='repairAcquire'){
   const v=get(id);if(!v?.managedRepair||v.state!=='queued'||v.held||policy(v.runId).paused)throw failure('BUSY');
   const lease=db.prepare('SELECT input_id,state FROM managed_repair_leases WHERE project_key=?').get(v.managedRepair.projectKey);
   if(lease?.input_id===id&&lease.state==='unknown')throw failure('MANAGED_REPAIR_REVIEW_REQUIRED','上次修复结果待复查，请从新的审查报告重新发起。');
   if(lease&&lease.input_id!==id){
    if(lease.state!=='unknown'||replaces!==lease.input_id)throw failure('BUSY');
    const prior=get(lease.input_id);put({...prior,repairStatus:'reviewed',reviewedBy:id});
   }
   db.prepare("INSERT INTO managed_repair_leases VALUES (?,?,'active') ON CONFLICT(project_key) DO UPDATE SET input_id=excluded.input_id,state='active'").run(v.managedRepair.projectKey,id);
   put({...v,repairStatus:'executing',error:undefined});return get(id);
  }
  if(action==='repairAssert'){
   const v=get(id),lease=v?.managedRepair&&db.prepare('SELECT input_id,state FROM managed_repair_leases WHERE project_key=?').get(v.managedRepair.projectKey);
   return !!lease&&lease.input_id===id&&lease.state==='active';
  }
  if(action==='repairRelease'){
   const v=get(id);if(!v?.managedRepair)return v;
   if(outcome==='reviewRequired')db.prepare("UPDATE managed_repair_leases SET state='unknown' WHERE input_id=?").run(id);
   else db.prepare('DELETE FROM managed_repair_leases WHERE input_id=?').run(id);
   put({...v,repairStatus:outcome==='unsent'?'queued':outcome,...(outcome==='reviewRequired'?{error:v.error||'修复执行结果待复查，请生成新的审查报告后继续。'}:{})});return get(id);
  }
  if(action==='repairReject'){const v=get(id);if(v?.managedRepair)put({...v,repairStatus:outcome});return get(id);}
  if(action==='list')return db.prepare("SELECT data FROM chat_inputs WHERE state='queued' ORDER BY rowid").all().map(r=>JSON.parse(r.data));
  if(action==='get')return get(id);
  if(action==='snapshot')return {policy:policy(runId),deliveries:db.prepare('SELECT data FROM chat_inputs WHERE run_id=? ORDER BY rowid DESC LIMIT 100').all(runId).map(r=>JSON.parse(r.data))};
  if(action==='pause'){const next={paused:true,generation:policy(runId).generation+1};setPolicy(runId,next);return next;}
  if(action==='resume'){
   const old=policy(runId),signature=JSON.stringify([...deliveryIds].sort());
   if(old.lastResume?.id===clientMutationId){if(old.lastResume.signature!==signature||old.lastResume.expectedGeneration!==expectedGeneration)throw failure('CONFLICT');return old;}
   if(old.generation!==expectedGeneration)throw failure('CONFLICT');
   for(const id of deliveryIds){const v=get(id);if(!v||v.runId!==runId||v.state!=='queued')throw failure('CONFLICT');}
   for(const row of db.prepare("SELECT data FROM chat_inputs WHERE run_id=? AND state='queued'").all(runId)){const v=JSON.parse(row.data);put({...v,held:!deliveryIds.includes(v.id),...(v.activeOnly?{allowIdle:deliveryIds.includes(v.id)}:{})});}
   const next={paused:false,generation:old.generation+1,lastResume:{id:clientMutationId,signature,expectedGeneration}};setPolicy(runId,next);return next;
  }
  if(action==='hold'){const v=get(id);if(v?.state==='queued')put({...v,held:true});return get(id);}
  if(action==='canDispatch'){const v=get(id);return !!v&&v.state==='queued'&&!v.held&&!policy(v.runId).paused;}

  if(action==='enqueue'){const prior=get(item.id);if(prior){if(prior.runId!==item.runId||prior.text!==item.text||prior.flowId!==item.flowId||prior.source!==item.source||JSON.stringify(prior.managedRepair)!==JSON.stringify(item.managedRepair))throw failure('CONFLICT');return prior;}if(item.source==='user'&&policy(item.runId).paused)throw failure('INTERACTION_REQUIRED','任务已停止，请明确继续后再发送');if(db.prepare("SELECT count(*) AS n FROM chat_inputs WHERE run_id=? AND state IN ('queued','dispatching','unknown')").get(item.runId).n>=32)throw failure('QUOTA_EXCEEDED');put({...item,state:'queued'});return get(item.id);}
  const prior=get(id);if(!prior)throw Error('NOT_FOUND');
  const transitions={queued:['dispatching','failed'],dispatching:['delivered','unknown','failed','queued'],unknown:['delivered']};
  if(state==='dispatching'&&(prior.held||policy(prior.runId).paused))throw failure('BUSY');
  if(!transitions[prior.state]?.includes(state))throw Error('CONFLICT');const updated={...prior,state,...(target?{target}:{}),error};put(updated);return updated;
 });}};
}
class ChatInputs{
 constructor({database,runtime,validate,publish}){Object.assign(this,{database,runtime,validate,publish});this.owners=new Map();this.inflight=new Map();this.locks=new Map();}
 serial(runId,fn){const old=this.locks.get(runId)||Promise.resolve(),work=old.catch(()=>{}).then(fn),tail=work.catch(()=>{});this.locks.set(runId,tail);void tail.then(()=>{if(this.locks.get(runId)===tail)this.locks.delete(runId);});return work;}
 checkRun(runId,{readOnly=false}={}){if(typeof runId!=='string'||!runId||runId.length>128)throw failure('INVALID_ARGUMENT');const run=this.runtime.runs?.find(r=>r.id===runId);if(!run)throw failure('NOT_FOUND','聊天不存在');if(run.archivedAt&&!readOnly)throw failure('FORBIDDEN','请先还原聊天');return run;}
 async validateItem(item){if(item.source==='user'){this.checkRun(item.runId);if(typeof item.text!=='string'||!item.text.trim()||item.text.length>20000||Buffer.byteLength(item.text)>65536)throw failure('INVALID_ARGUMENT');}else await this.validate(item);}
 async append(input,owner){
  if(!input||Object.keys(input).some(k=>!['runId','clientMutationId','text'].includes(k))||typeof input.clientMutationId!=='string'||!input.clientMutationId||input.clientMutationId.length>128||typeof input.text!=='string'||!input.text.trim()||input.text.length>20000||Buffer.byteLength(input.text)>65536)throw failure('INVALID_ARGUMENT');
  this.checkRun(input.runId);const id='user:'+createHash('sha256').update(JSON.stringify([input.runId,input.clientMutationId])).digest('hex');
  return this.serial(input.runId,()=>this.enqueue({id,runId:input.runId,text:input.text,source:'user'},owner));
 }
 async snapshot(runId){this.checkRun(runId,{readOnly:true});const value=await this.database.call('chatInput',{action:'snapshot',runId});return {policy:{paused:value.policy.paused,generation:value.policy.generation},deliveries:value.deliveries};}
 pause(runId){return this.serial(runId,async()=>{const result=await this.database.call('chatInput',{action:'pause',runId});this.publish(runId);return result;});}
 async resume(input){
  if(!input||Object.keys(input).some(k=>!['runId','clientMutationId','expectedPolicyGeneration','deliveryIds'].includes(k))||typeof input.clientMutationId!=='string'||!input.clientMutationId||input.clientMutationId.length>128||!Number.isSafeInteger(input.expectedPolicyGeneration)||input.expectedPolicyGeneration<0||!Array.isArray(input.deliveryIds)||input.deliveryIds.length>32||new Set(input.deliveryIds).size!==input.deliveryIds.length||input.deliveryIds.some(id=>typeof id!=='string'||!id||id.length>128))throw failure('INVALID_ARGUMENT');
  this.checkRun(input.runId);return this.serial(input.runId,async()=>{const value=await this.database.call('chatInput',{action:'resume',runId:input.runId,clientMutationId:input.clientMutationId,expectedGeneration:input.expectedPolicyGeneration,deliveryIds:input.deliveryIds});this.publish(input.runId);this.tick();return {paused:value.paused,generation:value.generation};});
 }
 async initialize(){await this.database.call('chatInput',{action:'recover'});this.timer=setInterval(()=>this.tick(),500);this.timer.unref?.();this.tick();}
 async enqueue(item,owner){const saved=await this.database.call('chatInput',{action:'enqueue',item});if(saved.state==='queued')this.owners.set(item.id,owner);this.publish(item.runId);this.tick();return saved;}
 get(id){return this.database.call('chatInput',{action:'get',id});}
 async update(id,state,error,target){const item=await this.database.call('chatInput',{action:'update',id,state,error,target});this.publish(item.runId);return item;}
 tick(){if(this.closed||this.poll)return;this.poll=this.drain().catch(()=>{}).finally(()=>{this.poll=null;});}
 async repairActive(runId){return !!this.runtime.contexts&&[...this.runtime.contexts.values()].some(c=>c.run?.id===runId||c.requestRunId===runId);}
 async acquireRepair(item){
  const leases=await this.database.call('chatInput',{action:'repairLeases'}),lease=leases.find(value=>value.item.managedRepair.projectKey===item.managedRepair.projectKey);let replaces;
  if(lease&&lease.item.id!==item.id){
   if(lease.state!=='unknown')throw failure('BUSY');
   const priorRun=this.runtime.runs?.find(run=>run.id===lease.item.runId);
   if(await this.repairActive(lease.item.runId)||['preparing','running','waiting','stopping'].includes(priorRun?.status))throw failure('BUSY');
   if(!Repair.canReplaceUnknown(item.managedRepair,lease.item))throw failure('MANAGED_REPAIR_REVIEW_REQUIRED','项目中上次修复结果待复查；请使用新的审查报告，并关联原提交。');
   // A new explicit user action may replace uncertainty only after its new baseline validates.
   await this.validateItem(item);replaces=lease.item.id;
  }
  await this.database.call('chatInput',{action:'repairAcquire',id:item.id,replaces});
 }
 async reapRepairs(){for(const lease of await this.database.call('chatInput',{action:'repairLeases'})){
  if(lease.state!=='active'||!lease.item.target?.turnKey||await this.repairActive(lease.item.runId))continue;
  const run=this.runtime.runs?.find(value=>value.id===lease.item.runId);
  if(!run||!['preparing','running','waiting','stopping'].includes(run.status)){
   // A later ordinary turn can replace the runtime's latest terminal marker before
   // this poll. Never leave that lease active forever or infer the old outcome.
   const finished=run?.terminalTurnId===lease.item.target.turnKey&&run.status==='completed';
   await this.database.call('chatInput',{action:'repairRelease',id:lease.item.id,outcome:finished?'finished':'reviewRequired'});this.publish(lease.item.runId);
  }
 }}
 async drain(){await this.reapRepairs();for(const item of await this.database.call('chatInput',{action:'list'})){
  if(this.closed)return;if(this.inflight.has(item.runId))continue;if(!await this.database.call('chatInput',{action:'canDispatch',id:item.id}))continue;
  const work=this.deliver(item).catch(()=>{}).finally(()=>this.inflight.delete(item.runId));this.inflight.set(item.runId,work);
 }}
 async deliver(item){let dispatched=false,repairAcquired=false;
  try{if(item.managedRepair){await this.acquireRepair(item);repairAcquired=true;}await this.validateItem(item);if(this.closed){if(repairAcquired)await this.database.call('chatInput',{action:'repairRelease',id:item.id,outcome:'unsent'});return;}
   const onDispatch=async target=>{if(this.closed)throw failure('BUSY');await this.validateItem(item);if(item.managedRepair&&!await this.database.call('chatInput',{action:'repairAssert',id:item.id}))throw failure('MANAGED_REPAIR_REVIEW_REQUIRED','修复执行占用已变化，请重新审查。');await this.update(item.id,'dispatching',undefined,target);dispatched=true;};
   const dispatch=(target,send)=>this.serial(item.runId,async()=>{await onDispatch(target);return {receipt:send()};});
   await this.runtime.deliverFormInput(item,{owner:this.owners.get(item.id),onDispatch,dispatch});
   await this.update(item.id,'delivered');this.owners.delete(item.id);
  }catch(error){
   if(item.managedRepair&&!repairAcquired&&!['BUSY','CANCELLED'].includes(error.code))await this.database.call('chatInput',{action:'repairReject',id:item.id,outcome:error.code==='MANAGED_REPAIR_REVIEW_REQUIRED'?'reviewRequired':error.code==='MANAGED_REPAIR_CONFLICT'?'conflict':'failed'});
   if(repairAcquired)await this.database.call('chatInput',{action:'repairRelease',id:item.id,outcome:dispatched&&!(error.rpcRejected&&error.turnBoundary)?'reviewRequired':error.code==='MANAGED_REPAIR_CONFLICT'?'conflict':['BUSY','CANCELLED'].includes(error.code)||error.holdInput||error.turnBoundary?'unsent':'failed'});
   if(!dispatched&&error.holdInput){await this.database.call('chatInput',{action:'hold',id:item.id});this.publish(item.runId);return;}if(!dispatched&&['BUSY','CANCELLED'].includes(error.code))return;
   // A transport failure after dispatch never becomes an automatic resend.
   if(dispatched&&error.rpcRejected&&error.turnBoundary){await this.update(item.id,'queued');return;}
   const uncertain=dispatched&&!(error.rpcRejected&&error.code===-32602);
   await this.update(item.id,uncertain?'unknown':'failed',uncertain?'OUTCOME_UNKNOWN':error.message);this.owners.delete(item.id);
  }
 }
 async reconcile(id){const item=await this.get(id);if(item?.state!=='unknown')return item;await this.validateItem(item);if(await this.runtime.hasFormInput(item))return this.update(id,'delivered');return item;}
 async shutdown(){this.closed=true;clearInterval(this.timer);await this.poll;await Promise.allSettled(this.inflight.values());}
}
module.exports={schema,handlers,ChatInputs};
