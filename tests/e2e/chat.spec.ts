import { test, expect } from '@playwright/test';
import {createRequire} from 'node:module';

test('silent model preserves compositor sweep, readable status and editable draft',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const w=window as any,r=w.__demoRun;r.status='running';r.approvals=[];r.questions=[];r.tools=[];r.lastEventAt=new Date(Date.now()-30000).toISOString();r.messages=[{id:'u',role:'user',text:'Wait for the model',timing:{startedAt:r.lastEventAt}}];w.__emit();});
 await expect(page.locator('.run-activity')).toHaveCount(0);
 const pending=page.getByRole('region',{name:'任务执行过程'});await expect(pending).toContainText('等待模型响应');
 const labels=page.locator('.process-entry [data-slot="marker-content"]');
 await expect(labels).toHaveCount(1);
 await expect(labels.locator('[data-shimmer-layer]')).toHaveCount(3);
 expect(await labels.evaluateAll(elements=>elements.flatMap(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').map(a=>(a as CSSAnimation).animationName)))).toEqual(Array(3).fill('composite-text-sweep'));
 expect(await labels.evaluateAll(elements=>elements.map(el=>el.textContent))).toEqual(['等待模型响应']);
 expect(await labels.evaluateAll(elements=>elements.map(el=>getComputedStyle(el).animationName))).toEqual(['none']);
 await expect(pending.locator('[data-slot=spinner]')).toBeVisible();
 const composer=page.getByRole('textbox',{name:'继续对话',exact:true});await composer.fill('Unsent while the model is silent');await expect(composer).toHaveValue('Unsent while the model is silent');
});
const xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="开始" vertex="1" parent="1" style="rounded=1;"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell><mxCell id="b" value="完成" vertex="1" parent="1"><mxGeometry x="240" y="20" width="120" height="60" as="geometry"/></mxCell><mxCell id="e" edge="1" source="a" target="b" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>';
const rich = '# 渲染验收\n\n**重点内容** 和 `inline`。\n\n| 项目 | 结果 |\n|---|---|\n| 测试 | 成功 |\n\n- [x] 已完成\n\n公式：$E=mc^2$\n\n```typescript\nconst hello = "world";\n```\n\n```mermaid\nflowchart LR\n A[输入] --> B[输出]\n```\n\n```echarts\n{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{},"series":[{"type":"bar","data":[3,7]}]}\n```\n\n```drawio\n'+xml+'\n```\n\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><rect width="200" height="60" fill="#e3ecfa"/><text x="20" y="35">Vector preview</text></svg>\n```';
async function prepare(page: import('@playwright/test').Page, text = rich, language: 'zh-CN'|'en' = 'zh-CN') {
  await page.addInitScript(({ text, language }) => {
    sessionStorage.setItem('atelier.active-view.v1',JSON.stringify({page:'home',activeGroup:'chats'}));
    const run: any = { id:'demo', title:'任务体验验收', model:'fixture', baseUrl:'http://127.0.0.1/v1', cwd:'/fixture', createdAt:new Date().toISOString(), status:'waiting', error:'', tools:[], approvals:[{id:'approve',method:'item/commandExecution/requestApproval',detail:JSON.stringify({command:'echo approved',cwd:'/fixture',reason:'确认本次操作'})}], messages:[{id:'u',role:'user',text:'请展示结果'},{id:'r',role:'assistant',kind:'reasoning',status:'completed',text:'先检查输入，再整理结果。'},{id:'a',role:'assistant',phase:'final_answer',text}] };
    (window as any).__formReads=0;(window as any).__formSubscriptions=0;
    let callback: any;
    (window as any).__demoRun = run;
    (window as any).__emit = () => callback(structuredClone(run));
    (window as any).__emitEvent = (event:any) => callback(event);
    (window as any).desktop = {
      getProvider:async()=>({configured:true,baseUrl:run.baseUrl,model:'fixture',executable:'',hasKey:false}),
      getDevice:async()=>({name:'Test Mac',memoryGB:64,mode:'desktop'}),readWorkspace:async()=>({language,layoutMode:'classic',tasks:[],projects:[],theme:'light'}),
      listRuns:async()=>[structuredClone(run)],onRun:(fn:any)=>{callback=fn;return()=>{}},onCommand:()=>()=>{},
      approveRun:async(input:any)=>{(window as any).__decision=input;run.approvals=[];run.status='completed';callback(structuredClone(run));},
      forms:{list:async()=>{(window as any).__formReads++;return[];},onChanged:(fn:any)=>{(window as any).__formsChanged=fn;(window as any).__formSubscriptions++;return()=>{(window as any).__formSubscriptions--;};}},
      copyText:async(text:string)=>{(window as any).__copiedText=text;},
      saveWorkspace:async()=>{},stopRun:async()=>{},
    };
  }, {text,language});
  await page.goto('/');
  await page.locator('.tree-task > button:first-child').filter({hasText:'任务体验验收'}).click();
  // Lazy route effects must subscribe before the fixture emits a form update.
  await page.waitForFunction(()=>typeof (window as any).__formsChanged==='function');
}
test('background SSH execution does not mount unseen transcripts and visited drafts survive switching',async({page})=>{
 await prepare(page,'Initial answer');
 const composer=page.getByRole('textbox',{name:'继续对话',exact:true});await composer.fill('keep selected draft');
 await page.evaluate(()=>{const w=window as any;w.__emitEvent({...structuredClone(w.__demoRun),id:'background-ssh',title:'Background SSH wait',status:'running',approvals:[],questions:[],messages:[{id:'ssh-user',role:'user',text:'Wait for SSH'}]});});
 await expect(page.locator('.tree-task > button:first-child').filter({hasText:'Background SSH wait'})).toBeVisible();
 await expect(page.locator('.conversation-page')).toHaveCount(1);
 await page.locator('.tree-task > button:first-child').filter({hasText:'Background SSH wait'}).click();
 await expect(composer).toHaveValue('');await composer.fill('SSH draft');
 await page.locator('.tree-task > button:first-child').filter({hasText:'任务体验验收'}).click();
 await expect(composer).toHaveValue('keep selected draft');
 await expect(page.locator('.conversation-page')).toHaveCount(2);
});

test('medium history keeps measured Markdown and remains navigable',async({page})=>{
 await prepare(page,'Initial answer');
 await page.evaluate(()=>{const w=window as any,r=w.__demoRun;r.status='completed';r.approvals=[];r.messages=Array.from({length:12},(_,i)=>[{id:'medium-u'+i,role:'user',text:'Question '+i},{id:'medium-a'+i,role:'assistant',phase:'final_answer',text:('**Answer '+i+'**\n\n'+('Long historical paragraph 中文. '.repeat(20))+'\n\n').repeat(12)}]).flat();w.__emit();});
 await expect(page.locator('[data-turn-id="medium-u11"] .markdown strong').first()).toHaveText('Answer 11');
 await expect(page.locator('[data-turn-id="medium-u0"] .markdown strong').first()).toHaveText('Answer 0');
 await page.getByRole('navigation',{name:'对话轮次导航'}).getByRole('button',{name:/^第 1 轮：/}).click();
 await expect(page.locator('[data-turn-id="medium-u0"] .markdown strong').first()).toHaveText('Answer 0');
 await expect(page.getByRole('textbox',{name:'继续对话',exact:true})).toBeVisible();
});

test('upward scrolling stays stable through a medium-length rich transcript',async({page})=>{
 await prepare(page,'Initial answer');
 await page.evaluate(()=>{
  const w=window as any,r=w.__demoRun;r.status='completed';r.approvals=[];r.tools=[];
  r.messages=Array.from({length:12},(_,i)=>[
   {id:'wheel-u'+i,role:'user',text:'Question '+i},
   {id:'wheel-a'+i,role:'assistant',phase:'final_answer',text:Array.from({length:32},(_,j)=>`Paragraph ${i}.${j} with historical content.\n\n`).join('')},
  ]).flat();w.__emit();
 });
 const viewport=page.locator('.conversation-scroll:visible');
 await expect(page.locator('[data-turn-id="wheel-u11"] .markdown')).toBeVisible();
 await expect(page.locator('[data-turn-id="wheel-u0"] .markdown p')).toHaveCount(32);
 const result=await viewport.evaluate(async el=>{
  const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  let maximum=0;
  for(let step=0;step<48;step++){
   el.scrollTop-=85;
   const top=el.getBoundingClientRect().top;
   const anchor=[...el.querySelectorAll<HTMLElement>('[data-turn-id]')].find(node=>node.getBoundingClientRect().bottom>top&& !node.querySelector('[data-virtualized=placeholder]'));
   const offset=anchor?.getBoundingClientRect().top;
   await frame();await frame();await frame();
   if(anchor?.isConnected&&offset!==undefined)maximum=Math.max(maximum,Math.abs(anchor.getBoundingClientRect().top-offset));
  }
  return maximum;
 });
 expect(result).toBeLessThan(4);
});

test('long history preserves the visible turn across window changes and deferred rendering',async({page})=>{
 await prepare(page,'Initial answer');
 await page.evaluate(()=>{
  const w=window as any,r=w.__demoRun;r.status='completed';r.approvals=[];r.tools=[];
  r.messages=Array.from({length:60},(_,i)=>[
   {id:'edge-u'+i,role:'user',text:'Question '+i},
   {id:'edge-a'+i,role:'assistant',phase:'final_answer',text:Array.from({length:[8,40,17,30,6][i%5]},(_,j)=>`**历史记录 ${i}.${j}** ${'逐项检查并汇总 Markdown 内容。'.repeat(8)}\n\n`).join('')},
  ]).flat();w.__emit();
 });
 const viewport=page.locator('.conversation-scroll:visible');
 await expect(viewport.locator('[data-turn-id="edge-u59"] .markdown')).toBeVisible();
 const result=await viewport.evaluate(async el=>{
  const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  const rows=()=>[...el.querySelectorAll<HTMLElement>('[data-turn-id]')];
  const ready=()=>new Set(rows().filter(row=>!row.querySelector('[data-virtualized=placeholder]')));
  let maximum=0,boundaries=0,expansions=0;
  const seen=new Set<string>();
  for(let step=0;step<110&&el.scrollTop>0;step++){
   const before=rows(),rendered=ready();el.scrollTop-=85;
   const bounds=el.getBoundingClientRect();
   const anchor=before.find(row=>{const r=row.getBoundingClientRect();return rendered.has(row)&&r.bottom>bounds.top&&r.top<bounds.bottom;});
   const offset=anchor?.getBoundingClientRect().top;
   if(anchor?.dataset.turnId)seen.add(anchor.dataset.turnId);
   for(let i=0;i<3;i++){
    await frame();
    if(anchor?.isConnected&&offset!==undefined)maximum=Math.max(maximum,Math.abs(anchor.getBoundingClientRect().top-offset));
   }
   const after=rows();
   if(before[0]!==after[0]||before.at(-1)!==after.at(-1))boundaries++;
   if([...ready()].some(row=>before.includes(row)&&!rendered.has(row)))expansions++;
  }
  return {maximum,boundaries,expansions,visibleTurns:seen.size};
 });
 expect(result.boundaries).toBeGreaterThan(0);
 expect(result.expansions).toBeGreaterThan(0);
 expect(result.visibleTurns).toBeGreaterThan(2);
 expect(result.maximum).toBeLessThan(4);
});

test('delayed Markdown loading keeps escaped content and composer focus',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/src/MarkdownContent.tsx*',async route=>{await gate;await route.continue();});
 try{await prepare(page,'**Formatted result**\n\n<img src=x onerror="window.__unsafe=true">');
 const composer=page.getByRole('textbox',{name:'继续对话',exact:true});await composer.fill('Draft while parser loads');
 await expect(page.locator('.markdown').last()).toContainText('<img');
 expect(await page.evaluate(()=>(window as any).__unsafe)).toBeUndefined();
 release();await expect(page.locator('.markdown strong')).toHaveText('Formatted result');
 await expect(composer).toHaveValue('Draft while parser loads');await expect(composer).toBeFocused();
 }finally{release();}
});

