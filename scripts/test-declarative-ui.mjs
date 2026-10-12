import http from 'node:http';
import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.env.AMBLE_UI_TEST_ROOT||await mkdtemp(path.join(tmpdir(),'amble-ui-desktop-'));
const skillDirectory=path.resolve(process.env.AMBLE_UI_SKILL_DIR||'specs/extensions/examples/declarative-ui');
const templateId=process.env.AMBLE_UI_TEMPLATE_ID||'review';
const templateTitle=process.env.AMBLE_UI_TEMPLATE_TITLE||'代码审查';
const fixtureData=process.env.AMBLE_UI_DATA_FILE?JSON.parse(await (await import('node:fs/promises')).readFile(process.env.AMBLE_UI_DATA_FILE,'utf8')):{values:{},rows:[{id:'A',severity:'high',file:'src/a.ts',status:'open',details:'需要检查的业务数据'},{id:'B',severity:'low',file:'src/b.ts',status:'open'}],state:'ready',coverage:'fixture only'};
const selectedKey=process.env.AMBLE_UI_SELECTED_KEY||'A';const testMode=process.env.AMBLE_UI_TEST_MODE||'collection';let app,server,key,round=0;const requests=[];
async function waitFor(fn){for(let i=0;i<300;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out');}
try{
 server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));round++;
 const tool=round===1?'ui_capabilities':round===2?'ui_list':round===3?'ui_present':null;
 const item=tool?{type:'function_call',id:'fc'+round,call_id:'call'+round,namespace:'mcp__amble_extensions',name:tool,arguments:JSON.stringify(round===3?{key,data:fixtureData}:{}),status:'completed'}:{type:'message',id:'msg'+round,role:'assistant',status:'completed',content:[{type:'output_text',text:'已收到，请按按钮继续。',annotations:[]}]};
 res.writeHead(200,{'Content-Type':'text/event-stream'});let sequence=0;const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:sequence++,...data})}\n\n`);const response={id:'response'+round,object:'response',status:'in_progress',output:[]};emit('response.created',{response});emit('response.output_item.added',{output_index:0,item});emit('response.output_item.done',{output_index:0,item});emit('response.completed',{response:{...response,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});res.end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const launch=async()=>{app=await electron.launch({args:['.',`--user-data-dir=${path.join(root,'profile')}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.getByRole('textbox',{name:'任务内容'}).waitFor();return page;};let page=await launch();
 await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});dialog.showMessageBox=async()=>({response:1});},skillDirectory);
 const imported=await page.evaluate(()=>window.desktop.skills.import({}));key='skill:'+imported.skill.id+':'+templateId;
 const provider=await page.evaluate(baseUrl=>window.desktop.saveProvider({name:'UI fixture',baseUrl,model:'fixture',executable:'',protocol:'responses'}),'http://127.0.0.1:'+server.address().port+'/v1');
 const task=await page.evaluate(providerId=>window.desktop.startRun({prompt:'declarative UI desktop fixture',providerId,permission:'default'}),provider.id);
 await waitFor(async()=>round>=4&&(await page.evaluate(id=>window.desktop.getRunPage({id}),task.id)).status==='completed');
 assert.ok(JSON.stringify(requests[1]).includes('declarativeUi'));assert.ok(JSON.stringify(requests[2]).includes(key),'ordinary skill UI must be discoverable without an extension backend');
 await page.locator('.activity-rail').getByRole('button',{name:'任务',exact:true}).click();await page.locator('.sidebar').getByRole('button',{name:/declarative UI desktop fixture/}).first().click();await expect(page.getByText(templateTitle,{exact:true})).toBeVisible();
 if(process.env.AMBLE_UI_SCREENSHOT)await page.screenshot({path:process.env.AMBLE_UI_SCREENSHOT,fullPage:true});
 if(testMode==='file'){
  const first=fixtureData.rows[0];await page.getByRole('button',{name:/查看文件 .* 的完整路径/}).first().click();const popup=page.locator('[data-slot=popover-content]');await expect(popup).toContainText(first.file);await popup.getByRole('button',{name:'复制路径',exact:true}).click();assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),first.file);await expect(popup.getByRole('button',{name:'定位文件',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await page.getByRole('checkbox',{name:'选择 '+selectedKey,exact:true}).check();await page.getByRole('button',{name:'修复所选',exact:true}).click();
 }else if(testMode==='editor'){
  const label=process.env.AMBLE_UI_EDIT_LABEL||'规则要求';await page.getByRole('textbox',{name:label}).fill('桌面验证修改后的规则说明');await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.getByRole('textbox',{name:label})).toHaveValue('桌面验证修改后的规则说明');await expect(page.getByRole('button',{name:'保存草稿',exact:true})).toBeDisabled();await page.getByRole('button',{name:'保存并发送',exact:true}).click();
 }else if(testMode==='empty'){
  await expect(page.getByRole('table')).toHaveCount(0);await page.getByRole('button',{name:'初始化策略',exact:true}).click();
 }else if(testMode==='row'){await page.getByRole('button',{name:'修复',exact:true}).first().click();}
 else if(testMode==='all'){await page.getByRole('button',{name:'全部修复',exact:true}).click();}
 else{await page.getByRole('checkbox',{name:'选择 '+selectedKey,exact:true}).check();await page.getByRole('button',{name:'修复所选',exact:true}).click();}
 await waitFor(async()=>{const ui=(await page.evaluate(id=>window.desktop.forms.list({runId:id}),task.id)).find(f=>f.kind==='ui');return ui?.submissions[0]?.status==='delivered';});await expect(page.getByText('已发送',{exact:true})).toBeVisible();
 const run=await page.evaluate(id=>window.desktop.getRunPage({id}),task.id);const message=run.messages.find(m=>m.formSubmissionId);assert.ok(message);assert.ok(message.text.includes('ui_read_submission'));const flow=(await page.evaluate(id=>window.desktop.forms.list({runId:id}),task.id))[0];assert.deepEqual(flow.submissions[0].payload.rowKeys,['collection','row','all','file'].includes(testMode)?[selectedKey]:[]);if(testMode==='editor'){assert.equal(flow.submissions[0].payload.data.rows[0].intent,'桌面验证修改后的规则说明');assert.deepEqual(flow.submissions[0].payload.data.rows[0].immutable,fixtureData.rows[0].immutable);}
 await waitFor(async()=>(await page.evaluate(id=>window.desktop.getRunPage({id}),task.id)).status==='completed');const count=round;await app.close();app=null;page=await launch();const restored=await page.evaluate(id=>window.desktop.forms.list({runId:id}),task.id);assert.equal(restored[0].submissions[0].status,'delivered');assert.equal(round,count,'restart must not replay delivery');console.log('Desktop UI fixture passed: capabilities, ordinary skill discovery, render, click, idle chat delivery, frozen payload, restart without replay.');
}finally{if(app)await app.close();if(server)await new Promise(resolve=>server.close(resolve));if(!process.env.AMBLE_UI_TEST_ROOT)await rm(root,{recursive:true,force:true});}
