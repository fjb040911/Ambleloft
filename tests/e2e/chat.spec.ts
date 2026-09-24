import { test, expect } from '@playwright/test';
const xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="开始" vertex="1" parent="1" style="rounded=1;"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell><mxCell id="b" value="完成" vertex="1" parent="1"><mxGeometry x="240" y="20" width="120" height="60" as="geometry"/></mxCell><mxCell id="e" edge="1" source="a" target="b" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>';
const rich = '# 渲染验收\n\n**重点内容** 和 `inline`。\n\n| 项目 | 结果 |\n|---|---|\n| 测试 | 成功 |\n\n- [x] 已完成\n\n公式：$E=mc^2$\n\n```typescript\nconst hello = "world";\n```\n\n```mermaid\nflowchart LR\n A[输入] --> B[输出]\n```\n\n```echarts\n{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{},"series":[{"type":"bar","data":[3,7]}]}\n```\n\n```drawio\n'+xml+'\n```\n\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><rect width="200" height="60" fill="#e3ecfa"/><text x="20" y="35">Vector preview</text></svg>\n```';
async function prepare(page: import('@playwright/test').Page, text = rich) {
  await page.addInitScript(({ text }) => {
    const run: any = { id:'demo', title:'聊天体验验收', model:'fixture', baseUrl:'http://127.0.0.1/v1', cwd:'/fixture', createdAt:new Date().toISOString(), status:'waiting', error:'', tools:[], approvals:[{id:'approve',method:'item/commandExecution/requestApproval',detail:JSON.stringify({command:'echo approved',cwd:'/fixture',reason:'确认本次操作'})}], messages:[{id:'u',role:'user',text:'请展示结果'},{id:'r',role:'assistant',kind:'reasoning',status:'completed',text:'先检查输入，再整理结果。'},{id:'a',role:'assistant',phase:'final_answer',text}] };
    let callback: any;
    (window as any).__demoRun = run;
    (window as any).__emit = () => callback(structuredClone(run));
    (window as any).desktop = {
      getProvider:async()=>({configured:true,baseUrl:run.baseUrl,model:'fixture',executable:'',hasKey:false}),
      getDevice:async()=>({name:'Test Mac',memoryGB:64,mode:'desktop'}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light'}),
      listRuns:async()=>[structuredClone(run)],onRun:(fn:any)=>{callback=fn;return()=>{}},onCommand:()=>()=>{},
      approveRun:async(input:any)=>{(window as any).__decision=input;run.approvals=[];run.status='completed';callback(structuredClone(run));},
      copyText:async(text:string)=>{(window as any).__copiedText=text;},
      saveWorkspace:async()=>{},stopRun:async()=>{},
    };
  }, {text});
  await page.goto('/');
  await page.locator('.tree-task > button:first-child').filter({hasText:'聊天体验验收'}).click();
}
test('final answers render while unfinished execution stays visible', async ({page})=>{
  await prepare(page);
  await expect(page.getByRole('region',{name:'任务执行过程'})).toBeVisible();
  await expect(page.locator('.markdown h1')).toHaveText('渲染验收');
  await expect(page.locator('.markdown table td')).toHaveCount(2);
  await expect(page.locator('.katex')).toHaveCount(1);
  await expect(page.locator('.hljs-keyword')).toHaveCount(1);
  await expect(page.getByAltText('Mermaid 图表')).toHaveCount(1);
  await expect(page.locator('.chart-canvas svg')).toHaveCount(1);
  await expect(page.getByRole('img',{name:'draw.io 基础图形'})).toHaveCount(1);
  await expect(page.getByAltText('SVG 图形')).toHaveCount(1);
  await page.locator('.artifact').first().getByRole('button',{name:'源码',exact:true}).click();
  await expect(page.locator('.artifact').first().locator('pre')).toContainText('flowchart');
});
test('approval stays above composer while history scrolls; decision clears it', async ({page})=>{
  await prepare(page, Array.from({length:50},(_,i)=>`段落 ${i}\n\n`).join(''));
  const composer=page.getByRole('textbox',{name:'继续对话'});
  const before=await composer.boundingBox();
  await page.locator('.conversation-scroll').evaluate(el=>{el.scrollTop=0});
  await expect(page.getByRole('button',{name:'批准本次',exact:true})).toBeVisible();
  const after=await composer.boundingBox();
  expect(Math.abs(before!.y-after!.y)).toBeLessThan(2);
  const approval=await page.getByRole('region',{name:'执行授权'}).boundingBox();
  expect(approval!.y+approval!.height).toBeLessThanOrEqual(after!.y);
  await expect(page.getByRole('button',{name:'回到最新消息'})).toBeVisible();
  await page.getByRole('button',{name:'拒绝',exact:true}).click();
  await expect(page.getByRole('region',{name:'执行授权'})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).__decision.decision)).toBe('decline');
});
test('broken and executable content falls back without running',async({page})=>{
  await prepare(page,'<script>window.pwned=true</script>\n\n```echarts\n{"series":[{"type":"custom","renderItem":"alert(1)"}]}\n```\n\n```mermaid\ninvalid !!!\n```');
  await expect(page.locator('.artifact-error')).toHaveCount(2);
  expect(await page.evaluate(()=>(window as any).pwned)).toBeUndefined();
  await page.setViewportSize({width:800,height:600});
  const box=await page.getByRole('textbox',{name:'继续对话'}).boundingBox();
  expect(box!.y+box!.height).toBeLessThan(600);
});

