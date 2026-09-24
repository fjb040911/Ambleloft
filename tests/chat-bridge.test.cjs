const test=require('node:test');const assert=require('node:assert/strict');const {translateRequest,readSSE,usesChat}=require('../electron/chat-bridge.cjs');
test('chat adapter is selectable and preserves namespace and custom tool identity',()=>{
 assert.equal(usesChat({model:'DeepSeek-v4-flash'}),true);assert.equal(usesChat({model:'DeepSeek-v4-flash',protocol:'responses'}),false);assert.equal(usesChat({model:'other'}),false);
 const tools=[{type:'namespace',name:'a',tools:[{type:'function',name:'search',parameters:{type:'object'}}]},{type:'namespace',name:'b',tools:[{type:'function',name:'search',parameters:{type:'object'}}]},{type:'custom',name:'apply_patch',description:'Apply patch'}];
 const {body,definitions}=translateRequest({model:'fixture',input:[{type:'custom_tool_call',name:'apply_patch',call_id:'c',input:'patch'},{type:'custom_tool_call_output',call_id:'c',output:'ok'}],tools},{model:'fixture'});
 assert.equal(definitions.size,3);assert.equal(new Set(body.tools.map(t=>t.function.name)).size,3);assert.equal(body.messages[0].tool_calls[0].function.name,body.tools[2].function.name);assert.equal(body.messages[0].tool_calls[0].function.arguments,'{"input":"patch"}');assert.equal(body.messages[1].tool_call_id,'c');
 assert.throws(()=>translateRequest({input:[{type:'compaction'}]},{}),/暂不支持/);assert.throws(()=>translateRequest({previous_response_id:'r'},{}),/完整会话历史/);
});
test('SSE parser preserves UTF-8 across chunks and rejects unfinished events',async()=>{
 const bytes=Buffer.from('data: {"text":"思考"}\r\n\r\ndata: [DONE]\n\n');async function* chunks(){for(const byte of bytes)yield Buffer.from([byte]);}
 const result=[];for await(const event of readSSE(chunks()))result.push(event);assert.deepEqual(result,['{"text":"思考"}','[DONE]']);
 async function* broken(){yield Buffer.from('data: {');}await assert.rejects(async()=>{for await(const event of readSSE(broken()))void event;},/断开/);
});
test('tool aliases resolve only exact uniquely advertised names',()=>{
 const {resolveTool}=require('../electron/chat-bridge.cjs');
 const {definitions}=translateRequest({tools:[{type:'function',name:'exec_command'},{type:'namespace',name:'a',tools:[{type:'function',name:'search'}]},{type:'namespace',name:'b',tools:[{type:'function',name:'search'}]}],input:[]},{});
 assert.equal(resolveTool('exec_command',definitions).name,'exec_command');
 assert.equal(resolveTool('a.search',definitions).namespace,'a');
 assert.equal(resolveTool('search',definitions),undefined);
 assert.equal(resolveTool('unknown_command',definitions),undefined);
 assert.equal(resolveTool('exec',definitions),undefined);
 for(const [name,definition] of definitions)assert.equal(resolveTool(name,definitions),definition);
});
test('plain tool names stay readable and history uses exactly the advertised name',()=>{
 const {body,definitions}=translateRequest({tools:[{type:'function',name:'exec_command'}],input:[{type:'function_call',name:'exec_command',call_id:'old-call',arguments:'{"cmd":"pwd"}'},{type:'function_call_output',call_id:'old-call',output:'ok'}]},{});
 assert.equal(body.tools[0].function.name,'exec_command');
 assert.equal(body.messages[0].tool_calls[0].function.name,'exec_command');
 const {resolveTool}=require('../electron/chat-bridge.cjs');
 assert.equal(resolveTool('exec_command',definitions).name,'exec_command');
 assert.equal(resolveTool('exec_command_c942d4a1a1ab37f5e7f9c96b',definitions),undefined);
});

test('replayed image tool results remain images and follow all parallel tool results',()=>{
 const image='data:image/png;base64,'+'A'.repeat(400000);
 const input=[
  {type:'function_call',name:'view_image',call_id:'a',arguments:'{}'},
  {type:'function_call',name:'view_image',call_id:'b',arguments:'{}'},
  {type:'function_call_output',call_id:'a',output:[{type:'input_text',text:'First screenshot'},{type:'input_image',image_url:image,detail:'high'}]},
  {type:'function_call_output',call_id:'b',output:[{type:'input_image',image_url:image}]},
  {role:'user',content:'Continue.'},
 ];
 const original=JSON.stringify(input);
 const {body}=translateRequest({input},{model:'vision',modelImageInputs:{vision:'supported'}});
 assert.deepEqual(body.messages.map(m=>m.role),['assistant','tool','tool','user','user']);
 assert.deepEqual(body.messages[0].tool_calls.map(c=>c.id),['a','b']);
 assert.match(body.messages[1].content,/First screenshot/);
 assert.ok(body.messages.filter(m=>m.role==='tool').every(m=>m.content.length<100&&!m.content.includes('base64')));
 const images=body.messages[3].content.filter(c=>c.type==='image_url');
 assert.equal(images.length,2);assert.equal(images[0].image_url.url,image);assert.equal(images[0].image_url.detail,'high');
 assert.equal(body.messages[4].content,'Continue.');assert.equal(JSON.stringify(input),original);
});
test('text-only structured custom tool results stay text and unknown media fails explicitly',()=>{
 const {body}=translateRequest({input:[{type:'custom_tool_call_output',call_id:'c',output:[{type:'input_text',text:'one'},{type:'input_text',text:'two'}]}]},{});
 assert.equal(body.messages[0].content,'one\ntwo');assert.equal(body.messages.length,1);
 assert.throws(()=>translateRequest({input:[{type:'function_call_output',call_id:'c',output:[{type:'input_audio',data:'secret'}]}]},{}),/暂不支持工具结果类型/);
});

test('requests without available tools omit tool_choice, including after image filtering',()=>{
 for(const tools of [undefined,[],[{type:'function',name:'view_image'}],[{type:'namespace',name:'functions',tools:[{type:'function',name:'view_image'}]}]]){
  for(const tool_choice of ['none','auto','required']){
   const {body}=translateRequest({input:'Summarize the conversation.',tools,tool_choice},{});
   assert.equal(Object.hasOwn(body,'tools'),false);assert.equal(Object.hasOwn(body,'tool_choice'),false);
  }
 }
 const {body}=translateRequest({input:'Continue.',tools:[{type:'function',name:'exec_command'}],tool_choice:'none'},{});
 assert.equal(body.tools.length,1);assert.equal(body.tool_choice,'none');
});
