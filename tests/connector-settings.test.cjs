const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {connectorAction}=require('../electron/extensions/connector-settings.cjs');

test('connector settings scope credentials to saved origin and only return safe status/count',async()=>{
 let revision=1,origin='http://127.0.0.1:3080',prompt=async()=>({value:'fixture'});
 const vault=new Map(),writes=[];
 const id='fixture.search',generation=2,operation=id+'.query';
 const service={
  items:[{id,enabled:true,trusted:true,generation,manifest:{contributes:{connectorSettings:{originField:'origin',credentialPrefix:'api-',testOperation:operation}},operations:[{id:operation,effect:'read',exposeTo:['page']}]}}],
  configuration:async()=>({revision,generation,value:{origin}}),check:async()=>{},displayName:()=>id,
  database:{call:async(_,request)=>({value:vault.get(request.key)??null,revision:0})},
  storage:async(_,key,options)=>{writes.push(key);vault.set(key,options.value);}
 };
 const router={invoke:async(name,input,context)=>{assert.equal(name,operation);assert.equal(context.extensionId,id);await context.validate();return {ok:true,value:{hits:input.query==='missing'?[]:[{text:'not returned'}]}};}};
 const run=(action,query)=>connectorAction(service,router,{request:()=>prompt()},{},{action,id,generation,revision,query});
 assert.deepEqual(await run('status'),{saved:false});
 assert.deepEqual(await run('saveSecret'),{saved:true});
 assert.equal(writes[0],'api-'+createHash('sha256').update(origin).digest('hex'));
 assert.deepEqual(await run('status'),{saved:true});
 assert.deepEqual(await run('test','hit'),{count:1});
 assert.deepEqual(await run('test','missing'),{count:0});
 origin='https://other.example';
 assert.deepEqual(await run('status'),{saved:false});
 prompt=async()=>{revision++;return {value:'stale'};};
 await assert.rejects(run('saveSecret'),/配置已变化/);
 assert.equal(writes.length,1);
 service.check=async()=>{throw Error('FORBIDDEN');};
 await assert.rejects(run('status'),/FORBIDDEN/);
});
