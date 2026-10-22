// Real Electron + pinned engine + deterministic local inference. No account or device required.
import http from 'node:http';
import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm,mkdir,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=await mkdtemp(path.join(tmpdir(),'amble-creation-'));
let app,server,round=0,serverError;
const requests=[];
const calls=[
 ['creation_read',{}],
 ['creation_update',{expectedRevision:1,title:'三步差旅登记',kind:'skill',summary:'填写行程、用途与预算，再确认登记。',nextStep:'检查生成文件',stage:'building',trialPrompt:'帮我登记差旅',limitations:'仅回传聊天，未连接业务后台'}],
 ['creation_prepare',{expectedRevision:2,directory:'travel'}],
];
async function until(fn){for(let i=0;i<400;i++){if(serverError)throw serverError;if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Creation acceptance timed out');}
try{
 const project=path.join(root,'project');await mkdir(project);
 await cp('resources/skills/skill-master/examples/travel-skill',path.join(project,'travel'),{recursive:true});
 server=http.createServer(async(req,res)=>{try{
  let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);requests.push(body);
  const call=calls[round++];const tools=(body.tools||[]).flatMap(t=>t.type==='namespace'?t.tools.map(x=>({...x,namespace:t.name})):[t.function||t]);
  const tool=call?tools.find(t=>t.name===call[0]||t.name?.endsWith('_'+call[0])||t.name?.startsWith(call[0])):null;
  if(call)assert.ok(tool,'Missing tool: '+call[0]);
  const item=tool?{id:'fc'+round,type:'function_call',call_id:'call'+round,name:tool.name,...(tool.namespace?{namespace:tool.namespace}:{}),arguments:JSON.stringify(call[1]),status:'completed'}:{id:'msg'+round,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'文件已检查，请使用创建卡安装并试用。',annotations:[]}]};
  res.writeHead(200,{'Content-Type':'text/event-stream'});let sequence=0;
  const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:sequence++,...data})}\n\n`);
  const response={id:'response'+round,object:'response',status:'in_progress',output:[]};
  emit('response.created',{response});emit('response.output_item.added',{output_index:0,item});emit('response.output_item.done',{output_index:0,item});emit('response.completed',{response:{...response,status:'completed',output:[item],usage:{input_tokens:10,output_tokens:10,total_tokens:20}}});res.end();
 }catch(e){serverError=e;res.destroy(e);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const launch=async()=>{app=await electron.launch({args:['.',`--user-data-dir=${path.join(root,'profile')}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.getByRole('textbox',{name:'任务内容',exact:true}).waitFor();return page;};
 let page=await launch();
 const builtin=await page.evaluate(async()=>(await window.desktop.skills.list()).find(s=>s.id==='builtin-skill-master'));
 assert.ok(builtin?.enabled,'Skill master must ship enabled');
 await page.evaluate(async project=>{await window.desktop.patchWorkspace({changes:[{kind:'project',action:'put',id:'creation-test',expectedRevision:null,value:{id:'creation-test',name:'创建验收',path:project,createdAt:new Date().toISOString()}}]});},project);
 const provider=await page.evaluate(url=>window.desktop.saveProvider({name:'Creation fixture',baseUrl:url,model:'fixture',executable:'',protocol:'responses'}),'http://127.0.0.1:'+server.address().port+'/v1');
 await page.reload();await page.getByRole('combobox',{name:'当前项目'}).click();await page.getByRole('option',{name:'创建验收'}).click();
 await page.getByRole('button',{name:'创建技能 / 扩展',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'任务内容',exact:true})).toHaveValue(/请用技能大师/);
 // Send through the actual composer; inference and source generation are deterministic fixtures.
 await page.getByRole('textbox',{name:'任务内容',exact:true}).fill('创建验收：三步差旅登记');
 await page.getByRole('button',{name:'发送任务',exact:true}).click();
 await until(async()=> (await page.evaluate(()=>window.desktop.listRuns())).length>0);
 const run=(await page.evaluate(()=>window.desktop.listRuns()))[0];
 await until(async()=> (await page.evaluate(id=>window.desktop.getRunPage({id}),run.id)).status==='completed');
 assert.ok(JSON.stringify(requests[0]).includes(builtin.path));
 const prepared=await page.evaluate(runId=>window.desktop.creation.read({runId}),run.id);assert.equal(prepared.stage,'ready');
 const card=page.getByLabel('创建进度',{exact:true});await expect(card).toContainText('文件已检查，待安装');
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
 await card.getByRole('button',{name:'安装并启用',exact:true}).click();await expect(card).toContainText('已安装，待试用');
 const installed=await page.evaluate(async runId=>{const state=await window.desktop.creation.read({runId});return {state,skills:await window.desktop.skills.list()};},run.id);
 assert.ok(installed.skills.some(s=>s.id===installed.state.installed.id&&s.enabled));
 await card.getByRole('button',{name:'准备试用',exact:true}).click();await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('帮我登记差旅');
 await expect(page.getByText('不可用技能',{exact:false})).toHaveCount(0);
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/creation-electron.png'});
 const before=round;await app.close();app=null;page=await launch();
 const restored=await page.evaluate(runId=>window.desktop.creation.read({runId}),run.id);assert.equal(restored.stage,'installed');assert.equal(restored.trial,'pending');assert.equal(round,before);
 console.log('Creation Electron passed: bundled guide, real engine tool calls, persisted ready state, native install handoff, enabled skill, trial prompt and restart. Model responses and generated source are fixtures.');
}finally{await app?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
