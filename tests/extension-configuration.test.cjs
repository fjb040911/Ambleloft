const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {Database}=require('../electron/database.cjs');const {ExtensionService}=require('../core/extensions/service.cjs');
test('host settings persist, reject stale edits, notify backend, and reset without granting access',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'config-'));const db=new Database(dir);
 try{
 await db.call('ready');await db.call('extensionMutation',{action:'initialize',legacy:[],diagnostics:[]});
 const manifest={version:'1',permissions:[{capability:'configuration',scope:'self'}],configuration:{type:'object',properties:{name:{type:'string'}},additionalProperties:false}};
 await db.call('extensionMutation',{action:'stage',id:'test.config',revision:{id:'test.config',digest:'one',manifest}});
 let items=await db.call('extensionMutation',{action:'commit',id:'test.config',digest:'one'});
 items=await db.call('extensionMutation',{action:'grants',id:'test.config',expectedGeneration:items[0].generation,grants:[{capability:'configuration',resource:'self'}]});
 const service=new ExtensionService(db);service.items=items;service.packages={validateValue:async(_schema,value)=>typeof value.name==='string'};
 const events=[];service.hosts={configurationChanged:(_id,value)=>events.push(value)};
 let data=await service.configuration({id:'test.config'});assert.deepEqual(data.value,{});
 const input={id:'test.config',action:'save',generation:data.generation,expectedRevision:data.revision,value:{name:'Saved'}};
 data=await service.configuration(input);assert.deepEqual(data.value,{name:'Saved'});assert.deepEqual(events,[{name:'Saved'}]);
 await assert.rejects(service.configuration(input),/CONFLICT/);
 await assert.rejects(service.configuration({...input,expectedRevision:data.revision,value:{name:1}}),/INVALID/);
 data=await service.configuration({id:'test.config',action:'reset',generation:data.generation,expectedRevision:data.revision});
 assert.deepEqual(data.value,{});assert.deepEqual(events.at(-1),{});
 }finally{await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