test('user bubble contains only text and each finished turn has its own duration',async({page})=>{
 await prepare(page,'第一轮回答');
 await expect(page.locator('.message.user .message-label')).toHaveCount(0);
 await expect(page.locator('.message.user')).toHaveText('请展示结果');
 await expect(page.locator('.turn-duration')).toHaveCount(0);
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;
  run.messages[0].timing={startedAt:'2026-09-10T00:00:00Z',durationMs:65000,outcome:'completed'};
  run.messages.push({id:'u2',role:'user',text:'第二个问题',timing:{startedAt:'2026-09-10T00:02:00Z',durationMs:5000,outcome:'completed'}},{id:'a2',role:'assistant',text:'第二轮回答'});
  run.status='completed';run.approvals=[];(window as any).__emit();
 });
 await expect(page.locator('.turn-duration')).toHaveText(['用时 1 分 5 秒','用时 0 分 5 秒']);
 expect(await page.locator('.message.user').first().evaluate(el=>getComputedStyle(el).borderRadius)).toBe('22px');
 const items=await page.locator('.conversation-turn .turn-duration, .conversation-turn article').allTextContents();
 expect(items.findIndex(t=>t.includes('用时 1 分 5 秒'))).toBeLessThan(items.findIndex(t=>t.includes('第一轮回答')));
});


test('Mermaid arithmetic labels survive sanitization and copy returns exact source',async({page})=>{
 const source='---\nconfig:\n  htmlLabels: true\n---\nflowchart LR\n A["输入：17 × 23"] -->|计算| B["输出：391"]';
 await prepare(page,'```mermaid\n'+source+'\n```');
 const img=page.getByAltText('Mermaid 图表');await expect(img).toHaveCount(1);
 const labels=await img.evaluate(el=>{
  const svg=decodeURIComponent((el as HTMLImageElement).src.split(',').slice(1).join(','));
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
  return {text:[...doc.querySelectorAll('text')].map(n=>n.textContent).join(' '),html:doc.querySelectorAll('foreignObject').length};
 });
 expect(labels.text).toContain('17 × 23');expect(labels.text).toContain('391');expect(labels.text).toContain('计算');expect(labels.html).toBe(0);
 await page.locator('.artifact').getByRole('button',{name:'复制',exact:true}).click();
 await expect(page.locator('.artifact').getByRole('button',{name:'已复制',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__copiedText)).toBe(source);
});

test('turn anchors preview the question and jump without moving the composer',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='completed';run.approvals=[];
  run.messages=Array.from({length:15},(_,i)=>[
   {id:'u'+i,role:'user',text:`问题 ${i+1}：请详细说明设计方案`},
   {id:'a'+i,role:'assistant',text:Array.from({length:8},()=>`第 ${i+1} 轮的详细回答。\n\n`).join('')},
  ]).flat();(window as any).__emit();
 });
 const nav=page.getByRole('navigation',{name:'对话轮次导航'});
 await expect(nav.getByRole('button')).toHaveCount(15);
 const composer=await page.getByRole('textbox',{name:'继续对话'}).boundingBox();
 await nav.getByRole('button').first().hover();
 await expect(page.getByRole('tooltip')).toContainText('问题 1：请详细说明设计方案');
 await nav.getByRole('button').first().click();
 await expect(page.getByRole('tooltip')).toHaveCount(0);
 await expect.poll(()=>page.locator('[data-turn-id="u0"]').evaluate(el=>Math.round(el.getBoundingClientRect().top-el.closest('.conversation-scroll')!.getBoundingClientRect().top))).toBe(14);
 await nav.getByRole('button').nth(9).focus();
 await expect(page.getByRole('tooltip')).toContainText('问题 10：');
 await page.keyboard.press('Enter');
 await expect.poll(()=>page.locator('[data-turn-id="u9"]').evaluate(el=>Math.round(el.getBoundingClientRect().top-el.closest('.conversation-scroll')!.getBoundingClientRect().top))).toBe(14);
 expect((await page.getByRole('textbox',{name:'继续对话'}).boundingBox())!.y).toBe(composer!.y);
 await page.setViewportSize({width:800,height:600});
 const box=await page.getByRole('textbox',{name:'继续对话'}).boundingBox();expect(box!.y+box!.height).toBeLessThan(600);
});