test('streaming preserves existing markdown table and link DOM instead of flashing and resetting scroll',async({page})=>{
 await prepare(page,'| 名称 | 说明 |\n|---|---|\n| 数据 | '+('很长的内容'.repeat(80))+' |\n\n[参考资料](https://example.com)\n\n继续输出');
 await expect(page.locator('[data-slot=table-container]')).toBeVisible();
 await page.evaluate(()=>{const table=document.querySelector('[data-slot=table-container]')!;const link=document.querySelector<HTMLAnchorElement>('.markdown a')!;(window as any).__markdownNodes={table,link};table.scrollLeft=120;link.focus();});
 await page.evaluate(()=>{const w=window as any;w.__demoRun.messages.at(-1).text+='，新增一段文字';w.__emit();});
 await expect(page.locator('.markdown')).toContainText('新增一段文字');
 expect(await page.evaluate(()=>{const {table,link}=(window as any).__markdownNodes;return {tableRetained:table===document.querySelector('[data-slot=table-container]'),linkRetained:link===document.querySelector('.markdown a'),focused:document.activeElement===link};})).toEqual({tableRetained:true,linkRetained:true,focused:true});
});
test('rolling history snapshots preserve the reader and mounted turns after the thirtieth turn',async({page})=>{
 await prepare(page,'完成');
 await page.evaluate(()=>{
  const w=window as any,r=w.__demoRun;r.status='completed';r.approvals=[];r.tools=[];
  r.messages=Array.from({length:30},(_,i)=>[{id:`u${i}`,role:'user',text:`问题 ${i}`},{id:`a${i}`,role:'assistant',phase:'final_answer',text:('历史回答 '+i+'\n\n').repeat(12)}]).flat();
  r.turnOffset=0;r.historyBefore=null;r.totalTurns=30;w.__emit();
 });
 await page.getByRole('navigation',{name:'对话轮次导航'}).getByRole('button',{name:/^第 21 轮：/}).click();
 const anchor=page.locator('[data-turn-id="u20"]'),viewport=page.getByRole('region',{name:'任务消息'});
 // Navigation is scheduled by the scroller. Establish the reader position
 // before measuring whether the next snapshot preserves it.
 await expect.poll(()=>anchor.evaluate(el=>Math.abs(el.getBoundingClientRect().top-el.closest('.conversation-scroll')!.getBoundingClientRect().top-14))).toBeLessThan(2);
 const top=await anchor.evaluate(el=>el.getBoundingClientRect().top);
 await page.evaluate(()=>{
  const w=window as any,r=w.__demoRun;w.__readerNode=document.querySelector('[data-turn-id="u20"]');w.__readerViewport=document.querySelector('.conversation-scroll');
  // The host publishes only its last 30 turns; the frontend must not discard
  // the already displayed prefix or mistake this sliding window for new anchors.
  r.messages=[...r.messages.slice(2),{id:'u30',role:'user',text:'后台新增一轮'},{id:'a30',role:'assistant',phase:'final_answer',text:'继续输出'}];
  r.turnOffset=1;r.historyBefore='u1';r.totalTurns=31;r.status='running';w.__emit();
 });
 await expect(page.getByRole('navigation',{name:'对话轮次导航'}).getByRole('button')).toHaveCount(31);
 await expect.poll(()=>page.locator('[data-turn-id]').count()).toBeLessThan(24);
 await expect.poll(async()=>Math.abs((await anchor.boundingBox())!.y-top)).toBeLessThan(2);
 expect(await viewport.evaluate(el=>el===(window as any).__readerViewport)).toBeTruthy();
 expect(await anchor.evaluate(el=>el===(window as any).__readerNode)).toBeTruthy();
 await page.evaluate(()=>{const w=window as any;w.__demoRun.messages.at(-1).text+='，第二次推送';w.__emit();});
 await expect(page.getByRole('navigation',{name:'对话轮次导航'}).getByRole('button')).toHaveCount(31);
 await expect.poll(()=>page.locator('[data-turn-id]').count()).toBeLessThan(24);
 await expect.poll(async()=>Math.abs((await anchor.boundingBox())!.y-top)).toBeLessThan(2);
 await page.getByRole('button',{name:'回到最新消息'}).click();
 await page.evaluate(()=>{const w=window as any;w.__demoRun.messages.at(-1).text+=('\n\n继续流式输出').repeat(40);w.__emit();});
 await expect.poll(()=>viewport.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(2);
});
test('final answers render while unfinished execution stays visible', async ({page})=>{
  await prepare(page);
  await expect(page.getByRole('region',{name:'任务执行过程'})).toBeVisible();
  await expect(page.locator('.markdown h1')).toHaveText('渲染验收');
  await expect(page.locator('.markdown table td')).toHaveCount(2);
  await expect(page.locator('.katex')).toHaveCount(1);
  await expect(page.locator('.hljs-keyword')).toHaveCount(1);
  await page.locator('.artifact').nth(0).scrollIntoViewIfNeeded();
  await expect(page.getByAltText('Mermaid 图表')).toHaveCount(1);
  await page.locator('.artifact').nth(1).scrollIntoViewIfNeeded();
  await expect(page.locator('.chart-canvas svg')).toHaveCount(1);
  await page.locator('.artifact').nth(2).scrollIntoViewIfNeeded();
  await expect(page.getByRole('img',{name:'draw.io 基础图形'})).toHaveCount(1);
  await page.locator('.artifact').nth(3).scrollIntoViewIfNeeded();
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
  const chart = page.getByRole('region', { name: 'echarts 图表' });
  const diagram = page.getByRole('region', { name: 'mermaid 图表' });
  await expect(chart.getByRole('alert')).toBeVisible();
  await diagram.scrollIntoViewIfNeeded();
  await expect(diagram.getByRole('alert')).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(()=>(window as any).pwned)).toBeUndefined();
  await page.setViewportSize({width:800,height:600});
  const box=await page.getByRole('textbox',{name:'继续对话'}).boundingBox();
  expect(box!.y+box!.height).toBeLessThan(600);
});

test('user bubble contains only text and each finished turn has its own duration',async({page})=>{
 await prepare(page,'第一轮回答');
 await expect(page.locator('[data-message-role=user] .message-label')).toHaveCount(0);
 await expect(page.locator('[data-message-role=user]')).toHaveText('请展示结果');
 await expect(page.locator('.trace-duration')).toHaveCount(0);
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;
  run.messages[0].timing={startedAt:'2026-09-10T00:00:00Z',durationMs:65000,outcome:'completed'};
  run.messages.push({id:'u2',role:'user',text:'第二个问题',timing:{startedAt:'2026-09-10T00:02:00Z',durationMs:5000,outcome:'completed'}},{id:'a2',role:'assistant',text:'第二轮回答'});
  run.status='completed';run.approvals=[];(window as any).__emit();
 });
 await expect(page.locator('.trace-duration')).toHaveText(['用时 1 分 5 秒','用时 0 分 5 秒']);
 const items=await page.locator('.conversation-turn .trace-duration, .conversation-turn [data-slot=message], .conversation-turn [data-message-role=user]').allTextContents();
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

test('Mermaid instruction example renders quoted placeholders and literal quotes with the host renderer',async({page})=>{
 const {developerInstructions}=createRequire(process.cwd()+'/package.json')('./electron/agent-instructions.cjs');
 const examples=[...developerInstructions.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(match=>match[1].trim());
 expect(examples).toHaveLength(1);
 const invalid='flowchart LR\n A[文档写入] --> C[正文按 sha256 落盘<br/>documents/{space}/{doc}/{hash}.md]';
 await prepare(page,'```mermaid\n'+invalid+'\n```\n\n```mermaid\n'+examples[0]+'\n```');
 await expect(page.getByRole('alert')).toHaveCount(1);
 await expect(page.getByRole('alert')).toContainText('Parse error');
 const image=page.getByAltText('Mermaid 图表');await expect(image).toHaveCount(1);
 const labels=await image.evaluate(el=>{
  const doc=new DOMParser().parseFromString(decodeURIComponent((el as HTMLImageElement).src.split(',').slice(1).join(',')),'image/svg+xml');
  return [...doc.querySelectorAll('text')].map(n=>n.textContent).join(' ');
 });
 expect(labels).toContain('documents/{space}/{doc}/{hash}.md');
 expect(labels).toContain('workforce.spaces.v1');expect(labels).toContain('“引用”');expect(labels).toContain('完成');
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
 await panel.locator('.commandExecution [data-slot=trace-collapsible-trigger]').click();
 await expect(panel).toContainText('Downloading python-docx');
 await expect(panel.locator('.thinking-window')).toHaveCount(0);
 await panel.locator('.reasoning [data-slot=trace-collapsible-trigger]').click();
 await expect(panel.locator('.thinking-window pre')).toHaveText('检查可用环境');
 await expect(panel.locator('.process-milestone')).toHaveText(['有个 Python 3.11 可用。','安装进行中，等待完成。']);
 await page.evaluate(()=>{(window as any).__demoRun.tools[0].status='completed';(window as any).__emit();});
 await expect(panel.locator('.commandExecution [data-slot=trace-collapsible-trigger]')).toBeVisible();
 await expect(panel.locator('.process-entry-title')).toHaveText(['思考摘要']);
 await expect(panel.getByRole('button',{name:/查看已完成操作/})).toHaveCount(0);
 await expect(page.locator('[data-slot=message][data-align=start]')).toHaveCount(0);
 await page.screenshot({path:'test-results/turn-process.png'});
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.messages.push({id:'f',role:'assistant',phase:'final_answer',text:'## 文档已完成'});(window as any).__emit();});
 await expect(panel).toBeVisible();await expect(page.locator('.markdown h2')).toHaveText('文档已完成');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.plans=[{turnKey:'u',explanation:'整理结果',steps:[{step:'调研资料',status:'completed'},{step:'撰写文档',status:'inProgress'}]}];(window as any).__emit();});
 await expect(page.getByLabel('任务清单')).toContainText('撰写文档');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='completed';run.artifacts=[{id:'file',turnKey:'u',kind:'delivery',name:'report.md',path:'/fixture/report.md',size:1024}];(window as any).desktop.accessArtifact=async()=>({name:'report.md',text:'# 可预览的结果'});(window as any).__emit();});
 await expect(panel).toBeHidden();await expect(page.getByLabel('交付文件')).toContainText('report.md');
 await page.locator('.turn-progress-toggle').click();await expect(panel).toBeVisible();await page.getByLabel('任务清单').locator('[data-slot=trace-collapsible-trigger]').click();await expect(page.getByLabel('任务清单')).toContainText('未确认完成');await expect(panel.locator('.thinking-window')).toHaveCount(0);await expect(panel).not.toContainText('检查可用环境');
 const traceBody=panel.locator('.process-milestone .trace-markdown').first();
 expect(await traceBody.evaluate(el=>getComputedStyle(el).fontSize)).toBe(await panel.locator('[data-slot=trace-line]').first().evaluate(el=>getComputedStyle(el).fontSize));
 const traceDetail=page.locator('[data-slot=trace-collapsible-content-inner]').first();
 expect(await traceDetail.evaluate(el=>getComputedStyle(el).borderLeftColor)).not.toBe(await traceDetail.evaluate(el=>getComputedStyle(el).color));

 await expect(panel.locator('.commandExecution [data-slot=trace-collapsible-trigger]')).toBeVisible();await expect(panel).toContainText('有个 Python 3.11 可用。');await expect(panel).toContainText('安装进行中，等待完成。');
 await page.locator('.turn-progress-toggle').click();await expect(panel).toBeHidden();await expect(page.locator('.markdown h2')).toHaveText('文档已完成');await expect(page.getByLabel('交付文件')).toBeVisible();await page.locator('.turn-progress-toggle').click();
 await page.getByRole('button',{name:'预览 report.md',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('可预览的结果');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.screenshot({path:'test-results/progress-completed.png'});
 expect(await page.evaluate(()=>(window as any).__demoRun.messages.length)).toBe(5);
});

test('unclassified providers resolve on completion; failed turns retain their process',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];delete run.messages[2].phase;run.messages[2].text='正在安装';(window as any).__emit();});
 await expect(page.locator('.process-panel')).toContainText('正在安装');
 await page.locator('.turn-progress-toggle').click();
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='failed';run.error='安装失败';(window as any).__emit();});
 await expect(page.locator('.process-panel')).toBeVisible();await expect(page.getByRole('alert')).toContainText('安装失败');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='completed';run.error='';run.messages.push({id:'last',role:'assistant',text:'安装完成，文档已生成。'});(window as any).__emit();});
 await expect(page.locator('.process-panel')).toBeHidden();await expect(page.locator('[data-slot=message][data-align=start]')).toContainText('安装完成，文档已生成。');
});

test('folded process leaves the composer clear and restores tool details on expansion',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const w=(window as any),run=w.__demoRun;run.status='running';run.approvals=[];run.tools=[{id:'t',turnKey:'u',type:'commandExecution',label:'python report.py',status:'inProgress',detail:''}];w.__emit();});
 const summary=page.locator('.turn-progress-toggle');
 await summary.click();
 await expect(page.locator('.process-panel')).toBeHidden();
 await expect(page.locator('.run-activity')).toHaveCount(0);
 await summary.click();
 await expect(page.locator('.activity-tool-summary')).toContainText('report.py');
});

test('thinking scrolls independently, disappears after interruption, and tools stop shimmering',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];run.messages=[{id:'u',role:'user',text:'研究任务'},{id:'a',role:'assistant',phase:'commentary',text:'**核实关键前提**',order:1},{id:'r',role:'assistant',kind:'reasoning',text:Array.from({length:60},(_,i)=>'分析步骤 '+i).join('\n'),order:2}];run.tools=[{id:'t',turnKey:'u',order:3,type:'commandExecution',label:'pwd',status:'inProgress',detail:''}];(window as any).__emit();});
 await page.locator('.reasoning [data-slot=trace-collapsible-trigger]').click();
 const window=page.locator('.thinking-window');
 await expect(page.locator('.process-milestone strong')).toHaveText('核实关键前提');
 expect((await window.boundingBox())!.height).toBeLessThanOrEqual(180);
 await expect.poll(()=>window.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)).toBeLessThan(2);
 await window.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
 await page.evaluate(()=>{(window as any).__demoRun.messages[2].text+='\n更多分析';(window as any).__emit();});
 await expect.poll(()=>window.evaluate(el=>el.scrollTop)).toBe(0);
 const tool=page.locator('.process-entry.commandExecution [data-slot=trace-collapsible-trigger]');
 expect(await tool.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
 await expect(tool.locator('[data-slot=spinner]')).toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await tool.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
 await page.screenshot({path:'test-results/process-abc.png'});
 await page.evaluate(()=>{(window as any).__demoRun.status='interrupted';(window as any).__emit();});
 await expect(page.locator('.process-panel')).toBeHidden();await page.locator('.turn-progress-toggle').click();
 await expect(window).toHaveCount(0);await expect(page.locator('.process-milestone')).toBeVisible();await expect(tool).toBeVisible();
 expect(await tool.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
 await page.locator('.turn-progress-toggle').click();await page.locator('.turn-progress-toggle').click();await expect(window).toHaveCount(0);
});

test('clarification collects explicit answers and retry state offers recovery without replaying work',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='waiting';run.approvals=[];run.questions=[{id:'q',blocking:true,questions:[{id:'audience',header:'受众',question:'面向谁？',options:[{label:'设计师',description:'设计工作'},{label:'开发者',description:'工程工作'}]}]}];(window as any).desktop.answerRun=async(value:any)=>{(window as any).__answer=value;run.questions=[];run.status='running';(window as any).__emit();};(window as any).__emit();});
 await expect(page.getByRole('form',{name:'任务澄清'})).toBeVisible();
 await expect(page.getByRole('button',{name:'提交回答'})).toBeDisabled();await page.screenshot({path:'test-results/task-question.png'});
 await page.getByRole('radio',{name:'设计师 设计工作'}).check();await page.getByRole('button',{name:'提交回答'}).click();
 await expect(page.getByRole('form',{name:'任务澄清'})).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__answer.answers)).toEqual({audience:'设计师'});
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.retrying=true;run.error='连接中断';(window as any).__emit();});
 await expect(page.getByRole('alert')).toContainText('正在重试');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.retrying=false;run.status='failed';(window as any).__emit();});
 await page.getByRole('button',{name:'准备继续任务'}).click();
 await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('请核实当前任务已完成的操作，并从未完成的步骤继续。');
 await expect(page.getByRole('button',{name:'发送后续消息'})).toBeEnabled();
});


