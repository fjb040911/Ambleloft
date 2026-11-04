const {test}=require('node:test'),assert=require('node:assert/strict');
const {generate}=require('../core/automation/provider.cjs');
const {createProviderStore,probeProvider}=require('../electron/provider.cjs');
const {usesChat}=require('../electron/chat-bridge.cjs');
const caps=require('../core/automation/output-capabilities.cjs');
const schema={type:'object',additionalProperties:false,required:['status','count'],properties:{status:{type:'string',enum:['ok']},count:{type:'integer',minimum:2,maximum:2}}};
const job={prompt:'Return the requested JSON.',input:{fixture:true},outputSchema:schema,repairInvalidOutput:true};
const config=(extra={})=>({baseUrl:'https://fixture.example/v1',model:'unknown-model',protocol:'chat',...extra});
const ok=(value={status:'ok',count:2},protocol='chat')=>new Response(JSON.stringify(protocol==='chat'?{choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
const reject=(message,status=400)=>new Response(JSON.stringify({error:{message}}),{status});
function mock(t,fetch){const old=global.fetch;global.fetch=fetch;t.after(()=>{global.fetch=old;});}
function storage(){let state=null;const database={call:async(method,args)=>method==='readSetting'?structuredClone(state):(state=structuredClone(args.value))};return {database,read:()=>state};}
const encryption={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encrypted:'+s),decryptString:b=>b.toString().slice(10)};

for(const model of ['glm-example','kimi-example','gpt-example'])for(const protocol of ['chat','responses'])test(`${model} ${protocol} uses portable schema output with full local validation`,async t=>{
 let body;mock(t,async(_url,options)=>{body=JSON.parse(options.body);return ok(undefined,protocol);});
 await generate(config({model,protocol}),job);
 const format=protocol==='chat'?body.response_format.json_schema:body.text.format;
 assert.equal(format.strict,true);assert.equal(format.schema.properties.count.minimum,undefined);assert.equal(schema.properties.count.minimum,2);
});
test('explicit unsupported format downgrades once and the successful profile is reused',async t=>{
 const c=config();const modes=[];mock(t,async(_url,o)=>{const mode=JSON.parse(o.body).response_format?.type;modes.push(mode);return mode==='json_schema'?reject('response_format json_schema is not supported'):ok();});
 await generate(c,job);assert.deepEqual(modes,['json_schema','json_object']);assert.deepEqual(c.outputProfiles[0].unsupported,['schema']);
 await generate(c,job);assert.deepEqual(modes,['json_schema','json_object','json_object']);
});
test('format unavailability and explicit allowed-format errors negotiate without vendor names',async t=>{
 for(const message of ['This response_format type is unavailable now','response_format.type must be one of text, json_object']){
  let calls=0;mock(t,async()=>++calls===1?reject(message):ok());const c=config();await generate(c,job);assert.equal(calls,2);assert.equal(c.outputProfiles[0].mode,'json');
 }
});
test('localized model errors preserve machine codes and diagnostics',()=>{
 const {localizeStructuredError}=require('../core/automation/structured-output.cjs');
 const error=Object.assign(Error('PROVIDER_AUTH'),{diagnostics:{httpStatus:401,attempts:1}});
 assert.equal(localizeStructuredError(error),error);assert.equal(error.code,'PROVIDER_AUTH');assert.match(error.message,/身份验证/);assert.equal(error.diagnostics.httpStatus,401);
 const business=Error('PLAN_STALE');assert.equal(localizeStructuredError(business).message,'PLAN_STALE');
});
test('packaged desktop includes the schema validator and its runtime dependencies',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createRequire}=require('node:module');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'packaged-schema-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const files=require('../build/electron-builder.cjs').files;
 for(const name of ['ajv','fast-uri','fast-deep-equal','json-schema-traverse','require-from-string']){
  assert.ok(files.some(f=>f.to==='node_modules/'+name));await fs.cp(path.resolve('node_modules',name),path.join(root,'node_modules',name),{recursive:true});
 }
 const Ajv=createRequire(path.join(root,'entry.cjs'))('ajv');const validate=new Ajv().compile(schema);assert.ok(validate({status:'ok',count:2}));assert.equal(validate({status:'ok',count:'2'}),false);
});
test('all format fallbacks and content repair share a four-request ceiling',async t=>{
 let calls=0;const c=config();mock(t,async(_url,o)=>{calls++;const mode=JSON.parse(o.body).response_format?.type;if(mode)return reject('response_format '+mode+' is unsupported');return ok({wrong:'private-value'});});
 await assert.rejects(generate(c,job),e=>e.message==='INVALID_OUTPUT'&&e.diagnostics.attempts===4);assert.equal(calls,4);assert.equal(c.outputProfiles,undefined);
});
test('schema feedback contains schema locations, never generated values, and never coerces types',async t=>{
 const bodies=[];mock(t,async(_url,o)=>{bodies.push(JSON.parse(o.body));return bodies.length===1?ok({status:'PRIVATE',count:'2'}):ok();});
 const result=await generate(config(),job);assert.equal(result.count,2);assert.equal(bodies.length,2);assert.match(bodies[1].messages[0].content,/Validation errors/);assert.ok(!JSON.stringify(bodies[1]).includes('PRIVATE'));
});
test('native schema syntax cannot bypass full local constraints or additional-property validation',async t=>{
 let calls=0;mock(t,async()=>{calls++;return ok({status:'ok',count:999,unexpected:true});});
 await assert.rejects(generate(config(),job),e=>e.message==='INVALID_OUTPUT'&&e.diagnostics.stage==='schema');assert.equal(calls,2);
});
test('schema-specific rejection does not globally downgrade the service',async t=>{
 const c=config(),modes=[];mock(t,async(_url,o)=>{const mode=JSON.parse(o.body).response_format?.type;modes.push(mode);return modes.length===1?reject('Invalid schema: required fields not supported'):ok();});
 await generate(c,job);assert.equal(c.outputProfiles[0].mode,'json');assert.deepEqual(c.outputProfiles[0].unsupported,[]);await generate(c,job);assert.deepEqual(modes,['json_schema','json_object','json_schema']);
});
test('a schema with optional fields uses JSON without declaring strict output unsupported',async t=>{
 const c=config(),modes=[];mock(t,async(_url,o)=>{modes.push(JSON.parse(o.body).response_format?.type);return ok();});
 await generate(c,{...job,outputSchema:{type:'object',properties:{optional:{type:'string'}}}});await generate(c,job);assert.deepEqual(modes,['json_object','json_schema']);
});
test('credential, quota, server and model failures never downgrade or repair',async t=>{
 for(const [status,message,code] of [[401,'Bad key','PROVIDER_AUTH'],[403,'Forbidden','PROVIDER_AUTH'],[429,'Rate limit','PROVIDER_RATE_LIMIT'],[500,'response_format unsupported','PROVIDER_REJECTED'],[400,'Invalid model ID','PROVIDER_REJECTED'],[404,'model_not_found','MODEL_UNAVAILABLE']]){
  let calls=0;mock(t,async()=>{calls++;return reject(message,status);});const c=config({protocol:'auto'});await assert.rejects(generate(c,{...job,probeProtocol:true}),e=>e.message===code);assert.equal(calls,1);assert.equal(c.outputProfiles,undefined);
 }
});
test('an explicit refusal does not trigger another generation',async t=>{
 let calls=0;mock(t,async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{refusal:'No',content:null}}]}));});
 await assert.rejects(generate(config(),job),/MODEL_REFUSAL/);assert.equal(calls,1);
});
test('cancel during negotiation prevents the next request and caches nothing',async t=>{
 const abort=new AbortController();let calls=0;const c=config();mock(t,async()=>{calls++;abort.abort();return reject('response_format unsupported');});await assert.rejects(generate(c,job,abort.signal),/abort/i);assert.equal(calls,1);assert.equal(c.outputProfiles,undefined);
});
test('protocol auto-detection is explicit, bounded and honors a pinned protocol',async t=>{
 const urls=[];mock(t,async(url)=>{urls.push(url);return url.endsWith('/responses')?reject('Endpoint /responses not supported',404):ok();});
 const c=config({protocol:'auto'});await generate(c,job);assert.deepEqual(urls.map(u=>u.split('/').at(-1)),['responses','completions']);assert.equal(usesChat(c),true);
 urls.length=0;await assert.rejects(generate(config({protocol:'responses'}),job),/PROTOCOL_UNSUPPORTED/);assert.equal(urls.length,1);
});
test('synthetic connection probe discovers a generic 404 route and verifies content, not just HTTP 200',async t=>{
 const c=config({protocol:'auto'}),requests=[];mock(t,async(url,o)=>{requests.push(JSON.parse(o.body));return url.endsWith('/responses')?new Response('Not Found',{status:404}):ok();});
 const result=await probeProvider(c);assert.equal(result.capability.protocol,'chat');assert.equal(result.capability.mode,'schema');assert.equal(requests.length,2);assert.equal(JSON.stringify(requests).includes('project'),false);
 global.fetch=async()=>ok({status:'no',count:7});await assert.rejects(probeProvider(config()),/结构校验/);
});
test('persistent profiles survive restart, isolate model/stream settings and ignore stale writes',async t=>{
 const state=storage(),store=createProviderStore('',encryption,state.database);
 const base={baseUrl:'https://fixture.example/v1',model:'first',models:['first','second'],protocol:'auto',apiKey:'fixture-secret'};
 const saved=await store.save(base);const urls=[];
 mock(t,async(url,o)=>{urls.push(url);const mode=JSON.parse(o.body).response_format?.type;return url.endsWith('/responses')?reject('Endpoint /responses not supported',404):mode==='json_schema'?reject('response_format json_schema unsupported'):ok();});
 await probeProvider(await store.secret(saved.id));
 const restarted=createProviderStore('',encryption,state.database),c=await restarted.secret(saved.id);
 assert.equal(c.detectedProtocol,'chat');assert.equal(c.outputProfiles[0].mode,'json');assert.deepEqual(c.outputProfiles[0].unsupported,['schema']);
 urls.length=0;await generate(c,job);assert.equal(urls.length,1);assert.ok(urls[0].endsWith('/chat/completions'));
 assert.equal((await restarted.secret(saved.id,'second')).outputProfiles.length,0);
 assert.equal(caps.profile(c,'chat',true),undefined);assert.ok(!JSON.stringify(await store.public()).includes('fixture-secret'));
 await store.save({...base,id:saved.id,apiKey:undefined,name:'Renamed'});assert.equal((await store.secret(saved.id)).outputProfiles.length,1);
 const stale=await store.secret(saved.id);await store.save({...base,id:saved.id,apiKey:undefined,reasoningSummary:false});
 await caps.remember(stale,{protocol:'chat',mode:'schema',streaming:false,unsupported:[]});assert.equal((await store.secret(saved.id)).outputProfiles.length,0);
 await store.save({...base,id:saved.id,apiKey:'new-secret'});assert.equal((await store.secret(saved.id)).outputProfiles.length,0);
 assert.ok(!JSON.stringify(state.read()).includes('"apiKey"'));
});
test('expiry, configuration changes and streaming are distinct capability scopes',()=>{
 const c=config();const key=caps.key(c),profile={key,protocol:'chat',mode:'json',streaming:false,verifiedAt:Date.now()};assert.ok(caps.valid(profile,key));assert.ok(!caps.valid({...profile,verifiedAt:Date.now()-caps.TTL-1},key));
 for(const changes of [{baseUrl:'https://other.example/v1'},{model:'other'},{protocol:'responses'},{reasoningSummary:false},{limits:{maxOutputTokens:512}},{encryptedKey:'changed'}])assert.notEqual(caps.key({...c,...changes}),key);
});
test('successful cached calls do not indefinitely extend a downgrade or rewrite settings',async t=>{
 const c=config(),verifiedAt=Date.now()-10000;let writes=0;
 c.outputProfiles=[{protocol:'chat',streaming:false,mode:'json',unsupported:['schema'],verifiedAt}];
 caps.bind(c,async()=>writes++);mock(t,async()=>ok());await generate(c,job);
 assert.equal(writes,0);assert.equal(c.outputProfiles[0].verifiedAt,verifiedAt);
 c.outputProfiles[0].verifiedAt=Date.now()-caps.TTL-1;await generate(c,job);assert.equal(writes,1);assert.equal(c.outputProfiles[0].mode,'schema');
});
test('schema-specific probe fallback reports the verified mode without blacklisting schema output',async t=>{
 let calls=0;mock(t,async()=>++calls===1?reject('Invalid schema: unsupported keyword'):ok());
 const result=await probeProvider(config());assert.equal(result.capability.mode,'json');assert.deepEqual(result.capability.unsupported,[]);
});
test('invalid local schemas are rejected before any network request',async t=>{
 let calls=0;mock(t,async()=>{calls++;return ok();});await assert.rejects(generate(config(),{...job,outputSchema:{type:'invented'}}),/INVALID_SCHEMA/);assert.equal(calls,0);
});
