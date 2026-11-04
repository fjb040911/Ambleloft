const test=require('node:test');
const assert=require('node:assert/strict');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {isReferenced}=require('../core/workforce/run-ownership.cjs');
const {transformSync}=require('esbuild');
const fs=require('node:fs');
const compiled={exports:{}};
new Function('module',transformSync(fs.readFileSync('src/collaboration-navigation.ts','utf8'),{loader:'ts',format:'cjs'}).code)(compiled);
const {collaborationDestination}=compiled.exports;
const origin={spaceId:'space',spaceName:'Space',requestId:'request',mode:'work'};
function fixture(state={spaces:[{id:'space'}]}){
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});
 runtime.runs=[{id:'run',title:'Evidence',projectId:null,status:'completed',messages:[],collaboration:origin}];
 runtime.spaces={read:async()=>state};
 let writes=0,pauses=0;
 runtime.persist=async()=>{writes++;};runtime.chatInputs={pause:async()=>{pauses++;}};
 runtime.workspace={read:async()=>({projects:[]})};
 return {runtime,counts:()=>({writes,pauses})};
}
test('space-owned records reject destructive edits before pausing inputs or writing',async()=>{
 for(const change of [{archived:true},{remove:true},{projectId:'other'}]){
  const {runtime,counts}=fixture({spaces:[{id:'space',archivedAt:'yesterday'}]});
  runtime.runs[0].archivedAt='yesterday';const before=structuredClone(runtime.runs);
  await assert.rejects(runtime.edit({id:'run',...change}),{code:'COLLABORATION_RECORD_OWNED'});
  assert.deepEqual(runtime.runs,before);assert.deepEqual(counts(),{writes:0,pauses:0});
  await runtime.edit({id:'run',title:'Renamed'});assert.equal(runtime.runs[0].title,'Renamed');
 }
});
test('evidence remains protected by requests, attempts and document versions after space removal',()=>{
 const run={id:'run',collaboration:origin};
 for(const state of [
  {requests:[{id:'request'}]},
  {requests:[{id:'other',participants:[{runId:'run'}]}]},
  {plans:[{packages:[{attempts:[{runId:'run'}]}]}]},
  {plans:[{packages:[{attempts:[{requestId:'request'}]}]}]},
  {documents:[{sourceRunId:'run'}]},
  {documents:[{versions:[{sourceRunId:'run'}]}]}
 ])assert.equal(isReferenced(run,state),true);
 assert.equal(isReferenced(run,{}),false);
});
test('ownership read failures preserve records; truly orphaned records can be cleaned up',async()=>{
 const {runtime,counts}=fixture();runtime.spaces.read=async()=>{throw Error('read failed');};
 await assert.rejects(runtime.edit({id:'run',archived:true}),/read failed/);
 assert.deepEqual(counts(),{writes:0,pauses:0});
 runtime.spaces={read:async()=>({})};
 await runtime.edit({id:'run',archived:true});await runtime.edit({id:'run',remove:true});
 assert.equal(runtime.runs.length,0);
});
test('standalone expert conversations keep the normal archive and delete lifecycle',async()=>{
 const {runtime}=fixture();delete runtime.runs[0].collaboration;runtime.runs[0].employee={id:'expert'};
 runtime.spaces.read=async()=>{throw Error('must not read spaces');};
 await runtime.edit({id:'run',archived:true});await runtime.edit({id:'run',remove:true});
 assert.equal(runtime.runs.length,0);
});
test('navigation resolves historical attempts and discussions without crossing spaces',()=>{
 const run={id:'run',collaboration:origin};
 const state={spaces:[{id:'space'}],requests:[{id:'request',spaceId:'space',mode:'discussion',participants:[]}],plans:[{id:'wrong',spaceId:'elsewhere',packages:[{id:'wrong',attempts:[{runId:'run'}]}]},{id:'plan',spaceId:'space',packages:[{id:'node',attempts:[{runId:'run',requestId:'request'},{runId:'new',requestId:'new-request'}]}]}]};
 assert.deepEqual(collaborationDestination(run,state),{spaceId:'space',tab:'tasks',planId:'plan',packageId:'node',detailTab:'chat'});
 state.plans=[];
 assert.deepEqual(collaborationDestination(run,state),{spaceId:'space',tab:'discussion',requestId:'request'});
 state.spaces=[];assert.equal(collaborationDestination(run,state),null);
 assert.equal(collaborationDestination({id:'standalone'},state),null);
});
