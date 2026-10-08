const {randomUUID}=require('node:crypto');const path=require('node:path');const fs=require('node:fs/promises');
const {resource,CSP}=require('./assets.cjs');const {Interactions}=require('./interactions.cjs');const {compileCondition}=require('../../core/extensions/condition.cjs');
const originOf=url=>{const u=new URL(url);return `${u.protocol}//${u.host}`;};
class PageHost{
 constructor({electron,registry,service,workspace,external,locale}){
  Object.assign(this,{electron,registry,service,workspace,external,locale});this.pages=new Map();this.owners=new Map();this.overlays=new Map();this.contexts=new Map();this.development=new Map();
  this.interactions=new Interactions(registry,owner=>this.suspend(owner));
 }
 item(id){const item=this.service.items.find(i=>i.id===id);if(!item||item.kind!=='package'||!item.enabled||!item.trusted||item.pending||!item.manifest.contributes?.home)throw Error('FORBIDDEN');return item;}
 allowed(item,projectId,expression){if(!expression)return true;const types={'project.exists':'boolean'},values={'project.exists':!!projectId};for(const key of item.manifest.contextKeys||[]){types[key.key]=key.type;values[key.key]=this.service.hosts?.entries.get(item.id)?.context[key.key]??key.default;}try{return compileCondition(expression,types)(values);}catch{return false;}}
 valid(p){if(p.closed||p.owner.window.isDestroyed()||this.owners.get(p.owner.id)!==p)throw Error('CANCELLED');const item=this.item(p.extensionId);if(item.active!==p.revision||item.generation!==p.generation)throw Error('FORBIDDEN');return item;}
 context(p){return {protocolVersion:'1',extensionId:p.extensionId,pageInstanceId:p.id,locale:p.locale||this.locale,theme:this.electron.nativeTheme.shouldUseDarkColors?'dark':'light',supportedMethods:['initialize','selectProject','requestGrant','requestSecretInput','invoke']};}
 async open(event,input){
  const owner=this.registry.authorize(event);if(typeof input?.slotId!=='string'||input.slotId.length>100)throw Error('INVALID_ARGUMENT');this.closeOwner(owner.id);
  const item=this.item(input.extensionId);const projectId=this.contexts.get(owner.id)?.projectId;if(!this.allowed(item,projectId,item.manifest.contributes.home.when))throw Error('FORBIDDEN');
  const p={id:randomUUID(),owner,slotId:input.slotId,extensionId:item.id,revision:item.active,generation:item.generation,projectId,locale:this.contexts.get(owner.id)?.locale,pending:new Map(),lastRequest:0,selected:new Set(),closed:false};this.owners.set(owner.id,p);
  try{
   // A new view must use the saved host language even before its first context event.
   // Preserve a newer context update that arrives while workspace storage is read.
   if(!p.locale){const state=await this.workspace.read();this.valid(p);p.locale||=state.language&&state.language!=='system'?state.language:this.locale;}
   const revision=item.revisions.find(r=>r.digest===item.active),directory=path.join(this.service.packages.root,revision.relativePath);
   const checked=await this.service.packages.prepare(directory,'directory');if(checked.digest!==item.active)throw Error('FORBIDDEN');this.valid(p);
   if(item.manifest.main){await this.service.hosts.activate(item.id);this.valid(p);}
   p.root=await fs.realpath(path.join(directory,item.manifest.contributes.home.webRoot));p.development=this.development.get(item.id);p.origin=p.development||'amble-extension://'+p.id;p.url=p.origin+'/'+item.manifest.contributes.home.entry;
   const partition=this.electron.session.fromPartition('extension-page-'+p.id,{cache:false});p.session=partition;
   partition.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));partition.setPermissionCheckHandler(()=>false);partition.on('will-download',event=>event.preventDefault());
   partition.webRequest.onBeforeRequest((details,callback)=>{let allow=false;try{allow=originOf(details.url)===p.origin||(p.development&&originOf(details.url)===p.origin.replace(/^http:/,'ws:'));}catch{}callback({cancel:!allow});});
   if(p.development)partition.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[CSP.replace("script-src 'self'","script-src 'self' 'unsafe-inline' 'unsafe-eval'").replace("connect-src 'self'","connect-src 'self' "+p.origin.replace(/^http:/,'ws:'))]}}));
   else await partition.protocol.handle('amble-extension',request=>p.closed?new Response(null,{status:403}):resource(p.root,p.origin,request));
   const view=new this.electron.WebContentsView({webPreferences:{session:partition,preload:path.join(__dirname,'page-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,disableDialogs:true,webviewTag:false,navigateOnDragDrop:false,devTools:false,backgroundThrottling:true}});p.view=view;this.pages.set(view.webContents.id,p);view.setVisible(false);owner.window.contentView.addChildView(view);
   view.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'){event.preventDefault();owner.window.focus();owner.window.webContents.focus();owner.window.webContents.send('extension-page:focus-host');}});
   view.webContents.setWindowOpenHandler(()=>({action:'deny'}));view.webContents.on('will-attach-webview',event=>event.preventDefault());
   view.webContents.on('will-frame-navigate',event=>{event.preventDefault();if(event.isMainFrame){this.close(p);if(/^https?:\/\//.test(event.url))void this.external(owner.window,event.url);}});
   view.webContents.on('will-redirect',event=>{event.preventDefault();this.close(p);});
   view.webContents.on('did-navigate',(_event,url)=>{if(url!==p.url)this.close(p);});
   view.webContents.on('render-process-gone',()=>this.close(p));view.webContents.once('destroyed',()=>this.close(p));
   p.resize=()=>this.layout(p);owner.window.on('resize',p.resize);owner.window.on('enter-full-screen',p.resize);owner.window.on('leave-full-screen',p.resize);
   p.ownerClosed=()=>this.close(p);owner.window.once('closed',p.ownerClosed);
   await view.webContents.loadURL(p.url);this.valid(p);this.layout(p);return {pageInstanceId:p.id};
  }catch(error){this.close(p);throw error;}
 }
 layout(p){if(!p.view||p.closed||p.owner.window.isDestroyed())return;
  const bounds=p.bounds,owner=p.owner.window;const visible=bounds&&p.visible&&!(this.overlays.get(owner.id)?.size);if(!visible){p.view.setVisible(false);return;}
  const z=owner.webContents.getZoomFactor(),[w,h]=owner.getContentSize();const x=Math.max(0,Math.min(w,Math.round(bounds.x*z))),y=Math.max(0,Math.min(h,Math.round(bounds.y*z)));const width=Math.max(0,Math.min(w-x,Math.round(bounds.width*z))),height=Math.max(0,Math.min(h-y,Math.round(bounds.height*z)));
  p.view.setBounds({x,y,width,height});p.view.webContents.setZoomFactor(z);p.view.setVisible(width>0&&height>0);
 }
 setLayout(event,input){const owner=this.registry.authorize(event),p=this.owners.get(owner.id);if(!p||p.slotId!==input?.slotId)return;
  if(!input.bounds||!['x','y','width','height'].every(k=>Number.isFinite(input.bounds[k])&&Math.abs(input.bounds[k])<100000))throw Error('INVALID_ARGUMENT');p.bounds=input.bounds;p.visible=input.visible===true;this.layout(p);
 }
 overlay(owner,key,enabled){
  let set=this.overlays.get(owner.id);if(!set){set=new Set();this.overlays.set(owner.id,set);}const r=[...this.registry.records.values()].find(r=>r.window===owner),p=r&&this.owners.get(r.id);
  if(enabled){if(!set.size&&p?.view?.webContents.isFocused())p.restoreFocus=true;set.add(key);}else set.delete(key);
  if(p){this.layout(p);if(enabled&&!owner.isDestroyed())owner.webContents.focus();else if(!set.size&&p.restoreFocus&&p.visible&&owner.isFocused()){p.restoreFocus=false;p.view?.webContents.focus();}}
 }
 suspend(owner){const key=randomUUID();this.overlay(owner,key,true);return ()=>{this.overlay(owner,key,false);};}
 close(p){if(!p||p.closed)return;p.closed=true;for(const request of p.pending.values())request.abort.abort();p.pending.clear();if(this.owners.get(p.owner.id)===p)this.owners.delete(p.owner.id);
  if(p.view){this.pages.delete(p.view.webContents.id);try{p.view.setVisible(false);if(!p.owner.window.isDestroyed())p.owner.window.contentView.removeChildView(p.view);if(!p.view.webContents.isDestroyed())p.view.webContents.close();}catch{}}
  p.owner.window.removeListener('resize',p.resize||(()=>{}));p.owner.window.removeListener('enter-full-screen',p.resize||(()=>{}));p.owner.window.removeListener('leave-full-screen',p.resize||(()=>{}));p.owner.window.removeListener('closed',p.ownerClosed||(()=>{}));
  if(p.session){if(!p.development)p.session.protocol.unhandle('amble-extension');void p.session.clearStorageData().catch(()=>{});}if(!p.owner.window.isDestroyed())p.owner.window.webContents.send('extension-page:closed',{slotId:p.slotId});
 }
 resetOwner(owner){this.closeOwner(owner.id);this.overlays.delete(owner.window.id);this.contexts.delete(owner.id);}
 closeOwner(id,slotId){const p=this.owners.get(id);if(p&&(!slotId||p.slotId===slotId))this.close(p);}
 invalidate(id){for(const p of [...this.owners.values()])if(p.extensionId===id)this.close(p);}
 changed(id,action){const item=this.service.items.find(i=>i.id===id);for(const p of [...this.owners.values()])if(p.extensionId===id){if(action==='grants'&&item?.active===p.revision){p.generation=item.generation;for(const r of p.pending.values())if(!r.granting)r.abort.abort();}else this.close(p);}}
 authorize(event){const p=this.pages.get(event.sender?.id);if(!p||event.sender!==p.view.webContents||event.senderFrame!==event.sender.mainFrame||originOf(event.senderFrame.url)!==p.origin)throw Error('FORBIDDEN');this.valid(p);return p;}
 cancel(event,input){const p=this.authorize(event);p.pending.get(input?.id)?.abort.abort();}
 async rpc(event,message){let p,request;const id=typeof message?.id==='string'?message.id:'';
  const fail=code=>({ok:false,error:{code,message:code,requestId:id,effectStatus:request?.dispatched?'unknown':'notStarted'}});
  try{
   p=this.authorize(event);if(message?.protocolVersion!=='1'||!/^\d{1,15}$/.test(id)||Number(id)<=p.lastRequest)throw Error('INVALID_ARGUMENT');p.lastRequest=Number(id);
   if(p.pending.size>=16)throw Error('BUSY');if(Buffer.byteLength(JSON.stringify(message))>256*1024)throw Error('INVALID_ARGUMENT');
   request={abort:new AbortController(),generation:p.generation};p.pending.set(id,request);const params=message.params;if(!params||typeof params!=='object'||Array.isArray(params))throw Error('INVALID_ARGUMENT');
   let value;if(message.method==='initialize')value=this.context(p);
   else if(message.method==='invoke'){if(!this.router)throw Error('UNSUPPORTED');return await this.router.invoke(params.operationId,params.input,{caller:'page',extensionId:p.extensionId,owner:p.owner,signal:request.abort.signal,canUseProject:id=>p.selected.has(id)||(this.valid(p).grants||[]).some(g=>g.resource==='project:'+id),validate:()=>this.valid(p)});}
   else if(['selectProject','requestGrant','requestSecretInput','invoke'].includes(message.method))value=await this.interact(p,request,message.method,params);
   else throw Error('UNSUPPORTED');
   this.valid(p);if(request.abort.signal.aborted||request.generation!==p.generation)throw Error('CANCELLED');return {ok:true,value};
  }catch(error){const code=String(error.message).split(':')[0];return fail(['FORBIDDEN','CANCELLED','TIMEOUT','BUSY','INVALID_ARGUMENT','UNSUPPORTED','CONFLICT','STORAGE_UNAVAILABLE'].includes(code)?code:'INTERNAL');}
  finally{if(p&&request&&p.pending.get(id)===request)p.pending.delete(id);}
 }
 async interact(p,request,method,params){
  const item=this.valid(p),permissions=item.manifest.permissions||[];let capabilities=method==='requestSecretInput'?['secrets']:params.capabilities;
  if(!Array.isArray(capabilities)||!capabilities.length||capabilities.length>10||new Set(capabilities).size!==capabilities.length||!capabilities.every(c=>permissions.some(d=>d.capability===c)))throw Error('FORBIDDEN');
  const projects=(await this.workspace.read()).projects;
  if(method==='requestGrant'&&(!p.selected.has(params.projectId)||!projects.some(project=>project.id===params.projectId)))throw Error('FORBIDDEN');
  if(method==='requestSecretInput'&&(typeof params.key!=='string'||!params.key.length||params.key.length>200||typeof params.title!=='string'||!params.title.length||params.title.length>120))throw Error('INVALID_ARGUMENT');
  const payload={extensionName:this.service.displayName(item),extensionId:item.id,kind:method,capabilities,key:params.key,title:params.title,projects:method==='selectProject'?projects.map(({id,name,description})=>({id,name,description:description||''})):undefined,project:method==='requestGrant'?projects.find(project=>project.id===params.projectId)?.name:undefined};
  const result=await this.interactions.request(p.owner,payload,request.abort.signal);this.valid(p);if(request.generation!==p.generation)throw Error('CONFLICT');
  const projectId=method==='selectProject'?result.projectId:params.projectId,selected=projects.find(project=>project.id===projectId);
  if(method==='selectProject'&&!selected)throw Error('INVALID_ARGUMENT');
  if(method==='requestSecretInput'&&(typeof result.value!=='string'||!result.value.length||result.value.length>16000))throw Error('INVALID_ARGUMENT');
  const additions=capabilities.map(capability=>({capability,resource:permissions.find(d=>d.capability===capability).scope==='self'?'self':'project:'+projectId}));
  request.granting=true;await this.service.setGrants(item.id,[...(item.grants||[]),...additions],request.generation,()=>{this.valid(p);if(request.abort.signal.aborted)throw Error('CANCELLED');request.dispatched=true;});this.valid(p);request.generation=p.generation;
  if(request.abort.signal.aborted)throw Error('CANCELLED');
  if(method==='requestSecretInput'){
   const context={id:item.id,generation:p.generation};try{const prior=await this.service.storage(context,params.key,{kind:'secret'});await this.service.storage(context,params.key,{kind:'secret',write:true,value:result.value,expectedRevision:prior.revision});}catch{throw Error('STORAGE_UNAVAILABLE');}return {saved:true};
  }
  if(method==='selectProject'){p.selected.add(projectId);return {id:selected.id,name:selected.name,description:selected.description||''};}return true;
 }
 async updateContext(event,input){const owner=this.registry.authorize(event);const value={projectId:(await this.workspace.read()).projects.some(project=>project.id===input?.projectId)?input.projectId:null,locale:typeof input?.locale==='string'?input.locale:this.locale};this.contexts.set(owner.id,value);owner.window.webContents.send('extensions:event');const p=this.owners.get(owner.id);if(p){p.locale=value.locale;const item=this.item(p.extensionId);if(!this.allowed(item,value.projectId,item.manifest.contributes.home.when)){this.close(p);return;}p.view?.webContents.send('extension-page:context',this.context(p));}}
 async configureDevelopment(event,input,confirm){const owner=this.registry.authorize(event),item=this.item(input?.id);const revision=item.revisions.find(r=>r.digest===item.active);if((item.sourceMode||revision.sourceMode)!=='directory')throw Error('FORBIDDEN: 仅开发目录支持本地服务');if(!input.url){this.invalidate(item.id);this.development.delete(item.id);return true;}const url=new URL(input.url);if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('INVALID_ARGUMENT: 仅允许本地 HTTP origin');if(await confirm(owner.window,url.origin)){if(this.item(item.id).generation!==item.generation)throw Error('CONFLICT');this.invalidate(item.id);this.development.set(item.id,url.origin);}return true;}
 shutdown(){for(const p of [...this.owners.values()])this.close(p);}
}
module.exports={PageHost,originOf};