test('progress stays until completion and can be reopened alongside plans and files',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='running';run.approvals=[];
  run.messages=[{id:'u',role:'user',text:'制作文档'},{id:'r',role:'assistant',kind:'reasoning',text:'检查可用环境',order:1},{id:'p',role:'assistant',phase:'commentary',text:'有个 Python 3.11 可用。',order:2},{id:'p2',role:'assistant',phase:'commentary',text:'安装进行中，等待完成。',order:4}];
  run.tools=[{id:'t',turnKey:'u',order:3,type:'commandExecution',label:'uv pip install python-docx',status:'inProgress',detail:'Downloading python-docx'}];(window as any).__emit();
 });
 const panel=page.getByRole('region',{name:'任务执行过程'});
 await expect(panel).toContainText('有个 Python 3.11 可用。');
 await expect(panel).toContainText('Downloading python-docx');
 await panel.locator('summary').click();
 await expect(panel.locator('.thinking-window pre')).toHaveText('检查可用环境');
 await expect(panel.locator('.process-milestone')).toHaveText(['有个 Python 3.11 可用。','安装进行中，等待完成。']);
 await page.evaluate(()=>{(window as any).__demoRun.tools[0].status='completed';(window as any).__emit();});
 await expect(panel.locator('summary')).toBeVisible();
 await expect(panel.locator('.process-entry-title')).toHaveText(['思考摘要']);
 await expect(panel.getByRole('button',{name:/查看已完成操作/})).toHaveCount(0);
 await expect(page.locator('.message.assistant')).toHaveCount(0);
 await page.screenshot({path:'test-results/turn-process.png'});
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.messages.push({id:'f',role:'assistant',phase:'final_answer',text:'## 文档已完成'});(window as any).__emit();});
 await expect(panel).toBeVisible();await expect(page.locator('.markdown h2')).toHaveText('文档已完成');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.plans=[{turnKey:'u',explanation:'整理结果',steps:[{step:'调研资料',status:'completed'},{step:'撰写文档',status:'inProgress'}]}];(window as any).__emit();});
 await expect(page.getByLabel('任务清单')).toContainText('撰写文档');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='completed';run.artifacts=[{id:'file',turnKey:'u',name:'report.md',path:'/fixture/report.md',size:1024}];(window as any).desktop.accessArtifact=async()=>({name:'report.md',text:'# 可预览的结果'});(window as any).__emit();});
 await expect(panel).toHaveCount(0);await expect(page.getByLabel('交付文件')).toContainText('report.md');
 await page.locator('.turn-progress-toggle').click();await expect(panel).toBeVisible();await expect(page.getByLabel('任务清单')).toContainText('未确认完成');await expect(panel.locator('.thinking-window')).toHaveCount(0);await expect(panel).not.toContainText('检查可用环境');
 await expect(panel.locator('summary')).toBeVisible();await expect(panel).toContainText('有个 Python 3.11 可用。');await expect(panel).toContainText('安装进行中，等待完成。');
 await page.locator('.turn-progress-toggle').click();await expect(panel).toHaveCount(0);await expect(page.locator('.markdown h2')).toHaveText('文档已完成');await expect(page.getByLabel('交付文件')).toBeVisible();await page.locator('.turn-progress-toggle').click();
 await page.getByRole('button',{name:'预览 report.md',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('可预览的结果');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.screenshot({path:'test-results/progress-completed.png'});
 expect(await page.evaluate(()=>(window as any).__demoRun.messages.length)).toBe(5);
});

test('unclassified providers resolve on completion; failed turns retain their process',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];delete run.messages[2].phase;run.messages[2].text='正在安装';(window as any).__emit();});
 await expect(page.locator('.process-panel')).toContainText('正在安装');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='failed';run.error='安装失败';(window as any).__emit();});
 await expect(page.locator('.process-panel')).toBeVisible();await expect(page.getByRole('alert')).toContainText('安装失败');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='completed';run.error='';run.messages.push({id:'last',role:'assistant',text:'安装完成，文档已生成。'});(window as any).__emit();});
 await expect(page.locator('.process-panel')).toHaveCount(0);await expect(page.locator('.message.assistant')).toContainText('安装完成，文档已生成。');
});

test('persistent activity survives folded logs and distinguishes silence, tools and approval',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];run.messages=[{id:'u',role:'user',text:'执行任务',timing:{startedAt:new Date().toISOString()}}];run.lastEventAt=new Date().toISOString();(window as any).__emit();});
 const activity=page.getByLabel('当前运行状态');await expect(activity).toContainText('等待模型响应');
 await expect(page.getByLabel('任务执行过程')).toContainText('尚未收到模型的过程内容');
 await page.locator('.turn-progress-toggle').click();await expect(page.locator('.process-panel')).toHaveCount(0);await expect(activity).toBeVisible();
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.tools=[{id:'t',turnKey:'u',type:'commandExecution',label:'python report.py',status:'inProgress',detail:''}];(window as any).__emit();});
 await expect(activity).toContainText('python report.py');await expect(activity.locator('.activity-spinner')).toBeVisible();
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.lastEventAt=new Date(Date.now()-30000).toISOString();(window as any).__emit();});
 await expect(activity).toContainText('等待新的响应');await expect(activity).toContainText('距上次更新');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='waiting';(window as any).__emit();});
 await expect(activity).toContainText('需要你批准');await expect(activity.locator('.activity-spinner')).toHaveCount(0);
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.lastEventAt=new Date().toISOString();(window as any).__emit();});await page.locator('.turn-progress-toggle').click();
 await expect(page.locator('.activity-tool-summary')).toContainText('python report.py');
 await page.screenshot({path:'test-results/live-activity.png'});
 await page.emulateMedia({reducedMotion:'reduce'});expect(await activity.locator('.activity-spinner').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='completed';run.tools[0].status='completed';(window as any).__emit();});await expect(activity).toHaveCount(0);await expect(page.locator('.turn-progress-toggle')).toContainText('1 次工具调用');
});


