import http from 'node:http';
import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=await mkdtemp(path.join(tmpdir(),'amble-mcp-apps-'));let app,server,round=0,key;const requests=[];
async function waitFor(fn){for(let i=0;i<300;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out');}
try{
 server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));const call=round++<2;
  const item=call?{type:'function_call',id:'fc1',call_id:'call1',namespace:'mcp__amble_extensions',name:round===1?'forms_list':'forms_present',arguments:JSON.stringify(round===1?{}:{key}),status:'completed'}:{type:'message',id:'msg1',role:'assistant',status:'completed',content:[{type:'output_text',text:'请填写表单。',annotations:[]}]};
  res.writeHead(200,{'Content-Type':'text/event-stream'});let sequence=0;const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:sequence++,...data})}\n\n`);const response={id:'response'+round,object:'response',status:'in_progress',output:[]};emit('response.created',{response});emit('response.output_item.added',{output_index:0,item});emit('response.output_item.done',{output_index:0,item});emit('response.completed',{response:{...response,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});res.end();
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const launch=async()=>{app=await electron.launch({args:['.',`--user-data-dir=${path.join(root,'profile')}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();page.on('console',m=>{if(m.type()==='error')console.log('renderer:',m.text());});await page.getByRole('textbox',{name:'任务内容'}).waitFor();return page;};
 let page=await launch();
 await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});dialog.showMessageBox=async()=>({response:1});},path.resolve('examples/skills/travel-expense'));
 const imported=await page.evaluate(()=>window.desktop.skills.import({}));key='skill:'+imported.skill.id+':travel-expense';
 const provider=await page.evaluate(baseUrl=>window.desktop.saveProvider({name:'MCP Apps fixture',baseUrl,model:'fixture',executable:'',protocol:'responses'}),'http://127.0.0.1:'+server.address().port+'/v1');
 const task=await page.evaluate(providerId=>window.desktop.startRun({prompt:'MCP Apps demo',providerId,permission:'default'}),provider.id);
 await waitFor(async()=>{const run=(await page.evaluate(()=>window.desktop.listRuns())).find(r=>r.id===task.id);return run&&['completed','failed'].includes(run.status);});
 const run=await page.evaluate(id=>window.desktop.getRunPage({id}),task.id);assert.equal(run.status,'completed',run.error);
 const outputs=(requests[1]?.input||[]).filter(i=>i.type==='function_call_output');assert.ok(outputs.some(i=>JSON.stringify(i.output).includes('templates')&&JSON.stringify(i.output).includes(key)),'forms_list must return the registered template, not an approval rejection');
 await page.locator('.sidebar').getByRole('button',{name:/MCP Apps demo/}).first().click();
 const card=page.getByLabel('差旅费用登记',{exact:true});await expect(card).toBeVisible();
 await card.evaluate(element=>{window.__formDisabledChanges=0;new MutationObserver(records=>{window.__formDisabledChanges+=records.filter(r=>r.attributeName==='disabled'&&r.target.matches('input,textarea,select')).length;}).observe(element,{subtree:true,attributes:true,attributeFilter:['disabled']});});
 await card.getByLabel('出差地区').selectOption('shanghai');await card.getByLabel('金额').fill('12.30');await card.getByLabel('出差日期').fill('2026-10-01');
 await waitFor(async()=>{const f=(await page.evaluate(id=>window.desktop.forms.list({runId:id}),task.id))[0];return f?.drafts.main?.amount==='12.30'&&f?.drafts.main?.['travel-date']==='2026-10-01';});
 await expect(card.getByLabel('出差日期')).toBeFocused();assert.equal(await page.evaluate(()=>window.__formDisabledChanges),0,'Autosave must not disable fields or interrupt focus');
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/declarative-form.png'});
 await app.close();app=null;page=await launch();const restored=await page.evaluate(id=>window.desktop.forms.list({runId:id}),task.id);assert.equal(restored[0].drafts.main.amount,'12.30');assert.equal(round,3);
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
 await page.locator('.sidebar').getByRole('button',{name:/MCP Apps demo/}).first().click();await page.getByRole('button',{name:'将填写结果发送到聊天'}).click();await waitFor(async()=> (await page.evaluate(id=>window.desktop.forms.list({runId:id}),task.id))[0].status==='completed');
 const sent=await page.evaluate(id=>window.desktop.getRunPage({id}),task.id);assert.equal(sent.messages.filter(m=>m.formSubmissionId).length,1);
 console.log('Declarative forms native passed: default-permission forms_list → forms_present, real Agent MCP presentation, shadcn fields, autosave, restart without replay.');

}finally{await app?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