test('older turns load by cursor and long history mounts only the visible window',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='completed';run.approvals=[];
  const messages=(start:number,end:number)=>Array.from({length:end-start},(_,j)=>{const i=j+start;return [{id:'u'+i,role:'user',text:'问题 '+i},{id:'a'+i,role:'assistant',phase:'final_answer',text:('回答 '+i+'\n\n').repeat(15)}];}).flat();
  run.messages=messages(30,60);run.tools=[];run.historyBefore='u30';run.turnOffset=30;
  (window as any).desktop.getRunPage=async(input:any)=>{(window as any).__historyInput=input;return {...run,messages:messages(0,30),historyBefore:null,turnOffset:0};};
  (window as any).__emit();
 });
 await expect(page.getByRole('navigation',{name:'对话轮次导航'}).getByRole('button').first()).toHaveAttribute('aria-label',/第 31 轮/);
 await page.getByRole('navigation',{name:'对话轮次导航'}).getByRole('button').first().click();
 const anchorTop=()=>page.locator('[data-turn-id="u30"]').evaluate(el=>el.getBoundingClientRect().top-el.closest('.conversation-scroll')!.getBoundingClientRect().top);
 await expect.poll(async()=>Math.abs(await anchorTop()-14)).toBeLessThan(1);
 await page.getByRole('button',{name:'加载更早的对话'}).click();
 await expect.poll(async()=>Math.abs(await anchorTop()-14)).toBeLessThan(1);
 expect(await page.evaluate(()=>(window as any).__historyInput.before)).toBe('u30');
 await expect.poll(()=>page.locator('.conversation-turn').count()).toBeLessThan(20);
 await expect(page.locator('[data-turn-id="u0"]')).toHaveCount(0);
 await page.getByRole('navigation',{name:'对话轮次导航'}).getByRole('button').first().click();
 await expect(page.locator('[data-turn-id="u0"] [data-slot=message][data-align=start]')).toBeVisible();
 await page.getByRole('button',{name:'回到最新消息'}).click();
 await expect(page.locator('[data-turn-id="u59"] [data-slot=message][data-align=start]')).toBeVisible();
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
 await page.locator('.tree-task > button:first-child').filter({hasText:'任务体验验收'}).click();
 await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('第一项草稿');
 await page.locator('.tree-task > button:first-child').filter({hasText:'另一项任务'}).click();
 await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('第二项草稿');
});

test('background task never occupies chat viewport and another chat can send',async({page})=>{
 await prepare(page,'第一项结果');
 await page.evaluate(()=>{
  const original=(window as any).__demoRun;
  original.status='running';original.approvals=[];(window as any).__emit();
  original.id='parallel';original.title='并行任务';original.status='completed';original.messages=[{id:'p-user',role:'user',text:'第二项任务'}];(window as any).__emit();
  (window as any).desktop.startRun=async(input:any)=>{
   (window as any).__parallelInput=input;
   original.status='running';(window as any).__emit();return structuredClone(original);
  };
 });
 const first=page.locator('.tree-task').filter({hasText:'任务体验验收'});
 await expect(first.getByRole('img',{name:'运行中'})).toBeVisible();
 await page.locator('.tree-task > button:first-child').filter({hasText:'并行任务'}).click();
 await expect(page.locator('.running-banner')).toHaveCount(0);
 const input=page.getByRole('textbox',{name:'继续对话'});
 const main=await page.locator('main.chat-main').boundingBox();
 const box=await input.boundingBox();
 expect(box!.width).toBeGreaterThan(main!.width*.6);
 await input.fill('开始第二项');
 await page.getByRole('button',{name:'发送后续消息'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__parallelInput?.runId)).toBe('parallel');
 await expect(page.locator('.tree-task').filter({hasText:'并行任务'}).getByRole('img',{name:'运行中'})).toBeVisible();
 await expect(first.getByRole('img',{name:'运行中'})).toBeVisible();
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
 await page.locator('.tree-task > button:first-child').filter({hasText:'任务体验验收'}).click();
 await page.waitForTimeout(150);
 expect(Math.abs(await viewport.evaluate(el=>el.scrollTop)-before)).toBeLessThan(3);
});

test('delivered preview maximizes, zooms content and restores focus',async({page})=>{
 await prepare(page,'文档已生成');
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='completed';run.approvals=[];
  run.artifacts=[{id:'code',turnKey:'u',kind:'delivery',name:'sample.ts',path:'/fixture/sample.ts',size:100}];
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
  run.artifacts=names.map(name=>({id:name,turnKey:'u',kind:'delivery',name,path:'/fixture/'+name,size:name==='large.txt'?1048577:100}));
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
  run.artifacts=[{id:'md',turnKey:'u',kind:'delivery',name:'theme.md',path:'/fixture/theme.md',size:100}];
  (window as any).desktop.accessArtifact=async()=>({name:'theme.md',text:'# 主题预览\n\n正文与 **重点** 和 `inline`。\n\n> 引用文字\n\n| 项目 | 结果 |\n|---|---|\n| 主题 | 正常 |\n\n```js\nconst value = "hello";\n```'});
  (window as any).__emit();
 });
 await page.getByRole('button',{name:'预览 theme.md',exact:true}).click();const dialog=page.getByRole('dialog');
 for(const theme of ['dark','light','system']){
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
  const dark=theme!=='light';
  await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(dark?'rgb(36, 36, 36)':'rgb(255, 255, 255)');
  await expect.poll(()=>dialog.locator('.markdown').evaluate(el=>getComputedStyle(el).color)).toBe(dark?'rgb(237, 237, 237)':'rgb(38, 44, 53)');
  await expect.poll(()=>dialog.locator('.hljs-keyword').evaluate(el=>getComputedStyle(el).color)).toBe(dark?'rgb(213, 165, 245)':'rgb(128, 64, 160)');
  await dialog.getByRole('button',{name:'最大化',exact:true}).click();
  await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(dark?'rgb(36, 36, 36)':'rgb(255, 255, 255)');
  if(theme==='dark')await page.screenshot({path:'test-results/markdown-preview-dark.png'});
  await dialog.getByRole('button',{name:'退出最大化',exact:true}).click();
 }
});

test('preview maximize motion reverses from its visible bounds and respects reduced motion',async({page})=>{
 await prepare(page,'预览');
 await page.evaluate(()=>{
  const run=(window as any).__demoRun;run.status='completed';run.approvals=[];
  run.artifacts=[{id:'md',turnKey:'u',kind:'delivery',name:'motion.md',path:'/fixture/motion.md',size:100}];
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
  run.artifacts=[{id:'nested',turnKey:'u',kind:'delivery',name:'nested.md',path:'/fixture/nested.md',size:100}];
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
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='completed';w.__demoRun.approvals=[];w.__demoRun.fileChanges=[{turnKey:'u',files:[{id:'md',path:'README.md',status:'modified',additions:1,deletions:1,hunks:[{oldStart:1,oldLines:1,newStart:1,newLines:1,lines:['-old heading','+new heading']}]},{id:'xlsx',path:'report.xlsx',status:'added',reason:'此文件类型仅展示变更状态'},{id:'pptx',path:'slides.pptx',status:'modified',reason:'此文件类型仅展示变更状态'}]}];w.__demoRun.tools.push({id:'writes',turnKey:'u',type:'fileChange',label:'文件变更',status:'completed',detail:JSON.stringify(['README.md','report.xlsx','slides.pptx'].map(path=>({path,kind:'update'})))});w.__emit();});
 await page.getByRole('button',{name:'查看本轮变更',exact:true}).click();
 const panel=page.getByRole('complementary',{name:'本轮文件变更'});
 await expect(panel).toBeVisible();
 await panel.getByRole('button').filter({hasText:'README.md'}).click();
 await expect(panel.locator('.addition')).toContainText('+new heading');await expect(panel.locator('.deletion')).toContainText('-old heading');
 await panel.getByRole('button').filter({hasText:'report.xlsx'}).click();
 await expect(panel).toContainText('此文件类型仅展示变更状态');
 await expect(panel.getByRole('button').filter({hasText:'slides.pptx'})).toContainText('已修改');
 await panel.getByRole('button',{name:'展开面板'}).click();await expect(panel).toHaveClass(/expanded/);
 await page.setViewportSize({width:800,height:600});
 const close=panel.getByRole('button',{name:'关闭变更面板'});const rect=await close.boundingBox();expect(rect!.x+rect!.width).toBeLessThanOrEqual(800);
 await close.click();await expect(panel).toBeHidden();await expect(page.getByRole('textbox',{name:'继续对话'})).toBeVisible();
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
 await actions.first().getByRole('button',{name:'技能 1'}).click();
 await expect(page.getByRole('dialog')).toContainText('写作');
 await page.keyboard.press('Escape');
 await actions.last().getByRole('button',{name:'second-model'}).click();
 await expect(page.getByRole('dialog')).toContainText('second-model');
 await page.keyboard.press('Escape');
 await page.screenshot({path:'test-results/turn-actions.png'});
});

test('archive confirmation stays usable while another task waits for approval',async({page})=>{
 await prepare(page,'等待审批');
 await page.evaluate(()=>{
  const w=window as any;
  const other={...structuredClone(w.__demoRun),id:'other',title:'待归档任务',status:'completed',approvals:[]};
  w.__archiveFails=true;
  w.desktop.editRun=async(input:any)=>{
   if(w.__archiveFails)throw new Error('保存失败，请重试');
   w.__archiveInput=input;other.archivedAt=new Date().toISOString();
   return [structuredClone(w.__demoRun),other].map(run=>({...run,messages:[],tools:[],approvals:[],summaryOnly:true}));
  };
  w.desktop.listRuns=async()=>[structuredClone(w.__demoRun),other];
  // Feed the second task through the same subscription used for runtime updates.
  const original=w.__demoRun;w.__demoRun=other;
  // The fixture emitter closes over its run; temporarily replace its fields instead.
  const saved=structuredClone(original);Object.assign(original,other);w.__emit();Object.assign(original,saved);w.__demoRun=original;
 });
 await page.getByRole('button',{name:'管理任务：待归档任务',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'管理任务'});
 await dialog.getByRole('button',{name:'归档任务',exact:true}).click();
 await dialog.getByRole('button',{name:'确认归档任务',exact:true}).click();
 await expect(dialog.getByRole('alert')).toHaveText('保存失败，请重试');
 await page.evaluate(()=>{(window as any).__archiveFails=false;});
 await dialog.getByRole('button',{name:'确认归档任务',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'管理任务：待归档任务',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'批准本次',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__archiveInput)).toEqual({id:'other',archived:true});
});

test('standalone Office delivery previews use a scoped artifact and keep controls outside zoom',async({page})=>{
 await prepare(page,'表格已生成');
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='completed';w.__demoRun.approvals=[];w.__demoRun.artifacts=[{id:'sheet',turnKey:'u',kind:'delivery',path:'/fixture/book.xlsx',name:'book.xlsx',size:2048,modifiedAt:'2026-09-24'}];w.desktop.projectFiles={context:async(input:any)=>{w.__officeContext=input;return {root:'/fixture',baseUrl:'atelier-preview://fixture/'};},read:async()=>({path:'book.xlsx',name:'book.xlsx',kind:'spreadsheet',size:2048,version:'v1',truncated:false}),office:async()=>({version:'v1',asset:'fixture',kind:'spreadsheet',truncated:false,sheets:[{name:'Overview',columns:2,rows:[['Name','Value'],['Alpha','42']],truncated:false}]})};w.__emit();});
 const previewStarted=Date.now();await page.getByRole('button',{name:'预览 book.xlsx',exact:true}).click();const dialog=page.getByRole('dialog',{name:'book.xlsx',exact:true});await expect(dialog.getByRole('table',{name:'Overview'})).toContainText('Alpha',{timeout:15000});await test.info().attach('office-preview-timing',{body:JSON.stringify({readyMs:Date.now()-previewStarted}),contentType:'application/json'});
 expect(await page.evaluate(()=>(window as any).__officeContext)).toEqual({runId:'demo',artifactId:'sheet'});
 await dialog.getByRole('button',{name:'最大化',exact:true}).click();await expect(dialog.getByRole('button',{name:'放大',exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'刷新文件',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(dialog).toHaveCount(0);
});

test('parallel streaming keeps sidebar order and selection stable after pointer leaves',async({page})=>{
 await page.addInitScript(()=>{
  const make=(id:string,startedAt:string)=>({id,title:'并行任务 '+id,model:'fixture',baseUrl:'http://127.0.0.1/v1',cwd:'/fixture/'+id,createdAt:startedAt,updatedAt:startedAt,status:'running',error:'',tools:[],approvals:[],messages:[{id:'u'+id,role:'user',text:'问题 '+id,timing:{startedAt}},{id:'a'+id,role:'assistant',phase:'commentary',text:'处理中'}]});
  const runs=[make('A','2026-09-24T00:00:00Z'),make('B','2026-09-24T00:01:00Z')];
  let emit:any;const w=window as any;
  w.__stream=(id:string,index:number)=>{const run=runs.find(r=>r.id===id)!;run.updatedAt=new Date(Date.UTC(2026,8,24,0,2,index)).toISOString();run.messages[1].text+='更新';emit(structuredClone(run));};
  sessionStorage.setItem('atelier.active-view.v1',JSON.stringify({page:'home',activeGroup:'chats'}));
  w.desktop={getProvider:async()=>({configured:true,model:'fixture',baseUrl:runs[0].baseUrl}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>({language:'zh-CN',layoutMode:'classic',tasks:[],projects:[],theme:'light'}),listRuns:async()=>structuredClone(runs),onRun:(fn:any)=>{emit=fn;return()=>{};},onCommand:()=>()=>{},saveWorkspace:async()=>{}};
 });
 await page.goto('/');
 const rows=page.locator('.tree-task > button:first-child');
 await expect(rows).toHaveCount(2);
 const initial=await rows.allTextContents();
 for(const selected of ['A','B']){
  await rows.filter({hasText:'并行任务 '+selected}).click();await page.mouse.move(1000,50);
  const row=page.locator('.tree-task.selected');const top=(await row.boundingBox())!.y;
  for(let index=0;index<6;index++){
   await page.evaluate(({id,index})=>(window as any).__stream(id,index),{id:index%2?'B':'A',index});
   await expect(rows).toHaveText(initial);
   await expect(row).toHaveCount(1);await expect(row).toContainText('并行任务 '+selected);
   await expect(row.locator('button').first()).toHaveAttribute('aria-current','page');
   expect((await row.boundingBox())!.y).toBe(top);
  }
 }
});

test('sidebar peer categories toggle without changing the current chat',async({page})=>{
 await prepare(page,'保持当前任务');
 await page.getByRole('button',{name:'隐藏侧栏',exact:true}).click();
 await expect(page.locator('#workspace-sidebar')).toHaveAttribute('aria-hidden','true');
 await expect.poll(async()=>{const box=await page.locator('#workspace-sidebar').boundingBox();return box!.x+box!.width;}).toBeLessThanOrEqual(0);
 await expect.poll(async()=>(await page.locator('.main-shell').boundingBox())!.width).toBeGreaterThan(1000);
 await expect(page.getByRole('textbox',{name:'继续对话'})).toBeVisible();
 await page.getByRole('button',{name:'显示侧栏',exact:true}).click();
 await expect(page.locator('#workspace-sidebar')).toBeVisible();
 await expect.poll(async()=>Math.round((await page.locator('#workspace-sidebar').boundingBox())!.width)).toBe(256);
 const navigation=page.getByRole('navigation',{name:'分组导航'});
 for(const name of ['项目','任务','协作工作平台','扩展'])await expect(navigation.getByRole('button',{name,exact:true})).toBeVisible();
 // Never-visited categories must not mount their trees and layout effects.
 await expect(page.locator('.workspace-navigation > [data-slot="sidebar-group"]')).toHaveCount(1);
 await page.screenshot({path:'test-results/task-sidebar.png'});
 for(const name of ['项目','任务','项目','任务']){
  const group=navigation.getByRole('button',{name,exact:true});
  await group.click();await expect(group).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.workspace-navigation > [data-slot="sidebar-group"]:visible')).toHaveCount(1);
  await expect(navigation.locator('[aria-pressed=true]')).toHaveCount(1);
  await expect(page.locator('[data-slot=message][data-align=start]')).toContainText('保持当前任务');
  await expect(page.getByRole('textbox',{name:'继续对话'})).toBeVisible();
 }
 await expect(page.locator('.tree-task.selected')).toContainText('任务体验验收');
});

test('latest commentary shimmers in place without a running label above the composer',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{
  document.documentElement.dataset.theme='dark';
  const w=window as any, run=w.__demoRun;
  run.status='running';run.approvals=[];run.messages=run.messages.slice(0,1);
  run.tools=Array.from({length:60},(_,i)=>({id:'read-'+i,turnKey:'u',type:'commandExecution',label:'read file',status:'completed',detail:'done',order:i+1}));
  run.messages.push({id:'progress',role:'assistant',phase:'commentary',text:'正在汇总审查结果。'.repeat(30),turnKey:'u',order:61});
  w.__emit();
 });
 const dockLabel=page.locator('.conversation-dock').getByText('执行中',{exact:true});
 await expect(dockLabel).toHaveCount(0);
 const progress=page.locator('.process-milestone').filter({hasText:'正在汇总审查结果'});
 const prose=progress.locator('p');
 const animation=()=>prose.evaluate(el=>getComputedStyle(el).animationName);
 await expect.poll(animation).toBe('progress-commentary-sweep');
 await expect(prose).toHaveCSS('background-clip','text');
 expect(await prose.evaluate(el=>el.getBoundingClientRect().height/parseFloat(getComputedStyle(el).lineHeight))).toBeGreaterThan(1);
 const atPhase=async(ms:number)=>{
  await prose.evaluate((el,time)=>{const sweep=el.getAnimations()[0];sweep.pause();sweep.currentTime=time;},ms);
  return prose.screenshot();
 };
 const first=await atPhase(250),middle=await atPhase(1200);
 expect(first.equals(middle)).toBe(false);
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect.poll(animation).toBe('none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='waiting';w.__emit();});
 await expect.poll(animation).toBe('none');
});

test('activity and thinking sweeps preserve text, stop on attention and respect reduced motion',async({page})=>{
 await prepare(page,'完成');
 await page.evaluate(()=>{const w=window as any,r=w.__demoRun;r.status='running';r.approvals=[];r.lastEventAt=new Date().toISOString();r.messages=r.messages.slice(0,1);w.__emit();});
 const status=page.locator('.turn-progress-toggle');await expect(status).toContainText('执行中');
 const label=status.locator('[data-slot="trace-title"]').first(),layer=label.locator('[data-shimmer-layer="0"]');
 await expect(label.locator('[data-shimmer-layer]')).toHaveCount(3);
 await expect(label).toHaveCSS('animation-name','none');await expect(layer).toHaveCSS('animation-name','composite-text-sweep');
 const position=await layer.evaluate(e=>getComputedStyle(e).backgroundPosition),opacity=await layer.evaluate(e=>getComputedStyle(e).opacity);
 await expect.poll(()=>layer.evaluate(e=>getComputedStyle(e).opacity)).not.toBe(opacity);await expect(layer).toHaveCSS('background-position',position);
 expect(await label.textContent()).toBe('执行中');
 await label.evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=0;}));const sweepStart=await label.screenshot();
 await label.evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>{a.currentTime=666;}));const sweepEnd=await label.screenshot();
 expect(sweepStart.equals(sweepEnd)).toBe(false);await label.evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>a.play()));
 await page.evaluate(()=>{const w=window as any;w.__demoRun.messages.push({id:'thinking',role:'assistant',kind:'reasoning',reasoningFormat:'text',text:'正在分析输入'});w.__emit();});
 const thinking=page.locator('.process-entry.reasoning [data-slot="trace-line"]'),title=thinking.locator('[data-slot="trace-title"]');
 await expect(title).toContainText('思考过程');await expect(title.locator('[data-shimmer-layer]')).toHaveCount(3);
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await expect(title).toBeVisible();
 expect(await title.evaluate(e=>getComputedStyle(e).webkitTextFillColor)).not.toBe('rgba(0, 0, 0, 0)');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(layer).toHaveCSS('display','none');await expect(layer).toHaveCSS('animation-name','none');
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(layer).toHaveCSS('animation-name','composite-text-sweep');
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='waiting';w.__emit();});
 await expect(title.locator('[data-shimmer-layer]')).toHaveCount(0);await expect(status).toContainText('等待审批');await expect(status.locator('[data-shimmer-layer]')).toHaveCount(0);await expect(status.locator('[data-slot="spinner"]')).toHaveCount(0);
});

