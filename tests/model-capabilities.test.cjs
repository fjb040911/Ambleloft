const test=require('node:test');const assert=require('node:assert/strict');
const {createProviderStore,normalizeProvider}=require('../electron/provider.cjs');
const {applyImageInputPolicy,imageInputCapability,imageInputInstructions}=require('../electron/model-capabilities.cjs');
const {startChatBridge}=require('../electron/chat-bridge.cjs');const http=require('node:http');

test('model image capabilities persist independently and legacy models default to unknown',async()=>{
 let stored=null;const database={call:async(method,args)=>method==='readSetting'?stored:(stored=structuredClone(args.value))};
 const provider=createProviderStore('',{},database);
 const base={baseUrl:'https://example.com/v1',model:'text',models:['text','vision','old']};
 const saved=await provider.save({...base,modelImageInputs:{text:'unsupported',vision:'supported'}});
 const restarted=createProviderStore('',{},database);
 assert.equal(imageInputCapability(await restarted.secret(saved.id,'text')),'unsupported');
 assert.equal(imageInputCapability(await restarted.secret(saved.id,'vision')),'supported');
 assert.equal(imageInputCapability(await restarted.secret(saved.id,'old')),'unknown');
 assert.deepEqual((await restarted.public(saved.id)).modelImageInputs,{text:'unsupported',vision:'supported'});
 assert.deepEqual(normalizeProvider(base).modelImageInputs,{});
 for(const modelImageInputs of [null,[],{text:true},{text:'auto'}])assert.throws(()=>normalizeProvider({...base,modelImageInputs}),/图片能力/);
});

const history={model:'fixture',tools:[{type:'function',name:'view_image'},{type:'namespace',name:'functions',tools:[{type:'function',name:'view_image'},{type:'function',name:'exec_command'}]}],input:[
 {type:'function_call',name:'view_image',call_id:'old-image',arguments:'{}'},
 {type:'function_call_output',call_id:'old-image',output:[{type:'input_text',text:'keep this text'},{type:'input_image',image_url:'data:image/png;base64,SECRET_IMAGE'}]},
 {role:'user',content:[{type:'input_image',image_url:'https://example.com/private.png'},{type:'input_text',text:'continue'}]}
]};
test('text-only policy preserves history and tool associations while removing every image input',()=>{
 const original=JSON.stringify(history);
 for(const capability of ['unknown','unsupported']){
  const config={model:'fixture',modelImageInputs:{fixture:capability}};
  const result=applyImageInputPolicy(history,config);
  const serialized=JSON.stringify(result);
  assert.ok(!serialized.includes('SECRET_IMAGE'));assert.ok(!serialized.includes('private.png'));
  assert.equal(result.input[1].call_id,'old-image');assert.equal(result.input[1].output[0].text,'keep this text');
  assert.equal(result.tools.length,1);assert.deepEqual(result.tools[0].tools.map(t=>t.name),['exec_command']);
  assert.match(result.input[1].output[1].text,capability==='unknown'?/未配置/:/不支持图片/);
  assert.match(imageInputInstructions(config),/do not claim to have seen images/);
 }
 assert.equal(JSON.stringify(history),original);
 assert.equal(applyImageInputPolicy(history,{model:'fixture',modelImageInputs:{fixture:'supported'}}),history);
});
test('both wire protocols enforce unknown and unsupported capabilities at the HTTP boundary',async()=>{
 const received=[];const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;received.push(JSON.parse(raw));
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.end(req.url.endsWith('/responses')?'event: response.completed\ndata: {"type":"response.completed"}\n\n':'data: {"choices":[{"delta":{"content":"text checks only"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const passthrough of [false,true])for(const capability of ['unknown','unsupported']){
  const bridge=await startChatBridge({baseUrl:`http://127.0.0.1:${server.address().port}`,model:'fixture',modelImageInputs:{fixture:capability}},'text-only-history',passthrough);
  try{const res=await fetch(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey},body:JSON.stringify(history)});
   assert.equal(res.status,200);await res.text();const body=JSON.stringify(received.at(-1));
   assert.ok(!body.includes('SECRET_IMAGE'));assert.ok(!body.includes('private.png'));assert.ok(body.includes('keep this text'));
   assert.ok(!JSON.stringify(received.at(-1).tools).includes('view_image'));
  }finally{bridge.close();}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
