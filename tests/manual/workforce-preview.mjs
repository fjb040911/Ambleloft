// Isolated visual QA host. Uses real storage, roles and installers; never starts a model.
// node tests/manual/workforce-preview.mjs /absolute/path/to/trusted-source.json
import {createRequire} from 'node:module';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{Database}=require('../../electron/database.cjs'),{createSkills}=require('../../electron/skills.cjs'),{CatalogStore,loadSources}=require('../../core/catalog-store/service.cjs'),{WorkforceService}=require('../../core/workforce/service.cjs'),{SpaceService}=require('../../core/workforce/spaces.cjs');
const directory=process.argv[3]||await mkdtemp(path.join(os.tmpdir(),'amble-workforce-visual-')),database=new Database(directory);await database.call('ready');
const skills=createSkills(directory,database);
const catalog=new CatalogStore({directory,database,skills,extensions:{items:[]},sources:await loadSources(process.argv[2])});await catalog.initialize();
const workforce=new WorkforceService({directory,database,skills,catalog});await workforce.initialize();
const projects=[{id:'qa-gateway',name:'api-gateway',path:'/example/api-gateway',createdAt:new Date().toISOString()},{id:'qa-router',name:'model-router',path:'/example/model-router',createdAt:new Date().toISOString()}];
const spaces=new SpaceService({directory,database,workspace:{read:async()=>({projects})},workforce,runtime:{runs:[],start(){throw Error('Visual QA does not run models');}}});await spaces.initialize();
const port=Number(process.env.WORKFORCE_PREVIEW_PORT||4186);
const token=crypto.randomBytes(24).toString('hex');
const workspace=require('../../electron/store.cjs').createStore(directory,database);
const actions={app:{workspace:()=>workspace.read(),patch:input=>workspace.patch(input)},workforce:Object.fromEntries(['snapshot','save','submit','controlPreparation','remove','activate','roles','createDraft','saveDraft','discardDraft','suggestRole','guideRole','cancelRoleSuggestion','suggestExpertSkills','cancelExpertSkillSuggestion','resolveExpertSkillSuggestion','importRepository'].map(k=>[k,input=>workforce[k](input)])),spaces:Object.fromEntries(['snapshot','save','saveDocument','adoptDocument','withdrawDocument','restoreDocument','document','savePlan','suggestPlan','reviewPlan','controlPlan','knowledge'].map(k=>[k,input=>spaces[k](input)])),store:{catalog:input=>catalog.catalog(input)}};
const server=await createServer({configFile:path.resolve('vite.config.ts'),server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'isolated-workforce-qa',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url?.startsWith('/__workforce/rpc/')){if(req.method!=='POST'||req.headers['x-workforce-qa']!==token){res.statusCode=403;res.end();return;}try{let body='';for await(const chunk of req){body+=chunk;if(body.length>256000)throw Error('Too large');}const [,group,action]=req.url.match(/^\/__workforce\/rpc\/([a-z]+)\/([a-zA-Z]+)$/)||[];if(!actions[group]?.[action])throw Error('Unavailable in QA');const value=await actions[group][action](JSON.parse(body||'null'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({value}));}catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));}return;}
 if(req.url==='/__workforce/narrow'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>窄屏验证</title><iframe title="工作台窄屏" src="/__workforce/" style="width:390px;height:calc(100vh - 24px);border:1px solid #ddd"></iframe>');return;}
 if(req.url?.split('?')[0]==='/__workforce/'){const html=await readFile(path.resolve('tests/manual/workforce-preview.html'),'utf8');res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__workforce/',html.replace('__TOKEN__',token)));return;}next();});}}]});
await server.listen();console.log(JSON.stringify({url:`http://127.0.0.1:${port}/__workforce/`,profile:directory}));
process.on('SIGINT',()=>void(async()=>{await server.close();await spaces.shutdown();await workforce.shutdown();await catalog.shutdown();await database.close();process.exit(0);})());