for(const resume of ['button','wheel'] as const)test(`message scroller follows output, pauses for reading, and resumes at the latest message via ${resume}`,async({page})=>{
 await prepare(page,('初始回答\n\n').repeat(80));
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];(window as any).__emit();});
 const viewport=page.locator('.conversation-scroll:visible');
 const distance=()=>viewport.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight);
 await expect.poll(distance).toBeLessThan(3);
 await viewport.hover();await page.mouse.wheel(0,-500);
 await expect.poll(distance).toBeGreaterThan(200);
 const top=await viewport.evaluate(el=>el.scrollTop);
 await page.evaluate(()=>{(window as any).__demoRun.messages.at(-1).text+='\n\n'+('新输出\n\n').repeat(40);(window as any).__emit();});
 await page.waitForTimeout(150);
 expect(Math.abs(await viewport.evaluate(el=>el.scrollTop)-top)).toBeLessThan(3);
 if(resume==='button')await page.getByRole('button',{name:'回到最新消息'}).click();
 else await page.mouse.wheel(0,100000);
 await expect.poll(distance).toBeLessThan(3);
 for(let i=0;i<3;i++){
  await page.evaluate(()=>{(window as any).__demoRun.messages.at(-1).text+='\n\n'+('继续输出\n\n').repeat(20);(window as any).__emit();});
  await expect.poll(distance).toBeLessThan(3);
 }
 // Resuming must not prevent the reader from pausing the next stream again.
 await viewport.hover();await page.mouse.wheel(0,-500);
 await expect.poll(distance).toBeGreaterThan(200);
 const paused=await viewport.evaluate(el=>el.scrollTop);
 await page.evaluate(()=>{(window as any).__demoRun.messages.at(-1).text+='\n\n'+('后续输出\n\n').repeat(20);(window as any).__emit();});
 await expect(viewport).toContainText('后续输出');
 await page.waitForTimeout(200);
 expect(Math.abs(await viewport.evaluate(el=>el.scrollTop)-paused)).toBeLessThan(3);
});

test('tool summaries describe actions while commands and output remain expandable',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];run.tools=[
 {id:'read',turnKey:'u',type:'commandExecution',label:"/bin/zsh -lc 'cat docs/design.md'",status:'completed',detail:'file contents',commandActions:[{type:'read',name:'design.md',path:'docs/design.md'}]},
 {id:'legacy',turnKey:'u',type:'commandExecution',label:"/bin/zsh -lc 'cat docs/old.md'",status:'completed',detail:'older content'},
 {id:'unknown',turnKey:'u',type:'commandExecution',label:'cat a.md && rm b.md',status:'completed',detail:'mixed commands'},
 {id:'compact',turnKey:'u',type:'contextCompaction',label:'上下文压缩',status:'inProgress',detail:''}
 ];(window as any).__emit();});
 const rows=page.locator('.process-entry.commandExecution');
 await expect(rows.nth(0).locator('[data-slot=trace-collapsible-trigger]')).toContainText('读取文件');
 await expect(rows.nth(0).locator('[data-slot=trace-collapsible-trigger]')).toContainText('design.md');
 await expect(rows.nth(0).locator('[data-slot=trace-collapsible-trigger]')).not.toContainText('/bin/zsh');
 await expect(rows.nth(0).locator('pre').first()).not.toBeVisible();
 await rows.nth(0).locator('[data-slot=trace-collapsible-trigger]').click();
 await expect(rows.nth(0).getByLabel('执行命令')).toHaveText("/bin/zsh -lc 'cat docs/design.md'");
 await expect(rows.nth(0).locator('pre').last()).toHaveText('file contents');
 await expect(rows.nth(1).locator('[data-slot=trace-collapsible-trigger]')).toContainText('读取文件');
 await expect(rows.nth(2).locator('[data-slot=trace-collapsible-trigger]')).toContainText('运行命令');
 await expect(page.locator('.process-entry.contextCompaction')).toContainText('正在压缩上下文');
 await page.evaluate(()=>{(window as any).__demoRun.tools.at(-1).status='completed';(window as any).__emit();});
 await expect(page.locator('.process-entry.contextCompaction')).toContainText('上下文已压缩');
});

test('thinking follows rapid output and hidden updates, but respects reading older lines',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];run.messages=[{id:'u',role:'user',text:'分析任务'},{id:'r',role:'assistant',kind:'reasoning',text:('分析内容\n').repeat(80)}];(window as any).__emit();});
 await page.locator('.reasoning [data-slot=trace-collapsible-trigger]').click();
 const thinking=page.locator('.thinking-window');
 const distance=()=>thinking.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight);
 await expect.poll(distance).toBeLessThan(2);
 for(let i=0;i<5;i++)await page.evaluate(()=>{(window as any).__demoRun.messages[1].text+=('新分析\n').repeat(30);(window as any).__emit();});
 await expect.poll(distance).toBeLessThan(2);
 await page.getByRole('button',{name:/新建任务/}).first().click();
 await expect(thinking).not.toBeVisible();
 await page.evaluate(()=>{(window as any).__demoRun.messages[1].text+=('后台分析\n').repeat(80);(window as any).__emit();});
 await page.locator('.tree-task > button:first-child').filter({hasText:'任务体验验收'}).click();
 await expect.poll(distance).toBeLessThan(2);
 await thinking.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
 await page.evaluate(()=>{(window as any).__demoRun.messages[1].text+=('继续分析\n').repeat(30);(window as any).__emit();});
 await expect.poll(()=>thinking.evaluate(el=>el.scrollTop)).toBe(0);
 await thinking.evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
 await page.evaluate(()=>{(window as any).__demoRun.messages[1].text+=('恢复跟随\n').repeat(30);(window as any).__emit();});
 await expect.poll(distance).toBeLessThan(2);
 await page.locator('.turn-progress-toggle').click();await page.locator('.turn-progress-toggle').click();
 await expect.poll(distance).toBeLessThan(2);
});

test('questionnaire preserves answers across steps and failed submissions',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.approvals=[];run.questions=[{id:'multi',blocking:true,questions:[{id:'audience',question:'面向谁？',options:[{label:'设计师',description:'设计工作'}]},{id:'detail',question:'补充要求？'},{id:'secret',question:'私密答案？',isSecret:true}]}];(window as any).__attempts=0;(window as any).desktop.answerRun=async(value:any)=>{(window as any).__attempts++;if((window as any).__attempts===1)throw new Error('提交失败，请重试');(window as any).__answer=value;run.questions=[];(window as any).__emit();};(window as any).__emit();});
 const form=page.getByRole('form',{name:'任务澄清'});
 await expect(form).toContainText('问题 1 / 3');
 await expect(form.getByRole('button',{name:'下一题'})).toBeDisabled();
 await form.getByRole('radio',{name:'设计师 设计工作'}).check();
 await form.getByRole('button',{name:'下一题'}).click();
 await expect(form).toContainText('问题 2 / 3');
 await expect(form.getByLabel('面向谁？')).not.toBeVisible();
 await form.getByLabel('补充要求？').fill('保留现有数据');
 await form.getByRole('button',{name:'上一题'}).click();
 await expect(form.getByRole('radio')).toBeChecked();
 await form.getByLabel('面向谁？').fill('产品经理');
 await form.getByRole('button',{name:'下一题'}).click();
 await expect(form.getByLabel('补充要求？')).toHaveValue('保留现有数据');
 await form.getByRole('button',{name:'下一题'}).click();
 await expect(form.getByLabel('私密答案？')).toHaveAttribute('type','password');
 await form.getByLabel('私密答案？').fill('private-value');
 expect(await page.evaluate(()=>(window as any).__attempts)).toBe(0);
 await form.getByRole('button',{name:'提交回答'}).click();
 await expect(form.getByRole('alert')).toContainText('提交失败');
 await expect(form.getByLabel('私密答案？')).toHaveValue('private-value');
 await page.screenshot({path:'test-results/questionnaire-multi.png'});
 await form.getByRole('button',{name:'提交回答'}).click();
 await expect(form).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__answer.answers)).toEqual({audience:'产品经理',detail:'保留现有数据',secret:'private-value'});
});

test('task header exposes directory and permissions in a compact popover',async({page})=>{
 await prepare(page,'完成');
 const trigger=page.getByRole('button',{name:'项目信息：fixture',exact:true});
 await expect(trigger).toHaveAttribute('title','fixture');
 await expect(page.locator('.conversation-scope')).toHaveCount(0);
 await trigger.click();
 const card=page.getByRole('region',{name:'项目信息',exact:true});
 await expect(card).toBeVisible();await expect(card).toContainText('/fixture');await expect(card).toContainText('默认权限');
 await page.keyboard.press('Escape');await expect(card).not.toBeVisible();
});

test('long history shares one forms subscription and preserves expanded state offscreen',async({page})=>{
 await prepare(page,'完成');
 await page.evaluate(()=>{
  const w=window as any,r=w.__demoRun;r.status='completed';r.approvals=[];
  r.messages=Array.from({length:60},(_,i)=>[{id:`u${i}`,role:'user',text:`历史问题 ${i}`},{id:`r${i}`,role:'assistant',kind:'reasoning',status:'completed',text:'保留展开内容'},{id:`a${i}`,role:'assistant',phase:'final_answer',text:'回答内容。'.repeat(50)}]).flat();w.__emit();
 });
 const navigation=page.getByRole('navigation',{name:'对话轮次导航'});
 await expect(navigation.getByRole('button')).toHaveCount(60);
 await expect.poll(()=>page.locator('[data-turn-id]').count()).toBeLessThan(24);
 const first=page.locator('[data-turn-id="u0"]'),toggle=first.locator('.turn-progress-toggle');
 await navigation.getByRole('button',{name:/^第 1 轮：/}).click();await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
 const before=await page.evaluate(()=>(window as any).__formReads);
 await navigation.getByRole('button',{name:/^第 60 轮：/}).click();
 await expect(first).toHaveCount(0);
 await page.evaluate(()=>(window as any).__formsChanged());
 await expect.poll(()=>page.evaluate(()=>(window as any).__formReads)).toBe(before+1);
 expect(await page.evaluate(()=>(window as any).__formSubscriptions)).toBe(1);
 await navigation.getByRole('button',{name:/^第 1 轮：/}).click();await expect(toggle).toHaveAttribute('aria-expanded','true');
});

