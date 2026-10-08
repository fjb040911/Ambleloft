import http from 'node:http';
import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=await mkdtemp(path.join(tmpdir(),'amble-mcp-apps-'));let app,server,round=0;
async function waitFor(fn){for(let i=0;i<300;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out');}
try{
 server=http.createServer(async(req,res)=>{
  for await(const _chunk of req){}const call=round++===0;
  const item=call?{type:'function_call',id:'fc1',call_id:'call1',namespace:'mcp__amble_extensions',name:'extension_invoke_operation',arguments:JSON.stringify({operationId:'example.task-form.render',input:{destination:'上海',amount:1200}}),status:'completed'}:{type:'message',id:'msg1',role:'assistant',status:'completed',content:[{type:'output_text',text:'请在差旅记录中核对信息。',annotations:[]}]};
  res.writeHead(200,{'Content-Type':'text/event-stream'});let sequence=0;const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:sequence++,...data})}\n\n`);const response={id:'response'+round,object:'response',status:'in_progress',output:[]};emit('response.created',{response});emit('response.output_item.added',{output_index:0,item});emit('response.output_item.done',{output_index:0,item});emit('response.completed',{response:{...response,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});res.end();
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const launch=async()=>{app=await electron.launch({args:['.',`--user-data-dir=${path.join(root,'profile')}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();page.on('console',m=>{if(m.type()==='error')console.log('renderer:',m.text());});await page.getByRole('textbox',{name:'任务内容'}).waitFor();return page;};
 let page=await launch();
 await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});dialog.showMessageBox=async()=>({response:1});},path.resolve('examples/extensions/task-form'));
 await page.evaluate(()=>window.desktop.extensions.install({development:true}));
 await page.evaluate(()=>window.desktop.extensions.grants({id:'example.task-form'}));
 const provider=await page.evaluate(baseUrl=>window.desktop.saveProvider({name:'MCP Apps fixture',baseUrl,model:'fixture',executable:'',protocol:'responses'}),'http://127.0.0.1:'+server.address().port+'/v1');
 const task=await page.evaluate(providerId=>window.desktop.startRun({prompt:'MCP Apps demo',providerId,permission:'full'}),provider.id);
 await waitFor(async()=>{const run=(await page.evaluate(()=>window.desktop.listRuns())).find(r=>r.id===task.id);return run&&['completed','failed'].includes(run.status);});
 const run=await page.evaluate(id=>window.desktop.getRunPage({id}),task.id);assert.equal(run.status,'completed',run.error);assert.equal(run.taskApps?.length,1,JSON.stringify(run));
 await page.locator('.sidebar').getByRole('button',{name:/MCP Apps demo/}).first().click();
 await page.getByRole('button',{name:'打开交互内容',exact:true}).click();
 let frame=page.frameLocator('.task-app-card iframe');await expect(frame.locator('#destination')).toHaveValue('上海');await expect(frame.locator('#save')).toBeEnabled();
 const iframe=page.frames().find(f=>f.url().startsWith('amble-app:'));assert.ok(iframe);
 assert.deepEqual(await iframe.evaluate(()=>[typeof window.desktop,typeof require,typeof process]),['undefined','undefined','undefined']);
 assert.equal(await iframe.evaluate(()=>{try{void window.parent.document;return false;}catch{return true;}}),true);
 assert.equal(await iframe.evaluate(()=>fetch('http://127.0.0.1:1/private').then(()=>false,()=>true)),true);
 let sessionId=new URL(iframe.url()).host;
 await iframe.evaluate(()=>location.href='https://example.com/').catch(()=>{});await expect(page.locator('.task-app-card iframe')).toHaveCount(0);await page.getByRole('button',{name:'重新打开',exact:true}).click();frame=page.frameLocator('.task-app-card iframe');await expect(frame.locator('#save')).toBeEnabled();
 sessionId=new URL(await page.locator('.task-app-card iframe').getAttribute('src')).host;
 await frame.locator('#destination').fill('杭州');await frame.locator('#save').click();await page.getByRole('dialog',{name:'确认扩展操作'}).waitFor();await page.getByRole('button',{name:'取消',exact:true}).click();await expect(frame.locator('#status')).toContainText('未能确认保存结果');
 await frame.locator('#save').click();await page.getByRole('dialog',{name:'确认扩展操作'}).waitFor();await page.getByRole('button',{name:'确认执行',exact:true}).click();await expect(frame.locator('#status')).toHaveText('已保存到本地记录。');
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/mcp-apps-task-form.png'});
 await page.evaluate(()=>window.desktop.newWindow());await waitFor(async()=> (await app.windows()).length===2);const other=(await app.windows()).find(p=>p!==page);await other.getByRole('textbox',{name:'任务内容'}).waitFor();
 assert.equal((await other.evaluate(sessionId=>window.desktop.taskApps.rpc({sessionId,message:{jsonrpc:'2.0',id:999,method:'ping'}}),sessionId)).error.message,'FORBIDDEN');
 await page.evaluate(()=>window.desktop.extensions.grants({id:'example.task-form',revoke:true}));await expect(page.locator('.task-app-card iframe')).toHaveCount(0);await expect(page.locator('.task-app-card')).toContainText('交互内容暂时无法使用');
 await app.close();app=null;page=await launch();const restored=await page.evaluate(id=>window.desktop.getRunPage({id}),task.id);assert.deepEqual(restored.taskApps,run.taskApps);assert.equal(round,2,'Reloading must not execute the producer again');
 console.log('MCP Apps native passed: real Agent route, durable card, isolated iframe, handshake/data, write cancel/confirm, navigation/network denial, cross-window denial, revoke closes UI, restart without replay.');
}finally{await app?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