test('thinking scrolls independently, disappears after interruption, and tools stop shimmering',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];run.messages=[{id:'u',role:'user',text:'研究任务'},{id:'a',role:'assistant',phase:'commentary',text:'**核实关键前提**',order:1},{id:'r',role:'assistant',kind:'reasoning',text:Array.from({length:60},(_,i)=>'分析步骤 '+i).join('\n'),order:2}];run.tools=[{id:'t',turnKey:'u',order:3,type:'commandExecution',label:'pwd',status:'inProgress',detail:''}];(window as any).__emit();});
 const window=page.locator('.thinking-window');
 await expect(page.locator('.process-milestone strong')).toHaveText('核实关键前提');
 expect((await window.boundingBox())!.height).toBeLessThanOrEqual(180);
 await expect.poll(()=>window.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)).toBeLessThan(2);
 await window.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
 await page.evaluate(()=>{(window as any).__demoRun.messages[2].text+='\n更多分析';(window as any).__emit();});
 await expect.poll(()=>window.evaluate(el=>el.scrollTop)).toBe(0);
 const tool=page.locator('.process-entry details summary');
 expect(await tool.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('tool-sweep');
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await tool.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
 await page.screenshot({path:'test-results/process-abc.png'});
 await page.evaluate(()=>{(window as any).__demoRun.status='interrupted';(window as any).__emit();});
 await expect(window).toHaveCount(0);await expect(page.locator('.process-milestone')).toBeVisible();await expect(tool).toBeVisible();
 expect(await tool.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
 await page.locator('.turn-progress-toggle').click();await page.locator('.turn-progress-toggle').click();await expect(window).toHaveCount(0);
});

test('clarification collects explicit answers and retry state offers recovery without replaying work',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='waiting';run.approvals=[];run.questions=[{id:'q',blocking:true,questions:[{id:'audience',header:'受众',question:'面向谁？',options:[{label:'设计师',description:'设计工作'},{label:'开发者',description:'工程工作'}]}]}];(window as any).desktop.answerRun=async(value:any)=>{(window as any).__answer=value;run.questions=[];run.status='running';(window as any).__emit();};(window as any).__emit();});
 await expect(page.getByLabel('当前运行状态')).toContainText('等待你的回答');
 await expect(page.getByRole('button',{name:'提交回答'})).toBeDisabled();await page.screenshot({path:'test-results/task-question.png'});
 await page.getByRole('radio',{name:'设计师 设计工作'}).check();await page.getByRole('button',{name:'提交回答'}).click();
 await expect(page.getByRole('form',{name:'任务澄清'})).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__answer.answers)).toEqual({audience:'设计师'});
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.retrying=true;run.error='连接中断';(window as any).__emit();});
 await expect(page.getByLabel('当前运行状态')).toContainText('正在重试');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.retrying=false;run.status='failed';(window as any).__emit();});
 await page.getByRole('button',{name:'准备继续任务'}).click();
 await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('请核实当前任务已完成的操作，并从未完成的步骤继续。');
 await expect(page.getByRole('button',{name:'发送后续消息'})).toBeEnabled();
});


test('older turns load by cursor and long history only mounts nearby content',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='completed';run.approvals=[];
  const messages=(start:number,end:number)=>Array.from({length:end-start},(_,j)=>{const i=j+start;return [{id:'u'+i,role:'user',text:'问题 '+i},{id:'a'+i,role:'assistant',phase:'final_answer',text:('回答 '+i+'\n\n').repeat(15)}];}).flat();
  run.messages=messages(30,60);run.tools=[];run.historyBefore='u30';run.turnOffset=30;
  (window as any).desktop.getRunPage=async(input:any)=>{(window as any).__historyInput=input;return {...run,messages:messages(0,30),historyBefore:null,turnOffset:0};};
  (window as any).__emit();
 });
 await expect(page.getByRole('navigation',{name:'对话轮次导航'}).getByRole('button').first()).toHaveAttribute('aria-label',/第 31 轮/);
 await page.getByRole('button',{name:'加载更早的对话'}).click();
 expect(await page.evaluate(()=>(window as any).__historyInput.before)).toBe('u30');
 await expect(page.locator('.conversation-turn')).toHaveCount(60);
 await expect.poll(()=>page.locator('.message.assistant').count()).toBeLessThan(30);
 await page.getByRole('navigation',{name:'对话轮次导航'}).getByRole('button').first().click();
 await expect(page.locator('[data-turn-id="u0"] .message.assistant')).toBeVisible();
 await page.getByRole('button',{name:'回到最新消息'}).click();
 await expect(page.locator('[data-turn-id="u59"] .message.assistant')).toBeVisible();
});