test('terminal approval copies exact commands and retains failed decisions for retry',async({page})=>{
 await prepare(page,'等待授权');
 const card=page.getByRole('region',{name:'执行授权'});
 await card.getByRole('button',{name:'复制命令'}).click();expect(await page.evaluate(()=>(window as any).__copiedText)).toBe('echo approved');
 await card.getByRole('button',{name:'查看请求详情'}).click();const details=card.getByRole('region',{name:'授权请求详情'});await expect(details).toContainText('echo approved');await expect(details).toContainText('不会开启完全访问');await expect(page.getByRole('dialog')).toHaveCount(0);await card.getByRole('button',{name:'收起请求详情'}).click();
 await page.evaluate(()=>{const w=window as any;w.__originalApprove=w.desktop.approveRun;w.__approvalCalls=0;w.desktop.approveRun=()=>{w.__approvalCalls++;return new Promise((resolve,reject)=>{w.__rejectApproval=reject;});};});
 await card.getByRole('button',{name:'拒绝',exact:true}).click();await expect(card.getByRole('button',{name:'正在拒绝…'})).toBeDisabled();await expect(card.getByRole('button',{name:'批准本次'})).toBeDisabled();expect(await page.evaluate(()=>(window as any).__approvalCalls)).toBe(1);
 await page.evaluate(()=>(window as any).__rejectApproval(new Error('连接暂时中断')));await expect(card.getByRole('alert')).toContainText('连接暂时中断');await expect(card.getByRole('button',{name:'拒绝',exact:true})).toBeEnabled();
 await page.setViewportSize({width:760,height:600});await page.screenshot({path:'test-results/terminal-approval.png'});
 await page.evaluate(()=>(window as any).desktop.approveRun=(window as any).__originalApprove);await card.getByRole('button',{name:'批准本次'}).click();await expect(card).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__decision.decision)).toBe('accept');
});


test('transcript keeps long tool metadata and reply typography readable in narrow and dark views',async({page})=>{
 await prepare(page,'**重点内容** 和普通正文。');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];run.tools=[{id:'long',turnKey:'u',type:'commandExecution',label:'node scripts/verify-cross-platform-build-and-extension-contracts.mjs --platform windows,macos,linux',status:'inProgress',detail:'Checking contracts…\n'+ 'output '.repeat(180)}];(window as any).__emit();});
 const reply=page.getByRole('article',{name:'助手消息'});
 const strong=reply.locator('strong');
 expect(await strong.evaluate(el=>getComputedStyle(el).fontSize)).toBe(await strong.evaluate(el=>getComputedStyle(el.parentElement!).fontSize));
 const row=page.locator('.process-entry.commandExecution');
 await expect(row.locator('[data-slot=trace-collapsible-trigger]')).toHaveAttribute('aria-expanded','false');
 await row.locator('[data-slot=trace-collapsible-trigger]').click();
 await expect(row.locator('[data-slot=trace-collapsible-trigger]')).toHaveAttribute('aria-expanded','true');
 await expect(row.getByLabel('工具输出')).toBeVisible();
 for(const width of [1240,640]){
  await page.setViewportSize({width,height:840});
  await row.scrollIntoViewIfNeeded();
  const boxes=await row.locator('[data-slot=trace-collapsible-trigger]').evaluate(el=>{const title=el.querySelector('.activity-tool-title')!.getBoundingClientRect();const status=el.querySelector('.activity-tool-status')!.getBoundingClientRect();return {right:title.right,left:status.left,overflow:el.scrollWidth-el.clientWidth};});
  expect(boxes.right).toBeLessThanOrEqual(boxes.left);expect(boxes.overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('.run-activity')).toHaveCount(0);
  await page.screenshot({path:'test-results/chat-layout-'+width+'.png'});
 }
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark');});
 await page.screenshot({path:'test-results/chat-layout-dark.png'});
 await row.locator('[data-slot=trace-collapsible-trigger]').focus();await page.keyboard.press('Enter');
 await expect(row.getByLabel('工具输出')).not.toBeVisible();
});

test('reconciled forms replace stale local errors with the confirmed submission result',async({page})=>{
 await prepare(page,'请核实提交结果。');
 await page.evaluate(()=>{
  const flow={id:'recovery',runId:'demo',turnKey:'u',revision:1,status:'unknown',step:0,error:'提交未完成：INTERNAL',drafts:{main:{amount:'1280'}},template:{title:'报销申请',steps:[{id:'main',title:'费用',fields:[{name:'amount',label:'金额',type:'text'}]}],submit:{label:'提交'}}};
  (window as any).__recovery=flow;
  (window as any).desktop.forms.list=async()=>[structuredClone(flow)];
  (window as any).desktop.forms.action=async()=>{throw Error('暂时无法连接');};
  (window as any).__formsChanged();
 });
 const card=page.getByLabel('报销申请',{exact:true});
 await expect(card.getByRole('alert')).toContainText('INTERNAL');
 // The shared authorization surface can be dismissed to work with transcript forms.
 await page.getByRole('region',{name:'处理任务请求',exact:true}).getByRole('button',{name:'收起请求',exact:true}).click();
 await card.getByRole('button',{name:'核实提交结果'}).click();
 await expect(card.getByRole('alert')).toContainText('暂时无法连接');
 await page.evaluate(()=>{const f=(window as any).__recovery;f.revision++;f.status='completed';delete f.error;f.results={main:{claimId:'CL-001',amount:'1280.00'}};(window as any).__formsChanged();});
 await expect(card.getByRole('alert')).toHaveCount(0);
 await expect(card.getByRole('region',{name:'提交结果'})).toContainText('CL-001');
 await expect(card.getByRole('button',{name:'核实提交结果'})).toHaveCount(0);
});

test('running summary exposes failures without overriding a manually folded process',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];run.messages=run.messages.slice(0,1);run.plans=[{turnKey:'u',explanation:'执行计划',steps:[{step:'读取资料',status:'completed'},{step:'生成报告',status:'inProgress'}]}];run.tools=[{id:'report',turnKey:'u',type:'commandExecution',label:'python report.py',status:'inProgress',detail:'Generating report'}];(window as any).__emit();});
 await expect(page.locator('.turn-progress-toggle')).toContainText('生成报告');await expect(page.locator('.turn-progress-toggle')).toContainText('1/2');await expect(page.locator('.process-panel')).toBeVisible();
 await page.locator('.turn-progress-toggle').click();await expect(page.locator('.process-panel')).toBeHidden();
 await page.evaluate(()=>{(window as any).__demoRun.tools[0].status='failed';(window as any).__demoRun.tools[0].detail='Report generation failed';(window as any).__emit();});
 await expect(page.locator('.process-panel')).toHaveCount(0);await expect(page.locator('.turn-progress-toggle')).toHaveAttribute('aria-expanded','false');
 await expect(page.locator('.turn-progress-toggle [data-slot=trace-line]')).toHaveAttribute('data-status','error');
 await page.locator('.turn-progress-toggle').click();
 await page.locator('.process-entry.commandExecution [data-slot=trace-collapsible-trigger]').click();await expect(page.locator('.process-panel')).toContainText('Report generation failed');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='completed';(window as any).__emit();});
 await expect(page.locator('.process-panel')).toBeHidden();await expect(page.locator('.turn-progress-toggle')).toHaveAttribute('aria-expanded','false');
 await page.locator('.turn-progress-toggle').click();await expect(page.locator('.process-panel')).toBeVisible();
 await page.evaluate(()=>{(window as any).__emit();});
 await expect(page.locator('.turn-progress-toggle')).toHaveAttribute('aria-expanded','true');
});

test('queued execution follows application language',async({page})=>{
 await prepare(page);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面语言').selectOption('en');await page.getByRole('button',{name:'Back to app',exact:true}).click();
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='preparing';run.queued=true;run.approvals=[];(window as any).__emit();});
 await expect(page.getByText('Queued · Waiting for an available execution slot or working directory',{exact:true})).toHaveText('Queued · Waiting for an available execution slot or working directory');
});

test('project execution status and empty description are translated',async({page})=>{
 await prepare(page);
 await page.addInitScript(()=>{const api=(window as any).desktop;api.readWorkspace=async()=>({layoutMode:'classic',theme:'light',language:'en',tasks:[],projects:[{id:'p',name:'Demo',path:'/fixture',createdAt:new Date().toISOString()}]});const run=(window as any).__demoRun;run.projectId='p';run.status='completed';run.approvals=[];});
 await page.reload();await page.getByRole('navigation',{name:'Navigation groups'}).getByRole('button',{name:'Project',exact:true}).click();await page.locator('.project-tree-name').click();
 await expect(page.locator('.project-task-list small')).toHaveText('Turn ended');
 await expect(page.locator('.page-description')).toHaveText('Add a description to share context across project tasks.');
});

test('approval card keeps command and decisions readable across themes and narrow layouts',async({page})=>{
 await prepare(page,'等待审批');const card=page.getByRole('region',{name:'执行授权'});
 await expect(card).toContainText('允许执行此命令？');await page.screenshot({path:'test-results/approval-light.png'});
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面语言').selectOption('en');await page.getByRole('button',{name:'Dark',exact:true}).click();await page.getByRole('button',{name:'Back to app',exact:true}).click();
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.approvals[0].detail=JSON.stringify({command:'node scripts/check-project-and-extension-permissions.mjs --directory /a/very/long/project/path --verbose',cwd:'/a/very/long/project/path/with/additional/nested/directories',reason:'Review the project permissions before continuing.'});(window as any).__emit();});
 await page.setViewportSize({width:640,height:800});const englishCard=page.getByRole('region',{name:'Execution approval'});
 await expect(englishCard).toContainText('Allow this command to run?');await expect(englishCard.getByRole('button',{name:'Approve once',exact:true})).toBeVisible();
 expect(await englishCard.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:'test-results/approval-english-dark.png'});
 await page.setViewportSize({width:360,height:740});await expect(englishCard.getByRole('button',{name:'Approve once',exact:true})).toBeVisible();expect(await englishCard.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.approvals[0].method='item/fileChange/requestApproval';run.approvals[0].detail='{}';(window as any).__emit();});await expect(englishCard).toContainText('Allow file changes?');
});

test('Trace history preserves tool disclosure and isolates terminal and markdown styles',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const r=(window as any).__demoRun;r.status='running';r.approvals=[];r.messages=[{id:'u',role:'user',text:'检查过程'},{id:'p',role:'assistant',phase:'commentary',text:'## 步骤\n\n**检查**\n\n- 项目\n\n> 引用',order:1}];r.tools=[{id:'tool',turnKey:'u',type:'commandExecution',label:'node check.js',status:'inProgress',detail:'first output',order:2}];(window as any).__emit();});
 const entry=page.locator('.process-entry.commandExecution');
 await expect(entry.getByLabel('工具输出')).toHaveCount(0);
 await entry.locator('[data-slot=trace-collapsible-trigger]').click();
 await expect(entry.getByLabel('工具输出')).toBeVisible();
 await expect(entry.locator('[data-slot=code-block]')).toHaveCount(2);
 await entry.getByRole('button').click();
 await page.evaluate(()=>{(window as any).__demoRun.tools[0].detail+='\nnext output';(window as any).__emit();});
 await expect(entry.getByLabel('工具输出')).toBeHidden();
 await entry.getByRole('button').click();
 await page.locator('.turn-progress-toggle').click();await expect(entry.getByLabel('工具输出')).toBeHidden();
 await page.locator('.turn-progress-toggle').click();await expect(entry.getByLabel('工具输出')).toBeVisible();
 await expect(page.locator('.process-panel .markdown')).toHaveCount(0);
 await expect(page.locator('.trace-markdown h2')).toHaveText('步骤');
 await page.evaluate(()=>{const r=(window as any).__demoRun;r.status='completed';r.tools[0].status='completed';(window as any).__emit();});
 await expect(page.locator('.process-panel')).toBeHidden();
 await page.locator('.turn-progress-toggle').click();await expect(entry.getByLabel('工具输出')).toBeVisible();
 await expect.poll(()=>page.locator('.turn-progress > [data-slot=trace-collapsible] > [data-slot=trace-collapsible-content]').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(100);
 await page.screenshot({path:'test-results/trace-history.png',animations:'disabled'});
});

test('Trace tools distinguish denied, pending and unfinished historical calls',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const r=(window as any).__demoRun;r.status='completed';r.approvals=[];r.messages=r.messages.slice(0,1);r.tools=['declined','pending','inProgress','failed'].map((status,i)=>({id:String(i),turnKey:'u',type:'commandExecution',label:'command '+i,status,detail:i===3?'failure':''}));(window as any).__emit();});
 await page.locator('.turn-progress-toggle').click();
 const rows=page.locator('.process-entry.commandExecution');
 await expect(rows.nth(0)).toContainText('已拒绝');await expect(rows.nth(0).getByRole('button')).toHaveCount(0);
 await expect(rows.nth(2).locator('[data-slot=trace-line]')).toHaveAttribute('data-status','error');
 await expect(rows.nth(3).locator('[data-slot=trace-line]')).toHaveAttribute('data-status','error');
});

