// Opt-in: electron scripts/probes/model-budget-live.cjs [isolated-directory] [provider-name]
// Real inference and scheduler, synthetic text only. No user project access.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {Database}=require('../../electron/database.cjs'),{createProviderStore}=require('../../electron/provider.cjs');
const {createStore}=require('../../electron/store.cjs'),{createSkills}=require('../../electron/skills.cjs');
const {CatalogStore}=require('../../core/catalog-store/service.cjs'),{WorkforceService}=require('../../core/workforce/service.cjs');
const {SpaceService}=require('../../core/workforce/spaces.cjs'),{AgentRuntime}=require('../../electron/agent-runtime.cjs');
const {generate}=require('../../core/automation/provider.cjs'),{startChatBridge}=require('../../electron/chat-bridge.cjs');
const directory=process.argv[2]||path.join(os.tmpdir(),'model-budget-live-'+Date.now()),providerName=process.argv[3]||'DeepSeek';
app.setName('Ambleloft');app.setPath('userData',directory);app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
let database,catalog,workforce,spaces,runtime,bridge;
const evidence={scope:'Real model, production adapters, isolated database, actual AgentRuntime and scheduler. Synthetic text-only work; no user projects or UI clicks.',steps:[],budgets:[]};
const record=(step,value)=>{evidence.steps.push({step,...value});console.log(JSON.stringify({step,...value}));};
async function waitFor(read,ready,label){const start=Date.now();while(Date.now()-start<240000){const value=await read();if(ready(value))return value;await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 assert.equal((await fs.readdir(directory)).includes('atelier.sqlite'),false,'Use a fresh isolated directory');
 const state=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys;c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True);print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 const selected=state.providers.find(p=>p.name===providerName);assert.ok(selected,'Provider unavailable');evidence.provider=selected.name;evidence.model=selected.model;
 database=new Database(directory);await database.call('ready');
 await database.call('writeSetting',{key:'providers',value:{version:2,defaultId:selected.id,providers:[{...selected,webSearch:'disabled'}]}});
 const providers=createProviderStore(directory,safeStorage,database),workspace=createStore(directory,database),skills=createSkills(directory,database);
 // Exercise both ordinary conversation routing and the streaming chat bridge.
 const config=await providers.secret(selected.id,selected.model);
 const conversation=await generate(config,{budgetProfile:'conversation',retryOutputLimit:true,prompt:'Return JSON. Reply to the user without tools.',input:{message:'只回复预算验证通过'},outputSchema:{type:'object',additionalProperties:false,required:['reply'],properties:{reply:{type:'string'}}},timeoutMs:90000});
 assert.match(conversation.reply,/预算验证通过/);record('conversation',{passed:true});
 const diagnostics=[];bridge=await startChatBridge(config,'budget-live',false,d=>diagnostics.push(d));
 const chatResponse=await fetch(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:selected.model,input:'只回复一行：普通聊天预算验证通过。不调用工具。'}),signal:AbortSignal.timeout(90000)});
 const events=(await chatResponse.text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
 const completion=events.find(e=>e.type==='response.completed');assert.ok(completion,'Chat did not complete');assert.match(JSON.stringify(completion.response.output),/普通聊天预算验证通过/);
 evidence.budgets.push(...diagnostics.map(d=>d.budget));bridge.close();bridge=null;record('chat-stream',{passed:true});
 catalog=new CatalogStore({directory,database,skills,extensions:{items:[]},sources:[]});await catalog.initialize();
 workforce=new WorkforceService({directory,database,skills,catalog,providers});await workforce.initialize();
 const employees=[];
 for(const name of ['资料整理员','验算专家']){const e=await workforce.save({value:{name,domain:'隔离验证',responsibilities:'核对给定的虚构数字',methods:'只用提供的文本，不调用工具，不读写文件，不访问网络。',deliverables:'一行核对结果',skills:[],modelChoice:{providerId:selected.id,model:selected.model}}});await workforce.activate({id:e.id,expectedRevision:e.revision});employees.push(e);}
 runtime=new AgentRuntime({directory,database,workspace,skills,provider:providers,publish(){}});runtime.workforce=workforce;await runtime.init();
 spaces=new SpaceService({directory,database,workspace,workforce,runtime});runtime.spaces=spaces;await spaces.initialize();
 const space=await spaces.save({value:{name:'统一模型预算验证',purpose:'只用虚构数字验证任务生命周期',projectIds:[],members:employees.map(e=>({employeeId:e.id,assignment:e.responsibilities,projectIds:[]}))}});
 let last,root;
 const turn=async prompt=>{const id=randomUUID();await spaces.coordinateDiscussion({spaceId:space.id,clientRequestId:id,replyTo:last?.id,locale:'zh-CN',providerId:selected.id,model:selected.model,prompt});await waitFor(async()=>spaces.hostJobs.size,n=>n===0,'host');last=(await spaces.read()).requests.find(r=>r.id===id);root ||= id;assert.notEqual(last.host.status,'failed',last.host.error);return last;};
 await turn('直接整理任务草稿，不启动，也不先邀请专家讨论。目标与范围已确认：虚构数据 7+8 的求和及独立复核。两个串行节点：资料整理员只依据本消息计算 7+8，最终只回复一行“求和结果：15”；验算专家依赖第一节点的真实交付，核对是否为 15，最终只回复一行“核对通过：7+8=15”。两项都只用文本分析，模式为讨论，不关联项目、不读取文件、不调用工具、不访问网络。交付各为一行答案。验收由用户逐项检查精确输出，第二项同时检查真实上游证据。不增加其他任务，所有信息已齐全。');
 const draft=(await spaces.read()).taskDrafts.find(d=>d.id===last.host.task?.draftId);assert.ok(draft);assert.equal(draft.status,'ready');assert.equal(draft.value.packages.length,2);assert.equal(runtime.runs.length,0);record('discussion-to-draft',{passed:true});
 const blocked=async()=>{await assert.rejects(spaces.createTaskDraft({spaceId:space.id,discussionId:root,commandId:randomUUID(),newPlan:true}),/未结束|current task/);};
 await blocked();
 const plan=await spaces.createGuidedPlan({id:draft.id,expectedRevision:draft.revision});assert.equal(runtime.runs.length,0);
 await spaces.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:randomUUID(),action:'start'},{});
 const readPlan=async()=>(await spaces.read()).plans.find(p=>p.id===plan.id);
 const ids=plan.packages.map(p=>p.id),first=plan.packages.find(p=>!p.definition.dependencies.length);assert.ok(first);const second=plan.packages.find(p=>p.id!==first.id);assert.deepEqual(second.definition.dependencies,[first.id]);
 const review=async(id,expected)=>{
  const current=await waitFor(readPlan,p=>p.packages.find(n=>n.id===id).status==='review','expert delivery');
  const node=current.packages.find(p=>p.id===id),attempt=node.attempts.at(-1),run=runtime.runs.find(r=>r.collaboration?.requestId===attempt.requestId);assert.ok(run);
  assert.ok(run.messages.some(m=>m.role==='assistant'&&m.kind!=='reasoning'&&m.text?.trim()===expected),'Unexpected real expert output');
  assert.equal(run.tools.length,0,'Text-only probe must not execute tools');
  evidence.budgets.push(...(run.modelRequests||[]).map(d=>d.budget).filter(Boolean));await blocked();
  return spaces.reviewPlan({planId:plan.id,packageId:id,attemptId:attempt.id,resultHash:attempt.resultHash,accepted:true,note:'已核对本次真实输出：'+expected});
 };
 await review(first.id,'求和结果：15');
 // reviewPlan records acceptance; the scheduler dispatches asynchronously.
 // Verify dispatch through the second node's real run below, not a receipt.
 record('first-acceptance',{passed:true});
 await review(second.id,'核对通过：7+8=15');
 const finished=await waitFor(readPlan,p=>p.status==='completed','plan completion');assert.equal(runtime.runs.length,2);
 const downstream=runtime.runs.find(r=>r.collaboration?.packageId===second.id)||runtime.runs.find(r=>r.employee?.id===second.definition.ownerId);
 assert.ok(downstream.messages.some(m=>m.role==='user'&&m.text.includes('求和结果：15')),'Downstream must receive the actual predecessor result');
 record('acceptance-and-dispatch',{passed:true,status:finished.status,nodes:ids});
 await turn('上一项已经全部验收完成。现在在同一话题创建下一项任务草稿，不启动。新目标：由资料整理员仅用文本计算虚构数据 5-2，最终只回复一行“结果：3”。不关联项目、不读写文件、不调用工具、不访问网络。交付是一行文本，用户按精确匹配“结果：3”验收。只要一个节点，信息齐全。');
 const after=await spaces.read(),next=after.taskDrafts.find(d=>d.id===last.host.task?.draftId);assert.ok(next);assert.notEqual(next.id,draft.id);assert.equal(next.status,'ready');assert.equal(runtime.runs.length,2);assert.equal(after.plans.find(p=>p.id===plan.id).status,'completed');
 record('next-task-and-history',{passed:true,previousStatus:'completed',nextStatus:next.status});evidence.passed=true;
}).catch(error=>{evidence.passed=false;evidence.error=error.message;console.error(JSON.stringify({passed:false,error:error.message}));}).finally(async()=>{
 bridge?.close();await spaces?.shutdown();await runtime?.shutdown();await workforce?.shutdown();await catalog?.shutdown();await database?.close();
 await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{mode:0o600});console.log('Evidence: '+path.join(directory,'evidence.json'));app.exit(evidence.passed?0:1);
});
