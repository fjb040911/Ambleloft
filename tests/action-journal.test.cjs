const {test}=require('node:test');const assert=require('node:assert/strict');const {DatabaseSync}=require('node:sqlite');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {schema,createActionJournal}=require('../core/extensions/action-journal.cjs');
function open(file){const db=new DatabaseSync(file);db.exec(schema);return {db,j:createActionJournal(db,fn=>{db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}})};}
test('reopen recovers prepared and dispatch-boundary records differently; unknown blocks replay',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'action-journal-'));let store=open(path.join(dir,'state.db'));
 try{const first=store.j.prepare({scope:'profile/extension/account',messageId:'a',snapshot:{command:'accept',args:{task:1}}});const second=store.j.prepare({scope:'profile/extension/account',messageId:'b',snapshot:{command:'accept'}});
 store.j.dispatch(second.id,1);store.db.close();store=open(path.join(dir,'state.db'));
 assert.equal(store.j.recover(),2);assert.equal(store.j.get(first.id).state,'notExecuted');assert.equal(store.j.get(second.id).state,'unknown');assert.equal(store.j.recover(),0);
 const retry=store.j.prepare({scope:first.scope,messageId:'a',snapshot:first.snapshot});assert.notEqual(retry.id,first.id);
 assert.throws(()=>store.j.prepare({scope:second.scope,messageId:'b',snapshot:second.snapshot}),/BUSY/);
 assert.throws(()=>store.j.cancelBeforeDispatch(second.id,2),/CONFLICT/);
 }finally{store.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('snapshot is durable, transitions require matching revision, accounts have independent locks',()=>{
 const {db,j}=open(':memory:');try{const snapshot={args:{task:1}};const a=j.prepare({scope:'one',messageId:'message',snapshot});snapshot.args.task=2;assert.equal(j.get(a.id).snapshot.args.task,1);
 assert.throws(()=>j.dispatch(a.id,0),/CONFLICT/);assert.equal(j.get(a.id).state,'prepared');j.dispatch(a.id,1);j.unknown(a.id,2);assert.throws(()=>j.dispatch(a.id,3),/CONFLICT/);
 assert.ok(j.prepare({scope:'two',messageId:'message',snapshot}).id);
 }finally{db.close();}
});
test('accepted and completed writes retain locks; result retry is canonical and atomic',()=>{
 const {db,j}=open(':memory:');try{const r=j.prepare({scope:'s',messageId:'m',snapshot:{effect:'write'}});j.dispatch(r.id,1);
 const input={invocationId:r.id,reportId:'accepted',expectedRevision:2,outcome:'accepted',remoteTaskId:'remote'};
 const accepted=j.report('s',input);assert.equal(accepted.invocation.state,'accepted');assert.deepEqual(j.report('s',{...input}),accepted);
 assert.throws(()=>j.report('other',input),/FORBIDDEN/);assert.throws(()=>j.report('s',{...input,outcome:'failed'}),/CONFLICT/);
 assert.throws(()=>j.prepare({scope:'s',messageId:'m',snapshot:{}}),/BUSY/);
 const final={invocationId:r.id,reportId:'done',expectedRevision:3,outcome:'completed',messageUpdate:{patch:{businessState:'resolved'},expectedRevision:1}};
 assert.throws(()=>j.report('s',final,()=>{throw Error('CONFLICT');}),/CONFLICT/);assert.equal(j.get(r.id).state,'accepted');
 const result=j.report('s',final,()=>({businessState:'resolved'}));assert.equal(result.invocation.state,'completed');
 assert.deepEqual(j.report('s',final,()=>{throw Error('must not reapply');}),result);
 assert.throws(()=>j.prepare({scope:'s',messageId:'m',snapshot:{}}),/BUSY/);
 assert.ok(j.prepare({scope:'s',messageId:'m',snapshot:{effect:'read'}}).id);
 }finally{db.close();}
});