test('user Bubble keeps message theme and typography across themes and narrow layouts',async({page})=>{
 await prepare(page,'回答');
 for(const theme of ['light','dark'])for(const width of [1240,390]){
  await page.setViewportSize({width,height:840});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const message=page.locator('[data-message-role=user]').first(),bubble=message.locator('[data-slot=bubble-content]');
  await expect(message).toHaveAttribute('data-align','end');await expect(bubble).toHaveCSS('background-color',theme==='light'?'rgb(0, 0, 0)':'rgb(48, 48, 48)');await expect(bubble).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(bubble).toHaveCSS('font-size','15px');await expect(bubble).toHaveCSS('font-weight','500');await expect(bubble).toHaveCSS('line-height','22.5px');await expect(bubble).toHaveCSS('border-width','0px');
  const text='第一行\n'+('很长的用户消息'.repeat(40));
  await page.evaluate(text=>{const run=(window as any).__demoRun;run.messages[0].text=text;(window as any).__emit();},text);
  await expect(bubble).toHaveText(text);
  expect(await message.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  // Read both edges in one browser task. Separate boundingBox calls can span
  // frames while the responsive sidebar changes the conversation's position.
  await expect.poll(()=>message.evaluate(el=>{
   const outer=el.getBoundingClientRect(),inner=el.querySelector('[data-slot=bubble-content]')!.getBoundingClientRect();
   return Math.abs(outer.right-inner.right);
  })).toBeLessThan(2);
  await page.screenshot({path:`test-results/user-bubble-${theme}-${width}.png`});
 }
});

for (const language of ['zh-CN','en'] as const) test(`loop pause offers diagnostic export and manual continuation (${language})`,async({page})=>{
  await prepare(page,'Fixture answer',language);
  await page.evaluate(()=>{
    const w=window as any;
    w.desktop.exportRunDiagnostics=async(input:any)=>{w.__diagnosticInput=input;return {saved:true};};
    w.__demoRun.status='interrupted';w.__demoRun.approvals=[];
    w.__demoRun.error='检测到重复调用且没有有效进展，任务已暂停。请核实已执行的操作后再继续，或导出诊断数据。';w.__emit();
  });
  const exportLabel=language==='en'?'Export diagnostic data':'导出诊断数据';
  const alert=page.getByRole('alert');
  await expect(alert).toContainText(language==='en'?'task has been paused':'任务已暂停');
  await alert.getByRole('button',{name:exportLabel,exact:true}).click();
  await expect(alert.getByRole('status')).toHaveText(language==='en'?'Diagnostic data exported':'诊断数据已导出');
  expect(await page.evaluate(()=>(window as any).__diagnosticInput)).toEqual({id:'demo',language});
  await alert.getByRole('button',{name:language==='en'?'Prepare to continue':'准备继续任务'}).click();
  await expect(page.locator('[data-slot="input-group-control"]')).not.toBeEmpty();
  await page.getByTitle(language==='en'?'Model used for this turn':'本次使用的模型').click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText(language==='en'?'credentials are excluded':'不包含聊天正文');
  await page.evaluate(()=>{(window as any).desktop.exportRunDiagnostics=async()=>null;});
  await dialog.getByRole('button',{name:exportLabel,exact:true}).click();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await page.evaluate(()=>{(window as any).desktop.exportRunDiagnostics=async()=>{throw Error('private filesystem path');};});
  await dialog.getByRole('button',{name:exportLabel,exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText(language==='en'?'Could not export diagnostic data. Please try again.':'诊断数据导出失败，请重试');
  await page.screenshot({path:test.info().outputPath(`ambleloft-diagnostics-${language}.png`)});
});

for(const width of [1240,600])test(`chat composer keeps bottom space for messages ${width}`,async({page})=>{
 await prepare(page,'空间检查');await page.setViewportSize({width,height:840});
 await page.getByRole('button',{name:'批准本次',exact:true}).click();
 const input=page.getByRole('textbox',{name:'继续对话'});
 await input.fill('第一行');await input.press('Shift+Enter');await input.press('a');
 await expect(input).toHaveValue('第一行\na');
 const geometry=await input.evaluate(el=>{const group=el.closest('[data-slot=input-group]')!.getBoundingClientRect(),page=el.closest('.conversation-page')!.getBoundingClientRect(),hint=document.getElementById(el.getAttribute('aria-describedby')!)!;return {gap:page.bottom-group.bottom,hintHeight:hint.getBoundingClientRect().height,description:hint.textContent};});
 expect(geometry.gap).toBeLessThanOrEqual(10);expect(geometry.hintHeight).toBeLessThanOrEqual(1);expect(geometry.description).toContain('Shift+Enter');
});

for(const width of [1240,390])test(`concurrent approvals share one review surface and preserve the composer ${width}`,async({page})=>{
 await prepare(page,'等待审批');await page.setViewportSize({width,height:844});
 const input=page.getByRole('textbox',{name:'继续对话'}),surface=page.getByRole('region',{name:'处理任务请求',exact:true});
 await input.fill('保留正在输入的补充');const initial=await input.boundingBox();
 await page.evaluate(()=>{const w=window as any;w.__calls=[];w.__demoRun.approvals=Array.from({length:12},(_,i)=>({id:'a'+i,method:'item/commandExecution/requestApproval',detail:JSON.stringify({command:'echo '+i,cwd:'/fixture',subagent:i%2?'架构师':'产品经理'})}));w.desktop.approveRun=async(input:any)=>{w.__calls.push(input);w.__demoRun.approvals=w.__demoRun.approvals.filter((a:any)=>a.id!==input.approvalId);w.__demoRun.approvals.push({id:'new',method:'commandExecution',detail:'{"command":"echo new"}'});w.__emit();};w.__emit();});
 await expect(surface).toContainText('待处理授权 · 12');await expect(surface.getByRole('region',{name:'执行授权',exact:true})).toHaveCount(1);
 await expect(surface.getByLabel('待执行命令')).toHaveText('echo 0');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(input).toBeFocused();
 await surface.getByRole('button',{name:'收起请求',exact:true}).click();
 await page.evaluate(()=>{const w=window as any;w.__demoRun.approvals.push({id:'later',method:'commandExecution',detail:'{"command":"echo later"}'});w.__emit();});
 await expect(surface.getByRole('region',{name:'执行授权',exact:true})).toBeHidden();await expect(surface).toContainText('待处理授权 · 13');await expect(input).toHaveValue('保留正在输入的补充');
 await surface.getByRole('button',{name:'查看并处理',exact:true}).click();
 await surface.getByRole('button',{name:'批准本次',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__calls.map((c:any)=>c.approvalId))).toEqual(['a0']);
 await expect(surface).toContainText('已批准本次命令');await expect(surface.getByRole('button',{name:'批准本次',exact:true})).toHaveCount(0);
 await expect(surface.getByRole('region',{name:'下一项请求'})).toContainText('echo 1');
 await surface.getByRole('button',{name:'审核此项',exact:true}).click();await expect(surface.getByLabel('待执行命令')).toHaveText('echo 1');
 await surface.getByRole('button',{name:/查看下一项/}).click();await expect(surface.getByLabel('待执行命令')).toHaveText('echo 2');
 expect(await page.evaluate(()=>(window as any).__calls.length)).toBe(1);
 expect(await input.boundingBox()).toEqual(initial);
 await page.screenshot({path:`test-results/approval-single-${width}.png`});
 expect(await surface.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await surface.getByRole('button',{name:'收起请求',exact:true}).focus();await page.keyboard.press('Escape');await expect(surface.getByRole('button',{name:'查看并处理',exact:true})).toBeFocused();
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='stopping';w.__emit();});await expect(surface).toHaveCount(0);
});

test('single review retries failures without acting on other concurrent approvals',async({page})=>{
 await prepare(page,'等待审批');
 await page.evaluate(()=>{const w=window as any;w.__calls=[];w.__demoRun.approvals=[0,1].map(i=>({id:'a'+i,method:'commandExecution',detail:JSON.stringify({command:'echo '+i})}));w.desktop.approveRun=async(input:any)=>{w.__calls.push(input);throw Error('服务暂时不可用');};w.__emit();});
 const surface=page.getByRole('region',{name:'处理任务请求',exact:true});
 await surface.getByRole('button',{name:'拒绝',exact:true}).click();await expect(surface.getByRole('alert')).toContainText('服务暂时不可用');
 await expect(surface.getByLabel('待执行命令')).toHaveText('echo 0');expect(await page.evaluate(()=>(window as any).__calls.map((c:any)=>c.approvalId))).toEqual(['a0']);
 await page.evaluate(()=>{const w=window as any;w.__calls=[];w.desktop.approveRun=(input:any)=>{w.__calls.push(input);return new Promise(resolve=>{w.__resolve=resolve;});};});
 await surface.getByRole('button',{name:'批准本次'}).click();await expect(surface.getByRole('button',{name:'正在批准…'})).toBeDisabled();
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='stopping';w.__emit();});await expect(surface).toHaveCount(0);
 await page.evaluate(()=>(window as any).__resolve());expect(await page.evaluate(()=>(window as any).__calls.map((c:any)=>c.approvalId))).toEqual(['a0']);
});

test('thinking and tool streams default to summaries and mount text only on demand',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.status='running';run.approvals=[];run.questions=[];run.messages=[run.messages[0],{id:'reasoning-lazy',role:'assistant',kind:'reasoning',text:'Hidden reasoning payload',order:1}];run.tools=[{id:'tool-lazy',turnKey:run.messages[0].id,type:'commandExecution',label:'pwd',status:'inProgress',detail:'Hidden tool payload',order:2}];(window as any).__emit();});
 await expect(page.locator('.thinking-window')).toHaveCount(0);await expect(page.getByText('Hidden tool payload',{exact:true})).toHaveCount(0);
 const thinking=page.locator('.process-entry.reasoning [data-slot=trace-collapsible-trigger]');await thinking.click();await expect(page.locator('.thinking-window')).toContainText('Hidden reasoning payload');await thinking.click();await expect(page.locator('.thinking-window')).toHaveCount(0);
 await page.evaluate(()=>{const run=(window as any).__demoRun;run.messages[1].text+=' more';run.tools[0].detail+=' more';(window as any).__emit();});await expect(page.locator('.thinking-window')).toHaveCount(0);
 const tool=page.locator('.process-entry.commandExecution [data-slot=trace-collapsible-trigger]');await tool.click();await expect(page.getByText('Hidden tool payload more',{exact:true})).toBeVisible();await tool.click();await expect(page.getByText('Hidden tool payload more',{exact:true})).toHaveCount(0);
});

test('collapsed execution unmounts large histories and restores disclosure choices with latest output',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const w=window as any,r=w.__demoRun;r.status='running';r.approvals=[];r.questions=[];r.messages=[r.messages[0],{id:'progress-heavy',role:'assistant',phase:'commentary',text:'**Progress evidence**\n\n'+('Long progress record. '.repeat(1000)),order:1}];r.tools=Array.from({length:200},(_,i)=>({id:'heavy-'+i,turnKey:r.messages[0].id,type:'commandExecution',label:'echo step-'+i,status:'completed',detail:'Output '+i+' '+('x'.repeat(12000)),order:i+2}));w.__emit();});
 const progress=page.locator('.turn-progress'),toggle=progress.locator('.turn-progress-toggle');
 await expect(progress.locator('.process-entry.commandExecution')).toHaveCount(200);
 const first=progress.locator('.process-entry.commandExecution').first();
 await first.locator('[data-slot=trace-collapsible-trigger]').click();
 await expect(first.getByLabel('工具输出')).toBeVisible();
 const expandedCount=await progress.locator('*').count();
 await toggle.click();
 await expect(progress.locator('.process-panel')).toHaveCount(0);
 await expect(progress.locator('.markdown')).toHaveCount(0);
 expect(await progress.locator('*').count()).toBeLessThan(expandedCount/10);
 await page.evaluate(()=>{const w=window as any;w.__demoRun.tools[0].detail='Newest output while collapsed';w.__demoRun.messages[1].text+=' Latest progress';w.__emit();});
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await expect(progress.locator('.process-panel')).toHaveCount(0);
 await toggle.click();
 await expect(first.getByLabel('工具输出')).toHaveText('Newest output while collapsed');
 await expect(progress.locator('.process-milestone')).toContainText('Latest progress');
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='completed';w.__emit();});
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await expect(toggle).not.toContainText('200');
 await expect(progress.locator('.process-panel')).toHaveCount(0);
 await toggle.click();await expect(first.getByLabel('工具输出')).toHaveText('Newest output while collapsed');
});

test('hidden conversation freezes transcript DOM while retaining draft and latest approvals',async({page})=>{
 await prepare(page,'Before hidden');
 await page.getByRole('textbox',{name:'继续对话'}).fill('Draft survives hidden updates');
 await page.evaluate(()=>{const w=window as any;w.__demoRun.approvals=[];w.__demoRun.status='running';w.__emit();});
 const original=page.locator('.conversation-page').filter({hasText:'Before hidden'});
 await page.getByRole('button',{name:/新建任务/}).first().click();
 await expect(original).toBeHidden();
 await page.evaluate(()=>{const w=window as any,el=[...document.querySelectorAll('.conversation-page')].find(el=>el.textContent?.includes('Before hidden'))!;w.__hiddenMutations=0;w.__hiddenObserver=new MutationObserver(()=>w.__hiddenMutations++);w.__hiddenObserver.observe(el,{subtree:true,childList:true,characterData:true});});
 for(let i=0;i<5;i++)await page.evaluate(i=>{const w=window as any;w.__demoRun.messages.at(-1).text='After hidden '+i;w.__emit();},i);
 await expect(original).toContainText('Before hidden');
 expect(await page.evaluate(()=>(window as any).__hiddenMutations)).toBe(0);
 await page.evaluate(()=>{const w=window as any;w.__hiddenObserver.disconnect();w.__demoRun.status='waiting';w.__demoRun.approvals=[{id:'new-approval',method:'commandExecution',detail:JSON.stringify({command:'echo latest approval'})}];w.__emit();});
 await page.locator('.tree-task > button:first-child').filter({hasText:'任务体验验收'}).click();
 await expect(page.locator('.conversation-page:visible')).toContainText('After hidden 4');
 await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('Draft survives hidden updates');
 await expect(page.getByLabel('待执行命令')).toHaveText('echo latest approval');
});

test('shadcn plan keeps streaming counts while collapsed and restores its disclosure after process folding',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const w=window as any,r=w.__demoRun;r.status='running';r.approvals=[];r.messages=r.messages.slice(0,1);r.plans=[{turnKey:'u',explanation:'Plan details on demand',steps:[{step:'Inspect current code',status:'inProgress'},{step:'Verify changes',status:'pending'}]}];w.__emit();});
 const plan=page.getByLabel('任务清单'),toggle=plan.locator('[data-slot=trace-collapsible-trigger]');
 await expect(toggle).toContainText('0/2');await expect(plan).toContainText('Inspect current code');
 await toggle.click();await expect(plan.getByText('Inspect current code',{exact:true})).toHaveCount(0);
 await page.evaluate(()=>{const w=window as any,p=w.__demoRun.plans[0];p.steps[0].status='completed';p.steps[1].status='inProgress';w.__emit();});
 await expect(toggle).toContainText('1/2');await expect(toggle).toHaveAttribute('aria-expanded','false');
 await page.locator('.turn-progress-toggle').click();await page.locator('.turn-progress-toggle').click();
 await expect(toggle).toHaveAttribute('aria-expanded','false');await toggle.click();await expect(plan).toContainText('Verify changes');
 await page.evaluate(()=>{const w=window as any;w.__demoRun.plans[0].steps[1].status='completed';w.__demoRun.status='completed';w.__emit();});
 await expect(page.locator('.process-panel')).toHaveCount(0);await page.locator('.turn-progress-toggle').click();await expect(toggle).toContainText('2/2');
});

