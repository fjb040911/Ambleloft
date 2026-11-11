const {randomUUID}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const {redact}=require('./provider.cjs');
const live=new Set(['pending','running','waiting']);
const validate=input=>{if(!input||!['default','full'].includes(input.permission))throw Error('权限模式无效');if(input.permission==='full'&&input.confirmed!==true)throw Error('请先确认允许完全访问');};
const policy=(permission,remote)=>({sandbox:!remote&&permission==='full'?'danger-full-access':'read-only',sandboxPolicy:{type:!remote&&permission==='full'?'dangerFullAccess':'readOnly'},approvalPolicy:remote||permission==='full'?'never':'on-request'});

async function switchPermission(input,change){
 if(!change)validate(input);
 const label=change?'模型':'权限';
 const run=this.runs.find(r=>r.id===input.runId),context=[...this.contexts.values()].find(c=>c.run===run&&!c.done);
 if(!run||run.archivedAt||!context||context.cancelled||this.closing)throw Error('任务当前不可切换权限');
 if(context.permissionTransition)throw Error('权限正在切换，请等待结果');
 if(run.collaboration)await this.spaces?.authorizeRun(run);
 // Recheck after authorization: only one transition may own this context.
 if(context.permissionTransition||context.done||context.cancelled)throw Error('任务状态已变化，请重试');
 const transition={phase:'pausing',completed:new Map(),controller:new AbortController()};context.permissionTransition=transition;
 const record={id:randomUUID(),requested:change?.requested||input.permission,previous:change?.previous||run.permission||'default',state:'switching',effective:null,startedAt:new Date().toISOString()};run[change?'modelChange':'permissionChange']=record;
 const check=()=>{if(context.cancelled||context.done||transition.controller.signal.aborted||this.closing)throw Error('权限切换已停止');};
 const archived=new Set();
 const deadline=Date.now()+(this.permissionTimeoutMs||30000);
 const wait=async()=>{check();if(Date.now()>deadline)throw Error('未能确认执行已暂停；权限未确认生效');await delay(25,undefined,{signal:transition.controller.signal});};
 this.changed(run);
 try{
  await this.persist();
  // Preparation keeps its original permissions until there is a confirmed engine turn.
  while(!run.threadId||!run.turnId||!context.rpc)await wait();check();
  let rpc=context.rpc;const p=policy(input.permission,context.remoteProject);
  const request=async(method,args)=>{check();const result=await rpc.call(method,args,Math.max(1,deadline-Date.now()));check();return result;};
  // Pause host tools as well as engine tools. Abort is not proof of completion:
  // the channel must drain before any permission change is advertised.
  const channelPause=context.extensionChannel?.pause();
  channelPause?.catch(()=>{});
  for(const answer of context.remoteApprovals?.values()||[])answer(false);
  const targets=new Map();
  async function suspend(threadId,tool){
   if(targets.has(threadId))return;
   const target={threadId,tool,resume:!tool||live.has(tool.status),turnId:tool?.nativeTurnId||(!tool?run.turnId:null)};targets.set(threadId,target);
   if(tool&&!live.has(tool.status)){target.resume=false;return;}
   if(!target.turnId){
    const read=await request('thread/read',{threadId,includeTurns:true});
    const active=read.thread.turns?.findLast(t=>t.status==='inProgress');
    if(active)target.turnId=active.id;
    else if(read.thread.turns?.length){target.resume=!tool;if(tool)tool.status=read.thread.turns.at(-1).status==='completed'?'completed':'interrupted';return;}
   }
   if(!target.turnId){target.resume=!tool;return;}
   // Register before interrupting: completion notification may precede the reply.
   while(!transition.completed.has(target.turnId)){
    try{await request('turn/interrupt',{threadId,turnId:target.turnId});break;}
    catch(e){if(context.cancelled||context.done)throw e;if(transition.completed.has(target.turnId))break;if(e.rpcRejected&&/no active turn/i.test(e.message)){await wait();continue;}throw e;}
   }
   while(!transition.completed.has(target.turnId))await wait();
   if(tool&&transition.completed.get(target.turnId)==='completed')target.resume=false;
  }
  await suspend(run.threadId);
  // A child may have spawned another child while its parent was being paused.
  while([...context.nativeThreads?.keys()||[]].some(id=>!targets.has(id))){for(const tool of [...context.nativeThreads.values()])await suspend(tool.nativeThreadId,tool);}
  if(channelPause)await channelPause;check();
  transition.phase='configuring';
  // Loaded threads ignore thread/resume configuration overrides in the bundled
  // engine. Unload and restore the same IDs after all work has quiesced.
  for(const target of [...targets.values()].reverse()){await request('thread/archive',{threadId:target.threadId});archived.add(target.threadId);}
  for(const target of targets.values()){await request('thread/unarchive',{threadId:target.threadId});archived.delete(target.threadId);}
  if(change){await change.reconnect(context,check);rpc=context.rpc;check();}
  for(const target of targets.values()){
   const applied=await request('thread/resume',{...(!target.tool?context.engineParameters:{}),threadId:target.threadId,...(change?change.parameters(context,target):{}),sandbox:p.sandbox,approvalPolicy:p.approvalPolicy,excludeTurns:true});
   if(change&&!change.matches(applied))throw Error('引擎未确认请求的模型，已停止续跑');
   if(applied.sandbox?.type!==p.sandboxPolicy.type||applied.approvalPolicy!==p.approvalPolicy)throw Error('引擎未确认请求的权限，已停止续跑');
  }
  if(change)change.commit(context);else run.permission=input.permission;
  // Keep durable forms, queued answers, original turn attribution and child IDs.
  // Native RPC questions from the interrupted turn are retained in message history.
  run.approvals=[];run.questions=[];run.turnId=null;
  for(const target of targets.values())if(target.tool)target.tool.nativeTurnId=undefined;
  transition.phase='resuming';context.extensionChannel?.resume();
  const pendingUpdates=(run.conversation?.updates||[]).filter(u=>u.turnKey===context.turnKey&&u.action==='execute'&&u.state==='delivered').map(u=>({version:u.version,text:run.messages.find(m=>(m.userInputId||m.formSubmissionId)===u.inputId)?.text}));
  const unresolvedQuestions=run.messages.filter(m=>m.inputRecord?.state==='pending').flatMap(m=>m.inputRecord.questions.map(q=>q.label));
  const prompt='Unanswered native questions (expired RPCs; ask again if still needed): '+JSON.stringify(unresolvedQuestions)+'\nThe user changed '+(change?'the execution model':'execution permissions')+' through the host. Continue the existing task from the recorded progress; do not restart completed work. Verify outcomes of interrupted operations before retrying. Preserve all requirements and pending user forms; do not infer answers. Existing subagent IDs remain valid. Pending versioned updates: '+JSON.stringify(pendingUpdates);
  for(const target of [...targets.values()].sort((a,b)=>Number(!a.tool)-Number(!b.tool))){
   if(!target.resume)continue;
   const started=await request('turn/start',{threadId:target.threadId,...(change?{model:change.requested.model}:{}),sandboxPolicy:p.sandboxPolicy,approvalPolicy:p.approvalPolicy,input:[{type:'text',text:prompt}]});
   if(!started.turn?.id)throw Error('引擎未确认恢复执行');
   if(target.tool){target.tool.nativeTurnId=started.turn.id;target.tool.status='running';}else run.turnId=started.turn.id;
  }
  record.state='applied';record.effective=change?.requested||input.permission;record.finishedAt=new Date().toISOString();
  context.permissionTransition=null;run.status=run.approvals.length||run.questions.some(q=>q.blocking)?'waiting':'running';this.changed(run);await this.persist();
  if(transition.finalNotification)this.notification(context,transition.finalNotification);
  this.chatInputs?.tick();return structuredClone(record);
 }catch(e){
  record.state='failed';record.error=redact(e.message,context.config?.apiKey).replaceAll('权限',label);record.finishedAt=new Date().toISOString();record.effective=null;
  for(const threadId of archived)try{await context.rpc.call('thread/unarchive',{threadId},5000);}catch{}
  context.permissionTransition=null;
  // Never silently resume with a mixture of old and new child policies.
  await this.stop(run.id);this.changed(run);await this.persist();
  return structuredClone(record);
 }
}
function permissionNotification(context,message){
 const transition=context.permissionTransition;if(!transition)return false;
 if(message.method==='turn/completed'){
  const old=transition.completed.has(message.params.turn.id);
  transition.completed.set(message.params.turn.id,message.params.turn.status);
  if(message.params.threadId===context.run.threadId){if(transition.phase==='resuming'&&!old)transition.finalNotification=message;return true;}
 }
 return false;
}
module.exports={switchPermission,permissionNotification,validate,policy};
