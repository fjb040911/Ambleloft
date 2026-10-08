const {randomUUID,createHash}=require('node:crypto');
const {compileCondition}=require('./condition.cjs');const {failure}=require('./hosts.cjs');
const codeOf=e=>e.code||String(e.message).split(':')[0];
function redactInput(value){if(Array.isArray(value))return value.map(redactInput);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/secret|token|password|credential|authorization|api.?key/i.test(k)?'[redacted]':redactInput(v)]));return value;}
class OperationRouter{
 constructor({service,confirm,workspace,publishWorkspace,openConversation}){Object.assign(this,{service,confirm,workspace,publishWorkspace,openConversation});this.pending=new Set();}
 item(id){const item=this.service.items.find(i=>i.kind==='package'&&i.manifest.operations?.some(op=>op.id===id));if(!item)throw failure('NOT_FOUND','Operation not found');if(!item.enabled||!item.trusted||item.pending)throw failure('FORBIDDEN','Extension unavailable');return item;}
 async check(binding){const {context,operation,input,item}=binding;await context.validate?.();if(context.signal?.aborted)throw failure('CANCELLED','Cancelled');const current=this.item(operation.id);if(current.generation!==item.generation||current.active!==item.active)throw failure('FORBIDDEN','Extension changed');
  if(!operation.exposeTo.includes(context.caller)||context.extensionId&&context.extensionId!==item.id)throw failure('FORBIDDEN','Operation is not exposed');
  if(operation.projectScoped&&(!binding.projectId||context.caller==='agent'&&context.projectId!==binding.projectId))throw failure('FORBIDDEN','Project mismatch');
  if(operation.projectScoped){if(!(await this.workspace.read()).projects.some(p=>p.id===binding.projectId)||context.canUseProject&&!context.canUseProject(binding.projectId))throw failure('FORBIDDEN','Project unavailable');}
  if(input.projectId!==undefined&&input.projectId!==binding.projectId)throw failure('FORBIDDEN','Project mismatch');
  const types={'project.exists':'boolean'},values={'project.exists':!!binding.projectId};for(const k of item.manifest.contextKeys||[]){types[k.key]=k.type;values[k.key]=this.service.hosts.entries.get(item.id)?.context[k.key]??k.default;}
  if(operation.enablement&&!compileCondition(operation.enablement,types)(values))throw failure('FORBIDDEN','Operation disabled');
  for(const capability of operation.requiredPermissions||[])await this.service.check({id:item.id,generation:item.generation,projectId:binding.projectId},capability,binding.projectId);
 }
 async list(context){const result=[];for(const item of this.service.items)for(const operation of item.manifest?.operations||[])try{const binding={item,operation,context,input:{},projectId:context.projectId};await this.check(binding);result.push({id:operation.id,title:this.service.localized(item,operation.title),description:this.service.localized(item,operation.description),inputSchema:operation.inputSchema,exposeTo:operation.exposeTo,...(operation._meta?{_meta:operation._meta}:{}),effect:operation.effect,risk:operation.risk});}catch{}return result;}
 invalidate(id){for(const b of this.pending)if(b.item.id===id)b.abort.abort();}
 async invoke(operationId,input,context){const requestId=randomUUID();let binding;
  try{
   const item=structuredClone(this.item(operationId)),operation=item.manifest.operations.find(op=>op.id===operationId);
   if(!await this.service.packages.validateValue(operation.inputSchema,input))throw failure('INVALID_ARGUMENT','Invalid operation input');
   input=structuredClone(input);const abort=new AbortController();const cancel=()=>abort.abort();context.signal?.addEventListener('abort',cancel,{once:true});
   binding={item,operation,input,context:{...context,signal:abort.signal},projectId:operation.projectScoped?(context.caller==='agent'?context.projectId:input.projectId):undefined,abort,cancel,sourceSignal:context.signal,started:false};this.pending.add(binding);if(context.signal?.aborted)abort.abort();await this.check(binding);
   const key='extensions.approval.'+createHash('sha256').update(JSON.stringify([item.id,item.active,item.generation,operation,context.caller,binding.projectId])).digest('hex');
   const eligible=operation.effect==='write'&&operation.projectScoped&&operation.risk?.reversible===true&&operation.risk.impacts.length===0&&JSON.stringify(redactInput(input))===JSON.stringify(input);
   const exempt=!context.form&&!context.message&&eligible&&await this.service.database.call('readSetting',{key});
   if(operation.effect==='write'&&!exempt){
    const projectName=binding.projectId?(await this.workspace?.read())?.projects.find(p=>p.id===binding.projectId)?.name:undefined;
    const answer=await this.confirm(binding,{kind:'operation',extensionName:this.service.displayName(item),extensionId:item.id,capabilities:operation.requiredPermissions||[],title:this.service.localized(item,operation.title),description:this.service.localized(item,operation.description),project:projectName||binding.projectId,caller:context.caller,impact:operation.risk?.impacts||[],input:redactInput(input),allowRemember:eligible&&!context.form&&!context.message});
    await this.check(binding);if(!answer||answer.cancel)throw failure('CANCELLED','Confirmation cancelled');
    if(answer.remember===true&&eligible&&!context.form&&!context.message)await this.service.database.call('writeSetting',{key,value:true});
   }
   await this.check(binding);
   const value=await this.service.hosts.invoke(item.id,operationId,input,{signal:abort.signal,caller:context.caller,form:context.form,message:context.message,projectId:binding.projectId,timeout:operation.timeoutMs,guard:()=>this.check(binding),onDispatch:async()=>{await context.onDispatch?.();binding.started=true;},resources:(method,params)=>this.resource(binding,method,params)});
   await this.check(binding);return {ok:true,value};
  }catch(error){const code=require('./errors.cjs').publicCode({code:codeOf(error)});return {ok:false,error:{code,message:code==='INTERNAL'?'Operation failed':code,requestId,effectStatus:binding?.started?'unknown':'notStarted'}};}
  finally{if(binding){binding.sourceSignal?.removeEventListener('abort',binding.cancel);this.pending.delete(binding);}}
 }
 async resource(b,method,params){await this.check(b);if(method==='requestSession'){if(!this.service.authentication)throw failure('UNSUPPORTED','Authentication unavailable');return this.service.authentication.requestSession({id:b.item.id,generation:b.item.generation},params?.resourceId,{...b.context,validate:()=>this.check(b)});}const cap={getProject:'projects.read',getProjectPath:'projects.path.read',createConversation:'conversations.create',openConversation:'conversations.open'}[method];if(!cap||!(b.operation.requiredPermissions||[]).includes(cap))throw failure('FORBIDDEN','Resource not declared by operation');if(method==='createConversation'&&b.operation.effect!=='write')throw failure('FORBIDDEN','Write requires write operation');
  await this.service.check({id:b.item.id,generation:b.item.generation,projectId:b.projectId},cap,b.projectId);
  if(!b.projectId)throw failure('FORBIDDEN','Project required');
  if(method==='openConversation'){if(b.context.caller==='agent')throw failure('INTERACTION_REQUIRED','Open the conversation from an interactive page');const ref=await this.workspace.resolveConversation(params?.conversationId);if(ref.projectId!==b.projectId)throw failure('FORBIDDEN','Project mismatch');await this.check(b);await this.openConversation(b.context,ref);return null;}
  if(params?.projectId!==b.projectId)throw failure('FORBIDDEN','Project mismatch');const project=(await this.workspace.read()).projects.find(p=>p.id===b.projectId);if(!project)throw failure('NOT_FOUND','Project not found');let value;
  if(method==='getProject')value={id:project.id,name:project.name,description:project.description||''};
  else if(method==='getProjectPath')value=project.path;
  else{if(typeof params.title!=='string'||!params.title.trim()||params.title.length>120||params.initialPrompt!==undefined&&(typeof params.initialPrompt!=='string'||params.initialPrompt.length>20000))throw failure('INVALID_ARGUMENT','Invalid conversation');
   // Serialized against revocation/update; mutation and authorization cannot interleave.
   value=await this.service.serial(async()=>{await this.check(b);const id=randomUUID();const state=await this.workspace.patch({changes:[{kind:'draft',action:'put',id,expectedRevision:null,value:{id,projectId:b.projectId,title:params.title,prompt:params.initialPrompt||'',modelId:'',status:'draft',createdAt:new Date().toISOString()}}]});this.publishWorkspace(state);return {id:state.tasks.find(t=>t.id===id).conversationId,projectId:b.projectId,state:'draft'};});
  }await this.check(b);return value;
 }
}
module.exports={OperationRouter,redactInput};