test('versioned streaming recovers a missing patch and preserves historical DOM',async({page})=>{
 await prepare(page,'Initial answer');
 await page.evaluate(async()=>{
  const w=window as any,{createRunPublisher}=await import('/electron/run-events.mjs');
  w.__publisher=createRunPublisher('test-session');
  w.__wire=(skip=false)=>{const event=w.__publisher.encode(w.__demoRun);if(!skip)w.__wireReceive(event);};
  w.__wireReceive=w.__emitEvent;
  w.desktop.getRunSnapshot=async({id}:any)=>{w.__recoveries=(w.__recoveries||0)+1;return structuredClone(w.__publisher.snapshot(id));};
  w.__wire();
 });
 await page.evaluate(()=>{const w=window as any;w.__demoRun.messages.at(-1).text='First delta';w.__wire(true);w.__demoRun.messages.at(-1).text='Recovered latest text';w.__demoRun.status='running';w.__demoRun.approvals=[];w.__wire();});
 await expect(page.locator('.markdown')).toContainText('Recovered latest text');
 expect(await page.evaluate(()=>(window as any).__recoveries)).toBe(1);
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='waiting';w.__demoRun.approvals=[{id:'delta-approval',method:'commandExecution',detail:'{"command":"echo delta"}'}];w.__wire();});
 await expect(page.getByLabel('待执行命令')).toHaveText('echo delta');
});

test('long tool output is fetched only on disclosure and pages without losing text',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const w=window as any,r=w.__demoRun;r.status='running';r.approvals=[];r.messages=r.messages.slice(0,1);r.tools=[{id:'paged',turnKey:'u',type:'commandExecution',label:'cat log',status:'completed',detail:'Tail preview',detailPreview:true,detailVersion:'v1'}];w.__detailReads=[];w.desktop.getToolText=async(input:any)=>{w.__detailReads.push(input);const text='BEGIN '+('x'.repeat(100000))+' END',offset=input.offset??text.length-64000;return {text:text.slice(offset,offset+64000),total:text.length,offset,version:'v1'};};w.__emit();});
 const tool=page.locator('.process-entry.commandExecution'),toggle=tool.locator('[data-slot=trace-collapsible-trigger]');
 expect(await page.evaluate(()=>(window as any).__detailReads.length)).toBe(0);
 await toggle.click();await expect(tool.getByLabel('工具输出')).toContainText('END');
 await tool.getByRole('button',{name:'上一页',exact:true}).click();await expect(tool.getByLabel('工具输出')).toContainText('BEGIN');
 await toggle.click();await expect(tool.getByLabel('工具输出')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__detailReads.length)).toBe(2);
});

test('visited history is actually unmounted and disclosure state survives remount',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const w=window as any,r=w.__demoRun;r.status='completed';r.approvals=[];r.messages=Array.from({length:120},(_,i)=>[{id:'u'+i,role:'user',text:'Question '+i},{id:'a'+i,role:'assistant',phase:'final_answer',text:('Answer '+i+'\n\n').repeat(20)}]).flat();w.__emit();});
 const first=page.locator('[data-turn-id=u0]'),last=page.locator('[data-turn-id=u119]');
 const navigation=page.getByRole('navigation',{name:'对话轮次导航'});
 await navigation.getByRole('button').first().click();await first.locator('.turn-progress-toggle').click();
 await page.getByRole('textbox',{name:'继续对话'}).focus();
 await page.getByRole('button',{name:'回到最新消息'}).click();await expect(last).toBeVisible();
 await expect(first.locator('.turn-progress-toggle')).toHaveCount(0);
 expect(await page.locator('[data-turn-id] [data-message-role=user]').count()).toBeLessThan(25);
 await navigation.getByRole('button').first().click();await expect(first.locator('.turn-progress-toggle')).toHaveAttribute('aria-expanded','true');
});

test('evicted conversations restore the same reading turn and draft',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{
  const w=window as any,r=w.__demoRun;r.status='completed';r.approvals=[];
  r.messages=Array.from({length:60},(_,i)=>[
   {id:'read-u'+i,role:'user',text:'Question '+i},
   {id:'read-a'+i,role:'assistant',phase:'final_answer',text:('Answer '+i+'\n\n').repeat(20)},
  ]).flat();
  w.__emit();
  for(let i=0;i<4;i++)w.__emitEvent({...r,id:'recent-'+i,title:'Recent '+i,messages:[{id:'recent-turn-'+i,role:'user',text:'Other session'}]});
 });
 const viewport=page.locator('.conversation-scroll:visible');
 const reading=()=>viewport.evaluate(el=>{
  const top=el.getBoundingClientRect().top;
  const row=[...el.querySelectorAll<HTMLElement>('[data-turn-id]')].find(item=>item.getBoundingClientRect().bottom>top);
  return {id:row?.dataset.turnId,offset:row?row.getBoundingClientRect().top-top:0};
 });
 await page.getByRole('navigation',{name:'对话轮次导航'}).getByRole('button',{name:/^第 25 轮：/}).click();
 await viewport.evaluate(el=>{el.scrollTop+=55;});
 await expect.poll(async()=>(await reading()).id).toBe('read-u24');
 await page.getByRole('textbox',{name:'继续对话'}).fill('Keep this draft');
 const anchor=await reading();
 for(let i=0;i<4;i++)await page.locator('.tree-task > button:first-child').filter({hasText:'Recent '+i}).click();
 await expect(page.locator('.conversation-page')).toHaveCount(3);
 await expect(page.locator('[data-turn-id^="read-u"]')).toHaveCount(0);
 await page.locator('.tree-task > button:first-child').filter({hasText:'任务体验验收'}).click();
 await expect.poll(async()=>(await reading()).id).toBe(anchor.id);
 await expect.poll(async()=>Math.abs((await reading()).offset-anchor.offset)).toBeLessThan(3);
 await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('Keep this draft');
});

test('storage backpressure is visible without hiding approvals or losing the composer draft',async({page})=>{
 await prepare(page,'已有结果');
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='running';w.__demoRun.approvals=[];w.__demoRun.storageBackpressure=true;w.__emit();});
 await expect(page.getByText('正在保存输出 · 暂缓接收，保存后自动继续')).toBeVisible();
 const composer=page.getByRole('textbox',{name:'继续对话'});await composer.fill('补充要求仍然保留');
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='waiting';w.__demoRun.approvals=[{id:'new',method:'item/commandExecution/requestApproval',detail:JSON.stringify({command:'echo review',cwd:'/fixture'})}];w.__emit();});
 await expect(page.getByRole('region',{name:'执行授权'})).toBeVisible();await expect(composer).toHaveValue('补充要求仍然保留');
 await page.evaluate(()=>{const w=window as any;w.__demoRun.storageBackpressure=false;w.__emit();});
 await expect(page.getByText('正在保存输出 · 暂缓接收，保存后自动继续')).toHaveCount(0);await expect(composer).toHaveValue('补充要求仍然保留');
});

test('long message previews page from the beginning, copy the full message and preserve supplements during updates',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const w=window as any,r=w.__demoRun;r.status='completed';r.approvals=[];r.tools=[];r.messages=[r.messages[0],{id:'long-answer',role:'assistant',phase:'final_answer',text:'ENDING preview',textPreview:true,textVersion:'v1',textChars:100010}];w.__messageReads=[];w.desktop.getMessageText=async(input:any)=>{w.__messageReads.push(input);const text='BEGIN '+('x'.repeat(100000))+' END',offset=input.offset??0;return {text:text.slice(offset,offset+64000),offset,total:text.length,version:'v1'};};w.desktop.copyRunMessages=async(input:any)=>{w.__fullCopy=input;};w.__emit();});
 await expect(page.getByText('正文较长，当前显示末尾片段')).toBeVisible();expect(await page.evaluate(()=>(window as any).__messageReads.length)).toBe(0);
 const composer=page.getByRole('textbox',{name:'继续对话'});await composer.fill('补充：保留原有验收要求');
 await page.getByRole('button',{name:'分段查看全文',exact:true}).click();await expect(page.locator('.markdown')).toContainText('BEGIN');
 await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.locator('.markdown')).toContainText('END');
 await page.getByRole('button',{name:'拷贝',exact:true}).click();expect(await page.evaluate(()=>(window as any).__fullCopy)).toEqual({id:'demo',messageIds:['long-answer']});
 await page.getByRole('button',{name:'收起全文',exact:true}).click();await expect(page.locator('.markdown')).toHaveText('ENDING preview');await expect(composer).toHaveValue('补充：保留原有验收要求');
});

test('paged reasoning stays lazy and authoritative pending input survives a refreshed body',async({page})=>{
 await prepare(page,'');
 await page.evaluate(()=>{const w=window as any,r=w.__demoRun;r.status='running';r.approvals=[];r.tools=[];r.messages=[r.messages[0],{id:'reason',role:'assistant',kind:'reasoning',text:'reason tail',textPreview:true,textVersion:'v1',status:'running'}];w.__messageReads=[];w.desktop.getMessageText=async(input:any)=>{w.__messageReads.push(input);return {text:'Reasoning first page',offset:0,total:100000,version:'v1'};};w.__emit();});
 expect(await page.evaluate(()=>(window as any).__messageReads.length)).toBe(0);
 const reasoning=page.locator('.process-entry.reasoning');await reasoning.locator('[data-slot=trace-collapsible-trigger]').click();await expect(reasoning.getByRole('region',{name:'思考过程'})).toHaveText('Reasoning first page');
 await page.evaluate(()=>{const w=window as any;w.__demoRun.status='waiting';w.__demoRun.approvals=[{id:'read-later',method:'item/commandExecution/requestApproval',detail:JSON.stringify({command:'echo preserved'})}];w.__emit();});
 await expect(page.getByLabel('待执行命令')).toHaveText('echo preserved');
 await reasoning.locator('[data-slot=trace-collapsible-trigger]').click();await expect(reasoning.getByRole('region',{name:'思考过程'})).toHaveCount(0);
});

for(const height of [650,1100])test(`short last-turn navigation leaves no trailing spacer ${height}`,async({page})=>{
 await page.setViewportSize({width:1240,height});await prepare(page,'初始回答');
 await page.evaluate(()=>{const r=(window as any).__demoRun;r.status='running';r.approvals=[];r.messages=[{id:'u1',role:'user',text:'第一轮'},{id:'a1',role:'assistant',phase:'final_answer',text:'历史内容\n\n'.repeat(50)},{id:'u2',role:'user',text:'第二轮'},{id:'r2',role:'assistant',kind:'reasoning',status:'completed',text:'执行记录\n\n'.repeat(40)},{id:'a2',role:'assistant',phase:'final_answer',text:'简短的最终回答。'}];(window as any).__emit();});
 const viewport=page.locator('.conversation-scroll'),spacer=page.locator('[data-message-scroller-spacer]');
 const nav=page.getByRole('navigation',{name:'对话轮次导航'});
 await nav.getByRole('button').last().click();
 await expect.poll(()=>spacer.evaluate(el=>el.getBoundingClientRect().height)).toBe(0);
 await page.evaluate(()=>{(window as any).__demoRun.status='completed';(window as any).__emit();});
 await nav.getByRole('button').first().click();await nav.getByRole('button').last().click();
 await expect.poll(()=>viewport.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)).toBeLessThan(2);
 const endGap=()=>page.locator('[data-turn-id="u2"]').evaluate(el=>el.closest('.conversation-scroll')!.getBoundingClientRect().bottom-el.getBoundingClientRect().bottom);
 await expect.poll(endGap).toBeLessThan(65);
 // Reflow and process collapse must not recreate blank anchoring space.
 const processToggle=page.locator('[data-turn-id="u2"] .turn-progress-toggle');
 await processToggle.click();await processToggle.click();
 await expect.poll(()=>spacer.evaluate(el=>el.getBoundingClientRect().height)).toBe(0);
 await expect.poll(endGap).toBeLessThan(65);
 await page.setViewportSize({width:1240,height:height+200});
 await expect.poll(()=>spacer.evaluate(el=>el.getBoundingClientRect().height)).toBe(0);
 await expect.poll(endGap).toBeLessThan(65);
 await nav.getByRole('button').first().click();
 await expect(page.getByRole('button',{name:'回到最新消息'})).toBeVisible();
 await page.getByRole('button',{name:'回到最新消息'}).click();
 await expect.poll(endGap).toBeLessThan(65);
});

