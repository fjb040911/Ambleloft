// Host-owned outbox: a confirmed form answer is a durable user input, not an approval.
const schema=`CREATE TABLE IF NOT EXISTS chat_inputs(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,state TEXT NOT NULL,data TEXT NOT NULL);CREATE INDEX IF NOT EXISTS chat_inputs_pending ON chat_inputs(state);`;
function handlers(db,transaction){
 const get=id=>{const row=db.prepare('SELECT data FROM chat_inputs WHERE id=?').get(id);return row?JSON.parse(row.data):null;};
 const put=item=>db.prepare('INSERT INTO chat_inputs VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data').run(item.id,item.runId,item.state,JSON.stringify(item));
 return {chatInput({action,id,item,state,error,target}){return transaction(()=>{
  if(action==='recover'){for(const row of db.prepare("SELECT data FROM chat_inputs WHERE state='dispatching'").all()){const v=JSON.parse(row.data);put({...v,state:'unknown',error:'OUTCOME_UNKNOWN'});}return;}
  if(action==='list')return db.prepare("SELECT data FROM chat_inputs WHERE state='queued' ORDER BY rowid").all().map(r=>JSON.parse(r.data));
  if(action==='get')return get(id);
  if(action==='enqueue'){const prior=get(item.id);if(prior){if(prior.runId!==item.runId||prior.text!==item.text||prior.flowId!==item.flowId)throw Error('CONFLICT');return prior;}put({...item,state:'queued'});return get(item.id);}
  const prior=get(id);if(!prior)throw Error('NOT_FOUND');
  const transitions={queued:['dispatching','failed'],dispatching:['delivered','unknown','failed','queued'],unknown:['delivered']};
  if(!transitions[prior.state]?.includes(state))throw Error('CONFLICT');const updated={...prior,state,...(target?{target}:{}),error};put(updated);return updated;
 });}};
}
class ChatInputs{
 constructor({database,runtime,validate,publish}){Object.assign(this,{database,runtime,validate,publish});this.owners=new Map();this.inflight=new Map();}
 async initialize(){await this.database.call('chatInput',{action:'recover'});this.timer=setInterval(()=>this.tick(),500);this.timer.unref?.();this.tick();}
 async enqueue(item,owner){const saved=await this.database.call('chatInput',{action:'enqueue',item});if(saved.state==='queued')this.owners.set(item.id,owner);this.tick();return saved;}
 get(id){return this.database.call('chatInput',{action:'get',id});}
 async update(id,state,error,target){const item=await this.database.call('chatInput',{action:'update',id,state,error,target});this.publish();return item;}
 tick(){if(this.closed||this.poll)return;this.poll=this.drain().catch(()=>{}).finally(()=>{this.poll=null;});}
 async drain(){for(const item of await this.database.call('chatInput',{action:'list'})){
  if(this.closed)return;if(this.inflight.has(item.runId))continue;
  const work=this.deliver(item).catch(()=>{}).finally(()=>this.inflight.delete(item.runId));this.inflight.set(item.runId,work);
 }}
 async deliver(item){let dispatched=false;
  try{await this.validate(item);if(this.closed)return;
   await this.runtime.deliverFormInput(item,{owner:this.owners.get(item.id),onDispatch:async target=>{if(this.closed)throw Object.assign(Error('BUSY'),{code:'BUSY'});await this.validate(item);await this.update(item.id,'dispatching',undefined,target);dispatched=true;}});
   await this.update(item.id,'delivered');this.owners.delete(item.id);
  }catch(error){if(!dispatched&&error.code==='BUSY')return;
   // A transport failure after dispatch never becomes an automatic resend.
   if(dispatched&&error.rpcRejected&&error.turnBoundary){await this.update(item.id,'queued');return;}
   const uncertain=dispatched&&!(error.rpcRejected&&error.code===-32602);
   await this.update(item.id,uncertain?'unknown':'failed',uncertain?'OUTCOME_UNKNOWN':error.message);this.owners.delete(item.id);
  }
 }
 async reconcile(id){const item=await this.get(id);if(item?.state!=='unknown')return item;await this.validate(item);if(await this.runtime.hasFormInput(item))return this.update(id,'delivered');return item;}
 async shutdown(){this.closed=true;clearInterval(this.timer);await this.poll;await Promise.allSettled(this.inflight.values());}
}
module.exports={schema,handlers,ChatInputs};
