const path=require('node:path').posix;
const localPath=require('node:path');
const fs=require('node:fs/promises');
const {randomBytes}=require('node:crypto');
const {call,readBytes,sha}=require('./service.cjs');
const {sameTarget,environmentKey}=require('./environment.cjs');
const {containerAdapter}=require('./file-adapter.cjs');
const omitted=new Set(['node_modules','.git','dist','build','coverage','__pycache__']);
const mime={md:'text/plain',html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',pdf:'application/pdf'};
const ext=file=>path.extname(file).slice(1).toLowerCase();
class RemoteFiles{
 constructor({ssh,workspace,runs,directory}){Object.assign(this,{ssh,workspace,runs,directory});this.contexts=new Map();this.officeService=require('../../electron/office-preview.cjs').createOfficePreview({directory:localPath.join(directory,'ssh-office')});}
 async project(input){const p=(await this.workspace.read()).projects.find(p=>p.id===input?.projectId);if(p?.type!=='ssh')throw Error('SSH 项目不存在');const run=input.runId?this.runs().find(r=>r.id===input.runId):null;if(input.runId&&(!run||run.projectId!==p.id))throw Error('任务与项目不匹配');if(run?.remote&&!sameTarget(run.remote,p))throw Error('项目远端位置已改变，请新建任务');return p;}
 async use(input,fn){const p=await this.project(input);if(p.environment?.kind==='docker'){const location=await this.ssh.docker.file(p.connectionId,p.environment,{op:'resolve',root:p.path,path:input.path||''});return fn(containerAdapter(this.ssh.docker,p,location.root),location,p);}return this.ssh.withSftp(p.connectionId,async s=>{const location=await this.ssh.resolve(s,p.path,input.path||'');return fn(s,location,p);});}
 async context(input){const p=await this.project(input),root=await this.ssh.directory(p.connectionId,p.path,p.environment);const key=JSON.stringify([p.id,p.connectionId,environmentKey(p.environment),root,input.runId]);let id=[...this.contexts].find(([,v])=>v.key===key)?.[0];if(!id){id='ssh-'+randomBytes(20).toString('hex');this.contexts.set(id,{key,input:{projectId:p.id,runId:input.runId},connectionId:p.connectionId,environmentKey:environmentKey(p.environment),root});}return {root,baseUrl:`atelier-preview://${id}/`};}
 async list(input){const p=await this.project(input);if(p.environment?.kind==='docker'){const result=await this.ssh.docker.file(p.connectionId,p.environment,{op:'list',root:p.path,path:input.path||''});result.entries=result.entries.filter(e=>input.hidden||(!e.name.startsWith('.')&&!omitted.has(e.name)));result.entries.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));return result;}return this.use(input,async(s,{full,root})=>{const all=await call(s,'readdir',full),entries=[];for(const e of all){if(['.','..'].includes(e.filename)||(!input.hidden&&(e.filename.startsWith('.')||omitted.has(e.filename))))continue;if(e.attrs.isSymbolicLink())continue;if(!e.attrs.isDirectory()&&!e.attrs.isFile())continue;entries.push({name:e.filename,path:path.relative(root,path.join(full,e.filename)),directory:e.attrs.isDirectory()});if(entries.length>=2000)break;}entries.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));return {entries,truncated:all.length>2000};});}
 async search(input){const started=Date.now();const query=String(input.query||'').toLowerCase().slice(0,200);if(!query)return {entries:[],truncated:false};const queue=[''],entries=[];let visited=0;while(queue.length&&visited<10000&&entries.length<300&&Date.now()-started<20000){const directory=queue.shift();const batch=await this.list({...input,path:directory});for(const e of batch.entries){visited++;if(e.directory)queue.push(e.path);else if(e.path.toLowerCase().includes(query))entries.push(e);if(visited>=10000||entries.length>=300)break;}}return {entries,truncated:queue.length>0};}
 async read(input){return this.use(input,async(s,{full,relative})=>{
  const stat=await call(s,'stat',full);if(!stat.isFile())throw Error('仅支持普通文件');const suffix=ext(full),version=`${stat.mtime}:${stat.size}`;
  const base={path:relative,name:path.basename(relative),size:stat.size,version,truncated:false};
  if(mime[suffix]?.startsWith('image/')||suffix==='pdf')return {...base,kind:stat.size>32*1024*1024?'unsupported':suffix==='pdf'?'pdf':'image',reason:'文件超过预览限制'};
  if(['xlsx','xls','pptx','ppt'].includes(suffix))return {...base,kind:stat.size>32*1024*1024?'unsupported':['xls','xlsx'].includes(suffix)?'spreadsheet':'presentation'};
  if(stat.size>1048576)return {...base,kind:'unsupported',reason:'远端文本超过 1 MiB，请下载查看'};
  const {data}=await readBytes(s,full);const hash=sha(data);if(input.version===hash)return {unchanged:true,version:hash};
  if(data.includes(0))return {...base,kind:'unsupported',reason:'二进制文件，请下载查看'};
  try{return {...base,version:hash,sha256:hash,kind:['md','markdown'].includes(suffix)?'markdown':['html','htm'].includes(suffix)?'html':'code',text:new TextDecoder('utf-8',{fatal:true}).decode(data)};}catch{return {...base,kind:'unsupported',reason:'文件不是 UTF-8 文本'};}
 });}
 async bytes(input){return this.use(input,(s,{full})=>readBytes(s,full,32*1024*1024));}
 async cached(input){const {data}=await this.bytes(input),file=localPath.join(this.directory,'ssh-download-cache',sha(data)+'.'+ext(input.path));await fs.mkdir(localPath.dirname(file),{recursive:true});await fs.writeFile(file,data,{mode:0o600});return file;}
 async office(input){return this.officeService.preview(await this.cached(input),input.version);}
 async resource(request){try{const url=new URL(request.url),saved=this.contexts.get(url.hostname);if(!saved)return new Response('Not found',{status:404});const p=await this.project(saved.input);if(environmentKey(p.environment)!==saved.environmentKey||p.connectionId!==saved.connectionId||await this.ssh.directory(p.connectionId,p.path,p.environment)!==saved.root)return new Response('Context changed',{status:404});const input={...saved.input,path:decodeURIComponent(url.pathname.slice(1))};
  if(url.searchParams.has('office'))return new Response(await this.officeService.resource(await this.cached(input),url.searchParams.get('office')),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store'}});
  const contentType=mime[ext(input.path)];if(!contentType)return new Response('Unsupported',{status:415});const {data}=await this.bytes(input);return new Response(data,{headers:{'Content-Type':contentType,'Content-Security-Policy':"default-src 'none'; script-src 'none'; style-src 'unsafe-inline' atelier-preview:; img-src atelier-preview: data:; font-src atelier-preview:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",'Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
 }catch{return new Response('Remote file unavailable',{status:404});}}
 async apps(){return [{id:'default',name:'下载到本地',recommended:true}];}
 async open(input,{dialog,window}){const {data}=await this.bytes(input);const result=await dialog.showSaveDialog(window,{title:'下载远端文件',defaultPath:path.basename(input.path)});if(result.canceled||!result.filePath)return null;await fs.writeFile(result.filePath,data);return {id:'default',name:'下载到本地'};}
 async write(input){
  if(typeof input.text!=='string'||Buffer.byteLength(input.text)>196608||!(input.expectedSha256===null||/^[a-f0-9]{64}$/.test(input.expectedSha256||'')))throw Error('写入需要 UTF-8 文本和读取时的 SHA-256（新文件为 null）');
  const p=await this.project(input);if(p.environment?.kind==='docker')return this.ssh.docker.file(p.connectionId,p.environment,{op:'write',root:p.path,path:input.path,text:input.text,expectedSha256:input.expectedSha256},{signal:input.signal});return this.ssh.withSftp(p.connectionId,async s=>{
   const {full}=await this.ssh.resolve(s,p.path,input.path,true);let stat;try{stat=await call(s,'lstat',full);}catch(e){if(e.code!==2)throw e;}
   if(stat&&!stat.isFile())throw Error('不能覆盖目录或符号链接');
   if(stat&&input.expectedSha256===null||!stat&&input.expectedSha256!==null)throw Error('文件已变化，请重新读取');
   if(stat&&sha((await readBytes(s,full)).data)!==input.expectedSha256)throw Error('文件已变化，请重新读取');
   const data=Buffer.from(input.text),temp=full+'.amble-'+randomBytes(12).toString('hex');let handle;
   try{handle=await call(s,'open',temp,'wx',stat?.mode?stat.mode&0o777:0o600);await new Promise((resolve,reject)=>s.write(handle,data,0,data.length,0,e=>e?reject(e):resolve()));await call(s,'close',handle);handle=null;
    // Recheck immediately before publishing; SFTP cannot provide a cross-client CAS.
    if(stat&&sha((await readBytes(s,full)).data)!==input.expectedSha256)throw Error('文件已变化，请重新读取');
    if(stat)await call(s,'ext_openssh_rename',temp,full);else await call(s,'rename',temp,full);
    return {path:input.path,sha256:sha(data),bytes:data.length};
   }finally{if(handle)await call(s,'close',handle).catch(()=>{});await call(s,'unlink',temp).catch(()=>{});}
  });
 }
}
module.exports={RemoteFiles};