test('a completed protocol turn does not claim the user objective was achieved', async ({page}) => {
  await prepare(page, '当前资料尚未取得。');
  await expect(page.getByRole('button',{name:'批准本次',exact:true})).toBeVisible();
  await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='completed';run.approvals=[];(window as any).__emit();});
  await expect(page.locator('.turn-progress-toggle')).toContainText('本轮已结束');
  await expect(page.locator('.turn-progress-toggle')).not.toContainText('已完成');
  await expect(page.getByRole('button',{name:'批准本次',exact:true})).toHaveCount(0);
  await expect(page.locator('.markdown')).toContainText('当前资料尚未取得。');
});

test('switching away from a running task preserves each conversation draft',async({page})=>{
 await prepare(page,'第一项结果');
 await page.getByRole('textbox',{name:'继续对话'}).fill('第一项草稿');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.id='second';run.title='另一项任务';run.status='completed';run.approvals=[];run.messages=[{id:'u2',role:'user',text:'另一项提问'}];(window as any).__emit();});
 await page.locator('.tree-task > button:first-child').filter({hasText:'另一项任务'}).click();
 await page.getByRole('textbox',{name:'继续对话'}).fill('第二项草稿');
 await page.locator('.tree-task > button:first-child').filter({hasText:'聊天体验验收'}).click();
 await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('第一项草稿');
 await page.locator('.tree-task > button:first-child').filter({hasText:'另一项任务'}).click();
 await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('第二项草稿');
});

test('background task never occupies chat viewport and another chat can send',async({page})=>{
 await prepare(page,'第一项结果');
 await page.evaluate(()=>{
  const original=(window as any).__demoRun;
  original.status='running';original.approvals=[];(window as any).__emit();
  original.id='parallel';original.title='并行聊天';original.status='completed';original.messages=[{id:'p-user',role:'user',text:'第二项任务'}];(window as any).__emit();
  (window as any).desktop.startRun=async(input:any)=>{
   (window as any).__parallelInput=input;
   original.status='running';(window as any).__emit();return structuredClone(original);
  };
 });
 const first=page.locator('.tree-task').filter({hasText:'聊天体验验收'});
 await expect(first.locator('.task-status-label')).toHaveText('运行中');
 await page.locator('.tree-task > button:first-child').filter({hasText:'并行聊天'}).click();
 await expect(page.locator('.running-banner')).toHaveCount(0);
 const input=page.getByRole('textbox',{name:'继续对话'});
 const main=await page.locator('main.chat-main').boundingBox();
 const box=await input.boundingBox();
 expect(box!.width).toBeGreaterThan(main!.width*.6);
 await input.fill('开始第二项');
 await page.getByRole('button',{name:'发送后续消息'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__parallelInput?.runId)).toBe('parallel');
 await expect(page.locator('.tree-task').filter({hasText:'并行聊天'}).locator('.task-status-label')).toHaveText('运行中');
 await expect(first.locator('.task-status-label')).toHaveText('运行中');
});

test('background updates and switching preserve a scrolled-up conversation',async({page})=>{
 await prepare(page,Array.from({length:100},(_,i)=>'段落 '+i+'\n\n').join(''));
 const viewport=page.locator('.conversation-scroll:visible');
 await viewport.evaluate(el=>{el.scrollTop=250;el.dispatchEvent(new Event('scroll'));});
 await page.waitForTimeout(100);
 const before=await viewport.evaluate(el=>el.scrollTop);
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.id='background';run.title='后台滚动测试';run.status='running';run.approvals=[];run.messages=[{id:'bg-user',role:'user',text:'后台任务'},{id:'bg-answer',role:'assistant',text:'后台输出'}];(window as any).__emit();
 });
 await page.waitForTimeout(100);
 expect(Math.abs(await viewport.evaluate(el=>el.scrollTop)-before)).toBeLessThan(3);
 await page.locator('.tree-task > button:first-child').filter({hasText:'后台滚动测试'}).click();
 await page.evaluate(()=>{for(let i=0;i<8;i++){(window as any).__demoRun.messages[1].text+='\n更多输出';(window as any).__emit();}});
 await page.locator('.tree-task > button:first-child').filter({hasText:'聊天体验验收'}).click();
 await page.waitForTimeout(150);
 expect(Math.abs(await viewport.evaluate(el=>el.scrollTop)-before)).toBeLessThan(3);
});

