import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    const createdAt = new Date().toISOString();
    const project = {id:'docker-project', name:'Docker project', type:'ssh', connectionId:'ssh', path:'/workspace', createdAt,
      environment:{kind:'docker', containerId:'a'.repeat(64), containerName:'dev', shell:'auto'}};
    const run = {id:'running-task', title:'容器内任务', projectId:project.id, createdAt, status:'running', model:'fixture',
      messages:[{id:'user', role:'user', text:'检查容器项目'}], tools:[], approvals:[]};
    const sibling = {...run, id:'sibling-task', title:'同项目另一任务'};
    const sessions: {id:string; projectId:string; runId?:string; viewId?:string; cwd:string; shell:string; exited:boolean; exitCode:null}[] = [];
    const requests: unknown[] = [];
    const output = new Map<string,string>();
    type Frame={data:string;snapshot:boolean;cols:number;rows:number;exited:boolean;exitCode:null};
    const waiting=new Map<string,{token:string;resolve:(frame:Frame|null)=>void}>();
    const frame=(data:string,snapshot=false):Frame=>({data,snapshot,cols:80,rows:24,exited:false,exitCode:null});
    let reads=0;
    Object.assign(window, {terminalRequests:requests,terminalReads:()=>reads,desktop:{
      getProvider:async()=>({configured:true, model:'fixture', baseUrl:'http://fixture'}),
      getDevice:async()=>({mode:'desktop'}),
      readWorkspace:async()=>({language:'zh-CN', layoutMode:'activity', projects:[project,{...project,id:'other-project',name:'另一项目'}], tasks:[]}),
      listRuns:async()=>[run,sibling], onRun:()=>()=>{}, onCommand:()=>()=>{},
      ssh:{list:async()=>[{id:'ssh', state:'connected', username:'dev', host:'example.test', port:22}], onChanged:()=>()=>{}, validate:async()=>({path:project.path})},
      terminal:{
        list:async()=>sessions.slice(), profiles:async()=>[{id:'remote-login', name:'远端登录 Shell'}],
        create:async(input:{projectId:string;runId?:string;viewId?:string})=>{
          requests.push(input);
          const session = {...input,id:'term-'+requests.length,cwd:project.path,shell:'Docker · dev',exited:false,exitCode:null};
          sessions.push(session);
          return session;
        },
        write:async({id,data}:{id:string;data:string})=>{
          output.set(id,(output.get(id)||'')+data);
          waiting.get(id)?.resolve(frame(data));waiting.delete(id);
        },
        attach:async({id}:{id:string})=>frame(output.get(id)||'',true),
        read:({id,token}:{id:string;token:string})=>{reads++;return new Promise<Frame|null>(resolve=>waiting.set(id,{token,resolve}));},
        detach:async({id,token}:{id:string;token:string})=>{
          if(waiting.get(id)?.token===token){waiting.get(id)?.resolve(null);waiting.delete(id);}
        },
        resize:async()=>{}, focus:async()=>{},
      },
    }});
  });
  await page.goto('/');
  await page.locator('.tree-task > button:first-child').filter({hasText:'容器内任务'}).click();
  await page.getByRole('button',{name:'展开 SSH 连接详情'}).click();
});

test('open and reopen a container terminal during a running project task', async ({page}) => {
  const open = page.getByRole('button',{name:'打开终端',exact:true});
  await open.click();
  const terminal = page.locator('.terminal-screen:visible .xterm-helper-textarea');
  await expect(terminal).toBeFocused();
  await terminal.pressSequentially('pwd');
  await expect(page.locator('.terminal-screen .xterm-rows')).toContainText('pwd');
  await page.getByRole('button',{name:'收起终端'}).click();
  await expect(page.locator('.terminal-screen .xterm')).toHaveCount(0);
  await open.click();
  await expect(terminal).toBeFocused();
  await expect(page.locator('.terminal-screen .xterm-rows')).toContainText('pwd');
  await expect(page.getByText('检查容器项目',{exact:true})).toBeVisible();
  expect(await page.evaluate(() => (window as any).terminalRequests)).toEqual([{projectId:'docker-project', runId:'running-task'}]);
});

test('a terminal load failure stays in the dock and preserves the task draft', async ({page}) => {
  const composer = page.getByRole('textbox',{name:'继续对话', exact:true});
  await composer.fill('尚未发送的补充说明');
  const module = '**/src/TerminalPanel.tsx*';
  await page.route(module, route => route.fulfill({status:503, body:'Unavailable'}));
  const open = page.getByRole('button',{name:'打开终端',exact:true});
  await open.click();
  await expect(page.getByRole('alert')).toContainText('终端界面未能打开');
  await expect(composer).toHaveValue('尚未发送的补充说明');
  await page.getByRole('button',{name:'收起终端'}).click();
  await expect(page.getByText('终端界面未能打开', {exact:false})).toHaveCount(0);
  await expect(page.getByText('检查容器项目',{exact:true})).toBeVisible();
  expect(await page.evaluate(() => (window as any).terminalRequests)).toEqual([]);
  await page.unroute(module);
  await open.click();
  await expect(page.locator('.terminal-screen:visible .xterm-helper-textarea')).toBeFocused();
  await expect(composer).toHaveValue('尚未发送的补充说明');
});

test('tasks own their terminal visibility, sessions and scrollback', async ({page}) => {
  const task = (title:string) => page.locator('.tree-task > button:first-child').filter({hasText:title});
  const open = page.getByRole('button',{name:'打开终端',exact:true});
  const panel = page.locator('.terminal-panel:visible');
  const terminal = panel.locator('.terminal-screen:visible .xterm-helper-textarea');
  const rows = panel.locator('.terminal-screen:visible .xterm-rows');
  await open.click();
  await expect(terminal).toBeFocused();
  await terminal.pressSequentially('first-session');
  await expect(rows).toContainText('first-session');

  await task('同项目另一任务').click();
  await expect(panel).toHaveCount(0);
  await open.click();
  await expect(terminal).toBeFocused();
  await terminal.pressSequentially('second-session');
  await expect(rows).toContainText('second-session');
  await expect(rows).not.toContainText('first-session');
  await expect(panel.getByRole('tab')).toHaveCount(1);
  await panel.getByRole('button',{name:'收起终端'}).click();

  await page.getByRole('button',{name:/^另一项目(?: |$)/}).click();
  await expect(panel).toHaveCount(0);
  await task('容器内任务').click();
  await expect(rows).toContainText('first-session');
  await expect(rows).not.toContainText('second-session');
  await task('同项目另一任务').click();
  await expect(panel).toHaveCount(0);
  await open.click();
  await expect(rows).toContainText('second-session');
  expect(await page.evaluate(()=>(window as any).terminalRequests.map((r:{runId:string})=>r.runId))).toEqual(['running-task','sibling-task']);
});
