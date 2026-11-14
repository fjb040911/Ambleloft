const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Database}=require('../electron/database.cjs'),{SpaceService}=require('../core/workforce/spaces.cjs');
const acceptance=require('../core/workforce/acceptance.cjs');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptance-')),db=new Database(root);await db.call('ready');
 const runtime={runs:[],async start(input,context){const run={id:randomUUID(),status:'running',collaboration:context.collaboration,messages:[],tools:[],providerId:'test-provider',model:'test-model'};this.runs.push(run);return run;},async stop(id){this.runs.find(r=>r.id===id).status='interrupted';}};
 const service=new SpaceService({directory:root,database:db,workspace:{read:async()=>({projects:[]})},workforce:{read:async()=>({employees:[{id:'one'}]}),providers:{secret:async()=>({})}},runtime});await service.initialize();clearInterval(service.plans.timer);
 const space=await service.save({value:{name:'Automatic delivery',purpose:'Verify evidence',projectIds:[],members:[{employeeId:'one',assignment:'Deliver',projectIds:[]}]}});
 t.after(async()=>{await service.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});
 const read=async()=> (await service.read()).plans[0];
 const control=async(action,packageId,extra={})=>{const plan=await read();return service.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:randomUUID(),action,packageId,...extra},{});};
 const flush=async()=>{const plan=await read();await service.plans.pulse(plan.id);await service.plans.automationJobs.get(plan.id)?.promise;};
 const finish=async(id,text='OK')=>{const p=(await read()).packages.find(p=>p.id===id),run=runtime.runs.find(r=>r.collaboration.requestId===p.attempts.at(-1).requestId);run.status='completed';run.messages=[{role:'assistant',text}];await flush();return run;};
 const save=packages=>service.savePlan({spaceId:space.id,value:{name:'Plan',goal:'Checked delivery',acceptancePolicy:{...acceptance.DEFAULT_POLICY},packages}});
 return {service,runtime,space,read,control,flush,finish,save};
}
const check=(patch={})=>({id:'result',kind:'output-equals',requirement:'Output exactly OK',evidence:'Final answer',target:'',expected:'OK',operator:'eq',...patch});
const node=(id,dependencies=[])=>({id,title:id,ownerId:'one',mode:'discussion',projectId:null,instruction:'Produce the agreed delivery',dependencies,documentRefs:[],deliverables:'Answer',acceptance:'Output exactly OK',verification:'Compare text',acceptanceChecks:[check()]});
test('automatic acceptance releases successors and completes the plan with pinned evidence',async t=>{
 const f=await fixture(t);await f.save([node('first'),node('next',['first'])]);await f.control('start');await f.finish('first');
 let plan=await f.read();assert.equal(plan.packages[0].status,'accepted');assert.equal(plan.packages[0].acceptance.source,'automatic-review');assert.equal(plan.packages[0].acceptance.resultHash,plan.packages[0].attempts[0].resultHash);
 await f.flush();assert.equal(f.runtime.runs.length,2);await f.finish('next');await f.flush();assert.equal((await f.read()).status,'completed');
});
test('failed criteria repair once, then identical failure stops for human intervention',async t=>{
 const f=await fixture(t);await f.save([node('first'),node('next',['first'])]);await f.control('start');await f.finish('first','wrong');
 assert.equal((await f.read()).packages[0].status,'pending');await f.flush();assert.equal(f.runtime.runs.length,2);
 await f.finish('first','still wrong');const plan=await f.read();assert.equal(plan.packages[0].status,'review');assert.match(plan.packages[0].reason,/未见改善/);assert.equal(plan.packages[1].attempts.length,0);await f.flush();assert.equal(f.runtime.runs.length,2);
});
test('repair can pass without changing criteria and zero budget stops immediately',async t=>{
 const f=await fixture(t);await f.save([node('first')]);await f.control('start');await f.finish('first','wrong');await f.flush();await f.finish('first');assert.equal((await f.read()).packages[0].status,'accepted');
 await f.control('restart','first',{confirmed:true,resumePlan:true});await f.service.change(s=>s.plans[0].packages[0].definition.acceptancePolicy={mode:'auto',maxRepairs:0,maxRetries:0});await f.finish('first','wrong');assert.equal((await f.read()).packages[0].status,'review');
});
test('missing command evidence never passes and is not retried on each scheduler tick',async t=>{
 const f=await fixture(t);await f.save([{...node('first'),acceptanceChecks:[check({kind:'tool-exit',target:'npm test',expected:'0'})]}]);await f.control('start');await f.finish('first','All tests passed');await f.flush();
 const p=(await f.read()).packages[0];assert.equal(p.status,'review');assert.equal(p.attempts[0].automaticReview.outcome,'indeterminate');assert.equal(p.attempts.length,1);
});
test('metric comparison uses complete recorded command output, not model claims',()=>{
 const c=check({kind:'metric',target:'measure --json',evidence:'/latency/p95',expected:'200',operator:'lte'});
 const run={tools:[{status:'completed',label:'measure --json',exitCode:0,detail:'{"latency":{"p95":180}}'}]};
 assert.equal(acceptance.deterministic(c,run).outcome,'pass');run.tools[0].detail='{"latency":{"p95":240}}';assert.equal(acceptance.deterministic(c,run).outcome,'fail');
 run.tools[0].detail='{"latency":{"p95":"180"}}';assert.equal(acceptance.deterministic(c,run).outcome,'indeterminate');delete run.tools[0].exitCode;assert.equal(acceptance.deterministic(c,run).outcome,'indeterminate');
 const remote={tools:[{status:'completed',label:'remote_exec',detail:JSON.stringify({arguments:{command:c.target},result:{content:[{type:'text',text:JSON.stringify({stdout:'{"latency":{"p95":100}}',exitCode:0,truncated:false})}]}})}]};
 assert.equal(acceptance.deterministic(c,remote).outcome,'pass');
 const wrapped={tools:[{status:'completed',label:'/bin/zsh -lc "measure --json"',exitCode:0,detail:'{"latency":{"p95":180}}'}]};
 assert.equal(acceptance.deterministic(c,wrapped).outcome,'pass');wrapped.tools[0].label='/bin/zsh -lc "measure --json"; echo fabricated';assert.equal(acceptance.deterministic(c,wrapped).outcome,'indeterminate');
});
test('independent reviewer must cite valid evidence and cover every criterion',async t=>{
 const f=await fixture(t);let calls=0;f.service.generateAcceptance=async(_config,request)=>{calls++;assert.match(request.prompt,/independent delivery reviewer/);return {results:[{id:'result',outcome:'pass',reason:'Claimed correct',evidence:['invented-id']}]};};
 await f.save([{...node('first'),acceptanceChecks:[check({kind:'rubric'})]}]);await f.control('start');await f.finish('first');await f.flush();assert.equal(calls,1);assert.equal((await f.read()).packages[0].attempts[0].automaticReview.outcome,'indeterminate');
});
test('document rubric uses delivered content and records a separate assessment',async t=>{
 const f=await fixture(t);f.service.generateAcceptance=async()=>({results:[{id:'result',outcome:'pass',reason:'Includes agreed scope and exclusions',evidence:['output:0']}]});
 await f.save([{...node('first'),acceptanceChecks:[check({kind:'rubric',requirement:'Document includes scope and exclusions'})]}]);await f.control('start');await f.finish('first','Scope: delivery. Exclusions: payments.');assert.equal((await f.read()).packages[0].status,'accepted');
});
test('pausing aborts an active model review and late completion cannot release successors',async t=>{
 const f=await fixture(t);let resolve,entered;const started=new Promise(r=>entered=r);f.service.generateAcceptance=async()=>{entered();return new Promise(r=>resolve=r);};
 const plan=await f.save([{...node('first'),acceptanceChecks:[check({kind:'rubric'})]},node('next',['first'])]);await f.control('start');f.runtime.runs[0].status='completed';f.runtime.runs[0].messages=[{role:'assistant',text:'OK'}];await f.service.plans.pulse(plan.id);await started;
 await f.control('pause');resolve({results:[{id:'result',outcome:'pass',reason:'OK',evidence:['output:0']}]});await f.service.plans.automationJobs.get(plan.id)?.promise;
 assert.equal((await f.read()).packages[0].status,'review');assert.equal(f.runtime.runs.length,1);assert.equal((await f.read()).packages[0].attempts[0].automaticReview,undefined);
 f.service.generateAcceptance=async()=>({results:[{id:'result',outcome:'pass',reason:'OK',evidence:['output:0']}]});await f.control('resume');await f.flush();assert.equal((await f.read()).packages[0].status,'accepted');
});
test('changing a result during review discards the verdict',async t=>{
 const f=await fixture(t);f.service.generateAcceptance=async()=>{f.runtime.runs[0].messages.push({role:'assistant',text:'Changed output'});return {results:[{id:'result',outcome:'pass',reason:'OK',evidence:['output:0']}]};};
 await f.save([{...node('first'),acceptanceChecks:[check({kind:'rubric'})]}]);await f.control('start');await f.finish('first');const p=(await f.read()).packages[0];assert.equal(p.status,'review');assert.equal(p.acceptance,undefined);assert.match(p.attempts[0].automaticReview.reason,/变化/);
});
test('explicit completion bypass is distinguishable from verified quality; manual override inherits correctly',async t=>{
 const f=await fixture(t);await f.save([{...node('first'),acceptancePolicy:{mode:'complete',maxRepairs:0,maxRetries:0}},{...node('next',['first']),acceptancePolicy:{mode:'manual',maxRepairs:0,maxRetries:0}}]);await f.control('start');await f.finish('first','wrong');await f.flush();await f.finish('next');const plan=await f.read();assert.equal(plan.packages[0].acceptance.source,'completion-policy');assert.equal(plan.packages[1].status,'review');
});
test('restarting a branch invalidates all descendants, retains histories and leaves independent work running',async t=>{
 const f=await fixture(t);await f.save([node('first'),node('next',['first']),node('independent')]);await f.control('start');await f.finish('first');await f.flush();const before=await f.read(),independent=f.runtime.runs.find(r=>r.collaboration.requestId===before.packages[2].attempts[0].requestId);
 const result=await f.control('restart','first',{confirmed:true,resumePlan:true});assert.equal(result.packages[0].attempts.length,2);assert.equal(result.packages[0].acceptance,undefined);assert.equal(result.packages[1].status,'pending');assert.equal(result.packages[1].attempts.length,1);assert.equal(independent.status,'running');assert.equal(result.packages[2].attempts.length,1);
});
test('restart is idempotent and cannot reset a still-running affected task',async t=>{
 const f=await fixture(t);const plan=await f.save([node('first')]);await f.control('start');const stop=f.runtime.stop;f.runtime.stop=async()=>{};
 await assert.rejects(f.control('restart','first',{confirmed:true,resumePlan:true}),/尚未停止/);assert.equal((await f.read()).status,'paused');assert.equal((await f.read()).packages[0].attempts.length,1);
 f.runtime.stop=stop;const input={id:plan.id,expectedRevision:1,commandId:randomUUID(),action:'restart',packageId:'first',confirmed:true,resumePlan:true};await f.service.controlPlan(input,{});await f.service.controlPlan(input,{});assert.equal((await f.read()).packages[0].attempts.length,2);
});
test('service retry is delayed, bounded, and never replays a recorded tool effect',async t=>{
 const f=await fixture(t);await f.save([node('first')]);await f.control('start');let run=f.runtime.runs[0];run.status='failed';run.error='503 service unavailable';await f.flush();let p=(await f.read()).packages[0];assert.equal(p.status,'pending');assert.ok(p.retryAt>Date.now());await f.flush();assert.equal(f.runtime.runs.length,1);
 await f.service.change(s=>s.plans[0].packages[0].retryAt=0);await f.flush();assert.equal(f.runtime.runs.length,2);run=f.runtime.runs[1];run.tools=[{status:'completed',label:'side-effect'}];run.status='failed';run.error='503';await f.flush();assert.equal((await f.read()).packages[0].status,'failed');assert.equal(f.runtime.runs.length,2);
});
test('policy parsing rejects unbounded retries and malformed metric thresholds',()=>{
 assert.throws(()=>acceptance.policy({mode:'auto',maxRetries:100}),/0–3/);assert.throws(()=>acceptance.checks([check({kind:'metric',target:'measure',evidence:'/value',expected:'NaN'})]),/数值/);
});
test('bounded remote fingerprints detect changes, ignore dependency caches and reject symlinks',{skip:process.platform==='win32'?'Remote POSIX shell fixture runs on macOS/Linux CI':false},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'remote-evidence-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const exec=require('node:util').promisify(require('node:child_process').execFile),remote=require('../core/workforce/remote-evidence.cjs');
 const ssh={async execute(id,cwd,command,options){assert.equal(id,'ssh');assert.equal(options.timeoutMs,8000);assert.match(command,/^python3 -c /);const result=await exec('/bin/sh',['-c',command],{cwd,timeout:8000});return {stdout:result.stdout,exitCode:0};}};
 const project={connectionId:'ssh',path:root};await fs.writeFile(path.join(root,'app.py'),'print(1)');
 const a=await remote.capture(ssh,project);assert.equal(a.complete,true);assert.equal(a.files,1);
 await fs.mkdir(path.join(root,'node_modules'));await fs.writeFile(path.join(root,'node_modules','cache'),'ignored');assert.equal((await remote.capture(ssh,project)).digest,a.digest);
 await fs.writeFile(path.join(root,'app.py'),'print(2)');assert.notEqual((await remote.capture(ssh,project)).digest,a.digest);
 await fs.symlink('app.py',path.join(root,'linked.py'));assert.equal((await remote.capture(ssh,project)).complete,false);
});
test('remote automatic review requires an unchanged snapshot and the same assigned target',async()=>{
 const project={id:'remote',type:'ssh',connectionId:'ssh',path:'/app'},fingerprint={digest:'a'.repeat(64),head:null,files:1,scope:'project-source-v1',complete:true};
 const service={spaces:{workspace:{read:async()=>({projects:[project]})}},runtime:{ssh:{execute:async()=>({exitCode:0,stdout:JSON.stringify(fingerprint)})}}};
 const run={projectId:'remote',workEvidence:[{remote:true,target:{connectionId:'ssh',path:'/app'},output:{...fingerprint}}]};
 await acceptance.verifyWorkspace({definition:{mode:'work'}},run,service);
 fingerprint.digest='b'.repeat(64);await assert.rejects(acceptance.verifyWorkspace({definition:{mode:'work'}},run,service),/变化/);
 project.path='/elsewhere';await assert.rejects(acceptance.verifyWorkspace({definition:{mode:'work'}},run,service),/关联已变化/);
});
test('an orphaned checking marker falls back to human review without another model call',async t=>{
 const f=await fixture(t);await f.save([node('first')]);await f.control('start');await f.control('pause');
 f.runtime.runs[0].status='completed';f.runtime.runs[0].messages=[{role:'assistant',text:'OK'}];
 await f.service.change(s=>{const p=s.plans[0].packages[0];p.status='review';p.attempts[0].runId=f.runtime.runs[0].id;p.attempts[0].automaticReview={state:'checking'};});
 await f.control('resume');await f.flush();const p=(await f.read()).packages[0];assert.equal(p.status,'review');assert.equal(p.attempts[0].automaticReview.outcome,'indeterminate');assert.match(p.reason,/中断/);
});
test('plan-policy revisions preserve accepted nodes with unaffected explicit overrides',async t=>{
 const f=await fixture(t);await f.save([{...node('first'),acceptancePolicy:{mode:'auto',maxRepairs:0,maxRetries:0}},node('next',['first'])]);await f.control('start');await f.finish('first');await f.control('pause');const plan=await f.read();
 const revised=await f.service.savePlan({id:plan.id,expectedRevision:plan.revision,spaceId:plan.spaceId,value:{name:plan.name,goal:plan.goal,acceptancePolicy:{mode:'manual',maxRepairs:0,maxRetries:0},packages:plan.packages.map(p=>p.definition)}});
 assert.equal(revised.packages[0].status,'accepted');assert.equal(revised.packages[0].attempts.length,1);assert.equal(revised.packages[1].status,'pending');
});
test('cancelling while credentials load never starts a late model review',async()=>{
 let resolve,called=false;const config=new Promise(r=>resolve=r),controller=new AbortController();
 const service={spaces:{workforce:{providers:{secret:()=>config}},generateAcceptance:async()=>{called=true;return {};}}};
 const job=acceptance.evaluate(service,{goal:'Review'}, {definition:{title:'Doc',acceptance:'Coverage',verification:'Read document'}}, {messages:[{role:'assistant',text:'Document'}]},controller.signal);
 controller.abort();resolve({});await assert.rejects(job,/abort/i);assert.equal(called,false);
});
test('direct retry is limited to finished automatic fallback and preserves the acceptance definition',async t=>{
 const f=await fixture(t);await f.save([{...node('first'),acceptancePolicy:{mode:'manual',maxRepairs:0,maxRetries:0}}]);await f.control('start');await f.finish('first');
 await assert.rejects(f.control('retry','first'),/不可重试/);
 await f.service.change(s=>{s.plans[0].packages[0].attempts[0].automaticReview={state:'checking'};});
 await assert.rejects(f.control('retry','first'),/不可重试/);
 await f.service.change(s=>{s.plans[0].packages[0].attempts[0].automaticReview={state:'done',outcome:'indeterminate',reason:'缺少测试证据',results:[]};});
 const before=(await f.read()).packages[0].definition;await f.control('retry','first');const p=(await f.read()).packages[0];
 assert.deepEqual(p.definition,before);assert.equal(p.attempts.length,2);assert.match(p.rework,/缺少测试证据/);assert.equal(p.attempts[0].review,undefined);
});
