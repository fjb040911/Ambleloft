import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){
 await page.addInitScript(()=>{
  let workspace:any={projects:[],tasks:[],theme:'light',language:'zh-CN'};
  let connections:any[]=[{id:'build',name:'Build server',host:'build.example.test',port:22,username:'dev',authType:'agent',state:'disconnected'}];
  const provider={id:'p',name:'Test',model:'test',models:['test'],configured:true,baseUrl:'http://localhost/v1'};
  const win=window as any;win.__calls={save:[],connect:[],browse:[],disconnect:[]};
  win.__mode='normal';
  const wait=()=>new Promise<void>(resolve=>{win.__resolve=resolve;});
  win.desktop={getProvider:async()=>provider,listProviders:async()=>({defaultId:'p',providers:[provider]}),getDevice:async()=>({name:'Test',memoryGB:32}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},readWorkspace:async()=>workspace,saveWorkspace:async(s:any)=>{workspace=s;},patchWorkspace:async({changes}:any)=>{for(const c of changes)if(c.kind==='project'&&c.action==='put'){workspace.projects=workspace.projects.filter((p:any)=>p.id!==c.id);workspace.projects.push({...c.value,revision:(c.value.revision||0)+1});}return workspace;},
   ssh:{list:async()=>connections,onChanged:()=>()=>{},save:async(input:any)=>{win.__calls.save.push({...input});if(win.__mode==='slow-save')await wait();const value={...input,name:input.name||input.host,state:'disconnected'};connections=[...connections.filter(c=>c.id!==input.id),value];return value;},
    connect:async({id}:any)=>{win.__calls.connect.push(id);if(win.__mode==='slow-connect')await wait();if(win.__mode==='error')throw Error('Authentication failed: permission denied (publickey,password).');connections=connections.map(c=>c.id===id?{...c,state:'connected'}:c);return connections;},
    disconnect:async({id}:any)=>{win.__calls.disconnect.push(id);return connections;},
    browse:async({path}:any)=>{win.__calls.browse.push(path);if(win.__mode==='slow-browse')await wait();return {path:path||'/home/dev',parent:'/',entries:[{name:'project',path:'/home/dev/project'}]};},
    validate:async({path}:any)=>({path}),key:async()=>'/mock/id_ed25519'
   },skills:{list:async()=>[]},extensions:{list:async()=>({capabilities:{},installed:[]})}
  };
 });
 await page.goto('/');await page.getByRole('button',{name:'新建项目',exact:true}).click();await page.getByRole('radio',{name:/SSH 远端项目/}).check();
}
async function selectExisting(page:Page){await page.getByLabel('已保存的连接').selectOption('build');await page.getByRole('button',{name:'连接服务器',exact:true}).click();await expect(page.getByText('已连接',{exact:true})).toBeVisible();}
async function chooseDirectory(page:Page){await page.getByRole('button',{name:'浏览远端目录',exact:true}).click();await page.getByRole('button',{name:'project',exact:true}).click();await page.getByRole('button',{name:'使用此目录',exact:true}).click();}
async function newConnection(page:Page){await page.getByRole('button',{name:'新建 SSH 连接',exact:true}).click();await page.getByLabel('主机 / IP').fill('new.example.test');await page.getByLabel('SSH 用户名',{exact:true}).fill('alice');await page.getByLabel('认证方式').selectOption('agent');}
test('existing connections require explicit selection and create the project after choosing a directory',async({page})=>{
 await setup(page);await expect(page.getByLabel('已保存的连接')).toHaveValue('');await expect(page.getByLabel('主机 / IP')).toHaveCount(0);await expect(page.getByLabel('项目名称',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'连接服务器',exact:true})).toBeDisabled();
 await page.screenshot({path:'test-results/ssh-project-select.png'});
 await selectExisting(page);await expect(page.getByRole('button',{name:'浏览远端目录',exact:true})).toBeFocused();await chooseDirectory(page);
 await expect(page.getByLabel('项目名称',{exact:true})).toHaveValue('project');await expect(page.getByLabel('项目名称',{exact:true})).toBeFocused();
 await page.getByLabel('项目名称',{exact:true}).fill('');await expect(page.getByRole('button',{name:'创建项目',exact:true})).toBeDisabled();await expect(page.getByText('填写项目名称后即可保存。')).toBeVisible();
 await page.getByLabel('项目名称',{exact:true}).fill('Project');await page.screenshot({path:'test-results/ssh-project-ready.png'});await page.getByRole('button',{name:'创建项目',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);const project=await page.evaluate(()=>(window as any).desktop.readWorkspace().then((w:any)=>w.projects[0]));expect(project.path).toBe('/home/dev/project');expect(project.connectionId).toBe('build');
});
test('new connection is a separate view with retained draft; editing and changing back preserve the project directory',async({page})=>{
 await setup(page);await newConnection(page);await expect(page.getByRole('radio',{name:/SSH 远端项目/})).toHaveCount(0);await expect(page.getByLabel('已保存的连接')).toHaveCount(0);await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page.getByLabel('已保存的连接')).toBeFocused();
 await page.getByRole('button',{name:'新建 SSH 连接',exact:true}).click();await expect(page.getByLabel('主机 / IP')).toHaveValue('new.example.test');await expect(page.getByLabel('认证方式')).toHaveValue('agent');await page.getByRole('button',{name:'返回',exact:true}).click();
 await selectExisting(page);await chooseDirectory(page);await page.getByRole('button',{name:'修改连接 / 重新认证'}).click();await page.getByLabel('主机 / IP').fill('unsaved.example.test');await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page.getByLabel('工作目录',{exact:true})).toHaveValue('/home/dev/project');
 await page.getByRole('button',{name:'更换',exact:true}).click();await page.getByRole('button',{name:'返回项目配置',exact:true}).click();await expect(page.getByLabel('工作目录',{exact:true})).toHaveValue('/home/dev/project');expect(await page.evaluate(()=>(window as any).__calls.save)).toEqual([]);
});
test('authentication failure gives recovery, keeps the draft and retries with the same connection id',async({page})=>{
 await setup(page);await newConnection(page);await page.evaluate(()=>(window as any).__mode='error');await page.getByRole('button',{name:'保存并连接',exact:true}).click();await expect(page.getByRole('alert')).toContainText('服务器拒绝了当前凭据');await expect(page.getByRole('alert')).toBeFocused();await expect(page.getByText('连接配置已保存，可修改后重试。')).toBeVisible();
 await page.getByText('技术详情',{exact:true}).click();await expect(page.getByRole('alert')).toContainText('publickey,password');await page.screenshot({path:'test-results/ssh-project-error.png'});
 await page.evaluate(()=>(window as any).__mode='normal');await page.getByRole('button',{name:'保存并连接',exact:true}).click();await expect(page.getByText('已连接',{exact:true})).toBeVisible();const calls=await page.evaluate(()=>(window as any).__calls);expect(calls.save).toHaveLength(2);expect(calls.save[0].id).toBe(calls.save[1].id);
});
test('cancelled connection, save and browse responses cannot move the editor or overwrite the project',async({page})=>{
 await setup(page);await page.getByLabel('已保存的连接').selectOption('build');await page.evaluate(()=>(window as any).__mode='slow-connect');await page.getByRole('button',{name:'连接服务器',exact:true}).click();await expect(page.getByRole('button',{name:'关闭',exact:true})).toBeEnabled();await page.getByRole('button',{name:'取消等待',exact:true}).click();await newConnection(page);
 await page.evaluate(()=>(window as any).__resolve());await expect(page.getByLabel('主机 / IP')).toHaveValue('new.example.test');
 await page.evaluate(()=>(window as any).__mode='slow-save');await page.getByRole('button',{name:'保存并连接',exact:true}).click();await page.getByRole('button',{name:'取消等待',exact:true}).click();await page.getByRole('button',{name:'返回',exact:true}).click();await page.evaluate(()=>(window as any).__resolve());await expect(page.getByLabel('已保存的连接')).toBeVisible();expect(await page.evaluate(()=>(window as any).__calls.connect)).toEqual(['build']);
 await page.evaluate(()=>(window as any).__mode='normal');await page.getByRole('button',{name:'连接服务器',exact:true}).click();await page.evaluate(()=>(window as any).__mode='slow-browse');await page.getByRole('button',{name:'浏览远端目录',exact:true}).click();await page.getByRole('button',{name:'取消等待',exact:true}).click();await page.getByLabel('工作目录',{exact:true}).fill('/other');await page.evaluate(()=>(window as any).__resolve());await expect(page.getByLabel('远端文件夹')).toHaveCount(0);await expect(page.getByLabel('工作目录',{exact:true})).toHaveValue('/other');expect(await page.evaluate(()=>(window as any).__calls.disconnect)).toEqual([]);
});
test('narrow dark connection editor keeps its primary action visible and validates the advanced port',async({page})=>{
 await setup(page);await page.setViewportSize({width:600,height:720});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await newConnection(page);await page.getByText('高级设置',{exact:true}).click();await page.getByLabel('端口',{exact:true}).fill('0');await expect(page.getByRole('button',{name:'保存并连接',exact:true})).toBeDisabled();await page.getByLabel('端口',{exact:true}).fill('22');
 await page.screenshot({path:'test-results/ssh-project-new-dark.png'});const button=await page.getByRole('button',{name:'保存并连接',exact:true}).boundingBox();expect(button!.y+button!.height).toBeLessThan(720);expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});