test('delivered preview maximizes, zooms content and restores focus',async({page})=>{
 await prepare(page,'文档已生成');
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='completed';run.approvals=[];
  run.artifacts=[{id:'code',turnKey:'u',name:'sample.ts',path:'/fixture/sample.ts',size:100}];
  (window as any).desktop.accessArtifact=async()=>({name:'sample.ts',text:Array.from({length:200},(_,i)=>`const value${i} = ${i};`).join('\n')});
  (window as any).__emit();
 });
 const eye=page.getByRole('button',{name:'预览 sample.ts',exact:true});await eye.click();
 const dialog=page.getByRole('dialog');await expect(dialog.locator('.cm-editor')).toBeVisible();
 await dialog.evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
 const initial=await dialog.boundingBox();expect(initial!.width).toBeGreaterThan(560);
 await dialog.locator('.cm-scroller').evaluate(el=>{el.scrollTop=200;});
 await dialog.getByRole('button',{name:'最大化',exact:true}).click();
 await expect.poll(async()=>Math.round((await dialog.boundingBox())!.width)).toBe(page.viewportSize()!.width);
 await expect.poll(async()=>Math.round((await dialog.boundingBox())!.height)).toBe(page.viewportSize()!.height);
 expect(await dialog.locator('.cm-scroller').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await dialog.getByRole('button',{name:'放大',exact:true}).click();await expect(dialog.locator('output')).toHaveText('110%');
 expect(await dialog.locator('.artifact-preview-content').evaluate(el=>getComputedStyle(el).zoom)).toBe('1.1');
 await dialog.getByRole('button',{name:'缩小',exact:true}).click();await expect(dialog.locator('output')).toHaveText('100%');
 await dialog.getByRole('button',{name:'放大',exact:true}).click();await dialog.getByRole('button',{name:'还原尺寸',exact:true}).click();await expect(dialog.locator('output')).toHaveText('100%');
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
 await page.screenshot({path:'test-results/artifact-preview-dark.png'});
 await dialog.getByRole('button',{name:'退出最大化',exact:true}).click();
 await expect.poll(async()=>Math.round((await dialog.boundingBox())!.width)).toBe(Math.round(initial!.width));
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(eye).toBeFocused();
 await page.setViewportSize({width:390,height:720});await page.emulateMedia({reducedMotion:'reduce'});await eye.click();
 await dialog.getByRole('button',{name:'最大化',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'关闭',exact:true})).toBeInViewport();
 await page.screenshot({path:'test-results/artifact-preview-narrow.png'});
});

test('preview eyes only appear for supported files within size limit and text formats render',async({page})=>{
 await prepare(page,'文件已生成');
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='completed';run.approvals=[];
  const names=['report.md','data.json','notes.txt','table.csv','app.log','main.py','report.pdf','report.docx','image.png','archive.zip','large.txt'];
  run.artifacts=names.map(name=>({id:name,turnKey:'u',name,path:'/fixture/'+name,size:name==='large.txt'?1048577:100}));
  (window as any).desktop.accessArtifact=async({id}:any)=>({name:id,text:id==='report.md'?'# Preview':'Preview content'});
  (window as any).__emit();
 });
 for(const name of ['report.pdf','report.docx','image.png','archive.zip','large.txt'])await expect(page.getByRole('button',{name:'预览 '+name,exact:true})).toHaveCount(0);
 for(const name of ['report.md','data.json','notes.txt','table.csv','app.log','main.py']){
  await page.getByRole('button',{name:'预览 '+name,exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.locator(name.endsWith('.md')?'.markdown':'.cm-editor')).toContainText('Preview');
  await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 }
});

test('markdown file dialog follows dark, light and system themes in both sizes',async({page})=>{
 await prepare(page,'报告已生成');
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='completed';run.approvals=[];
  run.artifacts=[{id:'md',turnKey:'u',name:'theme.md',path:'/fixture/theme.md',size:100}];
  (window as any).desktop.accessArtifact=async()=>({name:'theme.md',text:'# 主题预览\n\n正文与 **重点** 和 `inline`。\n\n> 引用文字\n\n| 项目 | 结果 |\n|---|---|\n| 主题 | 正常 |\n\n```js\nconst value = "hello";\n```'});
  (window as any).__emit();
 });
 await page.getByRole('button',{name:'预览 theme.md',exact:true}).click();const dialog=page.getByRole('dialog');
 for(const theme of ['dark','light','system']){
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
  const dark=theme!=='light';
  await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(dark?'rgb(36, 39, 46)':'rgb(255, 255, 255)');
  await expect.poll(()=>dialog.locator('.markdown').evaluate(el=>getComputedStyle(el).color)).toBe(dark?'rgb(232, 234, 240)':'rgb(38, 44, 53)');
  await expect.poll(()=>dialog.locator('.hljs-keyword').evaluate(el=>getComputedStyle(el).color)).toBe(dark?'rgb(213, 165, 245)':'rgb(128, 64, 160)');
  await dialog.getByRole('button',{name:'最大化',exact:true}).click();
  await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(dark?'rgb(36, 39, 46)':'rgb(255, 255, 255)');
  if(theme==='dark')await page.screenshot({path:'test-results/markdown-preview-dark.png'});
  await dialog.getByRole('button',{name:'退出最大化',exact:true}).click();
 }
});

