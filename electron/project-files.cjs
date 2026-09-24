const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const TEXT_LIMIT = 1024 * 1024;
const MEDIA_LIMIT = 32 * 1024 * 1024;
const omitted = new Set(['node_modules','dist','build','coverage','__pycache__','target']);
const mime = {html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',avif:'image/avif',pdf:'application/pdf',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf'};
const textExtensions = new Set('md markdown mdx txt log csv tsv js jsx mjs cjs ts tsx json jsonc css scss sass less html htm xml svg yaml yml toml ini conf cfg env gitignore sh bash zsh py rb go rs java kt kts c h cpp hpp cs swift sql graphql vue svelte dockerfile makefile r php lua dart tex'.split(' '));
const extension = file => path.extname(file).slice(1).toLowerCase();
const inside = (root, file) => {const relative=path.relative(root,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
const visible = (name,hidden) => hidden||(!name.startsWith('.')&&!omitted.has(name));
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' atelier-preview:; style-src 'self' 'unsafe-inline' atelier-preview:; img-src atelier-preview: data: blob:; font-src atelier-preview: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

function createProjectFiles({cacheDirectory,getWorkspace,getRuns,getApprovedApps=async()=>[],setApprovedApps=async()=>{}}) {
 const officeService=require('./office-preview.cjs').createOfficePreview({directory:cacheDirectory});
 const approvedApps=new Set();
 const contexts = new Map();
 async function rootFor(input) {
  if(!input||(!input.projectId&&(!input.runId||!input.artifactId)))throw new Error('请选择项目');
  const run=input.runId?(await getRuns()).find(r=>r.id===input.runId):null;
  if(input.runId&&!run)throw new Error('会话不存在');
  if(!input.projectId&&!run?.artifacts?.some(file=>file.id===input.artifactId))throw new Error('交付文件不存在');
  const project=input.projectId?(await getWorkspace()).projects.find(p=>p.id===input.projectId):null;
  if(input.projectId&&(!project||(run&&run.projectId!==project.id)))throw new Error('会话与项目不匹配');
  const root=await fs.realpath(run?.cwd||project.path);
  if(!(await fs.stat(root)).isDirectory())throw new Error('项目目录不可用');
  return root;
 }
 async function resolve(input) {
  const root=await rootFor(input), relative=input.path||'';
  if(typeof relative!=='string'||relative.includes('\0')||path.isAbsolute(relative))throw new Error('文件路径无效');
  const requested=path.resolve(root,relative);
  if(!inside(root,requested))throw new Error('文件不在项目目录内');
  const full=await fs.realpath(requested);
  if(!inside(root,full))throw new Error('不能访问项目外的符号链接');
  if(!input.projectId){const run=(await getRuns()).find(r=>r.id===input.runId);const artifact=run?.artifacts?.find(file=>file.id===input.artifactId);if(!artifact||await fs.realpath(artifact.path)!==full)throw new Error('只能访问所选交付文件');}
  return {root,full,relative:path.relative(root,requested).split(path.sep).join('/'),stat:await fs.stat(full)};
 }
 async function context(input) {
  const root=await rootFor(input);
  const key=JSON.stringify([input.projectId,input.runId||'',input.artifactId||'',root]);
  let token;
  for(const [id,value] of contexts)if(value.key===key)token=id;
  if(!token){token=crypto.randomBytes(24).toString('hex');contexts.set(token,{key,root,input:{projectId:input.projectId,runId:input.runId,artifactId:input.artifactId}});}
  return {root,baseUrl:`atelier-preview://${token}/`};
 }
 async function list(input) {
  if(!input?.projectId)throw new Error('请选择项目');
  const {full,relative,stat}=await resolve(input);
  if(!stat.isDirectory())throw new Error('这不是目录');
  const dir=await fs.opendir(full),entries=[];let truncated=false;
  for await(const item of dir){
   if(!visible(item.name,input.hidden))continue;
   if(entries.length>=2000){truncated=true;break;}
   // Symlinks are resolved only inside the authorized root.
   let directory=item.isDirectory();
   if(item.isSymbolicLink()){try{directory=(await resolve({...input,path:[relative,item.name].filter(Boolean).join('/')})).stat.isDirectory();}catch{continue;}}
   else if(!item.isFile()&&!directory)continue;
   entries.push({name:item.name,path:[relative,item.name].filter(Boolean).join('/'),directory});
  }
  entries.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name,undefined,{numeric:true}));
  return {entries,truncated};
 }
 async function search(input) {
  if(!input?.projectId)throw new Error('请选择项目');
  const query=String(input.query||'').trim().toLowerCase().slice(0,200);
  if(!query)return {entries:[],truncated:false};
  const {root}=await resolve({...input,path:''});const queue=[''],entries=[];let visited=0,truncated=false;
  while(queue.length&&entries.length<300&&visited<10000){
   const relative=queue.shift();let dir;
   try{dir=await fs.opendir(path.join(root,relative));}catch{continue;}
   for await(const item of dir){
    if(++visited>10000){truncated=true;break;}
    if(!visible(item.name,input.hidden)||item.isSymbolicLink())continue;
    const file=[relative,item.name].filter(Boolean).join('/');
    if(item.isDirectory())queue.push(file);
    else if(item.isFile()&&file.toLowerCase().includes(query)){entries.push({name:item.name,path:file,directory:false});if(entries.length>=300){truncated=true;break;}}
   }
  }
  return {entries,truncated:truncated||queue.length>0};
 }
 async function read(input) {
  const {full,relative,stat}=await resolve(input);
  if(!stat.isFile())throw new Error('仅支持普通文件');
  const ext=extension(full),version=`${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  if(input.version===version)return {unchanged:true,version};
  const type=['md','markdown'].includes(ext)?'markdown':['html','htm'].includes(ext)?'html':mime[ext]?.startsWith('image/')?'image':ext==='pdf'?'pdf':['xlsx','xls'].includes(ext)?'spreadsheet':['pptx','ppt'].includes(ext)?'presentation':'code';
  const base={path:relative,name:path.basename(relative),size:stat.size,version,kind:type,truncated:false};
  if(['image','pdf','spreadsheet','presentation'].includes(type))return {...base,kind:stat.size>MEDIA_LIMIT?'unsupported':type,reason:stat.size>MEDIA_LIMIT?'文件超过 32 MiB，请使用外部应用打开。':''};
  const handle=await fs.open(full,'r');let bytes;
  try{const buffer=Buffer.alloc(Math.min(stat.size,TEXT_LIMIT));const result=await handle.read(buffer,0,buffer.length,0);bytes=buffer.subarray(0,result.bytesRead);}finally{await handle.close();}
  if(bytes.includes(0)||(!textExtensions.has(ext)&&ext&&/\.(docx?|xlsx?|pptx?|zip|gz|exe|dmg|mp[34]|mov|sqlite|db)$/i.test(full)))return {...base,kind:'unsupported',reason:'此格式请使用外部应用打开。'};
  try {const decoder=new TextDecoder('utf-8',{fatal:true});const text=decoder.decode(bytes,{stream:stat.size>TEXT_LIMIT});return {...base,text,truncated:stat.size>TEXT_LIMIT};}
  catch{return {...base,kind:'unsupported',reason:'此文件不是 UTF-8 文本，请使用外部应用打开。'};}
 }
 async function office(input){const {full,stat}=await resolve(input);if(!stat.isFile())throw new Error('仅支持普通文件');return officeService.preview(full,input.version);}
 async function resource(request) {
  try{
   const url=new URL(request.url),saved=contexts.get(url.hostname);
   if(!saved||await rootFor(saved.input)!==saved.root)return new Response('Not found',{status:404});
   const relative=decodeURIComponent(url.pathname.slice(1));
   const {full,stat}=await resolve({...saved.input,path:relative});
   if(url.searchParams.has('office')){const content=await officeService.resource(full,url.searchParams.get('office'));return new Response(content,{headers:{'Content-Type':'application/pdf','Access-Control-Allow-Origin':'*','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
   const contentType=mime[extension(full)];
   if(!stat.isFile()||!contentType||stat.size>MEDIA_LIMIT)return new Response('Preview unavailable',{status:413});
   let content=await fs.readFile(full);
   if(contentType==='text/html')content=Buffer.concat([content,Buffer.from(`<script>(()=>{let timer;addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>parent.postMessage({type:'atelier-preview-scroll',top:scrollY},'*'),100)},{passive:true});addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='atelier-preview-restore'&&Number.isFinite(event.data.top))scrollTo(0,Math.max(0,event.data.top))})})()</script>`)]);
   return new Response(content,{headers:{'Content-Type':contentType,...(contentType==='application/pdf'?{}:{'Content-Security-Policy':CSP}),'Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
  }catch{return new Response('File unavailable',{status:404});}
 }
 async function apps(input) {
  await resolve(input);
  if(process.platform!=='darwin')return [];
  const ext=extension(input.path), office=/^(docx?|rtf|odt)$/.test(ext)?['Microsoft Word']: /^(xlsx?|csv|ods)$/.test(ext)?['Microsoft Excel']:/^(pptx?|odp)$/.test(ext)?['Microsoft PowerPoint']:[];
  const names=['Visual Studio Code',...office,...(/^(docx?|xlsx?|pptx?|pdf|txt|csv|rtf|od[tps])$/.test(ext)?['wpsoffice','WPS Office']:[])];
  const found=[];
  for(const name of names)for(const dir of ['/Applications',path.join(os.homedir(),'Applications')]){const app=path.join(dir,name+'.app');try{if((await fs.stat(app)).isDirectory()){found.push({id:app,name:name==='wpsoffice'?'WPS Office':name});break;}}catch{}}
  return found;
 }
 async function open(input,{shell,dialog,window}) {
  const {full,stat}=await resolve(input);if(!stat.isFile())throw new Error('仅支持普通文件');
  if(input.action==='reveal'){shell.showItemInFolder(full);return null;}
  let application=input.application;
  if(application==='choose'){
   if(process.platform!=='darwin')throw new Error('当前平台请使用系统默认应用');
   const selected=await dialog.showOpenDialog(window,{title:'选择打开此文件的应用',defaultPath:'/Applications',properties:['openFile'],filters:[{name:'应用',extensions:['app']}]});
   if(selected.canceled)return null;application=selected.filePaths[0];
   if(!application.endsWith('.app')||!(await fs.stat(application)).isDirectory())throw new Error('请选择应用程序');
   approvedApps.add(application);await setApprovedApps([...new Set([...await getApprovedApps(),application])]);
  }else if(application&&application!=='default'){
   if(!approvedApps.has(application)&&!(await getApprovedApps()).includes(application)&&!(await apps(input)).some(a=>a.id===application))throw new Error('应用已不可用，请重新选择打开方式');
  }
  if(application&&application!=='default'){await exec('/usr/bin/open',['-a',application,full]);return {id:application,name:path.basename(application,'.app')};}
  const error=await shell.openPath(full);if(error)throw new Error(error);return {id:'default',name:'系统默认应用'};
 }
 return {context,list,search,read,office,resolve,resource,apps,open};
}
module.exports={createProjectFiles,TEXT_LIMIT,MEDIA_LIMIT};
