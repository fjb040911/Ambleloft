const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {stat}=require('node:fs/promises');
const {join,isAbsolute,basename}=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const Ajv=require('ajv');
const {generate}=require('../automation/provider.cjs');
const {normalizeDynamic}=require('../inputs/definition.cjs');
const {id,text}=require('./contract.cjs');
const {createContribution}=require('./discussion-contract.cjs');
const rules=readFileSync(join(__dirname,'skills/discussion-host/SKILL.md'),'utf8');
const ruleVersion='discussion-host-v3';
const live=new Set(['preparing','started','running','waiting','stopping']);
const str={type:'string',maxLength:8000};
const array=(items,maxItems)=>({type:'array',items,maxItems});
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const itemSchema=object({id:{type:'string',minLength:1,maxLength:100},kind:{enum:['decision','proposal','question','verification']},text:str,sourceIds:array({type:'string'},20)});
const schema=object({action:{enum:['reply','ask','delegate','ready']},message:str,brief:object({goal:str,items:array(itemSchema,40)}),questions:array(object({label:str,help:str,type:{enum:['textarea','select']},options:array(object({label:str,value:{type:'string',maxLength:100}}),7),defaultValue:{type:'string',maxLength:2000}}),3),delegates:array(object({employeeId:{type:'string'},instruction:str,reason:str}),2)});
const validate=new Ajv({strict:false}).compile(schema);
function rootOf(requests,r){const seen=new Set();while(r?.replyTo&&!seen.has(r.id)){seen.add(r.id);const prev=requests.find(p=>p.id===r.replyTo&&p.spaceId===r.spaceId);if(!prev)break;r=prev;}return r?.id;}
function sourcesFor(snapshot,spaceId,root){
 return snapshot.requests.filter(r=>r.spaceId===spaceId&&rootOf(snapshot.requests,r)===root).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).flatMap(r=>[
  {id:r.id,kind:'user',text:r.prompt,...(r.composer?.attachments?.length?{attachments:r.composer.attachments}:{} )},
  ...(r.host?.steps||[]).map(step=>({id:step.id,kind:'host',text:step.text})),
  ...r.participants.map(p=>({id:p.contribution?.id||`${r.id}:${p.employeeId}`,kind:'expert',employeeId:p.employeeId,name:p.role?.name,status:p.status,text:p.output||'',runId:p.runId})),
 ]);
}
function abortable(promise,signal){return new Promise((resolve,reject)=>{const abort=()=>reject(Error('讨论已停止或超时 / Discussion stopped or timed out'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});}
function checked(result,sources,roster,used,budget){
 if(!validate(result)||!result.message.trim())throw Error('主持人返回格式无效 / Invalid host response');
 const refs=new Map(sources.map(s=>[s.id,s]));
 if(new Set(result.brief.items.map(i=>i.id)).size!==result.brief.items.length)throw Error('方案条目标识重复 / Duplicate brief item');
 for(const i of result.brief.items){
  if(!i.text.trim()||!i.sourceIds.length||i.sourceIds.some(id=>!refs.has(id)))throw Error('方案来源无效 / Invalid brief source');
  if(i.kind==='decision'&&!i.sourceIds.some(id=>refs.get(id).kind==='user'))throw Error('专家建议不能标记为用户决定 / A decision needs a user source');
 }
 if(result.action==='delegate'){
  if(!result.delegates.length||result.delegates.length>budget||new Set(result.delegates.map(d=>d.employeeId)).size!==result.delegates.length)throw Error('专家委派超出预算或重复 / Invalid delegation budget');
  for(const d of result.delegates)if(!roster.some(e=>e.id===d.employeeId)||used.has(d.employeeId)||!d.instruction.trim()||!d.reason.trim())throw Error('专家未授权或重复委派 / Unauthorized or repeated expert');
 }else if(result.delegates.length)throw Error('当前阶段不能委派 / Unexpected delegation');
 if((result.action==='ask')!==!!result.questions.length)throw Error('补充问题与阶段不符 / Invalid clarification stage');
 return result;
}
const methods={
 async coordinateDiscussion(input,hostContext={}){
  if(this.closing)throw Error('应用正在关闭');
  if(!id(input.clientRequestId)||input.permission&&!['default','full'].includes(input.permission))throw Error('请求无效');
  let prompt=text(input.prompt,'讨论内容',20000);
  this.hostJobs ||= new Map();
  const prepared=await this.change(async s=>{
   this.assertDiscussionAvailable(s,input.clientRequestId,input.replyTo);
   const existing=s.requests.find(r=>r.id===input.clientRequestId);
   if(existing){if(existing.spaceId!==input.spaceId||existing.prompt!==prompt)throw Error('请求标识已使用');return null;}
   const space=this.writable(s,input.spaceId),previous=input.replyTo?s.requests.find(r=>r.id===input.replyTo&&r.spaceId===space.id&&r.mode==='discussion'):null;
   if(input.replyTo&&!previous)throw Error('讨论来源不存在');
   const root=previous?rootOf(s.requests,previous):input.clientRequestId;
   if(s.discussionStates[root]?.status==='closed')throw Error('讨论已关闭');
   if(s.requests.some(r=>rootOf(s.requests,r)===root&&(r.host&&live.has(r.host.status)||r.participants.some(p=>live.has(this.runtime.runs.find(run=>run.id===p.runId)?.status||p.status)))))throw Error('上一轮尚未结束');
   if(s.requests.some(r=>rootOf(s.requests,r)===root&&r.documentRefs.some(ref=>s.documents.find(d=>d.id===ref.id)?.deletedAt)))throw Error('本讨论包含已撤回资料，请新建讨论并重新选择来源 / A source was withdrawn; start a new discussion');
   const refs=input.documentRefs||[];
   if(!Array.isArray(refs)||refs.length>8||new Set(refs.map(r=>r.id)).size!==refs.length)throw Error('资料选择无效');
   const documents=refs.map(ref=>{const d=s.documents.find(d=>d.id===ref.id&&d.spaceId===space.id&&!d.deletedAt),v=d?.versions.find(v=>v.revision===(ref.revision||d.revision));if(!v||ref.hash&&ref.hash!==v.hash)throw Error('资料版本已变化');return {id:d.id,title:v.title||d.title,revision:v.revision,hash:v.hash};});
   const prior=s.requests.filter(r=>rootOf(s.requests,r)===root&&r.host?.brief).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).at(-1);
   // Validate before saving the message or consuming a clarification answer.
   // The host sees paths, never silently crawls or uploads an attached directory.
   const attachments=input.attachments||[],selectedSkillIds=input.selectedSkillIds||[];
   if(!Array.isArray(attachments)||attachments.length>50)throw Error('最多添加 50 个文件或文件夹 / Select at most 50 attachments');
   for(const file of attachments){if(!file||typeof file.path!=='string'||!isAbsolute(file.path)||file.path.length>4096)throw Error('附件路径无效 / Invalid attachment path');await stat(file.path);}
   if(!Array.isArray(selectedSkillIds)||selectedSkillIds.length>20||selectedSkillIds.some(id=>typeof id!=='string'))throw Error('最多选择 20 个技能 / Select at most 20 skills');
   if(selectedSkillIds.length&&!this.workforce.skills?.prepare)throw Error('技能服务不可用 / Skill service unavailable');
   const skills=selectedSkillIds.length?(await this.workforce.skills.prepare(selectedSkillIds)).snapshots:[];
   const composer={permission:input.permission||'default',attachments:attachments.map(file=>({name:basename(file.path),path:file.path})),selectedSkillIds:[...new Set(selectedSkillIds)],skills};
   if(input.answerTo&&(!previous?.host?.question||previous.id!==input.answerTo||previous.host.question.answeredBy))throw Error('补充问题已变化，请重新查看');
   if(input.answerTo){
    const normalized=normalizeDynamic(previous.host.question),checked=require('../forms/template.cjs').validateValues(normalized.template.steps[0],input.answers||{});
    if(Object.keys(checked.errors).length)throw Error('请完整补充问题 / Complete the requested fields');
    prompt=normalized.template.steps[0].fields.map(f=>f.label+'：'+(f.options?.find(o=>o.value===checked.values[f.name])?.label||checked.values[f.name]||'')).join('\n');
    previous.host.question.answers=checked.values;
   }
   if(previous?.host?.question&&!previous.host.question.answeredBy)previous.host.question.answeredBy=input.clientRequestId;
   const r={id:input.clientRequestId,spaceId:space.id,prompt,mode:'discussion',projectId:null,replyTo:previous?.id||null,round:(previous?.round||0)+1,createdAt:new Date().toISOString(),documentRefs:documents,participants:[],discussion:{schemaVersion:1,id:root,mode:'host',provenance:'recorded'},host:{status:'preparing',ruleVersion,revision:1,steps:[],brief:prior?.host.brief||null}};
   r.composer=composer;s.requests.unshift(r);return {request:r,space};
  });
  if(!prepared)return this.snapshot();
  const controller=new AbortController(),job={controller,requestId:input.clientRequestId,spaceId:input.spaceId,promise:null};
  this.hostJobs.set(input.clientRequestId,job);this.spaceLocks.set(input.spaceId,(this.spaceLocks.get(input.spaceId)||0)+1);
  job.promise=coordinate.call(this,prepared,input,hostContext,controller.signal).catch(async error=>{
   controller.abort();
   const current=(await this.snapshot()).requests.find(r=>r.id===input.clientRequestId);
   await Promise.allSettled((current?.participants||[]).filter(p=>p.runId&&live.has(p.status)).map(p=>this.runtime.stop(p.runId)));
   await this.change(s=>{const r=s.requests.find(r=>r.id===input.clientRequestId);if(r?.host){r.host.status=job.stopped?'interrupted':'failed';r.host.error=error.message;r.host.revision++;for(const p of r.participants)if(live.has(p.status)){p.status=r.host.status;p.error ||= error.message;}}});
  }).finally(()=>{this.hostJobs.delete(input.clientRequestId);const n=this.spaceLocks.get(input.spaceId)-1;if(n)this.spaceLocks.set(input.spaceId,n);else this.spaceLocks.delete(input.spaceId);this.publish();});
  return this.snapshot();
 },
 async stopDiscussionHost({requestId}){
  const job=this.hostJobs?.get(requestId);if(job){job.stopped=true;job.controller.abort();}
  const r=(await this.read()).requests.find(r=>r.id===requestId);if(!r?.host)return {stopped:false};
  await Promise.allSettled(r.participants.filter(p=>p.runId).map(p=>this.runtime.stop(p.runId)));
  if(job)await job.promise;
  return {stopped:!!job};
 }
};
async function coordinate({request,space},input,hostContext,signal){
 const composer=request.composer;
 const selectedSkills=composer.skills.map(({id,name,description,body})=>({id,name,description,instructions:body}));
 const update=fn=>this.change(s=>{signal.throwIfAborted();const current=this.writable(s,space.id);if(current.revision!==space.revision)throw Error('空间分工已变化，请继续讨论以重新协调');if(s.discussionStates[request.discussion.id]?.status==='closed')throw Error('讨论已关闭');if(request.documentRefs.some(ref=>s.documents.find(d=>d.id===ref.id)?.deletedAt))throw Error('引用资料已撤回，请重新选择');const r=s.requests.find(r=>r.id===request.id);fn(r);r.host.revision++;return r;});
 const documents=await Promise.all(request.documentRefs.map(async ref=>{const d=await this.document(ref);return {id:d.id,title:d.title,revision:d.revision,hash:d.hash,state:d.state,body:d.body};}));
 const projects=(await this.workspace.read()).projects.filter(p=>space.projectIds.includes(p.id)).map(p=>({id:p.id,name:p.name,type:p.type||'local',environment:p.environment?.kind||null}));
 const employees=(await this.workforce.read()).employees;
 const roster=space.members.flatMap(m=>{const e=employees.find(e=>e.id===m.employeeId);return e?[{id:e.id,name:e.name,responsibilities:e.responsibilities,methods:e.methods,deliverables:e.deliverables,skills:(e.skills||[]).map(s=>({name:s.name,purpose:s.purpose})),assignment:m.assignment,projectIds:m.projectIds}]:[];});
 const config=await abortable(this.workforce.providers.secret(input.providerId,input.model),AbortSignal.any([signal,AbortSignal.timeout(this.hostTimeoutMs||90000)]));
 await update(r=>{r.host.status='running';r.host.model=config.model||input.model||null;r.host.providerId=config.id||input.providerId||null;});
 const used=new Set();
 for(let pass=0;pass<5;pass++){
  signal.throwIfAborted();
  const snapshot=await this.snapshot(),sources=sourcesFor(snapshot,space.id,request.discussion.id),current=snapshot.requests.find(r=>r.id===request.id);
  // Never silently discard earlier decisions or the beginning of an expert response.
  if(JSON.stringify({sources,documents,roster,projects,selectedSkills}).length>240000)throw Error('讨论资料超过单次上下文上限，请缩小引用范围 / Discussion exceeds the context limit');
  const callSignal=AbortSignal.any([signal,AbortSignal.timeout(this.hostTimeoutMs||90000)]);
  const activityId=randomUUID();let latestProgress={id:activityId,phase:'waiting',reasoning:'',reasoningFormat:'summary',startedAt:new Date().toISOString()},lastPublished=0,accepting=true;
  await update(r=>{r.host.activity=latestProgress;});
  const onProgress=async progress=>{
   if(!accepting||callSignal.aborted)return;
   latestProgress={...latestProgress,...progress};
   const now=Date.now();if(now-lastPublished<120)return;lastPublished=now;
   await update(r=>{if(accepting&&!callSignal.aborted&&r.host.activity?.id===activityId)r.host.activity={...latestProgress};});
  };
  let output;
  try{output=await abortable((this.generateDiscussionHost||generate)(config,{prompt:rules+'\n'+require('./task-guide.cjs').rules,input:{locale:input.locale==='zh-CN'?'zh-CN':'en',purpose:space.purpose,roster,projects,sources,documents,selectedSkills,brief:current.host.brief,usedExperts:[...used],remainingDelegations:pass===4?0:4-used.size},outputSchema:schema,maxOutputTokens:8192},callSignal,onProgress),callSignal);}
  finally{accepting=false;}
  const result=checked(output,sources,roster,used,pass===4?0:4-used.size);
  let question=null;
  if(result.questions.length){
   const fields=result.questions.map((q,i)=>({name:'answer'+i,type:q.type,label:q.label,help:q.help,required:true,...(q.type==='select'?{options:q.options}:{})}));
   question={requestKey:randomUUID(),reason:result.message,source:{kind:'dynamic',definition:{title:input.locale==='zh-CN'?'需要你确认':'Your input is needed',fields}},prefill:Object.fromEntries(result.questions.map((q,i)=>['answer'+i,q.defaultValue]).filter(([,v])=>v))};normalizeDynamic(question);
  }
  await update(r=>{r.host.activity={...latestProgress,phase:result.action==='delegate'?'experts':'complete'};r.host.brief=result.brief;r.host.steps.push({id:randomUUID(),text:result.message,action:result.action,brief:result.brief,at:new Date().toISOString()});r.host.question=question;r.host.status=result.action==='delegate'?'running':result.action==='ask'?'needs-input':result.action==='ready'?'ready':'completed';});
  if(result.action!=='delegate')return;
  const starts=[];
  for(const d of result.delegates){
   signal.throwIfAborted();used.add(d.employeeId);
   const member=space.members.find(m=>m.employeeId===d.employeeId),employee=employees.find(e=>e.id===d.employeeId);
   const priorDiscussion={requestId:request.id,prompt:request.prompt,responses:sources.filter(s=>s.kind==='expert'),sources,brief:result.brief,earlierRounds:[],historyTruncated:false};
   const contribution=createContribution({member,employee,request:{...request,prompt:d.instruction},space,docs:documents,historySpaceIds:[],priorDiscussion});
   const participant={employeeId:d.employeeId,status:'preparing',contribution,instruction:d.instruction,reason:d.reason};
   await update(r=>r.participants.push(participant));
   const collaboration={requestId:request.id,spaceId:space.id,spaceName:space.name,purpose:space.purpose,mode:'discussion',assignment:member.assignment,documents,historySpaceIds:[],priorDiscussion,discussionId:request.discussion.id,contributionId:contribution.id,hostDelegated:true,brief:result.brief,sources};
   const start=this.runtime.start({prompt:d.instruction,employeeId:d.employeeId,projectId:null,providerId:input.providerId,model:input.model,permission:composer.permission,attachments:composer.attachments,selectedSkillIds:composer.selectedSkillIds}, {...hostContext,userAuthored:false,collaboration});
   start.then(run=>{if(signal.aborted&&run?.id)void this.runtime.stop(run.id).catch(()=>{});},()=>{});
   starts.push(abortable(start,signal).then(run=>update(r=>{const p=r.participants.find(p=>p.employeeId===d.employeeId);p.runId=run.id;p.status=run.status||'started';p.execution={model:run.model||null};})).catch(async e=>{if(signal.aborted)throw e;await update(r=>{const p=r.participants.find(p=>p.employeeId===d.employeeId);p.status='failed';p.error=e.message;});}));
  }
  await Promise.all(starts);
  const waitSignal=AbortSignal.any([signal,AbortSignal.timeout(this.hostExpertTimeoutMs||600000)]);
  while(true){
   waitSignal.throwIfAborted();const s=await this.snapshot(),r=s.requests.find(r=>r.id===request.id);
   if(!r.participants.some(p=>live.has(p.status)))break;
   await delay(this.hostPollMs||500,undefined,{signal:waitSignal});
  }
  const after=(await this.snapshot()).requests.find(r=>r.id===request.id);
  if(after.participants.some(p=>p.status!=='completed')){await update(r=>{r.host.status='failed';r.host.error='专家分析未完成，请查看结果后继续 / Expert analysis incomplete; review before continuing';});return;}
 }
}
module.exports={discussionHostMethods:methods,ruleVersion,rules,schema,sourcesFor,checked,rootOf};
