// Formal Electron UI + real pinned engine + local deterministic inference.
// Set ATELIER_TEST_APP to a macOS .app to run the same acceptance on a packaged build.
import http from 'node:http';
import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=await mkdtemp(path.join(tmpdir(),'amble-user-input-'));
const definition=JSON.parse(await readFile('resources/skills/supplemental-input/examples/travel.json','utf8'));
let app,server,release,round=0,protocol,requests=[],serverError;
const results=[];
async function until(fn){for(let i=0;i<400;i++){if(serverError)throw serverError;if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('User input acceptance timed out');}
try{
 server=http.createServer(async(req,res)=>{try{
  let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);requests.push(body);round++;
  const tools=(body.tools||[]).flatMap(t=>t.type==='namespace'?t.tools.map(x=>({...x,namespace:t.name})):[t.function||t]);
  const name=['input_capabilities','input_request','extension_list_operations'][round-1];
  const tool=name?tools.find(t=>t.name===name||t.name?.endsWith('_'+name)||t.name?.startsWith(name)):null;
  if(name)assert.ok(tool,'Missing tool: '+name);
  const item=tool?{id:'fc'+round,type:'function_call',call_id:'call'+round,name:tool.name,...(tool.namespace?{namespace:tool.namespace}:{}),arguments:JSON.stringify(name==='input_request'?definition:{}),status:'completed'}:{id:'msg'+round,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'已收到补充信息。',annotations:[]}]};
  const send=()=>{
   res.writeHead(200,{'Content-Type':'text/event-stream'});
   if(protocol==='chat'){const delta=tool?{tool_calls:[{index:0,id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments}}]}:{content:'已收到补充信息。'};res.end('data: '+JSON.stringify({choices:[{index:0,delta,finish_reason:tool?'tool_calls':'stop'}]})+'\n\ndata: [DONE]\n\n');return;}
   let sequence=0;const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:sequence++,...data})}\n\n`);
   const response={id:'response'+round,object:'response',status:'in_progress',output:[]};emit('response.created',{response});emit('response.output_item.added',{output_index:0,item});emit('response.output_item.done',{output_index:0,item});emit('response.completed',{response:{...response,status:'completed',output:[item],usage:{input_tokens:10,output_tokens:10,total_tokens:20}}});res.end();
  };
  if(round===4)release=send;else send();
 }catch(e){serverError=e;res.destroy(e);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(protocol of ['responses','chat']){
  requests=[];round=0;release=null;serverError=null;
  const profile=path.join(root,protocol);
  const launch=async()=>{const packaged=process.env.ATELIER_TEST_APP;app=await electron.launch({...(packaged?{executablePath:path.join(packaged,'Contents/MacOS/Ambleloft')}:{ }),args:[...(packaged?[]:['.']),`--user-data-dir=${profile}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.getByRole('textbox',{name:'任务内容',exact:true}).waitFor();return page;};
  let page=await launch();
  const builtin=await page.evaluate(async()=> (await window.desktop.skills.list()).find(s=>s.builtIn?.key==='supplemental-input'));
  assert.ok(builtin,'Built-in guide must be installed');
  const provider=await page.evaluate(async({url,protocol})=>window.desktop.saveProvider({name:'U9 fixture',baseUrl:url,model:'fixture',executable:'',protocol}),{url:'http://127.0.0.1:'+server.address().port+'/v1',protocol});
  const task=await page.evaluate(providerId=>window.desktop.startRun({prompt:'U9 补充信息验收',providerId,permission:'default'}),provider.id);
  await until(()=>release);assert.equal(round,4,'Independent tool must execute before user answer');
  const requestText=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(requestText):[];
  assert.ok(requestText(requests[0]).some(text=>text.includes(builtin.path)||text.includes(JSON.stringify(builtin.path).slice(1,-1))),'Built-in guide must be discoverable in the engine request');
  const snapshots=await page.evaluate(runId=>window.desktop.inputs.list({runId}),task.id);assert.equal(snapshots.requests.length,1);assert.equal(snapshots.requests[0].state,'pending');assert.equal(snapshots.deliveries.length,0);
  await page.locator('.activity-rail').getByRole('button',{name:'任务',exact:true}).click();await page.locator('.sidebar').getByRole('button',{name:/U9 补充信息验收/}).first().click();
  const dock=page.getByRole('region',{name:'待补充信息',exact:true});await expect(dock).toBeVisible();
  await dock.getByRole('button',{name:'提交补充信息',exact:true}).click();
  await expect(dock.getByLabel('目的地',{exact:false})).toBeEnabled();
  await expect(dock.getByLabel('目的地',{exact:false})).toHaveAttribute('aria-invalid','true');
  await dock.getByLabel('目的地',{exact:false}).fill('Shanghai U9');await dock.getByLabel('出发日期',{exact:false}).fill('2026-12-01');
  await until(async()=>{const r=(await page.evaluate(runId=>window.desktop.inputs.list({runId}),task.id)).requests[0];return r.draft.destination==='Shanghai U9'&&r.draft.departure==='2026-12-01';});
  await mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/u9-${process.env.ATELIER_TEST_APP?'packaged':'electron'}-${protocol}.png`});
  await dock.getByRole('button',{name:'提交补充信息',exact:true}).click();
  await until(async()=>{const s=await page.evaluate(runId=>window.desktop.inputs.list({runId}),task.id);return s.deliveries[0]?.state==='delivered';});
  const running=await page.evaluate(id=>window.desktop.getRunPage({id}),task.id);assert.equal(running.status,'running');assert.equal(running.totalTurns,1);
  release();await until(async()=> (await page.evaluate(id=>window.desktop.getRunPage({id}),task.id)).status==='completed');
  assert.ok(JSON.stringify(requests.at(-1)).includes('Shanghai U9'),'Next inference must receive confirmed answer');
  const delivered=await page.evaluate(runId=>window.desktop.inputs.list({runId}),task.id);assert.equal(delivered.requests[0].state,'answered');assert.equal(delivered.deliveries.length,1);
  const before=round;await app.close();app=null;page=await launch();
  const restored=await page.evaluate(runId=>window.desktop.inputs.list({runId}),task.id);assert.equal(restored.requests[0].answer.values.destination,'Shanghai U9');assert.equal(restored.deliveries[0].state,'delivered');assert.equal(round,before,'Restart must not resend');
  const reinstalled=await page.evaluate(async()=> (await window.desktop.skills.list()).find(s=>s.builtIn?.key==='supplemental-input'));assert.equal(reinstalled.revision,builtin.revision,'Restart must not reinstall unchanged guide');
  results.push({protocol,packaged:!!process.env.ATELIER_TEST_APP,passed:true,independentWork:true,sameTurn:true,restartNoReplay:true,builtinDiscovered:true});console.log(JSON.stringify(results.at(-1)));
  await app.close();app=null;
 }
}finally{await app?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
