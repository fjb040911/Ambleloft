const {generate}=require('./provider.cjs');
const fail=code=>{throw Object.assign(Error(code),{code});};
class AutomationService{
 constructor({database,extensions,providers,generate:request=generate}){this.database=database;this.extensions=extensions;this.providers=providers;this.request=request;this.controllers=new Map();}
 async initialize(){await this.database.call('automationRecover');this.timer=setInterval(()=>this.tick(),1000);this.timer.unref?.();this.tick();}
 async forExtension(context,method,input){
  if(method==='getTurn')return this.database.call('automationRead',{context,input});
  if(method==='getJob'){if(typeof input?.id!=='string')fail('INVALID_ARGUMENT');return this.database.call('automationGetJob',{context,id:input.id});}
  if(method!=='submit')fail('UNSUPPORTED');
  if(!input||typeof input.projectId!=='string'||typeof input.eventKey!=='string'||!input.eventKey.length||input.eventKey.length>200||typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>8000||!Array.isArray(input.turns)||input.turns.length<1||input.turns.length>10||Buffer.byteLength(JSON.stringify(input))>24000)fail('INVALID_ARGUMENT');
  // Validate the output schema itself through the packaged contract validator.
  try{await this.extensions.packages.validateValue(input.outputSchema,null);}catch{fail('INVALID_ARGUMENT');}
  const turns=[];for(const ref of input.turns){const turn=await this.database.call('automationRead',{context,input:ref});if(turn.projectId!==input.projectId)fail('FORBIDDEN');turns.push(turn);}
  if(Buffer.byteLength(JSON.stringify(turns))>48000)fail('QUOTA_EXCEEDED');
  const job=await this.database.call('automationSubmit',{context,input:{projectId:input.projectId,eventKey:input.eventKey,prompt:input.prompt,outputSchema:input.outputSchema,input:turns}});this.tick();return job;
 }
 async manage(input){
  if(input?.action==='policy'&&!input.policy?.paused){const list=await this.providers.list();const p=list.providers.find(p=>p.id===input.policy.providerId);if(!p||!p.models.includes(input.policy.model))fail('INVALID_ARGUMENT');}
  const value=await this.database.call('automationManage',input);
  if(input.action==='policy'&&input.policy.paused)for(const c of this.controllers.values())if(c.extensionId===input.id)c.abort.abort();
  this.tick();return value;
 }
 async reconcile(){await this.database.call('automationReconcile');for(const c of this.controllers.values()){const item=this.extensions.items.find(i=>i.id===c.extensionId);try{await this.extensions.check({id:c.extensionId,generation:item?.generation},'background.jobs',c.projectId);await this.extensions.check({id:c.extensionId,generation:item?.generation},'conversations.read',c.projectId);}catch{c.abort.abort();}}}
 tick(){if(this.closed)return;if(!this.eventWork)this.eventWork=this.deliver().catch(()=>{}).finally(()=>{this.eventWork=null;});if(!this.jobWork)this.jobWork=this.runJob().catch(()=>{}).finally(()=>{this.jobWork=null;});}
 async deliver(){
  const row=await this.database.call('automationNextEvent');if(!row||this.closed)return;
  const item=this.extensions.items.find(i=>i.id===row.extension_id),hook=item?.manifest.hooks?.find(h=>h.event===row.event.type);let ok=false;
  try{if(!hook)fail('NOT_FOUND');await this.extensions.hosts.invokeHook(item.id,hook,row.event,()=>this.extensions.check({id:item.id,generation:item.generation},'agent.hooks',row.project_id));ok=true;}catch{}
  await this.database.call('automationAck',{id:row.id,ok});
 }
 async runJob(){
  const job=await this.database.call('automationNextJob');if(!job||this.closed)return;
  let config;try{config=await this.providers.secret(job.providerId,job.model);}catch{await this.database.call('automationFinishJob',{id:job.id,status:'failed',error:'PROVIDER_UNAVAILABLE'});return;}
  if(this.closed||!await this.database.call('automationStartJob',{id:job.id}))return;
  if(this.closed){await this.database.call('automationReleaseJob',{id:job.id});return;}
  const abort=new AbortController();this.controllers.set(job.id,{extensionId:job.extensionId,projectId:job.projectId,abort});const timeout=setTimeout(()=>abort.abort(),120000);
  let outcome;
  try{const result=await this.request(config,job,abort.signal);if(!await this.extensions.packages.validateValue(job.outputSchema,result))outcome={status:'failed',error:'INVALID_OUTPUT'};else outcome={status:'succeeded',result};}
  catch(error){outcome={status:error.definitive?'failed':'unknown',error:error.definitive?(error.message==='INVALID_OUTPUT'?'INVALID_OUTPUT':'PROVIDER_REJECTED'):'OUTCOME_UNKNOWN'};}
  finally{clearTimeout(timeout);this.controllers.delete(job.id);}
  await this.database.call('automationFinishJob',{id:job.id,...outcome});
 }
 async shutdown(){this.closed=true;clearInterval(this.timer);for(const c of this.controllers.values())c.abort.abort();await Promise.allSettled([this.eventWork,this.jobWork]);}
}
module.exports={AutomationService};
