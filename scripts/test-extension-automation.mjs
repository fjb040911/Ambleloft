import {_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {Database} from '../electron/database.cjs';import {ExtensionService} from '../core/extensions/service.cjs';import {createProviderStore} from '../electron/provider.cjs';
const root=await mkdtemp(path.join(tmpdir(),'amble-m2-desktop-')),profile=path.join(root,'profile'),source=path.join(root,'source'),id='fixture.summary';let app,db;let requests=0;
const server=http.createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);requests++;assert.equal(data.tools,undefined);assert.equal(data.stream,false);assert.equal(data.max_output_tokens,2048);
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Summary from local fixture'})}]}]}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const outputSchema={type:'object',properties:{summary:{type:'string'}},required:['summary'],additionalProperties:false};
async function waitResult(page){let state;for(let n=0;n<200;n++){state=await page.evaluate(id=>window.desktop.extensions.automation({id}),id);if(state.jobs[0]?.status==='succeeded'&&state.events.length===0)return state;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(JSON.stringify(state));}
async function launch(){app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desktop?.extensions?.automation);return page;}
try{
 await mkdir(source);const manifest={specVersion:'1.0-draft',publisher:'fixture',name:'summary',version:'1.0.0',displayName:'M2 Summary Fixture',engines:{api:'1'},main:'main.cjs',permissions:['agent.hooks','conversations.read','background.jobs'].map(capability=>({capability,scope:'project'})),hooks:[{event:'conversation.turn.completed',handler:'summarize'},{event:'background.job.completed',handler:'completed'}]};
 await writeFile(path.join(source,'extension.json'),JSON.stringify(manifest));await writeFile(path.join(source,'main.cjs'),`exports.activate=ctx=>{ctx.hooks.register('summarize',event=>ctx.jobs.submit({projectId:event.projectId,eventKey:event.eventId,prompt:'Summarize',turns:[{conversationId:event.conversationId,turnId:event.turnId,version:event.version}],outputSchema:${JSON.stringify(outputSchema)}}));ctx.hooks.register('completed',async event=>{const job=await ctx.jobs.get(event.jobId);if(job.result?.summary!=='Summary from local fixture')throw Error('Unexpected result');});};`);
 db=new Database(profile);await db.call('ready');const service=new ExtensionService(db,{directory:profile});await service.initialize();await db.call('patchWorkspace',{changes:[{kind:'project',action:'put',id:'project',expectedRevision:null,value:{id:'project',name:'Automation project',path:root,createdAt:new Date().toISOString()}}]});await service.installPackage(source,'directory',async()=>true);await service.setGrants(id,manifest.permissions.map(p=>({capability:p.capability,resource:'project:project'})));
 const providers=createProviderStore(profile,{},db);const provider=await providers.save({create:true,name:'Local test fixture',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture-model',models:['fixture-model'],protocol:'responses'});
 await db.call('automationManage',{id,action:'policy',policy:{paused:false,providerId:provider.id,model:provider.model,dailyLimit:2}});
 await db.call('commitTurn',{runs:[{id:'run',projectId:'project',title:'Fixture turn',status:'completed',createdAt:new Date().toISOString(),messages:[{id:'turn',role:'user',text:'Summarize this expense report'},{id:'answer',role:'assistant',text:'The expense report is ready'}],tools:[],approvals:[]}],runId:'run',turnId:'turn'});await service.shutdown();await db.close();db=null;
 let page=await launch();let state=await waitResult(page);assert.equal(state.jobs[0].result.summary,'Summary from local fixture');assert.equal(requests,1);
 await app.close();app=null;page=await launch();state=await waitResult(page);assert.equal(state.events.length,0);assert.equal(requests,1);
 console.log('M2 Electron passed: startup recovery → utilityProcess Hook → authorized turn input → no-tool HTTP job → result Hook; restart reuses saved result.');
}finally{if(app)await app.close();if(db)await db.close();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