test('empty connection list offers a clear entry and private-key authentication remains available',async({page})=>{
 await setup(page);await page.getByRole('radio',{name:/本地项目/}).check();await page.evaluate(()=>(window as any).desktop.ssh.list=async()=>[]);await page.getByRole('radio',{name:/SSH 远端项目/}).check();await expect(page.getByText('还没有保存的连接。添加服务器后，可在多个项目中复用。')).toBeVisible();await expect(page.getByLabel('主机 / IP')).toHaveCount(0);
 await newConnection(page);await page.getByLabel('认证方式').selectOption('key');await page.getByRole('button',{name:'选择私钥',exact:true}).click();await expect(page.getByLabel('私钥文件',{exact:true})).toHaveValue('/mock/id_ed25519');await page.getByRole('button',{name:'保存并连接',exact:true}).click();await expect(page.getByText('已连接',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).__calls.save[0].authType)).toBe('key');
});
test('closing during a connection does not update a subsequently opened project editor',async({page})=>{
 await setup(page);await page.getByLabel('已保存的连接').selectOption('build');await page.evaluate(()=>(window as any).__mode='slow-connect');await page.getByRole('button',{name:'连接服务器',exact:true}).click();await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'新建项目',exact:true}).click();await page.getByRole('radio',{name:/SSH 远端项目/}).check();await page.evaluate(()=>(window as any).__resolve());await expect(page.getByLabel('已保存的连接')).toHaveValue('');await expect(page.getByLabel('项目名称',{exact:true})).toHaveCount(0);
});
test('switching project type keeps each working directory and preserves the local creation flow',async({page})=>{
 await setup(page);await selectExisting(page);await chooseDirectory(page);await page.locator('summary').filter({hasText:'项目类型'}).click();await page.getByRole('radio',{name:/本地项目/}).check();await expect(page.getByLabel('工作目录',{exact:true})).toHaveValue('');await page.getByLabel('工作目录',{exact:true}).fill('/local/project');await expect(page.getByRole('button',{name:'保存项目',exact:true})).toBeEnabled();
 await page.getByRole('radio',{name:/SSH 远端项目/}).click();await expect(page.getByLabel('工作目录',{exact:true})).toHaveValue('/home/dev/project');await expect(page.getByRole('button',{name:'创建项目',exact:true})).toBeEnabled();
});