test('preview maximize motion reverses from its visible bounds and respects reduced motion',async({page})=>{
 await prepare(page,'预览');
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='completed';run.approvals=[];
  run.artifacts=[{id:'md',turnKey:'u',name:'motion.md',path:'/fixture/motion.md',size:100}];
  (window as any).desktop.accessArtifact=async()=>({name:'motion.md',text:'# 动效'});(window as any).__emit();
 });
 await page.getByRole('button',{name:'预览 motion.md',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
 const before=await dialog.boundingBox();
 await dialog.getByRole('button',{name:'最大化',exact:true}).evaluate(el=>(el as HTMLButtonElement).click());
 await dialog.evaluate(el=>{const animation=el.getAnimations()[0];animation.pause();animation.currentTime=110;});
 const middle=await dialog.boundingBox();expect(middle!.width).toBeGreaterThan(before!.width);expect(middle!.width).toBeLessThan(page.viewportSize()!.width);
 await dialog.getByRole('button',{name:'退出最大化',exact:true}).evaluate(el=>(el as HTMLButtonElement).click());
 await dialog.evaluate(el=>{const animation=el.getAnimations()[0];animation.pause();animation.currentTime=0;});
 const reversed=await dialog.boundingBox();expect(Math.abs(reversed!.width-middle!.width)).toBeLessThan(2);expect(Math.abs(reversed!.x-middle!.x)).toBeLessThan(2);
 await dialog.evaluate(el=>el.getAnimations().forEach(a=>a.finish()));
 await page.emulateMedia({reducedMotion:'reduce'});
 await dialog.getByRole('button',{name:'最大化',exact:true}).click();
 expect(await dialog.evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
 expect(Math.round((await dialog.boundingBox())!.width)).toBe(page.viewportSize()!.width);
});

test('Mermaid opens a maximized preview with zoom, restore and focus return',async({page})=>{
 await prepare(page,'```mermaid\nflowchart LR\n A[输入] --> B[输出]\n```');
 const maximize=page.getByRole('button',{name:'最大化 Mermaid 图表'});
 await expect(page.getByAltText('Mermaid 图表')).toBeVisible();
 await maximize.click();const dialog=page.getByRole('dialog',{name:'Mermaid 图表'});
 await expect(dialog.getByAltText('Mermaid 图表')).toBeVisible();
 await expect.poll(async()=>Math.round((await dialog.boundingBox())!.width)).toBe(page.viewportSize()!.width);
 const original=await dialog.getByAltText('Mermaid 图表').boundingBox();
 await dialog.getByRole('button',{name:'放大',exact:true}).click();
 await expect(dialog.locator('output')).toHaveText('110%');
 const enlarged=await dialog.getByAltText('Mermaid 图表').boundingBox();expect(enlarged!.width/original!.width).toBeCloseTo(1.1,1);
 await dialog.getByRole('button',{name:'缩小',exact:true}).click();await expect(dialog.locator('output')).toHaveText('100%');
 await dialog.getByRole('button',{name:'放大',exact:true}).click();await dialog.getByRole('button',{name:'还原尺寸',exact:true}).click();await expect(dialog.locator('output')).toHaveText('100%');
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
 await page.screenshot({path:'test-results/mermaid-maximized.png'});
 await expect(dialog.getByRole('button',{name:'退出最大化',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'最大化',exact:true})).toHaveCount(0);
 const fit=await dialog.locator('.artifact-preview-body').evaluate(el=>({width:el.clientWidth,height:el.clientHeight,scrollWidth:el.scrollWidth,scrollHeight:el.scrollHeight}));
 expect(fit.scrollWidth).toBeLessThanOrEqual(fit.width+1);expect(fit.scrollHeight).toBeLessThanOrEqual(fit.height+1);
 await page.setViewportSize({width:800,height:600});
 await expect.poll(()=>dialog.locator('.artifact-preview-content').evaluate(el=>Math.round(el.getBoundingClientRect().width))).toBe(752);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(maximize).toBeFocused();
 await expect(page.getByAltText('Mermaid 图表')).toBeVisible();
});

test('nested Mermaid preview isolates document zoom and returns to the parent modal',async({page})=>{
 await prepare(page,'文档已生成');
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='completed';run.approvals=[];
  run.artifacts=[{id:'nested',turnKey:'u',name:'nested.md',path:'/fixture/nested.md',size:100}];
  (window as any).desktop.accessArtifact=async()=>({name:'nested.md',text:'# 嵌套预览\n\n'+('文档正文。\n\n'.repeat(12))+'```mermaid\nflowchart LR\n A[输入] --> B[输出]\n```\n\n'+('后续内容。\n\n'.repeat(20))});
  (window as any).__emit();
 });
 const eye=page.getByRole('button',{name:'预览 nested.md',exact:true});await eye.click();
 const parent=page.locator('dialog').filter({has:page.getByRole('heading',{name:'nested.md',exact:true})});
 await parent.getByRole('button',{name:'最大化',exact:true}).click();
 for(const zoom of [150,200]){
  for(let i=0;i<5;i++)await parent.getByRole('button',{name:'放大',exact:true}).click();
  await expect(parent.locator('output')).toHaveText(zoom+'%');
  const trigger=parent.getByRole('button',{name:'最大化 Mermaid 图表'});await trigger.scrollIntoViewIfNeeded();
  const scroll=await parent.locator('.artifact-preview-body').evaluate(el=>el.scrollTop);
  await trigger.click();const child=page.getByRole('dialog',{name:'Mermaid 图表',exact:true});
  await expect(child.getByAltText('Mermaid 图表')).toBeVisible();await expect(child.locator('output')).toHaveText('100%');
  expect(await child.evaluate(el=>el.parentElement===document.body)).toBe(true);
  for(const viewport of [{width:1240,height:840},{width:800,height:600}]){
   await page.setViewportSize(viewport);
   const bounds=await child.boundingBox();expect(Math.round(bounds!.width)).toBe(viewport.width);expect(Math.round(bounds!.height)).toBe(viewport.height);
   for(const name of ['放大','还原尺寸','关闭']){const button=await child.getByRole('button',{name,exact:true}).boundingBox();expect(button!.x).toBeGreaterThanOrEqual(0);expect(button!.x+button!.width).toBeLessThanOrEqual(viewport.width);expect(button!.y+button!.height).toBeLessThanOrEqual(viewport.height);}
  }
  await child.getByRole('button',{name:'放大',exact:true}).click();await child.getByRole('button',{name:'还原尺寸',exact:true}).click();await expect(child.locator('output')).toHaveText('100%');
  await page.setViewportSize({width:1240,height:840});
  if(zoom===150)await page.keyboard.press('Escape');else await child.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(child).toHaveCount(0);await expect(parent).toBeVisible();await expect(parent.locator('output')).toHaveText(zoom+'%');await expect(trigger).toBeFocused();
  expect(Math.abs(await parent.locator('.artifact-preview-body').evaluate(el=>el.scrollTop)-scroll)).toBeLessThan(3);
 }
 await page.keyboard.press('Escape');await expect(parent).toHaveCount(0);await expect(eye).toBeFocused();
});

