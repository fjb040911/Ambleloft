import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){await page.addInitScript(()=>{
 const environment={kind:'docker',endpoint:'unix:///var/run/docker.sock',daemonId:'engine',containerId:'a'.repeat(64),containerName:'fpga-dev',imageId:'sha256:image',user:null,shell:'auto'};
 let workspace=JSON.parse(localStorage.getItem('docker-workspace')||'null')||{projects:[],tasks:[],theme:'light',language:'zh-CN'};
 let containers=[{id:'a'.repeat(64),name:'fpga-dev',image:'ubuntu:24.04',state:'running',status:'Up'}, {id:'b'.repeat(64),name:'old-dev',image:'alpine:3',state:'exited',status:'Exited'}];
 const provider={id:'p',name:'Test',model:'test',models:['test'],configured:true,baseUrl:'http://localhost/v1'};
 (window as any).__started=[];(window as any).__browse=[];
 (window as any).desktop={getProvider:async()=>provider,listProviders:async()=>({defaultId:'p',providers:[provider]}),getDevice:async()=>({name:'Test',memoryGB:32}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},readWorkspace:async()=>workspace,saveWorkspace:async(s:any)=>{workspace=s;localStorage.setItem('docker-workspace',JSON.stringify(s));},patchWorkspace:async({changes}:any)=>{for(const c of changes)if(c.kind==='project'&&c.action==='put'){workspace.projects=workspace.projects.filter((p:any)=>p.id!==c.id);workspace.projects.push({...c.value,revision:(c.value.revision||0)+1});}localStorage.setItem('docker-workspace',JSON.stringify(workspace));return workspace;},
 ssh:{list:async()=>[{id:'c',name:'Build server',host:'example.test',port:22,username:'dev',authType:'agent',state:'connected'}],onChanged:()=>()=>{},
  dockerList:async()=>({endpoint:environment.endpoint,endpoints:[environment.endpoint],daemonId:'engine',containers}),
  dockerEnter:async({environment:e}:any)=>{if((window as any).__failEnter)throw Error('容器文件访问需要 Python 3');return {environment:{...e,imageId:'sha256:image'},path:'/workspace',uid:1000,shell:'sh',shells:['sh'],writable:true};},
  dockerStart:async({environment:e}:any)=>{(window as any).__started.push(e.containerId);containers=containers.map(c=>c.id===e.containerId?{...c,state:'running'}:c);return {environment:{...e,imageId:'sha256:image'},path:'/workspace',uid:1000,shell:'sh',shells:['sh'],writable:true};},
  browse:async({environment:e,path}:any)=>{(window as any).__browse.push({environment:e,path});return {path:path||'/home/dev',parent:'/',entries:path==='/workspace'?[{name:'firmware',path:'/workspace/firmware'}]:[],writable:true,storage:'bind'};},validate:async({path,environment:e}:any)=>{(window as any).__validated={path,environment:e};if((window as any).__failValidate)throw Error('容器当前状态：exited');return {path};},connect:async()=>[],disconnect:async()=>[],
 },skills:{list:async()=>[]},extensions:{list:async()=>({capabilities:{},installed:[]})}};
 });await page.goto('/');}
async function create(page:Page){await page.getByRole('button',{name:'新建项目',exact:true}).click();await page.getByRole('radio',{name:/SSH 远端项目/}).check();await page.getByLabel('项目名称',{exact:true}).fill('FPGA 开发');await page.locator('#ssh-connection').selectOption('c');await page.getByRole('radio',{name:'Docker 容器',exact:true}).check();await expect(page.getByRole('option',{name:/fpga-dev/})).toBeVisible();}
test('SSH Docker picker enters container directories, saves target and restores it',async({page})=>{
 await setup(page);await create(page);await expect(page.getByRole('option',{name:/old-dev/})).toHaveCount(0);
 await page.getByRole('option',{name:/fpga-dev/}).dblclick();await expect(page.getByLabel('容器文件夹')).toContainText('firmware');
 await page.getByRole('button',{name:'firmware',exact:true}).click();await page.getByRole('button',{name:'使用此目录',exact:true}).click();await expect(page.getByLabel('容器工作目录',{exact:true})).toHaveValue('/workspace/firmware');
 await expect(page.getByRole('button',{name:'保存项目',exact:true})).toBeEnabled();await page.screenshot({path:'test-results/docker-project-ready.png',animations:'disabled'});await page.getByRole('button',{name:'保存项目',exact:true}).click();await expect(page.getByRole('dialog',{name:'创建项目'})).toHaveCount(0);
 const p=await page.evaluate(()=>(window as any).desktop.readWorkspace().then((s:any)=>s.projects[0]));expect(p.environment.containerId).toBe('a'.repeat(64));expect(p.path).toBe('/workspace/firmware');
 expect(await page.evaluate(()=>(window as any).__validated.environment.containerId)).toBe(p.environment.containerId);
 await page.reload();await expect(page.getByRole('heading',{name:'FPGA 开发',exact:true})).toBeVisible();await expect(page.getByText('fpga-dev → /workspace/firmware',{exact:true}).first()).toBeVisible();
});
test('stopped containers require explicit start and missing dependencies remain recoverable',async({page})=>{
 await setup(page);await create(page);await page.getByLabel('显示已停止容器').check();await page.getByRole('option',{name:/old-dev/}).click();expect(await page.evaluate(()=>(window as any).__started)).toEqual([]);
 await page.getByRole('button',{name:'启动并进入',exact:true}).click();await expect(page.getByLabel('容器文件夹')).toBeVisible();expect(await page.evaluate(()=>(window as any).__started)).toEqual(['b'.repeat(64)]);
 await page.getByRole('button',{name:'更换容器'}).click();await page.evaluate(()=>(window as any).__failEnter=true);await page.getByRole('option',{name:/fpga-dev/}).click();await page.getByRole('button',{name:'进入容器',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Python 3');
 await expect(page.getByRole('option',{name:/fpga-dev/})).toBeEnabled();await page.evaluate(()=>(window as any).__failEnter=false);await page.getByRole('button',{name:'进入容器',exact:true}).click();await expect(page.getByLabel('容器文件夹')).toBeVisible();
});
test('environment switching clears directories and narrow dark picker stays usable',async({page})=>{
 await setup(page);await create(page);await page.setViewportSize({width:600,height:850});await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 const input=page.getByLabel('搜索容器');await input.fill('does-not-exist');await expect(page.getByText('没有匹配的容器')).toBeVisible();await input.fill('ubuntu');await expect(page.getByRole('option',{name:/fpga-dev/})).toBeVisible();
 await page.getByRole('option',{name:/fpga-dev/}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'使用此目录',exact:true}).click();
 await page.getByRole('radio',{name:'服务器',exact:true}).check();await expect(page.getByLabel('工作目录',{exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'保存项目',exact:true})).toBeDisabled();
 await page.getByRole('radio',{name:'Docker 容器',exact:true}).check();await expect(page.getByRole('option',{name:/fpga-dev/})).toBeVisible();
 await page.screenshot({path:'test-results/docker-project-dark.png',animations:'disabled'});
 const dialog=page.getByRole('dialog',{name:'创建项目'});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
