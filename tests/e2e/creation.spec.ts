import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,kind:'skill'|'extension'='skill'){
 await page.addInitScript(({kind})=>{
  const provider={id:'p',name:'Test',model:'test',models:['test'],configured:true,baseUrl:'http://localhost/v1',hasKey:false,executable:''};
  const skill={id:'builtin-skill-master',name:'skill-master',displayName:'技能大师',description:'创建技能与扩展',body:'Guide creation.',enabled:true,version:1,path:'/skills/master/SKILL.md',files:['SKILL.md'],sourcePath:'Ambleloft',builtIn:{key:'skill-master',version:1,digest:'test'}};
  const stored=JSON.parse(localStorage.getItem('creator-state')||'null');let state:any=stored?.state||null,run:any=stored?.run;const listeners=new Set<(event:any)=>void>();
  const save=()=>localStorage.setItem('creator-state',JSON.stringify({state,run}));
  const update=(next:any)=>{state=next;save();listeners.forEach(fn=>fn({runId:'r'}));};
  (window as any).__creatorUpdate=update;
  (window as any).desktop={
   getProvider:async()=>provider,listProviders:async()=>({defaultId:'p',providers:[provider]}),getDevice:async()=>({name:'Mac',memoryGB:64,mode:'desktop'}),
   readWorkspace:async()=>({tasks:[],projects:[{id:'project',name:'创建试验',path:'/tmp/creation',createdAt:new Date().toISOString()}],theme:'light',language:'zh-CN'}),saveWorkspace:async()=>{},listRuns:async()=>run?[run]:[],onRun:()=>()=>{},onCommand:()=>()=>{},
   skills:{list:async()=>[skill,...(state?.installed?.kind==='skill'?[{...skill,id:'created',name:'travel-registration',displayName:'差旅助手',builtIn:undefined}]:[])],detail:async()=>skill},
   creation:{read:async()=>state,onChanged:(fn:any)=>{listeners.add(fn);return()=>listeners.delete(fn);},install:async()=>{if((window as any).__failInstall)throw Error('安装失败，可以重试');update({...state,revision:state.revision+1,stage:'installed',installed:{id:'created',kind,hasConfiguration:kind==='extension'}});window.dispatchEvent(new Event('skills-changed'));return state;},trial:async()=>{update({...state,revision:state.revision+1,trial:'confirmed'});return state;}},
   extensions:{list:async()=>({capabilities:{},installed:state?.installed?.kind==='extension'?[{id:'created',kind:'package',trusted:true,enabled:true,active:'d',generation:1,manifest:{id:'created',name:'设备助手',version:'0.1.0',contributes:{commands:[]}},hasConfiguration:true,permissions:[],grants:[{capability:'configuration',resource:'self'}]}]:[]}),details:async()=>({readme:'设备助手',publisher:'local',size:10}),configuration:async()=>({schema:{type:'object',properties:{device:{type:'string',description:'调试设备地址'}}},value:{device:'localhost'},revision:1,generation:1})},
   startRun:async(input:any)=>{(window as any).__sent=input;
    run={id:'r',projectId:'project',providerId:'p',title:'创建差旅助手',model:'test',baseUrl:provider.baseUrl,cwd:'/tmp/creation',createdAt:new Date().toISOString(),status:'completed',error:'',tools:[],approvals:[],messages:[{id:'u',role:'user',text:input.prompt},{id:'a',role:'assistant',text:'已生成基础版本，请检查后安装。'}]};
    if(!state)state={runId:'r',revision:3,stage:'ready',kind,title:'差旅助手',summary:'三步填写行程与预算',nextStep:'试用表单',trialPrompt:'帮我登记差旅',limitations:'未连接真实服务',trial:'pending',prepared:{source:'travel',digest:'d'}};
    save();return run;
   },
  };
 },{kind});await page.goto('/');
}
async function begin(page:Page){await page.getByRole('combobox',{name:'当前项目'}).click();await page.getByRole('option',{name:'创建试验'}).click();await page.locator('.activity-rail').getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('button',{name:'技能与扩展',exact:true}).click();await page.getByRole('button',{name:'创建技能 / 扩展',exact:true}).click();await page.getByRole('button',{name:'填入聊天输入框',exact:true}).click();await page.getByRole('button',{name:'发送任务',exact:true}).click();await expect(page.getByLabel('创建进度', {exact:true})).toBeVisible();}
test('single center creation entry preserves draft and never sends on click',async({page})=>{
 await setup(page);await expect(page.getByRole('button',{name:'创建技能 / 扩展',exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'当前项目'}).click();await page.getByRole('option',{name:'创建试验'}).click();
 const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('我想连接 FPGA 调试');
 await page.locator('.activity-rail').getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('button',{name:'技能与扩展',exact:true}).click();
 await expect(page.getByRole('tab',{name:/已安装/})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'创建技能 / 扩展',exact:true}).click();
 await expect(page.getByLabel('聊天引导',{exact:true})).toHaveValue(/我想连接 FPGA 调试\n\n请用技能大师/);
 expect(await page.evaluate(()=>(window as any).__sent)).toBeUndefined();
 await page.getByRole('button',{name:'填入聊天输入框',exact:true}).click();await expect(input).toHaveValue(/我想连接 FPGA 调试\n\n请用技能大师/);
 expect(await page.evaluate(()=>(window as any).__sent)).toBeUndefined();
 await page.getByRole('button',{name:'发送任务',exact:true}).click();expect(await page.evaluate(()=>(window as any).__sent.selectedSkillIds)).toEqual(['builtin-skill-master']);await expect(page.getByLabel('创建进度',{exact:true})).toContainText('文件已检查，待安装');
});
test('install failure is recoverable; trial is prepared and only user confirmation completes it',async({page})=>{
 await setup(page);await begin(page);const card=page.getByLabel('创建进度',{exact:true});
 await page.evaluate(()=>(window as any).__failInstall=true);await card.getByRole('button',{name:'安装并启用',exact:true}).click();await expect(card.getByRole('alert')).toContainText('安装失败');
 await page.evaluate(()=>(window as any).__failInstall=false);await card.getByRole('button',{name:'安装并启用',exact:true}).click();await expect(card).toContainText('已安装，待试用');
 await card.getByRole('button',{name:'准备试用'}).click();await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('帮我登记差旅');
 await card.getByRole('button',{name:'我已试用，通过'}).click();await expect(card).toContainText('已试用确认');
 await page.setViewportSize({width:760,height:840});await page.screenshot({path:'test-results/creation-installed.png'});expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});
