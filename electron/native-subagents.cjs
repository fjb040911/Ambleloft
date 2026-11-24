const {fields:streamFields,secrets:streamSecrets,cleanText}=require('./stream-redactor.cjs');
const {redact}=require('./provider.cjs');
const rpcText=require('./rpc-text.cjs');
const live=status=>['pending','running','waiting'].includes(status);
const statuses={pendingInit:'pending',running:'running',completed:'completed',errored:'failed',interrupted:'interrupted',shutdown:'interrupted',notFound:'failed'};
class NativeSubagents {
 constructor(runtime){this.runtime=runtime;}
 changed(context,stream=false,bytes=0){
  for(const tool of context.nativeThreads?.values()||[]){
   tool.nativeLifecycle ||= [];
   if(tool.nativeLifecycle.at(-1)?.status!==tool.status){stream=false;tool.nativeLifecycle.push({status:tool.status,at:new Date().toISOString()});}
   tool.nativeLifecycle=tool.nativeLifecycle.slice(-100);
   if(!live(tool.status))for(const activity of tool.nativeActivity||[])if(['running','inProgress','pending'].includes(activity.status))activity.status='interrupted';
  }
  this.runtime.changed(context.run,{stream,bytes,items:[...(context.nativeThreads?.values()||[])].map(tool=>['tools',tool.id])});
 }
 child(context,id){return context.nativeThreads?.get(id);}
 register(context,id,prompt=''){
  context.nativeThreads??=new Map();let tool=context.nativeThreads.get(id);if(tool)return tool;
  const siblings=context.run.tools.filter(t=>t.nativeThreadId&&t.turnKey===context.turnKey);
  const title=typeof prompt==='object'?rpcText.preview(context,prompt,'prompt',1000):prompt;
  tool={id:'native-'+id+'-'+context.turnKey,type:'analysis',nativeThreadId:id,analysisAgent:{id,name:'Subagent '+id.slice(-8),avatar:siblings.length%6},analysisTitle:title.trim().split('\n')[0].replace(/^(?:Task|任务|职责)[:：]\s*/i,'').slice(0,80)||'Task execution',analysisTask:typeof prompt==='string'?prompt:'',label:'Subagent '+id.slice(-8),status:'pending',detail:'',turnKey:context.turnKey,order:context.run.nextEventOrder=(context.run.nextEventOrder||0)+1};
  if(typeof prompt==='object')rpcText.copy(context,tool,'analysisTask',prompt,'prompt');
  context.run.tools.push(tool);context.nativeThreads.set(id,tool);
  this.readIdentity(context,tool);
  return tool;
 }
 readIdentity(context,tool){
  context.nativeIdentity??=new Map();
  let lookup=context.nativeIdentity.get(tool.nativeThreadId);
  if(!lookup){lookup={attempts:0};context.nativeIdentity.set(tool.nativeThreadId,lookup);}
  if(context.done||lookup.pending||lookup.timer||lookup.complete||lookup.attempts>=3)return;
  lookup.pending=true;lookup.attempts++;
  void context.rpc.call('thread/read',{threadId:tool.nativeThreadId,includeTurns:false}).then(({thread})=>{
   const name=thread.agentNickname||thread.source?.subAgent?.thread_spawn?.agent_nickname||thread.name;
   if(!name)throw Error('Thread metadata has no agent nickname');
   tool.analysisAgent.name=redact(name,context.config.apiKey);tool.label=tool.analysisAgent.name;delete tool.nativeIdentityError;lookup.complete=true;
  }).catch(error=>{
   tool.nativeIdentityError=redact(String(error.message||error),context.config.apiKey);
   if(!context.done&&lookup.attempts<3){lookup.timer=setTimeout(()=>{lookup.timer=null;this.readIdentity(context,tool);},lookup.attempts*500);lookup.timer.unref?.();}
  }).finally(()=>{lookup.pending=false;this.changed(context);});
 }
 notification(context,{method,params={}}){
  if(context.done||!context.run)return false;
  const parent=params.threadId===context.run.threadId;
  const child=this.child(context,params.threadId);
  const item=params.item,clean=value=>cleanText(context,value);
  if((parent||child)&&item?.type==='collabAgentToolCall'){
   if(parent&&params.turnId&&context.run.turnId&&params.turnId!==context.run.turnId)return true;
   for(const id of item.receiverThreadIds||[]){
    const state=item.agentsStates?.[id];
    let tool=this.child(context,id);
    // Lookup targets can be mistyped IDs. Only a successful spawn establishes identity.
    if(!tool&&item.tool==='spawnAgent'&&item.status==='completed'&&state?.status!=='notFound')tool=this.register(context,id,item);
    if(!tool)continue;
    this.readIdentity(context,tool);
    if(state){if(!(!live(tool.status)&&['running','pendingInit'].includes(state.status)&&!['resumeAgent','sendInput'].includes(item.tool))&&!(state.status==='shutdown'&&tool.status==='completed')&&!(state.status==='pendingInit'&&tool.status!=='pending'))tool.status=statuses[state.status]||tool.status;if(rpcText.length(state,'message'))rpcText.copy(context,tool,'detail',state,'message');}
   }
   this.changed(context);return true;
  }
  if(!child)return false;
  if(method!=='turn/started'&&params.turnId&&child.nativeTurnId&&params.turnId!==child.nativeTurnId)return true;
  const segment=require('./bridge-segments.cjs').segment({method,params});
  if(segment){
   if(child.status==='pending')child.status='running';
   if(segment.reasoning){
    child.nativeActivity??=[];let activity=child.nativeActivity.find(a=>a.id===segment.group);
    if(!activity){activity={id:segment.group,title:'Reasoning',text:'',status:'running'};child.nativeActivity.push(activity);child.nativeActivity=child.nativeActivity.slice(-100);}
    require('./bridge-segments.cjs').apply(context,{method,params},activity,'text');activity.status=method==='item/completed'?'completed':'running';
   }else{
    child.nativeMessages??={};require('./bridge-segments.cjs').apply(context,{method,params},child.nativeMessages,segment.group);
    streamFields(context).join(child,'detail',()=>Object.values(child.nativeMessages).join('\n\n'),params.threadId,()=>Object.keys(child.nativeMessages).map(key=>require('./text-spool.cjs').part(child.nativeMessages,key)));
   }
   this.changed(context,rpcText.isText(params,'delta'),rpcText.length(params,'delta')*2);return true;
  }
  if(method==='turn/started'){child.nativeTurnId=params.turn.id;child.status='running';}
  else if(params.turnId&&child.nativeTurnId&&params.turnId!==child.nativeTurnId)return true;
  else if(method==='item/agentMessage/delta'){
   if(child.status==='pending')child.status='running';
   child.nativeMessages??={};for(const part of rpcText.parts(params,'delta'))streamFields(context).append(child.nativeMessages,params.itemId,part,streamSecrets(context),{scope:params.threadId});streamFields(context).join(child,'detail',()=>Object.values(child.nativeMessages).join('\n\n'),params.threadId,()=>Object.keys(child.nativeMessages).map(key=>require('./text-spool.cjs').part(child.nativeMessages,key)));
  }else if(method==='item/completed'&&item?.type==='agentMessage'){
   if(child.status==='pending')child.status='running';
   child.nativeMessages??={};rpcText.copy(context,child.nativeMessages,item.id,item,'text');streamFields(context).join(child,'detail',()=>Object.values(child.nativeMessages).join('\n\n'),params.threadId,()=>Object.keys(child.nativeMessages).map(key=>require('./text-spool.cjs').part(child.nativeMessages,key)));
  }else if(['item/started','item/completed'].includes(method)&&item&&!['agentMessage','reasoning'].includes(item.type)){
   child.nativeActivity ||= [];let activity=child.nativeActivity.find(a=>a.id===item.id);
   if(!activity){activity={id:item.id,title:rpcText.length(item,'command')?rpcText.preview(context,item,'command',1000):clean(item.tool||item.type).slice(0,1000),text:'',status:'running'};child.nativeActivity.push(activity);child.nativeActivity=child.nativeActivity.slice(-100);}
   if(method==='item/completed')streamFields(context).flush(activity,'text');
   activity.status=method==='item/completed'?(item.status||'completed'):'running';
   if(rpcText.length(item,'aggregatedOutput'))rpcText.copy(context,activity,'text',item,'aggregatedOutput');
   else if(require('./text-spool.cjs').reference(item,'output')||typeof item.output==='string')rpcText.copy(context,activity,'text',item,'output');
   else if(item.output)rpcText.replace(context,activity,'text',rpcText.json(context,item.output));
  }else if(method==='item/commandExecution/outputDelta'){
   const activity=child.nativeActivity?.find(a=>a.id===params.itemId);if(activity)for(const part of rpcText.parts(params,'delta'))streamFields(context).append(activity,'text',part,streamSecrets(context),{limit:50000,scope:params.threadId});
  }
  else if(method==='turn/completed'){
   if(child.nativeTurnId&&params.turn.id!==child.nativeTurnId)return true;
   streamFields(context).finish(params.turn.status!=='completed',params.threadId);
   child.status=params.turn.status==='completed'?'completed':params.turn.status==='interrupted'?'interrupted':'failed';if(params.turn.error?.message)child.detail=clean(params.turn.error.message);
  }else if(method==='serverRequest/resolved'){
   context.run.approvals=context.run.approvals.filter(a=>a.rpcId!==params.requestId);
   context.run.questions=(context.run.questions||[]).filter(q=>q.rpcId!==params.requestId);
   if(!context.cancelled)context.run.status=context.run.approvals.length||context.run.questions.some(q=>q.blocking)?'waiting':'running';
  }else return true;
  this.changed(context,/\/(?:delta|outputDelta)$/.test(method),rpcText.length(params,'delta')*2);return true;
 }
 async stop(id){
  for(const context of this.runtime.contexts.values())for(const tool of context.nativeThreads?.values()||[]){
   if(tool.id!==id)continue;if(context.done||!live(tool.status))return true;
   // Archive unloads the native child; the engine notifies its parent waiters.
   await context.rpc.call('thread/archive',{threadId:tool.nativeThreadId});
   streamFields(context).finish(true,tool.nativeThreadId);tool.status='interrupted';this.changed(context);return true;
  }
  return false;
 }
 async stopAll(context){
  if(!context.rpc||context.rpc.closed)return;
  await Promise.allSettled([...context.nativeThreads?.values()||[]].filter(tool=>live(tool.status)).map(async tool=>{
   await context.rpc.call('thread/archive',{threadId:tool.nativeThreadId},5000);
   tool.status='interrupted';
  }));
 }
 finish(context){streamFields(context).finish(true);for(const lookup of context.nativeIdentity?.values()||[])clearTimeout(lookup.timer);for(const tool of context.nativeThreads?.values()||[])if(live(tool.status))tool.status='interrupted';this.changed(context);context.nativeThreads?.clear();}
 recover(run,onChange){for(const [index,tool] of (run.tools||[]).entries())if(tool.type==='analysis'&&live(tool.status)){tool.status='interrupted';onChange?.(String(tool.id||tool.turnKey||index));}}
}
module.exports={NativeSubagents};
