const {redact}=require('./provider.cjs');
const live=status=>['pending','running','waiting'].includes(status);
const statuses={pendingInit:'pending',running:'running',completed:'completed',errored:'failed',interrupted:'interrupted',shutdown:'interrupted',notFound:'failed'};
class NativeSubagents {
 constructor(runtime){this.runtime=runtime;}
 changed(context){
  for(const tool of context.nativeThreads?.values()||[]){
   tool.nativeLifecycle ||= [];
   if(tool.nativeLifecycle.at(-1)?.status!==tool.status)tool.nativeLifecycle.push({status:tool.status,at:new Date().toISOString()});
   tool.nativeLifecycle=tool.nativeLifecycle.slice(-100);
   if(!live(tool.status))for(const activity of tool.nativeActivity||[])if(['running','inProgress','pending'].includes(activity.status))activity.status='interrupted';
  }
  this.runtime.changed(context.run);
 }
 child(context,id){return context.nativeThreads?.get(id);}
 register(context,id,prompt=''){
  context.nativeThreads??=new Map();let tool=context.nativeThreads.get(id);if(tool)return tool;
  const siblings=context.run.tools.filter(t=>t.nativeThreadId&&t.turnKey===context.turnKey);
  tool={id:'native-'+id+'-'+context.turnKey,type:'analysis',nativeThreadId:id,analysisAgent:{id,name:'Subagent '+id.slice(-8),avatar:siblings.length%6},analysisTitle:prompt.trim().split('\n')[0].replace(/^(?:Task|任务|职责)[:：]\s*/i,'').slice(0,80)||'Task execution',analysisTask:prompt,label:'Subagent '+id.slice(-8),status:'pending',detail:'',turnKey:context.turnKey,order:context.run.nextEventOrder=(context.run.nextEventOrder||0)+1};
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
  const item=params.item,clean=value=>redact(value||'',context.config.apiKey);
  if((parent||child)&&item?.type==='collabAgentToolCall'){
   if(parent&&params.turnId&&context.run.turnId&&params.turnId!==context.run.turnId)return true;
   for(const id of item.receiverThreadIds||[]){
    const state=item.agentsStates?.[id];
    let tool=this.child(context,id);
    // Lookup targets can be mistyped IDs. Only a successful spawn establishes identity.
    if(!tool&&item.tool==='spawnAgent'&&item.status==='completed'&&state?.status!=='notFound')tool=this.register(context,id,clean(item.prompt));
    if(!tool)continue;
    this.readIdentity(context,tool);
    if(state){if(!(!live(tool.status)&&['running','pendingInit'].includes(state.status)&&!['resumeAgent','sendInput'].includes(item.tool))&&!(state.status==='shutdown'&&tool.status==='completed')&&!(state.status==='pendingInit'&&tool.status!=='pending'))tool.status=statuses[state.status]||tool.status;if(state.message)tool.detail=clean(state.message);}
   }
   this.changed(context);return true;
  }
  if(!child)return false;
  if(method==='turn/started'){child.nativeTurnId=params.turn.id;child.status='running';}
  else if(params.turnId&&child.nativeTurnId&&params.turnId!==child.nativeTurnId)return true;
  else if(method==='item/agentMessage/delta'){
   if(child.status==='pending')child.status='running';
   child.nativeMessages??={};child.nativeMessages[params.itemId]=clean((child.nativeMessages[params.itemId]||'')+params.delta);child.detail=Object.values(child.nativeMessages).join('\n\n');
  }else if(method==='item/completed'&&item?.type==='agentMessage'){
   if(child.status==='pending')child.status='running';
   child.nativeMessages??={};child.nativeMessages[item.id]=clean(item.text);child.detail=Object.values(child.nativeMessages).join('\n\n');
  }else if(['item/started','item/completed'].includes(method)&&item&&!['agentMessage','reasoning'].includes(item.type)){
   child.nativeActivity ||= [];let activity=child.nativeActivity.find(a=>a.id===item.id);
   if(!activity){activity={id:item.id,title:clean(item.command||item.tool||item.type).slice(0,1000),text:'',status:'running'};child.nativeActivity.push(activity);child.nativeActivity=child.nativeActivity.slice(-100);}
   activity.status=method==='item/completed'?(item.status||'completed'):'running';
   if(item.aggregatedOutput||item.output)activity.text=clean(typeof (item.aggregatedOutput||item.output)==='string'?(item.aggregatedOutput||item.output):JSON.stringify(item.output)).slice(-50000);
  }else if(method==='item/commandExecution/outputDelta'){
   const activity=child.nativeActivity?.find(a=>a.id===params.itemId);if(activity)activity.text=clean(activity.text+(params.delta||'')).slice(-50000);
  }
  else if(method==='turn/completed'){
   if(child.nativeTurnId&&params.turn.id!==child.nativeTurnId)return true;
   child.status=params.turn.status==='completed'?'completed':params.turn.status==='interrupted'?'interrupted':'failed';if(params.turn.error?.message)child.detail=clean(params.turn.error.message);
  }else if(method==='serverRequest/resolved'){
   context.run.approvals=context.run.approvals.filter(a=>a.rpcId!==params.requestId);
   context.run.questions=(context.run.questions||[]).filter(q=>q.rpcId!==params.requestId);
   if(!context.cancelled)context.run.status=context.run.approvals.length||context.run.questions.some(q=>q.blocking)?'waiting':'running';
  }else return true;
  this.changed(context);return true;
 }
 async stop(id){
  for(const context of this.runtime.contexts.values())for(const tool of context.nativeThreads?.values()||[]){
   if(tool.id!==id)continue;if(context.done||!live(tool.status))return true;
   // Archive unloads the native child; the engine notifies its parent waiters.
   await context.rpc.call('thread/archive',{threadId:tool.nativeThreadId});
   tool.status='interrupted';this.changed(context);return true;
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
 finish(context){for(const lookup of context.nativeIdentity?.values()||[])clearTimeout(lookup.timer);for(const tool of context.nativeThreads?.values()||[])if(live(tool.status))tool.status='interrupted';this.changed(context);context.nativeThreads?.clear();}
 recover(run){for(const tool of run.tools||[])if(tool.type==='analysis'&&live(tool.status))tool.status='interrupted';}
}
module.exports={NativeSubagents};
