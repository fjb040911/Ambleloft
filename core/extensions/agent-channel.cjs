// One ephemeral, authenticated MCP endpoint per host-owned execution context.
const http=require('node:http');const {randomBytes,timingSafeEqual}=require('node:crypto');
const TOOLS=[{name:'extension_list_operations',description:'List authorized extension operations for this task project.',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'extension_invoke_operation',description:'Invoke an operation returned by extension_list_operations. Host authorization and confirmation always apply. Never retry an unknown outcome automatically.',inputSchema:{type:'object',properties:{operationId:{type:'string'},input:{type:'object'}},required:['operationId','input'],additionalProperties:false}}];
async function createAgentChannel({list,invoke,tools,resource,forms}){
 const token=randomBytes(32).toString('hex'),controllers=new Set();let closed=false;
 const server=http.createServer(async(req,res)=>{
  const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
  if(closed||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)||req.headers.origin||req.url!=='/mcp'){res.writeHead(403);res.end();return;}
  if(req.method!=='POST'){res.writeHead(405);res.end();return;}
  if(controllers.size>=16){res.writeHead(429);res.end();return;}
  const abort=new AbortController();controllers.add(abort);res.on('close',()=>abort.abort());
  try{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>270*1024)throw Error('Request too large');}const m=JSON.parse(raw);let result;
   if(m.id===undefined){res.writeHead(202);res.end();return;}
   if(m.method==='initialize')result={protocolVersion:m.params?.protocolVersion||'2024-11-05',capabilities:{tools:{},...(resource?{resources:{}}:{})},serverInfo:{name:'amble-extensions',version:'1'}};
   else if(m.method==='ping')result={};
   else if(m.method==='tools/list')result={tools:[...TOOLS,...(forms?[{name:'forms_list',description:'List deterministic host form templates. Use forms_present to display a selected form; never reproduce it as markdown.',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'forms_present',description:'Display a registered form in this conversation. User fills it and confirms submission. Do not submit on their behalf.',inputSchema:{type:'object',properties:{key:{type:'string'},prefill:{type:'object'}},required:['key'],additionalProperties:false}}]:[]),...(tools?await tools(abort.signal):[])]};
   else if(m.method==='resources/list'&&resource)result={resources:(await tools(abort.signal)).map(t=>({uri:t._meta.ui.resourceUri,name:t.title||t.name,mimeType:'text/html;profile=mcp-app'})).filter((r,i,all)=>all.findIndex(v=>v.uri===r.uri)===i)};
   else if(m.method==='resources/read'&&resource)result=await resource(m.params?.uri,abort.signal);
   else if(m.method==='tools/call'){
    const args=m.params?.arguments||{};let value,direct=false;
    if(forms&&m.params.name==='forms_list')value=await forms.list();
    else if(forms&&m.params.name==='forms_present'&&typeof args.key==='string')value=await forms.present(args);
    else if(m.params.name===TOOLS[0].name&&Object.keys(args).length===0)value=await list(abort.signal);
    else if(m.params.name===TOOLS[1].name&&typeof args.operationId==='string'&&args.input&&typeof args.input==='object'&&!Array.isArray(args.input)&&Object.keys(args).every(k=>['operationId','input'].includes(k)))value=await invoke(args.operationId,args.input,abort.signal);
    else if(tools&&(await tools(abort.signal)).some(t=>t.name===m.params.name)&&args&&typeof args==='object'&&!Array.isArray(args)){direct=true;value=await invoke(m.params.name,args,abort.signal);}
    else throw Error('Invalid tool arguments');
    result=direct?require('./mcp-apps.cjs').toolResult(value):{content:[{type:'text',text:JSON.stringify(value)}],isError:value?.ok===false};
   }else{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Method not found'}}));return;}
   if(!closed&&!abort.signal.aborted){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));}
  }catch{if(!res.destroyed){res.writeHead(400);res.end();}}finally{controllers.delete(abort);}
 });
 server.requestTimeout=150000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {config:{url:`http://127.0.0.1:${server.address().port}/mcp`,http_headers:{Authorization:'Bearer '+token},tool_timeout_sec:270},close(){closed=true;for(const c of controllers)c.abort();server.closeAllConnections();server.close();}};
}
module.exports={createAgentChannel,TOOLS};
