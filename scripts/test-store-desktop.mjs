// Explicit live acceptance. Native installation dialogs are accepted by a test callback;
// business confirmation is clicked in the real renderer. Existing encrypted credentials
// are copied only to a temporary profile and never logged or decrypted by this script.
import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Database}=require('../electron/database.cjs');
const root=await mkdtemp(path.join(tmpdir(),'amble-store-desktop-')),profile=path.join(root,'profile'),project=path.join(root,'project');
const source=process.env.AMBLE_STORE_SOURCE_FILE;if(!source)throw Error('Supply AMBLE_STORE_SOURCE_FILE');
let app,page;const result={store:false,realModel:false,travel:false,ticket:false};
const button=(name,scope=page)=>scope.getByRole('button',{name,exact:true});
async function until(fn,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,250));}throw Error('Live acceptance timed out');}
async function launch(){app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env:{...process.env,ATELIER_DEV:'0',AMBLE_STORE_SOURCE_FILE:source}});page=await app.firstWindow();await page.waitForFunction(()=>!!window.desktop?.store);await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});}
const flows=id=>page.evaluate(runId=>window.desktop.forms.list({runId}),id);
async function waitForm(id){return until(async()=>{const [flow]=await flows(id);if(flow)return flow;const run=await page.evaluate(id=>window.desktop.getRunPage({id}),id);if(run.status==='failed')throw Error('Real provider failed: '+run.error);return null;});}
const center=()=>button('技能与扩展',page.locator('.activity-rail')).click();
async function listing(name){await page.getByRole('tab',{name:'发现',exact:true}).click();await button('查看详情',page.locator('.store-card').filter({has:page.getByText(name,{exact:true})})).click();}
try{
 await mkdir(project);await mkdir('test-results',{recursive:true});
 if(process.env.AMBLE_STORE_LIVE_PROVIDER_PROFILE){
  const encrypted=JSON.parse(execFileSync('python3',['-c',"import sys,sqlite3; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); r=c.execute('select data from settings where key=?',('providers',)).fetchone(); print(r[0] if r else 'null')",path.join(process.env.AMBLE_STORE_LIVE_PROVIDER_PROFILE,'atelier.sqlite')],{encoding:'utf8',maxBuffer:100000}));
  if(!encrypted?.providers?.length)throw Error('Existing provider unavailable');if(process.env.AMBLE_STORE_LIVE_PROVIDER_ID){if(!encrypted.providers.some(p=>p.id===process.env.AMBLE_STORE_LIVE_PROVIDER_ID))throw Error('Selected provider unavailable');encrypted.defaultId=process.env.AMBLE_STORE_LIVE_PROVIDER_ID;}const db=new Database(profile);try{await db.call('ready');await db.call('writeSetting',{key:'providers',value:encrypted});}finally{await db.close();}
 }
 await launch();await page.evaluate(async project=>{const s=await window.desktop.readWorkspace();await window.desktop.patchWorkspace({changes:[{kind:'settings',action:'patch',expectedRevision:s.settingsRevision??0,value:{language:'zh-CN',theme:'light'}},{kind:'project',action:'put',id:'store-test',expectedRevision:null,value:{id:'store-test',name:'Store 实际验收',path:project,createdAt:new Date().toISOString()}}]});},project);
 await center();await page.locator('.store-card').getByText('三步差旅登记',{exact:true}).waitFor();await page.screenshot({path:'test-results/store-desktop-discover.png'});
 // Exercise actual main-process URL routing, IPC and renderer without invoking
 // the OS protocol handler or claiming packaged-app registration was tested.
 const sourceId=(await page.evaluate(()=>window.desktop.store.catalog())).source.id;
 await app.evaluate(({app},url)=>app.emit('open-url',{preventDefault(){}},url),`ambleloft://store/item?source=${sourceId}&id=examples.travel-registration`);
 await expect(page.getByRole('dialog')).toContainText('三步差旅登记');assert.equal((await page.evaluate(()=>window.desktop.store.catalog())).installed.length,0);await page.keyboard.press('Escape');
 await app.evaluate(({app})=>app.emit('open-url',{preventDefault(){}},'ambleloft://store/item?source=not-trusted&id=examples.travel-registration'));
 await expect(page.getByRole('alert')).toContainText('此链接来自尚未信任的目录');assert.equal(await page.getByRole('dialog').count(),0);assert.equal((await page.evaluate(()=>window.desktop.store.catalog())).installed.length,0);await button('关闭提示').click();result.deepLinkRouting=true;
 await listing('三步差旅登记');await button('安装此版本').click();await until(async()=> (await page.evaluate(()=>window.desktop.store.catalog())).installed.some(x=>x.listingId==='examples.travel-registration'));
 await listing('设备售后工单');await button('安装此版本').click();await button('授权扩展配置').click();await page.getByLabel('serviceUrl',{exact:false}).fill('http://127.0.0.1:18080');await button('保存配置').click();await expect(button('保存配置')).toBeDisabled();await page.screenshot({path:'test-results/store-desktop-configuration.png'});
 result.store=true;assert.equal((await page.evaluate(()=>window.desktop.store.catalog())).installed.length,2);
 await button('返回技能与扩展').click();const travelRow=page.locator('.store-installed-row').filter({has:page.getByRole('heading',{name:'三步差旅登记',exact:true})});await button('在聊天中使用',travelRow).click();await button('填入聊天输入框').click();await expect(page.getByRole('textbox',{name:'任务内容',exact:true})).toHaveValue(/三步差旅登记/);assert.equal((await page.evaluate(()=>window.desktop.listRuns())).length,0,'Preparing use must not send');
 if(process.env.AMBLE_STORE_LIVE_PROVIDER_PROFILE){
  await page.getByRole('textbox',{name:'任务内容',exact:true}).fill('使用已选择的“三步差旅登记”技能，帮我登记2026年11月12日去上海的商务差旅，事由是客户验收，预算3000元。请读取技能并打开它声明的三步表单，等待我逐步填写和确认。不要用补充信息工具替代业务表单，不写代码，不提交外部业务。');await button('发送任务').click();const travelRun=await until(async()=> (await page.evaluate(()=>window.desktop.listRuns()))[0]);const form=await waitForm(travelRun.id);assert.equal(form.template.steps.length,3);result.realModel=true;
  const card=page.getByLabel('差旅登记',{exact:true});await expect(card).toBeVisible();await card.getByLabel('目的地',{exact:false}).fill('上海');await card.getByLabel('出发日期',{exact:false}).fill('2026-11-12');await button('下一步',card).click();await card.getByLabel('出差事由',{exact:false}).fill('客户验收');await card.getByLabel('预算',{exact:false}).fill('3000');await button('下一步',card).click();await card.getByRole('checkbox').check();await button('发送登记信息',card).click();await until(async()=> (await flows(travelRun.id))[0]?.status==='completed');result.travel=true;await page.screenshot({path:'test-results/store-desktop-travel-form.png'});console.log('PASS real model opened Store skill form; three-step UI confirmed to chat.');
  await center();await page.getByRole('tab',{name:/已安装/}).click();const ext=page.locator('.store-installed-row').filter({has:page.getByRole('heading',{name:'设备售后工单（测试）',exact:true})});await button('准备试用',ext).click();await page.getByLabel('聊天引导',{exact:true}).fill('请使用 labs.service-desk 扩展的设备售后工单技能，读取技能并打开它的 ticket 三步业务表单。测试设备 STORE-DESKTOP-TEST，启动后日志中断，联系人 TEST-USER，常规优先级。先检查服务健康，然后展示已声明表单等待我填写确认；不要直接提交，不使用通用补充信息表单。');await button('填入聊天输入框').click();assert.equal((await page.evaluate(()=>window.desktop.listRuns())).length,1);await button('发送任务').click();const ticketRun=await until(async()=> (await page.evaluate(()=>window.desktop.listRuns())).find(x=>x.id!==travelRun.id));await waitForm(ticketRun.id);
  const ticket=page.getByLabel('设备售后登记',{exact:true});await expect(ticket).toBeVisible();await ticket.getByLabel('设备编号',{exact:false}).fill('STORE-DESKTOP-TEST');await ticket.getByLabel('遇到的问题',{exact:false}).fill('启动后日志中断');await button('下一步',ticket).click();await ticket.getByLabel('优先级',{exact:false}).selectOption('normal');await ticket.getByLabel('联系人或测试工号',{exact:false}).fill('TEST-USER');await button('下一步',ticket).click();await ticket.getByRole('checkbox').check();await button('创建测试工单',ticket).click();const confirm=page.getByRole('dialog',{name:'确认扩展操作',exact:true});await expect(confirm).toBeVisible();await button('确认执行',confirm).click();const done=await until(async()=>{const [f]=await flows(ticketRun.id);return f?.status==='completed'?f:null;});result.ticket=done.results.confirm.ticketId;assert.match(result.ticket,/^SR-/);await expect(ticket.getByLabel('提交结果',{exact:true})).toContainText(result.ticket);await page.screenshot({path:'test-results/store-desktop-ticket-receipt.png'});
 }
 await app.close();app=null;await launch();assert.equal((await page.evaluate(()=>window.desktop.store.catalog())).installed.length,2);result.restart=true;await page.evaluate(async()=>{const s=await window.desktop.readWorkspace();await window.desktop.patchWorkspace({changes:[{kind:'settings',action:'patch',expectedRevision:s.settingsRevision??0,value:{language:'en',theme:'dark'}}]});});await button('Skills & extensions',page.locator('.activity-rail')).click();await page.locator('.store-card').getByText('Three-step travel registration',{exact:true}).waitFor();await page.screenshot({path:'test-results/store-desktop-en-dark.png'});
 await writeFile(`test-results/store-desktop-${result.realModel?'live':'smoke'}.json`,JSON.stringify({...result,profile:'isolated, removed',nativeInstallConfirmation:'accepted by test callback',businessConfirmation:result.ticket?'real renderer dialog clicked':'not exercised'},null,2));console.log(JSON.stringify(result));
}catch(error){if(app){await page.screenshot({path:'test-results/store-desktop-failure.png'}).catch(()=>{});console.error((await page.locator('body').innerText()).slice(-3000));}throw error;
}finally{await app?.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
