// Read-only review of a real workforce-discussion probe. No provider or model
// execution is exposed to the browser; documents resolve only through the manifest.
import {readFile} from 'node:fs/promises';
import path from 'node:path';import {randomBytes,createHash} from 'node:crypto';
import {createServer} from 'vite';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {loadSources,download}=require('../../core/catalog-store/service.cjs');
const {verifyRoles,MAX}=require('../../core/workforce/contract.cjs');
const directory=path.resolve(process.argv[2]),token=randomBytes(24).toString('hex');
const read=name=>readFile(path.join(directory,name+'.json'),'utf8').then(JSON.parse);
const actions={async knowledge(input){const state=await read('snapshot');const results=[];for(const d of state.documents.filter(d=>!d.deletedAt&&d.adoptedRevision&&(!input.spaceIds||input.spaceIds.includes(d.spaceId))&&(!input.employeeId||state.spaces.find(s=>s.id===d.spaceId)?.members.some(m=>m.employeeId===input.employeeId)))){const doc=await actions.document({id:d.id,revision:d.adoptedRevision});if(input.query&&!(doc.title+' '+doc.body).includes(input.query))continue;results.push({...doc,spaceName:state.spaces.find(s=>s.id===d.spaceId).name,excerpt:doc.body.slice(0,1000)});}return results;},workspace:()=>read('workspace'),runs:()=>read('runs'),workforce:()=>read('employees'),spaces:()=>read('snapshot'),async roles(){
 const [source]=await loadSources();
 if(!source)return {items:[],stale:true,error:'尚未连接角色库'};
 const verified=verifyRoles(JSON.parse(await download(new URL('roles.json',source.baseUrl).href,MAX)),source);
 return {items:verified.catalog.items,stale:verified.stale,source:source.id};
},async document(input){
 const state=await read('snapshot'),doc=state.documents.find(d=>d.id===input.id),version=doc?.versions.find(v=>v.revision===(input.revision||doc.revision));
 if(!doc||!version)throw Error('文档版本不存在');
 const body=await readFile(path.join(directory,'workforce/documents',doc.spaceId,doc.id,version.hash+'.md'),'utf8');
 if(createHash('sha256').update(body).digest('hex')!==version.hash)throw Error('文档校验失败');
 return {...doc,...version,latestRevision:doc.revision,body};
}};
const server=await createServer({configFile:path.resolve('vite.config.ts'),server:{host:'127.0.0.1',port:Number(process.env.WORKFORCE_REVIEW_PORT||4187),strictPort:true},plugins:[{name:'workforce-real-review',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url?.startsWith('/__review/rpc/')){
  if(req.method!=='POST'||req.headers['x-workforce-review']!==token){res.statusCode=403;res.end();return;}
  try{let body='';for await(const chunk of req){body+=chunk;if(body.length>8000)throw Error('Too large');}const action=req.url.slice('/__review/rpc/'.length);if(!Object.hasOwn(actions,action))throw Error('只读审阅不提供修改或模型执行');const value=await actions[action](JSON.parse(body||'{}'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({value}));}
  catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));}return;
 }
 if(req.url?.split('?')[0]==='/__review/'){
  const html=await readFile(path.resolve('tests/manual/workforce-review.html'),'utf8');res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__review/',html.replace('__TOKEN__',token)));return;
 }next();
 });}}]});
await server.listen();console.log(`http://127.0.0.1:${server.config.server.port}/__review/`);
process.on('SIGINT',()=>void server.close().then(()=>process.exit(0)));
