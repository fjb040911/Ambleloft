import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir} from 'node:fs/promises';
const server=await createServer({server:{port:5188,strictPort:true}});
await server.listen();
let browser;
try {
 browser=await chromium.launch({channel:'chrome'});
 await mkdir('.github/assets',{recursive:true});
 for(const language of ['en','zh-CN']) {
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,locale:language,colorScheme:'light',reducedMotion:'reduce'});
  await page.addInitScript(({language})=>{
   const zh=language==='zh-CN';
   const title=zh?'整理项目交付说明':'Prepare the project handoff';
   const provider={id:'demo',name:'Demo model service',baseUrl:'https://api.example.com/v1',model:'workspace-model',models:['workspace-model','reasoning-model'],configured:true,hasKey:false,protocol:'responses',executable:''};
   const changes={turnKey:'u',files:[{id:'readme',path:'README.md',status:'modified',additions:4,deletions:2,hunks:[{oldStart:1,oldLines:3,newStart:1,newLines:5,lines:[' # Project handoff','-Status: draft','-Next steps: TBD','+Status: ready for review','+','+## Next steps','+Review the summary and confirm the release checklist.']}]},{id:'notes',path:'handoff/checklist.md',status:'added',additions:3,deletions:0,hunks:[{oldStart:0,oldLines:0,newStart:1,newLines:3,lines:['+# Release checklist','+- [x] Prepare the handoff summary','+- [ ] Review with the team']}]}]};
   const run={id:'demo-run',title,projectId:'p',providerId:'demo',cwd:'/demo/workspace',model:provider.model,baseUrl:provider.baseUrl,createdAt:'2026-09-24T08:00:00Z',status:'completed',error:'',approvals:[],tools:[],fileChanges:[changes],messages:[{id:'u',role:'user',text:zh?'整理项目交付说明，列出已完成工作和接下来的检查项。':'Prepare a concise project handoff with completed work and a review checklist.',timing:{startedAt:'2026-09-24T08:00:00Z',durationMs:24000,outcome:'completed'}},{id:'a',role:'assistant',phase:'final_answer',text:zh?'## 项目交付说明\n\n说明已整理为三个部分，便于团队继续推进。\n\n| 内容 | 状态 |\n|---|---|\n| 项目概览与启动步骤 | 已整理 |\n| 文件结构与关键入口 | 已补充 |\n| 发布前检查清单 | 待审阅 |\n\n### 下一步\n\n1. 确认 README 中的启动步骤。\n2. 审阅本轮文件变更。\n3. 与团队确认发布范围。\n\n交付文件：`README.md` 和 `handoff/checklist.md`。':'## Project handoff\n\nThe handoff is organized into three sections so the team can pick up the work.\n\n| Deliverable | Status |\n|---|---|\n| Project overview and setup | Prepared |\n| File structure and entry points | Documented |\n| Release checklist | Ready for review |\n\n### Next steps\n\n1. Confirm the setup instructions in the README.\n2. Review the file changes from this turn.\n3. Agree on the release scope with the team.\n\nDeliverables: `README.md` and `handoff/checklist.md`.'}]};
   const workspace={tasks:[],projects:[{id:'p',name:zh?'产品工作区':'Product workspace',path:'/demo/workspace',createdAt:'2026-09-24T08:00:00Z'}],theme:'light',language};
   window.desktop={readWorkspace:async()=>workspace,saveWorkspace:async()=>{},getDevice:async()=>({mode:'desktop',name:'Demo Mac',memoryGB:32}),getProvider:async()=>provider,listProviders:async()=>({defaultId:'demo',providers:[provider]}),listRuns:async()=>[run],onRun:fn=>{window.__demoUpdate=fn;return()=>{};},onCommand:()=>()=>{},skills:{list:async()=>[]},extensions:{list:async()=>({capabilities:{},installed:[]})},copyText:async()=>{},forms:{list:async()=>window.__demoForms||[],onChanged:fn=>{window.__formsChanged=fn;return()=>{};}}};
   window.__demoRun=run;
  },{language});
  await page.goto('http://localhost:5188');
  await page.locator('.tree-task > button:first-child').filter({hasText:language==='en'?'Prepare the project handoff':'整理项目交付说明'}).click();
  await page.locator('.markdown h2').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`.github/assets/workspace-${language}.png`});
  const changeButton=page.getByRole('button',{name:language==='en'?/View changes for this turn|View turn changes|changes.*\(2\)/i:/查看本轮变更/});
  if(await changeButton.count()) await changeButton.first().click();
  else await page.locator('button').filter({hasText:/\(2\)/}).first().click();
  await page.locator('.file-diff summary').first().click();
  await page.locator('.changes-panel .addition').first().waitFor();
  await page.locator('.conversation-scroll').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:`.github/assets/changes-${language}.png`});
  await page.locator('.changes-panel header button').last().click();
  await page.locator('.changes-panel').waitFor({state:'hidden'});
  await page.evaluate(({language})=>{
   const zh=language==='zh-CN',run=window.__demoRun;
   run.title=zh?'差旅费用登记':'Travel expense request';
   run.fileChanges=[];
   run.messages=[{id:'u',role:'user',text:zh?'我要报销差旅费。':'I need to submit my travel expenses.',timing:{startedAt:'2026-09-24T08:00:00Z',durationMs:3000,outcome:'completed'}},{id:'a',role:'assistant',phase:'final_answer',text:zh?'请先填写出差信息，下一步补充费用明细。确认后，填写结果会发送到当前对话。':'Start with your trip details, then add your expenses. After you confirm, the completed form will be sent to this conversation.'}];
   window.__demoForms=[{id:'expense-demo',runId:run.id,turnKey:'u',revision:1,status:'editing',step:0,drafts:{trip:{destination:'shanghai',date:'2026-10-06',purpose:zh?'参加客户项目启动会':'Attend a customer project kickoff'}},template:{title:zh?'差旅费用登记':'Travel expense request',steps:[{id:'trip',title:zh?'出差信息':'Trip details',fields:[{name:'destination',type:'select',label:zh?'出差地区':'Destination',required:true,options:[{label:zh?'上海':'Shanghai',value:'shanghai'},{label:zh?'北京':'Beijing',value:'beijing'}]},{name:'date',type:'date',label:zh?'出差日期':'Travel date',required:true},{name:'purpose',type:'textarea',label:zh?'出差事由':'Purpose of travel',required:true}],next:{label:zh?'下一步：费用明细':'Next: expenses'}},{id:'expenses',title:zh?'费用明细':'Expenses',fields:[{name:'amount',type:'money',currency:'CNY',label:zh?'金额':'Amount',required:true}]}],submit:{label:zh?'确认并发送到聊天':'Confirm and send to chat'}}}];
   window.__demoUpdate(structuredClone(run));window.__formsChanged?.();
  },{language});
  await page.locator('[data-slot="card"]').filter({hasText:language==='en'?'Trip details':'出差信息'}).waitFor();
  await page.locator('.conversation-scroll').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:`.github/assets/travel-expense-${language}.png`});
  await page.getByRole('button',{name:language==='en'?'Settings':'设置',exact:true}).click();
  await page.getByRole('button',{name:language==='en'?'Model providers':'模型提供商',exact:true}).click();
  await page.getByText('Demo model service',{exact:true}).first().waitFor();
  await page.screenshot({path:`.github/assets/providers-${language}.png`});
  await page.close();
 }
 console.log('Captured eight screenshots from the real UI with synthetic demo data.');
} finally {await browser?.close();await server.close();}