test('turn file changes open a readonly panel with text diff and Office status',async({page})=>{
 await prepare(page,'文件已更新');
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='completed';w.__demoRun.approvals=[];w.__demoRun.fileChanges=[{turnKey:'u',files:[{id:'md',path:'README.md',status:'modified',additions:1,deletions:1,hunks:[{oldStart:1,oldLines:1,newStart:1,newLines:1,lines:['-old heading','+new heading']}]},{id:'xlsx',path:'report.xlsx',status:'added',reason:'此文件类型仅展示变更状态'},{id:'pptx',path:'slides.pptx',status:'modified',reason:'此文件类型仅展示变更状态'}]}];w.__emit();});
 await page.getByRole('button',{name:'查看本轮变更 (3)'}).click();
 const panel=page.getByRole('complementary',{name:'本轮文件变更'});
 await expect(panel).toBeVisible();
 await panel.locator('summary').filter({hasText:'README.md'}).click();
 await expect(panel.locator('.addition')).toContainText('+new heading');await expect(panel.locator('.deletion')).toContainText('-old heading');
 await panel.locator('summary').filter({hasText:'report.xlsx'}).click();
 await expect(panel).toContainText('此文件类型仅展示变更状态');
 await expect(panel.locator('summary').filter({hasText:'slides.pptx'})).toContainText('已修改');
 await panel.getByRole('button',{name:'展开面板'}).click();await expect(panel).toHaveClass(/expanded/);
 await page.setViewportSize({width:800,height:600});
 const close=panel.getByRole('button',{name:'关闭变更面板'});const rect=await close.boundingBox();expect(rect!.x+rect!.width).toBeLessThanOrEqual(800);
 await close.click();await expect(panel).toHaveCount(0);await expect(page.getByRole('textbox',{name:'继续对话'})).toBeVisible();
});

test('finished turns expose copy, optional skills and their own model',async({page})=>{
 await prepare(page,'第一轮回答');
 await expect(page.locator('.turn-actions')).toHaveCount(0);
 await page.evaluate(()=>{
  const w=window as any;const run=w.__demoRun;
  run.messages[0].model='first-model';
  run.messages[0].skills=[{id:'writing',name:'写作',description:'写作技能',version:1,body:'整理内容',hash:'fixture',path:'/fixture'}];
  run.messages.push({id:'u2',role:'user',text:'继续',model:'second-model'},{id:'a2',role:'assistant',text:'第二轮回答'});
  run.model='second-model';run.status='completed';run.approvals=[];w.__emit();
 });
 const actions=page.locator('.turn-actions');await expect(actions).toHaveCount(2);
 await expect(actions.first()).toContainText('first-model');await expect(actions.last()).toContainText('second-model');
 await expect(actions.last().getByRole('button',{name:'skills'})).toHaveCount(0);
 await actions.first().getByRole('button',{name:'拷贝',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__copiedText)).toBe('第一轮回答');
 await actions.first().getByRole('button',{name:'skills 1'}).click();
 await expect(page.getByRole('dialog')).toContainText('写作');
 await page.keyboard.press('Escape');
 await actions.last().getByRole('button',{name:'second-model'}).click();
 await expect(page.getByRole('dialog')).toContainText('second-model');
 await page.keyboard.press('Escape');
 await page.screenshot({path:'test-results/turn-actions.png'});
});