test('clipboard images and files become removable attachments without changing the text draft',async({page})=>{
 await prepare(page,'完成');await page.getByRole('button',{name:'批准本次',exact:true}).click();
 await page.evaluate(()=>{window.desktop!.importAttachments=async files=>{(window as any).__pasted=await Promise.all(files.map(async f=>({name:f.name,type:f.type,bytes:Array.from(new Uint8Array(await f.arrayBuffer()))})));return new Promise(resolve=>{(window as any).__finishPaste=()=>resolve(files.map(f=>({name:f.name,path:'/pasted/'+f.name})));});};});
 const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('请分析这些文件');
 const paste=()=>input.evaluate(el=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array([137,80,78,71])],'截图.png',{type:'image/png'}));data.items.add(new File(['document'],'报告.txt',{type:'text/plain'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await paste();await expect(page.getByText('正在添加附件…')).toBeVisible();
 await expect(page.getByRole('button',{name:'发送后续消息',exact:true})).toBeDisabled();
 await input.press('Enter');await expect(input).toHaveValue('请分析这些文件');
 await page.evaluate(()=>(window as any).__finishPaste());
 const attachments=page.getByLabel('附件',{exact:true});await expect(attachments.getByText('截图.png')).toBeVisible();await expect(attachments.getByText('报告.txt')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__pasted[0].bytes)).toEqual([137,80,78,71]);
 await page.evaluate(()=>{delete (window as any).__finishPaste;});
 await paste();
 await page.waitForFunction(()=>typeof (window as any).__finishPaste==='function');
 await page.evaluate(()=>(window as any).__finishPaste());
 await expect(page.getByRole('button',{name:'发送后续消息',exact:true})).toBeEnabled();
 await expect(attachments.locator('[data-slot=attachment]')).toHaveCount(2);
 await page.getByRole('button',{name:'移除附件 截图.png'}).click();await expect(attachments.getByText('截图.png')).toHaveCount(0);await expect(input).toHaveValue('请分析这些文件');
 await page.evaluate(()=>{window.desktop!.importAttachments=async()=>{throw Error('单次粘贴内容不能超过 25 MB');};});await paste();await expect(page.getByRole('alert')).toContainText('25 MB');await expect(attachments.getByText('报告.txt')).toBeVisible();
 // Text-only paste is left to the browser, without cancellation or IPC import.
 expect(await input.evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','普通文本');return el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));})).toBe(true);
 await page.evaluate(()=>{window.desktop!.startRun=async payload=>{(window as any).__attachmentInput=payload;return structuredClone((window as any).__demoRun);};});
 await input.fill('');await page.getByRole('button',{name:'发送后续消息',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__attachmentInput)).toMatchObject({prompt:'请查看所附文件。',attachments:[{name:'报告.txt',path:'/pasted/报告.txt'}]});
});

test('pasted image thumbnails preview, remove and persist in sent messages',async({page})=>{
 await prepare(page,'完成');await page.getByRole('button',{name:'批准本次',exact:true}).click();
 await page.evaluate(()=>{
  window.desktop!.importAttachments=async files=>files.map(f=>({name:f.name,path:'/pasted/'+f.name}));
  window.desktop!.readAttachmentImage=async input=>{
   const canvas=document.createElement('canvas');canvas.width=input.thumbnail?192:1400;canvas.height=input.thumbnail?120:900;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='#d7e9f5';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#24495b';ctx.font=`${input.thumbnail?16:80}px sans-serif`;ctx.fillText('Image preview',20,canvas.height/2);
   return {dataUrl:canvas.toDataURL()};
  };
  window.desktop!.startRun=async payload=>{const w=window as any;w.__imageSend=payload;w.__demoRun.messages.push({id:'image-user',role:'user',text:payload.prompt+'\n\n附件：\n'+payload.attachments!.map(f=>f.path).join('\n'),attachments:payload.attachments});w.__emit();return structuredClone(w.__demoRun);};
 });
 const input=page.getByRole('textbox',{name:'继续对话'}),composer=page.locator('form.composer:visible');await input.fill('分析这张截图');
 const paste=()=>input.evaluate(el=>{const data=new DataTransfer();data.items.add(new File(['image'],'截图.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await paste();const thumb=composer.getByAltText('截图.png');await expect(thumb).toBeVisible();
 await expect.poll(()=>thumb.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(192);
 const trigger=composer.getByRole('button',{name:'预览图片 截图.png'});await trigger.click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'截图.png'})).toBeVisible();await expect(dialog.getByAltText('截图.png')).toBeVisible();
 await expect.poll(()=>dialog.getByAltText('截图.png').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(1400);
 expect((await dialog.getByAltText('截图.png').boundingBox())!.width).toBeGreaterThan((await thumb.boundingBox())!.width*3);
 await dialog.getByRole('button',{name:'原始尺寸',exact:true}).click();await expect(dialog.getByRole('button',{name:'适应窗口',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
 await composer.getByRole('button',{name:'移除附件 截图.png'}).click();await expect(composer.locator('[data-slot=attachment]')).toHaveCount(0);await expect(dialog).toHaveCount(0);await expect(input).toHaveValue('分析这张截图');
 await paste();await expect(thumb).toBeVisible();await composer.getByRole('button',{name:'发送后续消息',exact:true}).click();
 const message=page.locator('[data-turn-id="image-user"] [data-message-role="user"]');await expect(message.getByAltText('截图.png')).toBeVisible();await expect(message.locator('[data-slot=bubble-content]')).toHaveText('分析这张截图');
 await message.getByRole('button',{name:'预览图片 截图.png'}).click();await expect(dialog.getByAltText('截图.png')).toBeVisible();await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);await page.screenshot({path:test.info().outputPath('amble-image-attachments-light.png')});
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark');});
 await message.getByRole('button',{name:'预览图片 截图.png'}).click();await expect(dialog.getByAltText('截图.png')).toBeVisible();await expect(dialog).toHaveCSS('opacity','1');await page.screenshot({path:test.info().outputPath('amble-image-preview-dark.png')});
 await page.keyboard.press('Escape');await page.setViewportSize({width:560,height:840});await message.getByRole('button',{name:'预览图片 截图.png'}).click();
 const box=await dialog.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(561);
});

test('legacy image messages support previews and missing files show a useful error',async({page})=>{
 await prepare(page,'完成');await page.getByRole('button',{name:'批准本次',exact:true}).click();
 await page.evaluate(()=>{window.desktop!.readAttachmentImage=async()=>{throw Error('图片文件不可访问，可能已移动或删除');};const w=window as any;w.__demoRun.messages[0].text='旧的图片消息\n\n附件：\n/pasted/old.png';w.__emit();});
 const message=page.locator('[data-message-role="user"]');await expect(message.locator('[data-slot=bubble-content]')).toHaveText('旧的图片消息');await expect(message.getByText('图片不可用')).toBeVisible();
 await message.getByRole('button',{name:'预览图片 old.png'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('图片文件不可访问，可能已移动或删除');
 await page.keyboard.press('Escape');await expect(page.getByRole('textbox',{name:'继续对话'})).toBeEditable();
});


test('100 Hz versioned streaming preserves terminal state, exact copied text and draft',async({page})=>{
 test.setTimeout(60000);await prepare(page,'');
 const require=createRequire(process.cwd()+'/package.json'),source=require('node:fs').readFileSync(require.resolve('./electron/run-events.mjs'),'utf8');
 await page.route('**/__probe/run-events.mjs',route=>route.fulfill({contentType:'text/javascript',body:source}));
 await page.evaluate(async()=>{
  const w=window as any;
  const {createRunPublisher}=await import(/* @vite-ignore */'/__probe/run-events.mjs');
  const publisher=createRunPublisher('100hz-regression'),run=w.__demoRun;
  run.status='running';run.approvals=[];run.messages=[{id:'u',role:'user',text:'Deterministic stream'},{id:'a',role:'assistant',phase:'final_answer',text:''}];
  w.desktop.getRunSnapshot=async()=>structuredClone(publisher.snapshot(run.id));w.__emitEvent(publisher.encode(run));
  w.__stream={sent:0,done:false,started:performance.now()};
  // Windows can wake timers later than 10 ms. Send all elapsed slots so the
  // producer rate is independent of timer granularity, then assert the rate.
  const tick=()=>{try{const due=Math.min(800,Math.floor((performance.now()-w.__stream.started)/10)+1);while(w.__stream.sent<due){const i=w.__stream.sent;run.messages[1].text+=i+' 中文😀\n';w.__emitEvent(publisher.encode(run));w.__stream.sent++;}if(w.__stream.sent===800){run.status='completed';w.__emitEvent(publisher.encode(run));w.__stream.done=true;w.__stream.elapsed=performance.now()-w.__stream.started;}else setTimeout(tick,5);}catch(error){w.__stream.error=String(error);w.__stream.done=true;}};tick();
 });
 await page.waitForFunction(()=>(window as any).__stream.sent>=30);
 const composer=page.getByRole('textbox',{name:'继续对话',exact:true});await composer.fill('Unsent draft during 100 Hz output');
 await page.waitForFunction(()=>(window as any).__stream.done,{},{timeout:30000});
 await expect(page.locator('.turn-actions')).toHaveCount(1);
 await expect(composer).toHaveValue('Unsent draft during 100 Hz output');
 await page.locator('.turn-actions').getByRole('button',{name:'拷贝',exact:true}).click();
 const copied=await page.evaluate(()=>(window as any).__copiedText),expected=Array.from({length:800},(_,i)=>i+' 中文😀\n').join('');
 const hash=(text:string)=>require('node:crypto').createHash('sha256').update(text).digest('hex');
 expect(hash(copied)).toBe(hash(expected));expect(copied.length).toBe(expected.length);
 const metrics=await page.evaluate(()=>(window as any).__stream);expect(metrics.error).toBeUndefined();expect(metrics.sent).toBe(800);expect(metrics.sent*1000/metrics.elapsed).toBeGreaterThan(90);
 await test.info().attach('stream-integrity',{body:JSON.stringify({sent:metrics.sent,elapsedMs:metrics.elapsed,rateHz:metrics.sent*1000/metrics.elapsed,length:copied.length,sha256:hash(copied),completed:true,draftPreserved:true}),contentType:'application/json'});
});

test('current model failures can be dismissed and an older turn cannot leave a warning in the composer',async({page})=>{
 await prepare(page,'Done');
 const update=async(id:string,startedAt:string)=>page.evaluate(({id,startedAt})=>{
  const w=window as any,run=w.__demoRun;
  run.messages[0].timing={startedAt:'2026-11-20T01:42:00Z'};
  run.modelChange={id,startedAt,state:'failed',effective:null,previous:{model:'old'},requested:{model:'deepseek-flash'},error:'模型切换已停止'};
  w.__emit();
 },{id,startedAt});
 const warning=page.getByRole('button',{name:/deepseek-flash.*模型切换失败/});
 await update('current','2026-11-20T01:42:01Z');await expect(warning).toBeVisible();
 await warning.click();await page.getByRole('button',{name:'关闭提示'}).click();await expect(warning).toHaveCount(0);
 await update('another-attempt','2026-11-20T01:42:02Z');await expect(warning).toBeVisible();
 await update('old','2026-11-20T01:41:23Z');await expect(warning).toHaveCount(0);
});

test('completed commentary folds behind the duration and turn ticks preview the question', async ({page}, testInfo) => {
 await page.setViewportSize({width:1280,height:820});
 await prepare(page, '');
 await page.evaluate(()=>{
  const w=window as any, run=w.__demoRun;
  run.status='completed';run.approvals=[];
  run.messages=['梳理消息列表的渲染路径','检查流式回复的更新频率','定位长会话的性能瓶颈','如何验证优化效果？'].flatMap((text,index)=>{
   const key='audit-'+index;
   return [
    {id:key,role:'user',text,timing:{startedAt:'2026-11-20T01:00:00Z',durationMs:69000,outcome:'completed'}},
    {id:'conversation:'+key,role:'assistant',phase:'commentary',agentRole:'conversation',text:'我会先检查消息更新和滚动行为，再整理回归验证步骤。'},
    {id:key+'-thought',role:'assistant',kind:'reasoning',text:'核对历史消息数量和流式更新时的阅读位置。'},
    {id:key+'-answer',role:'assistant',phase:'final_answer',text:index===3?'**先验证阅读位置，再比较渲染耗时。** 使用同一段长会话，分别记录发送消息、向上阅读和回到末尾三个动作。\n\n- 向上阅读时，新回复到达后应停留在原段落。\n- 回到末尾后，新消息应继续自动跟随。\n- 保持窗口尺寸和消息数量一致，比较两次录制结果。':'已记录检查结果，继续核对下一项。'}
   ];
  });
  w.__emit();
 });
 const turn=page.locator('[data-turn-id="audit-3"]');
 await expect(turn).toContainText('先验证阅读位置');
 await page.locator('.conversation-scroll:visible').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:testInfo.outputPath('chat.png'),animations:'disabled'});
 const summary=turn.locator('.turn-progress-toggle');
 await expect(summary).toHaveAccessibleName(/用时 1 分 9 秒/);
 await expect(summary).not.toContainText('本轮已结束');
 await expect(turn.getByText('我会先检查消息更新和滚动行为，再整理回归验证步骤。')).toHaveCount(0);
 await summary.click();
 await expect(turn.getByText('我会先检查消息更新和滚动行为，再整理回归验证步骤。')).toBeVisible();
 const tick=page.getByRole('button',{name:'第 4 轮：如何验证优化效果？'});
 await expect(tick).toHaveText('');
 await tick.hover();
 await expect(page.getByRole('tooltip')).toContainText('如何验证优化效果？');
});

test('chat palette distinguishes inline code, links and the input surface',async({page},testInfo)=>{
 await page.setViewportSize({width:1280,height:820});
 await prepare(page,'验证 `scrollTop`、`scrollHeight` 和 `clientHeight`，再查看[滚动记录](https://example.org/log)。');
 const reply=page.locator('.markdown').filter({hasText:'滚动记录'}).last();
 await expect(reply.locator('code')).toHaveCount(3);
 await page.evaluate(()=>document.fonts.ready);
 await reply.screenshot({path:testInfo.outputPath('inline.png')});
 await expect(reply.locator('code').first()).toHaveCSS('background-color','rgb(240, 240, 240)');
 await expect(reply.getByRole('link')).toHaveCSS('color','rgb(65, 108, 194)');
 await expect(page.locator('main.chat-main')).toHaveCSS('background-color','rgb(255, 255, 255)');
 await expect(page.locator('.workspace-sidebar-container [data-slot=sidebar-inner]:visible')).toHaveCSS('background-color','rgb(246, 246, 246)');
});

for (const sample of [
 {kind:'camel identifier',prefix:'对照这条自动生成的测试名，确认失败的是哪一个场景：',value:'shouldRestoreFirstVisibleMessageAndPreserveOffsetAfterPrependingOlderConversationHistoryWhileAssistantResponseIsStreaming'},
 {kind:'file path',prefix:'先从诊断目录取出这次的滚动记录，核对 ',value:'/Users/gavin/Library/Application Support/Ambleloft/projects/chat-rendering/diagnostics/2026-11-20/scroll-anchor-snapshot.json'}
]) test(`a long inline ${sample.kind} wraps at component boundaries and copies verbatim`,async({page,context})=>{
 await page.setViewportSize({width:1394,height:947});
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await prepare(page,'- '+sample.prefix+'`'+sample.value+'`。');
 const code=page.locator('.conversation-content li code').filter({hasText:sample.value});
 const lines=await code.evaluate(el=>{
  const lines:string[]=[];
  let lastY=NaN;
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),range=document.createRange();
  for(let node=walker.nextNode();node;node=walker.nextNode()){
   for(let index=0;index<node.textContent!.length;index++){
    range.setStart(node,index);range.setEnd(node,index+1);
    const y=range.getBoundingClientRect().top;
    if(y!==lastY){lines.push('');lastY=y;}
    lines[lines.length-1]+=node.textContent![index];
   }
  }
  return lines;
 });
 expect(lines.length).toBeGreaterThan(1);
 expect(lines.join('')).toBe(sample.value);
 if(sample.kind==='file path'){
  for(const line of lines.slice(0,-1))expect(line).toMatch(/\/$/);
  expect(lines.some(line=>line.includes('Application Support/'))).toBe(true);
 }else{
  for(const continuation of lines.slice(1))expect(continuation).toMatch(/^[A-Z]/);
 }
 await code.evaluate(el=>{
  const range=document.createRange();range.selectNodeContents(el);
  const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);
 });
 await page.keyboard.press('ControlOrMeta+c');
 await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(sample.value);
});

test('standalone file links download, show one dismissible error and can be retried with a draft',async({page})=>{
 await prepare(page,'[下载配置表](</fixture/配置 表.xlsx>)');
 await page.evaluate(()=>{
  const w=window as any;
  w.__downloads=[];
  w.desktop.downloadArtifact=async(input:any)=>{
   w.__downloads.push(input);
   if(w.__downloads.length===1)throw Error("Error invoking remote method 'artifact:download': Error: 文件已移动");
  };
  w.__demoRun.status='completed';w.__demoRun.approvals=[];w.__emit();
 });
 const draft=page.getByRole('textbox',{name:'继续对话',exact:true});
 await draft.fill('未发送的草稿');
 const link=page.getByRole('link',{name:'下载配置表'});
 await link.click();
 const notice=page.getByRole('alert').filter({hasText:'文件已移动'});
 await expect(notice).toBeVisible();await expect(notice).not.toContainText('remote method');
 await notice.getByRole('button',{name:'关闭提示'}).click();await expect(notice).toHaveCount(0);
 await link.click();
 expect(await page.evaluate(()=>(window as any).__downloads)).toEqual(Array(2).fill({runId:'demo',path:'/fixture/配置 表.xlsx'}));
 await expect(notice).toHaveCount(0);await expect(draft).toHaveValue('未发送的草稿');
});
