const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {randomUUID}=require('node:crypto');
const {id,text}=require('./contract.cjs');
const {shape}=require('./plans.cjs');
const {generate}=require('../automation/provider.cjs');
const {inferenceDeadline}=require('../automation/inference-deadline.cjs');
const {normalizeDynamic}=require('../inputs/runtime-definition.cjs');
const rules=readFileSync(join(__dirname,'skills/task-creation-guide/SKILL.md'),'utf8');
const topicTask=require('./topic-task.cjs');
const ruleVersion='task-creation-guide-v9';
const projectRelations=require('./project-relations.cjs');
const relationGuide=require('./relation-guide.cjs');
function abortable(promise,signal){
 return new Promise((resolve,reject)=>{const cancel=()=>reject(Error('整理已停止或超时，已保留草稿'));signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));});
}
const packageFields=['title','instruction','deliverables','acceptance','verification','constraints','ownerId','projectId'];
const blank=()=>({name:'',goal:'',packages:[]});
function candidate(value){
 if(!value||!Array.isArray(value.packages)||value.packages.length>30)throw Error('任务草案格式无效');
 const packages=value.packages.map(p=>{
  if(!id(p.id)||!['discussion','work'].includes(p.mode)||!Array.isArray(p.dependencies)||p.dependencies.length>30)throw Error('任务草案格式无效');
  return {...(p.projectBinding?{projectBinding:projectRelations.binding(p.projectBinding)}:{}),id:p.id,mode:p.mode,...Object.fromEntries(packageFields.map(k=>[k,text(p[k]||'',k,k==='instruction'?8000:k==='title'?120:2000,true)])),projectId:p.mode==='work'?text(p.projectId||'','项目',120,true):null,dependencies:p.dependencies.map(v=>{if(!id(v))throw Error('依赖无效');return v;}),documentRefs:(p.documentRefs||[]).map(r=>{if(!id(r.id)||!Number.isInteger(r.revision)||r.revision<1)throw Error('资料版本无效');return {id:r.id,revision:r.revision,hash:r.hash};})};
 });
 if(new Set(packages.map(p=>p.id)).size!==packages.length)throw Error('工作包标识重复');
 return {name:text(value.name||'','计划名称',120,true),goal:text(value.goal||'','目标',4000,true),packages};
}
function issues(value,space,employees,locale='zh-CN'){
 const labels={'计划名称':'Plan name','共同目标':'Shared goal','至少一个任务':'At least one task','任务名称':'Task title','需求与范围':'Requirements and scope','交付物':'Deliverables','验收条件':'Acceptance criteria','验证方法':'Verification method','有效负责人':'Valid owner','获授权的执行项目':'Authorized execution project'};
 const label=value=>locale==='en'?(labels[value]||value):value;
 const missing=[];
 if(!value.name)missing.push(label('计划名称'));if(!value.goal)missing.push(label('共同目标'));if(!value.packages.length)missing.push(label('至少一个任务'));
 for(const p of value.packages){
  for(const [key,title] of [['title','任务名称'],['instruction','需求与范围'],['deliverables','交付物'],['acceptance','验收条件'],['verification','验证方法']])if(!p[key]?.trim())missing.push((p.title||p.id)+': '+label(title));
  const member=space.members.find(m=>m.employeeId===p.ownerId);
  if(!member||!employees.some(e=>e.id===p.ownerId))missing.push((p.title||p.id)+': '+label('有效负责人'));
  if(p.mode==='work'&&(!p.projectId||!space.projectIds.includes(p.projectId)||!member?.projectIds.includes(p.projectId)))missing.push((p.title||p.id)+': '+label('获授权的执行项目'));
 }
 missing.push(...projectRelations.issues(value.packages,space,{locale}));
 if(!missing.length)try{shape(value);}catch(e){missing.push(locale==='en'?'Review task structure and dependencies; dependencies must be acyclic.':e.message);}
 return missing;
}
function getDraft(service,state,input){
 const draft=state.taskDrafts.find(d=>d.id===input.id);if(!draft)throw Error('任务草稿不存在');service.writable(state,draft.spaceId);
 if(draft.revision!==input.expectedRevision)throw Error('任务草稿已更新，请重新打开');
 if(draft.discardedAt)throw Error('此草稿已结束，请创建下一项任务 / This draft has ended');
 if(draft.planId)throw Error('此草稿已创建任务，请在任务页修订');return draft;
}
const methods={
 async createTaskDraft(input){
  if(!id(input.commandId))throw Error('请求标识无效');
  const snapshot=await this.snapshot();this.writable(snapshot,input.spaceId);
  const request=snapshot.requests.find(r=>r.id===input.discussionId&&r.spaceId===input.spaceId&&r.mode==='discussion');
  if(input.discussionId&&!request)throw Error('讨论不属于此空间');
  const rootOf=r=>{const seen=new Set();while(r.replyTo&&!seen.has(r.id)){seen.add(r.id);const parent=snapshot.requests.find(p=>p.id===r.replyTo&&p.spaceId===input.spaceId);if(!parent)break;r=parent;}return r.id;};
  const discussionId=request?rootOf(request):null;
  const basePlan=input.basePlanId?topicTask.owned(snapshot,input.spaceId,discussionId).plans.find(p=>p.id===input.basePlanId):null;
  if(input.basePlanId&&(!basePlan||basePlan.revision!==input.basePlanRevision))throw Error('计划已有新版本，请重新读取后修订');
  const eligible=(d,s)=>d.spaceId===input.spaceId&&topicTask.root(s,input.spaceId,d.discussionId)===discussionId&&!d.planId&&!d.discardedAt&&(!d.basePlanId||input.basePlanId===d.basePlanId||s.plans.some(p=>p.id===d.basePlanId&&!topicTask.ended(p)));
  const existingDraft=!input.newPlan?snapshot.taskDrafts.find(d=>eligible(d,snapshot)&&(input.draftId?d.id===input.draftId:input.basePlanId?d.basePlanId===input.basePlanId&&d.basePlanRevision===input.basePlanRevision:true)):null;
  const sourceFromRequestId=existingDraft?.sourceFromRequestId||input.sourceFromRequestId;
  const discussionRequests=snapshot.requests.filter(r=>discussionId&&r.spaceId===input.spaceId&&r.mode==='discussion'&&rootOf(r)===discussionId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  const boundary=sourceFromRequestId?discussionRequests.findIndex(r=>r.id===sourceFromRequestId):0;
  if(boundary<0)throw Error('引导来源不属于当前话题 / Guide source does not belong to this topic');
  const source=discussionRequests.slice(boundary).map(r=>({id:r.id,prompt:r.prompt,createdAt:r.createdAt,documentRefs:r.documentRefs,...(r.host?{host:{brief:r.host.brief,steps:r.host.steps,status:r.host.status,ruleVersion:r.host.ruleVersion}}:{}),responses:r.participants.map(p=>({employeeId:p.employeeId,runId:p.runId,status:p.status,output:p.output}))}));
  if(JSON.stringify(source).length>100000)throw Error('讨论过长，请先将相关结论整理为简短任务需求');
  const sourceDocuments=[];
  for(const ref of [...source.flatMap(r=>r.documentRefs),...(basePlan?.packages.flatMap(p=>p.definition.documentRefs)||[])]){
   if(sourceDocuments.some(d=>d.id===ref.id&&d.revision===ref.revision))continue;
   if(sourceDocuments.length>=8)throw Error('讨论引用超过 8 份资料，请先缩小任务范围');
   const doc=await this.document(ref);if(doc.spaceId!==input.spaceId||ref.hash&&doc.hash!==ref.hash)throw Error('讨论资料已变化，请重新选择依据');
   sourceDocuments.push({id:doc.id,title:doc.title,revision:doc.revision,hash:doc.hash,state:doc.state,body:doc.body});
  }
  if(JSON.stringify(sourceDocuments).length>60000)throw Error('讨论引用资料过长，请先精简');
  return this.change(s=>{
   this.writable(s,input.spaceId);const prior=s.taskDrafts.find(d=>d.commandId===input.commandId);if(prior){if(prior.spaceId!==input.spaceId||prior.discussionId!==discussionId)throw Error('请求标识已用于其他草稿');return prior;}
   const existing=input.newPlan?null:s.taskDrafts.find(d=>eligible(d,s)&&(input.draftId?d.id===input.draftId:input.basePlanId?d.basePlanId===input.basePlanId&&d.basePlanRevision===input.basePlanRevision:true));
   if(input.draftId&&(!existing||existing.revision!==input.expectedRevision))throw Error('任务草稿已更新，请重新读取');
   if(basePlan&&s.plans.find(p=>p.id===basePlan.id)?.revision!==basePlan.revision)throw Error('计划已有新版本，请重新读取后修订');
   topicTask.assertAvailable(s,input.spaceId,discussionId,{planId:basePlan?.id||existing?.basePlanId,draftId:existing?.id});
   if(existing){if(input.refreshSource){existing.source=source;existing.sourceDocuments=[...new Map([...(existing.sourceDocuments||[]),...sourceDocuments].map(d=>[d.id+':'+d.revision,d])).values()];existing.revision++;existing.status='needs-input';delete existing.assessment;}return existing;}
   const draft={id:randomUUID(),commandId:input.commandId,spaceId:input.spaceId,discussionId,revision:1,...(sourceFromRequestId?{sourceFromRequestId}:{}),...(basePlan?{basePlanId:basePlan.id,basePlanRevision:basePlan.revision}:{}),value:basePlan?{name:basePlan.name,goal:basePlan.goal,packages:basePlan.packages.map(p=>p.definition)}:blank(),source,sourceDocuments,messages:[],status:'needs-input',requirementsPending:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};s.taskDrafts.unshift(draft);return draft;
  });
 },
 async discardTaskDraft(input){
  return this.change(s=>{const d=getDraft(this,s,input);d.discardedAt=new Date().toISOString();d.revision++;d.updatedAt=d.discardedAt;return d;});
 },
 async saveTaskDraft(input){
  const value=candidate(input.value);
  return this.change(s=>{const d=getDraft(this,s,input);d.requirementsPending ??= !!d.assessment?.question;d.pendingQuestion ??= d.assessment?.question||null;d.value=value;d.revision++;d.status='needs-input';delete d.assessment;delete d.relationGuide;d.updatedAt=new Date().toISOString();return d;});
 },
 async checkTaskDraft(input){
  const employees=(await this.workforce.read()).employees,projects=(await this.workspace.read()).projects;
  return this.change(s=>{
   const d=getDraft(this,s,input),space=this.writable(s,d.spaceId);
   d.relationGuide=relationGuide.buildGuide(d.value.packages,space,projects,input.locale);
   const missing=issues(d.value,space,employees,input.locale);
   // Human edits cannot dismiss unresolved requirements from the model review.
   if(d.requirementsPending??!!d.assessment?.question)missing.push(input.locale==='en'?'Answer the outstanding requirement questions first':'请先回答尚未确认的需求问题');
   for(const p of d.value.packages)for(const r of p.documentRefs){const doc=s.documents.find(doc=>doc.id===r.id&&!doc.deletedAt&&doc.spaceId===space.id);if(!doc||doc.versions.find(v=>v.revision===r.revision)?.hash!==r.hash)missing.push(input.locale==='en'?'Referenced document changed':'引用文档已变化');}
   d.revision++;d.updatedAt=new Date().toISOString();d.status=missing.length?'needs-input':'ready';
   d.assessment={summary:input.locale==='en'?'Draft checked without regenerating tasks.':'已检查草稿，未重新生成任务。',missing,ready:!missing.length,revision:d.revision,spaceRevision:space.revision,question:d.pendingQuestion||d.assessment?.question||null,ruleVersion,at:new Date().toISOString()};
   return d;
  });
 },
 async answerTaskRelations(input){
  const employees=(await this.workforce.read()).employees,projects=(await this.workspace.read()).projects;
  return this.change(s=>{
   const d=getDraft(this,s,input),space=this.writable(s,d.spaceId),guide=d.relationGuide;
   if(!guide||guide.requestKey!==input.requestKey||guide.spaceRevision!==space.revision)throw Error('项目关系已更新，请重新检查草稿');
   const patch=relationGuide.answerNode(guide,input.packageId,input.answers);
   const previous=d.value.packages.find(p=>p.id===input.packageId);
   if(!previous||previous.mode!=='work')throw Error('任务已变化，请重新检查');
   const packages=d.value.packages.map(p=>p.id===previous.id?{...p,...patch}:previous.projectId!==patch.projectId&&p.dependencies.includes(previous.id)&&p.projectBinding?{...p,projectBinding:{...p.projectBinding,confirmed:false}}:p);
   const invalid=projectRelations.issues(packages,space,{onlyIds:[previous.id],locale:input.locale});
   if(invalid.length)throw Error(invalid.join('；'));
   // This explicit confirmation also maintains the reusable space-level agreement.
   const saved=space.projectContext||{roles:[],relations:[]};
   space.projectContext=projectRelations.context({roles:[...saved.roles.filter(r=>r.projectId!==patch.projectId),{projectId:patch.projectId,responsibility:patch.projectBinding.responsibility}],relations:[...saved.relations.filter(r=>r.sourceProjectId!==patch.projectId),...patch.projectBinding.relations.map(r=>({sourceProjectId:patch.projectId,...r}))]},space.projectIds);
   space.revision++;space.updatedAt=new Date().toISOString();
   d.value={...d.value,packages};
   d.requirementsPending ??= !!d.assessment?.question;d.pendingQuestion ??= d.assessment?.question||null;
   const missing=issues(d.value,space,employees,input.locale);
   if(d.requirementsPending)missing.push(input.locale==='en'?'Answer the outstanding requirement questions first':'请先回答尚未确认的需求问题');
   for(const p of packages)for(const r of p.documentRefs){const doc=s.documents.find(doc=>doc.id===r.id&&!doc.deletedAt&&doc.spaceId===space.id);if(!doc||doc.versions.find(v=>v.revision===r.revision)?.hash!==r.hash)missing.push(input.locale==='en'?'Referenced document changed':'引用文档已变化');}
   d.revision++;d.updatedAt=new Date().toISOString();d.status=missing.length?'needs-input':'ready';
   d.relationGuide=relationGuide.buildGuide(packages,space,projects,input.locale,Object.fromEntries(guide.nodes.map(n=>[n.packageId,n.reason])));
   d.assessment={summary:input.locale==='en'?'Relationship confirmed and saved for future workflows.':'关系已确认并保存，后续流程可直接复用。',missing,ready:!missing.length,revision:d.revision,spaceRevision:space.revision,question:d.pendingQuestion||null,ruleVersion,at:d.updatedAt};
   return d;
  });
 },
 cancelTaskGuide(input){const job=this.taskGuideControllers?.get(input.requestId);if(job?.draftId===input.id)job.controller.abort();return {cancelled:!!job&&job.draftId===input.id};},
 guideTask(input,options={}){
  if(this.closing)return Promise.reject(Error('应用正在关闭'));
  const action=guide.call(this,input,options);this.suggestionJobs ||= new Set();this.suggestionJobs.add(action);action.finally(()=>this.suggestionJobs.delete(action)).catch(()=>{});return action;
 },
 async createGuidedPlan(input){
  const s=await this.read(),draft=s.taskDrafts.find(d=>d.id===input.id);
  if(draft?.planId){this.writable(s,draft.spaceId);const plan=s.plans.find(p=>p.id===draft.planId);if(plan)return plan;throw Error('已创建的计划不存在');}
  getDraft(this,s,input);
  if(draft.basePlanId){
   const plan=s.plans.find(p=>p.id===draft.basePlanId&&p.spaceId===draft.spaceId);
   if(!plan||plan.revision!==draft.basePlanRevision)throw Error('计划已有新版本，请重新讨论后修订');
   if(draft.status!=='ready'||draft.assessment?.revision!==draft.revision)throw Error('请先检查修订草稿');
   const running=['running','pausing'].includes(plan.status)||plan.packages.some(p=>['starting','preparing','running','waiting','stopping'].includes(p.status));
   if(running&&!input.pauseBeforeApply)throw Error('应用修订前需要确认暂停整个计划');
   if(running)await this.plans.control({id:plan.id,expectedRevision:plan.revision,commandId:randomUUID(),action:'pause'});
  }
  return this.plans.save({id:draft.basePlanId,expectedRevision:draft.basePlanRevision,spaceId:draft.spaceId,value:draft.value,taskDraftId:draft.id,expectedDraftRevision:input.expectedRevision,basisConfirmation:input.basisConfirmation});
 }
};
async function guide(input,options={}){
 if(!id(input.requestId))throw Error('引导请求标识无效');
 this.taskGuideControllers ||= new Map();
 if(this.taskGuideControllers.has(input.requestId)||[...this.taskGuideControllers.values()].some(j=>j.draftId===input.id))throw Error('正在整理，请先停止当前请求');
 const controller=new AbortController();this.taskGuideControllers.set(input.requestId,{draftId:input.id,controller});
 this.suggestionControllers ||= new Set();this.suggestionControllers.add(controller);
 const parent=options.signal?AbortSignal.any([controller.signal,options.signal]):controller.signal;
 const deadline=inferenceDeadline(parent,options.discussion?{timeoutMs:null,idleTimeoutMs:this.hostIdleTimeoutMs||300000}:{timeoutMs:this.taskGuideTimeoutMs||180000});
 const signal=deadline.signal;let characters=0,reasoning='';
 const onProgress=options.discussion?progress=>{
  if(signal.aborted)return;
  const changed=typeof progress.receivedCharacters==='number'?progress.receivedCharacters>0&&progress.receivedCharacters!==characters:!!progress.reasoning&&progress.reasoning!==reasoning;
  if(changed)deadline.touch();characters=progress.receivedCharacters??0;reasoning=progress.reasoning||'';
 }:undefined;
 try{
  const locale=input.locale==='zh-CN'?'zh-CN':'en';
  const state=await this.read(),draft=getDraft(this,state,input),space=this.writable(state,draft.spaceId);
  const message=text(input.message||'','补充需求',8000,true),employees=(await this.workforce.read()).employees;
  const messages=[...draft.messages,...(message?[{role:'user',text:message}]:[])];if(messages.length>60)throw Error('补充对话过长，请编辑草案后重新检查');
  const members=space.members.flatMap(m=>{const e=employees.find(e=>e.id===m.employeeId);return e?[{id:e.id,name:e.name,responsibilities:e.responsibilities,methods:e.methods,deliverables:e.deliverables,skills:(e.skills||[]).map(s=>({name:s.name,purpose:s.purpose})),assignment:m.assignment,projectIds:m.projectIds}]:[];});
  if(!members.length)throw Error('请先在团队与项目中选择专家');
  const projects=(await this.workspace.read()).projects.filter(p=>space.projectIds.includes(p.id)).map(p=>({id:p.id,name:p.name,type:p.type||'local',environment:p.environment?.kind||null}));
  // Persist human input before inference; cancellation/failure must not erase it.
  const base=await this.change(s=>{const d=getDraft(this,s,input);d.requirementsPending ??= !!d.assessment?.question;d.pendingQuestion ??= d.assessment?.question||null;d.messages=messages;d.revision++;d.status='needs-input';delete d.assessment;return d;});
  const config=await abortable(this.workforce.providers.secret(input.providerId,input.model),signal);signal.throwIfAborted();
  let stop;
  const aborted=new Promise((_,reject)=>{stop=()=>reject(options.discussion?signal.reason:Error('整理已停止或超时，已保留草稿'));signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();});
  let result;
  const relationsOnly=input.phase==='relations',known=relationGuide.knownBindings(state,space,draft.id);
  const gaps=base.value.packages.filter(p=>p.mode==='work'&&projectRelations.issues(base.value.packages,space,{onlyIds:[p.id]}).length).map(p=>p.id);
  try{result=await Promise.race([(this.generateTaskGuide||generate)(config,{prompt:relationsOnly?relationGuide.prompt:rules+'\nInvocation: host-structured task preparation. The user is ALREADY INSIDE the task guide. Synthesize the plan name and shared goal from the discussion; never ask the user to fill those fields. Return the editable proposal now; do not direct them back to the discussion, ask them to open the task guide, or repeat a previous host handoff. If ready, the next action is to review the proposal below, then save or confirm and start. Return only the schema. All generated values are proposals. Questions use labels/help, not fabricated answers. Preserve user-edited candidate values unless the user asks to revise them. When editing, keep existing package IDs and all unchanged fields exactly. Change only requested scope and logically affected dependencies/constraints. Never regenerate unrelated tasks or invent a user confirmation. The latest user request overrides earlier conflicting requirements; explain changes in summary. This prepares a draft only, never executes work.',input:{locale,source:base.source,documents:base.sourceDocuments||[],value:base.value,messages,members,projects,projectContext:space.projectContext||{roles:[],relations:[]},knownBindings:known,gaps},outputSchema:relationsOnly?relationGuide.outputSchema:schema,budgetProfile:'task-plan',retryOutputLimit:true,repairInvalidOutput:true,timeoutMs:deadline.timeoutMs},signal,onProgress),aborted]);}
  catch(e){if(e.message==='OUTPUT_LIMIT'){const detail=require('../automation/structured-output.cjs').outputLimitDetails(e,locale);e.code='OUTPUT_LIMIT';e.message=(locale==='en'?'The model reached its output limit. Your draft is preserved. Narrow the first delivery or raise the model output limit, then retry.':'模型输出达到上限，草稿已保留。可以缩小首轮交付范围，或提高模型输出限制后重试。')+detail;throw e;}throw require('../automation/structured-output.cjs').localizeStructuredError(e,locale);}
  finally{signal.removeEventListener('abort',stop);}
  signal.throwIfAborted();
  let value;const reasons={};
  if(relationsOnly){
   if(!Array.isArray(result.nodes)||result.nodes.length>30||new Set(result.nodes.map(n=>n.packageId)).size!==result.nodes.length)throw Error('项目关系建议格式无效');
   for(const n of result.nodes){if(!gaps.includes(n.packageId))throw Error('不可修改已确认或不存在的任务');reasons[n.packageId]=text(n.reason||'','Reason',2000,true);}
   value=candidate({...base.value,packages:base.value.packages.map(p=>{const n=result.nodes.find(n=>n.packageId===p.id);return n?{...p,projectId:n.projectId,projectBinding:projectRelations.binding({...n,confirmed:false})}:p;})});
  }else value=candidate({...result.value,packages:result.value?.packages?.map(p=>({...p,projectBinding:p.mode==='work'?projectRelations.proposal(p,space):undefined,documentRefs:(p.documentIds||[]).map(docId=>{const docs=(base.sourceDocuments||[]).filter(d=>d.id===docId);if(docs.length!==1)throw Error('任务引用了未提供或版本不唯一的资料');return {id:docs[0].id,revision:docs[0].revision,hash:docs[0].hash};})}))});
  if(!relationsOnly)for(const p of result.value?.packages||[])if(p.projectBinding?.reason)reasons[p.id]=text(p.projectBinding.reason,'Reason',2000,true);
  if(!relationsOnly&&(typeof result.ready!=='boolean'||!Array.isArray(result.questions)||result.questions.length>1))throw Error('模型返回的补充问题格式无效');
  const questions=(relationsOnly?[]:result.questions).map((q,i)=>({name:'answer'+i,type:'textarea',label:text(q.label,'问题',300),help:text(q.help||'','帮助',1000,true),required:true}));
  const question=questions.length?{requestKey:randomUUID(),reason:locale==='en'?'Clarify requirements that affect execution and acceptance':'补齐影响执行和验收的信息',source:{kind:'dynamic',definition:{title:locale==='en'?'Clarify task requirements':'补充任务信息',fields:questions}},prefill:{}}:null;
  if(question)normalizeDynamic(question);
  const summary=text(result.summary,'整理说明',4000);
  const latestEmployees=(await this.workforce.read()).employees;
  return await this.change(s=>{
   const d=getDraft(this,s,{id:base.id,expectedRevision:base.revision}),current=this.writable(s,d.spaceId);signal.throwIfAborted();
   if(current.revision!==space.revision)throw Error('空间成员或分工已更新，请重新检查');
   value.packages=relationGuide.inherit(value.packages,current,relationGuide.knownBindings(s,current,d.id),base.value.packages);
   const missing=issues(value,current,latestEmployees,locale);
   for(const p of value.packages)for(const ref of p.documentRefs){const doc=s.documents.find(doc=>doc.id===ref.id&&!doc.deletedAt&&doc.spaceId===d.spaceId);if(!doc||doc.versions.find(v=>v.revision===ref.revision)?.hash!==ref.hash)missing.push((p.title||p.id)+(locale==='en'?': Reconfirm or adopt the referenced document revision':'：资料版本已变化，请重新确认'));}
   if(!relationsOnly){d.requirementsPending=questions.length>0;d.pendingQuestion=question;}
   if(relationsOnly&&d.requirementsPending)missing.push(locale==='en'?'Answer the outstanding requirement questions first':'请先回答尚未确认的需求问题');
   d.relationGuide=relationGuide.buildGuide(value.packages,current,projects,locale,reasons);
   d.value=value;d.revision++;d.status=(relationsOnly||result.ready)&&!missing.length&&!questions.length?'ready':'needs-input';
   d.assessment={summary,missing,question:relationsOnly?d.pendingQuestion||null:question,ready:d.status==='ready',revision:d.revision,spaceRevision:space.revision,ruleVersion,at:new Date().toISOString()};
   d.messages.push({role:'assistant',text:summary});d.updatedAt=new Date().toISOString();return d;
  });
 }finally{deadline.dispose();this.taskGuideControllers.delete(input.requestId);this.suggestionControllers.delete(controller);}
}
const str={type:'string'};
const bindingSchema={type:'object',additionalProperties:false,required:['responsibility','relations','reason'],properties:{reason:str,responsibility:str,relations:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,required:['targetProjectId','kind','description'],properties:{targetProjectId:str,kind:{type:'string',enum:['api','artifact','contract']},description:str}}}}};
const schema={type:'object',additionalProperties:false,required:['summary','ready','questions','value'],properties:{summary:str,ready:{type:'boolean'},questions:{type:'array',maxItems:1,items:{type:'object',additionalProperties:false,required:['label','help'],properties:{label:str,help:str}}},value:{type:'object',additionalProperties:false,required:['name','goal','packages'],properties:{name:str,goal:str,packages:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['id','mode','dependencies','documentIds','projectBinding',...packageFields],properties:{projectBinding:bindingSchema,documentIds:{type:'array',maxItems:8,items:str},id:str,mode:{type:'string',enum:['discussion','work']},dependencies:{type:'array',items:str},...Object.fromEntries(packageFields.map(k=>[k,str]))}}}}}}};
// A generated workflow must carry its own summary. The shared provider repairs
// missing metadata once before any draft mutation; genuine goal clarification
// can still return no packages without fabricating a goal.
schema.properties.value.anyOf=[
 {properties:{packages:{maxItems:0}}},
 {properties:{name:{minLength:1,pattern:'\\S'},goal:{minLength:1,pattern:'\\S'}}}
];
module.exports={taskGuideMethods:methods,rules,issues,ruleVersion};
