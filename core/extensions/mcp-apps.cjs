// MCP Apps 2026-01-26, backed by extension Operations, not a second permission system.
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const VERSION='2026-01-26';
const MIME='text/html;profile=mcp-app';
const CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-forms";
const fault=code=>Object.assign(Error(code),{code});
function toolResult(result){return result.ok?{content:[{type:'text',text:JSON.stringify(result.value)}],structuredContent:result.value}:{content:[{type:'text',text:result.error.message}],isError:true,_meta:{ambleError:result.error}};}
function toolDescriptor(op){return {name:op.id,title:op.title,description:op.description,inputSchema:op.inputSchema,...(op._meta?{_meta:{...op._meta,ui:{...op._meta.ui,visibility:op.exposeTo?op.exposeTo.map(c=>c==='agent'?'model':'app'):['model','app']}}}:{})};}
class McpApps {
 constructor({service,router,runtime,locale=()=> 'en',theme=()=> 'light'}){Object.assign(this,{service,router,runtime,locale,theme});this.sessions=new Map();}
 async tools(context){return (await this.router.list(context)).filter(op=>op._meta?.ui).map(toolDescriptor);}
 async invokeTask(id,input,context,run,turnKey){
  let item;try{item=this.router.item(id);}catch{return this.router.invoke(id,input,context);}
  const revision=item.active,generation=item.generation;
  const result=await this.router.invoke(id,input,context);
  const uri=item.manifest.operations.find(op=>op.id===id)?._meta?.ui?.resourceUri;
  if(result.ok&&uri&&item.active===revision&&item.generation===generation&&!context.signal?.aborted){
   const resource=item.manifest.contributes.mcpApps.find(r=>r.uri===uri);
   const record={id:randomUUID(),turnKey,conversationId:run.conversationId,projectId:run.projectId,extensionId:item.id,revision,operationId:id,resourceUri:uri,title:this.service.localized(item,resource.title),extensionName:this.service.displayName(item),input:structuredClone(input),result:toolResult(result)};
   run.taskApps=[...(run.taskApps||[]),record];this.runtime.changed(run);
   // Persist the snapshot; reopening must never replay the producing operation.
   try{await this.runtime.persist();}catch{run.error='交互内容未能保存，请检查磁盘空间。';this.runtime.changed(run);}
  }
  return result;
 }
 async readResource(item,uri){
  const resource=item.manifest.contributes?.mcpApps?.find(r=>r.uri===uri);if(!resource)throw fault('NOT_FOUND');
  const revision=item.revisions.find(r=>r.digest===item.active);if(!revision)throw fault('FORBIDDEN');
  const directory=path.join(this.service.packages.root,revision.relativePath);
  const checked=await this.service.packages.prepare(directory,'directory');if(checked.digest!==item.active)throw fault('FORBIDDEN');
  // Package validation rejects symlinks and noncanonical paths; digest is rechecked above.
  const file=path.join(directory,resource.entry);if((await fs.stat(file)).size>1024*1024)throw fault('INVALID_ARGUMENT');
  const text=await fs.readFile(file,'utf8');
  return {contents:[{uri,mimeType:MIME,text}]};
 }
 async resourceForAgent(uri,context){
  for(const op of await this.router.list(context))if(op._meta?.ui?.resourceUri===uri){const item=this.router.item(op.id),generation=item.generation;const value=await this.readResource(item,uri);context.validate?.();if(item.generation!==generation)throw fault('FORBIDDEN');return value;}
  throw fault('FORBIDDEN');
 }
 validate(s){
  if(this.sessions.get(s.id)!==s||s.owner.window.isDestroyed())throw fault('CANCELLED');
  const run=this.runtime.runs.find(r=>r.id===s.runId);
  if(!run||run.archivedAt||run.conversationId!==s.record.conversationId||run.projectId!==s.record.projectId||!run.taskApps?.some(a=>a.id===s.record.id))throw fault('FORBIDDEN');
  const item=this.router.item(s.record.operationId);
  if(item.id!==s.record.extensionId||item.active!==s.record.revision||item.generation!==s.generation)throw fault('FORBIDDEN');
  return item;
 }
 async check(s){const item=this.validate(s),operation=item.manifest.operations.find(op=>op.id===s.record.operationId);
  await this.router.check({item,operation,input:s.record.input,projectId:operation.projectScoped?s.record.projectId:undefined,context:{caller:'agent',projectId:s.record.projectId,validate:()=>this.validate(s)}});
 }
 async open(owner,{runId,appId}){
  if([...this.sessions.values()].filter(s=>s.owner.id===owner.id).length>=12)throw fault('BUSY');
  const run=this.runtime.runs.find(r=>r.id===runId),record=run?.taskApps?.find(a=>a.id===appId);if(!record)throw fault('NOT_FOUND');
  const item=this.router.item(record.operationId);
  const s={id:randomUUID(),owner,runId,record,generation:item.generation,phase:'new',pending:new Map(),seen:new Set()};this.sessions.set(s.id,s);
  try{await this.check(s);const resource=await this.readResource(item,record.resourceUri);await this.check(s);s.html=resource.contents[0].text;return {sessionId:s.id,url:'amble-app://'+s.id+'/index.html'};}catch(e){this.close(owner,s.id);throw e;}
 }
 close(owner,id){const s=this.sessions.get(id);if(s?.owner.id!==owner.id)return;for(const controller of s.pending.values())controller.abort();this.sessions.delete(id);}
 closeOwner(owner){for(const s of [...this.sessions.values()])if(s.owner.id===owner.id)this.close(owner,s.id);}
 invalidate(extensionId){for(const s of [...this.sessions.values()])if(s.record.extensionId===extensionId){this.close(s.owner,s.id);if(!s.owner.window.isDestroyed())s.owner.window.webContents.send('task-app:closed',{sessionId:s.id});}}
 contextChanged(){for(const s of this.sessions.values())if(s.phase==='ready'&&!s.owner.window.isDestroyed())s.owner.window.webContents.send('task-app:context',{sessionId:s.id,context:{theme:this.theme(),locale:this.locale()}});}
 async document(url){try{const u=new URL(url),s=this.sessions.get(u.host);if(!s||u.pathname!=='/index.html'||u.search||u.hash)throw fault('FORBIDDEN');await this.check(s);if(s.documentServed)throw fault('FORBIDDEN');s.documentServed=true;return new Response(s.html,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':CSP,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(), microphone=(), geolocation=(), clipboard-write=()'}});}catch{return new Response(null,{status:403});}}
 async rpc(owner,sessionId,message){
  const s=this.sessions.get(sessionId),id=message?.id;let executionRequested=false;
  const error=(code,text)=>({jsonrpc:'2.0',id:id??null,error:{code,message:text,...(message?.method==='tools/call'?{data:{effectStatus:executionRequested?'unknown':'notStarted'}}:{})}});
  if(!s||s.owner.id!==owner.id)return error(-32000,'FORBIDDEN');
  if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string'||JSON.stringify(message).length>256*1024)return error(-32600,'Invalid request');
  const notification=id===undefined;
  if(!notification&&!(typeof id==='string'&&id.length<=100||Number.isSafeInteger(id)))return error(-32600,'Invalid request id');
  let controller;
  try{
   await this.check(s);
   if(notification){
    if(message.method==='notifications/cancelled'){s.pending.get(message.params?.requestId)?.abort();return null;}
    if(message.method==='ui/notifications/initialized'&&s.phase==='initializing'){s.phase='ready';return {notifications:[{jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:s.record.input}},{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:s.record.result}]};}
    return null;
   }
   // Keep IDs for the session lifetime: duplicate submissions never dispatch twice.
   if(s.seen.has(id))return error(-32600,'Duplicate request id');
   if(s.seen.size>=2048||s.pending.size>=8)return error(-32000,'BUSY');
   s.seen.add(id);controller=new AbortController();s.pending.set(id,controller);
   const params=message.params||{};let result;
   if(message.method==='ui/initialize'){
    if(s.phase!=='new'||params.protocolVersion!==VERSION||!params.appInfo||typeof params.appInfo.name!=='string'||typeof params.appInfo.version!=='string'||!params.appCapabilities||typeof params.appCapabilities!=='object'||Array.isArray(params.appCapabilities))throw fault('UNSUPPORTED');
    s.phase='initializing';result={protocolVersion:VERSION,hostInfo:{name:'Amblelost',version:'0.2.1'},hostCapabilities:{serverTools:{},sandbox:{permissions:{},csp:{connectDomains:[],resourceDomains:[],frameDomains:[],baseUriDomains:[]}}},hostContext:{theme:this.theme(),locale:this.locale(),platform:'desktop',displayMode:'inline',availableDisplayModes:['inline'],containerDimensions:{maxHeight:640},toolInfo:{tool:toolDescriptor(this.validate(s).manifest.operations.find(op=>op.id===s.record.operationId))}}};
   }else if(message.method==='ping')result={};
   else{
    if(s.phase!=='ready')throw fault('FORBIDDEN');
    if(message.method==='tools/call'){
     const input=params.arguments===undefined?{}:params.arguments;
     if(typeof params.name!=='string'||!input||typeof input!=='object'||Array.isArray(input))throw fault('INVALID_ARGUMENT');
     // A UI cannot switch project, extension, or impersonate the agent.
     if(input.projectId!==undefined&&input.projectId!==s.record.projectId)throw fault('FORBIDDEN');
     executionRequested=true;
     result=toolResult(await this.router.invoke(params.name,input,{caller:'page',extensionId:s.record.extensionId,owner,signal:controller.signal,canUseProject:id=>id===s.record.projectId,validate:()=>this.validate(s)}));
    }else return error(-32601,'Method not supported');
   }
   await this.check(s);return {jsonrpc:'2.0',id,result};
  }catch(e){return notification?null:error(-32000,['FORBIDDEN','CANCELLED','BUSY','INVALID_ARGUMENT','UNSUPPORTED','GRANT_REQUIRED','NOT_FOUND'].includes(e.code||e.message)?e.code||e.message:'INTERNAL');}
  finally{if(controller)s.pending.delete(id);}
 }
}
module.exports={McpApps,toolResult,toolDescriptor,CSP,VERSION,MIME};