test('reopening restores the next step and resume retains pending information',async({page})=>{
 await setup(page);await begin(page);await page.evaluate(()=>(window as any).__creatorUpdate({runId:'r',revision:4,stage:'brief',kind:'extension',title:'开发板调试助手',summary:'使用现有 GDB Server',nextStep:'请补充连接目标和现有调试工具',trialPrompt:'查看连接状态',limitations:'未连接硬件',trial:'pending'}));
 await page.reload();await page.getByRole('button',{name:'创建差旅助手',exact:true}).click();const card=page.getByLabel('创建进度',{exact:true});await expect(card).toContainText('请补充连接目标');await card.getByRole('button',{name:'继续创建'}).click();await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue(/读取创建进度和待回答问题/);
});
test('extension handoff opens the exact extension settings',async({page})=>{
 await setup(page,'extension');await begin(page);const card=page.getByLabel('创建进度',{exact:true});await card.getByRole('button',{name:'安装并启用',exact:true}).click();await card.getByRole('button',{name:'设置与权限'}).click();await expect(page.getByRole('tab',{name:'设置',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByText('调试设备地址',{exact:true})).toBeVisible();
});
test('version changes retain historical evidence and require a new trial',async({page})=>{
 await setup(page,'extension');await begin(page);
 await page.evaluate(()=>(window as any).__creatorUpdate({runId:'r',revision:6,stage:'installed',kind:'extension',title:'售后助手',summary:'查询并跟进设备工单',nextStep:'试用',trialPrompt:'查询工单',limitations:'真实服务尚未验证',trial:'pending',trialStale:true,prepared:{source:'service-desk',digest:'abcdef1234567890'},installed:{id:'created',kind:'extension',hasConfiguration:true},readiness:{versionCurrent:true,configuration:'saved',connection:'unverified'},delivery:{environment:['Node 扩展运行时'],unverified:['真实服务连接']},evidence:[{id:'old',method:'user-trial',source:'user',artifactDigest:'old1234567890',at:'2026-10-23T01:00:00Z',current:false,environment:{platform:'darwin',arch:'arm64'}},{id:'new',method:'package-validation',source:'host',artifactDigest:'abcdef1234567890',at:'2026-10-23T02:00:00Z',current:true,environment:{platform:'darwin',arch:'arm64',hostVersion:'0.8.0'}}]}));
 const card=page.getByLabel('创建进度',{exact:true});await expect(card).toContainText('版本或设置已变化，请重新试用');await card.locator('summary').click();await expect(card.getByLabel('验证记录')).toContainText('宿主文件检查');await expect(card.getByLabel('验证记录')).toContainText('用户试用确认 · 历史记录');await expect(card).toContainText('配置已保存；外部连接尚未验证。');
 await page.setViewportSize({width:760,height:840});expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.screenshot({path:'test-results/creation-evidence.png'});
});
