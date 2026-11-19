import {test,expect,type Page} from '@playwright/test';
test.describe.configure({timeout:60000});

async function mount(page:Page){
 await page.evaluate(async()=>{
  await import('/src/shadcn.css');await import('/src/styles.css');
  const React=(await import('/node_modules/.vite/deps/react.js')).default,DOM=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {default:Conversation}=await import('/src/Conversation.tsx');
  const w=window as any;w.desktop={...w.desktop,importAttachments:async(files:File[])=>files.map(f=>({name:f.name,path:'C:/draft-fixture/'+f.name})),readAttachmentImage:async()=>({dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='})};
  document.getElementById('preview')!.className='chat-main';document.getElementById('preview')!.style.cssText='height:800px;max-width:1000px;margin:auto';
  const root=DOM.createRoot(document.getElementById('preview')!);w.send=async()=>{};
  w.renderRun=(id='draft-a',status='completed',text='Answer')=>root.render(React.createElement(Conversation,{key:id,run:{...w.fixtureHistory,id,title:id,model:'fixture',baseUrl:'http://localhost',cwd:'C:/draft-fixture',status,messages:w.fixtureMessages||[{id:'u',role:'user',text:'Question'},{id:'a',role:'assistant',text}],tools:[],approvals:[]},catalog:{providers:[]},visible:true,send:(...args:any[])=>w.send(...args),stop:()=>{},approve:async()=>{},openSettings:()=>{},openChanges:()=>{},submitting:false}));w.renderRun();
 });
 await expect(page.getByRole('textbox',{name:'继续对话'})).toBeVisible();
}
async function start(page:Page){await page.goto('/tests/fixtures/declarative-ui.html');await mount(page);}
async function reload(page:Page){await page.reload({waitUntil:'domcontentloaded'});await mount(page);}
test('streaming, immediate reload and conversation switches preserve separate unsent drafts',async({page})=>{
 await start(page);const input=page.getByRole('textbox',{name:'继续对话'}),text='中文 English 😀\n"quote" \\ draft';await input.fill(text);
 await page.evaluate(()=>(window as any).renderRun('draft-a','running','streamed update'));await expect(input).toHaveValue(text);
 await reload(page);await expect(input).toHaveValue(text);
 await page.evaluate(()=>(window as any).renderRun('draft-b'));await expect(input).toHaveValue('');await input.fill('second conversation');
 await page.evaluate(()=>(window as any).renderRun('draft-a'));await expect(input).toHaveValue(text);
 await page.evaluate(()=>(window as any).renderRun('draft-b'));await expect(input).toHaveValue('second conversation');
});
test('pasted attachments and failed sends survive reload; successful send preserves new typing only',async({page})=>{
 await start(page);const input=page.getByRole('textbox',{name:'继续对话'}),composer=page.locator('form.composer:visible');await input.fill('keep files and text');
 await input.evaluate(el=>{const data=new DataTransfer();data.items.add(new File(['file'],'报告.txt',{type:'text/plain'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await expect(composer.getByText('报告.txt')).toBeVisible();await reload(page);await expect(input).toHaveValue('keep files and text');await expect(composer.getByText('报告.txt')).toBeVisible();
 await page.evaluate(()=>(window as any).send=async()=>{throw Error('fixture send failed');});await page.getByRole('button',{name:'发送后续消息',exact:true}).click();await expect(page.getByRole('alert')).toContainText('fixture send failed');
 await reload(page);await expect(input).toHaveValue('keep files and text');await expect(composer.getByText('报告.txt')).toBeVisible();
 await page.evaluate(()=>{const w=window as any;w.send=()=>new Promise(resolve=>w.finishSend=resolve);});await page.getByRole('button',{name:'发送后续消息',exact:true}).click();await expect(input).toHaveValue('');await input.fill('new typing during send');await page.evaluate(()=>(window as any).finishSend());
 await expect(composer.getByText('报告.txt')).toHaveCount(0);await reload(page);await expect(input).toHaveValue('new typing during send');await expect(composer.getByText('报告.txt')).toHaveCount(0);
 await input.fill('');await reload(page);await expect(input).toHaveValue('');
});
test('unavailable draft storage keeps editing usable and warns before reload',async({page})=>{
 await start(page);await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError');};});
 const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('copy this before reload');await expect(input).toHaveValue('copy this before reload');await expect(page.getByRole('alert')).toContainText('刷新前请先复制');
});
test('reloading a saved draft preserves its identity and uses the latest optimistic revision',async({page})=>{
 await page.addInitScript(()=>{
  const draft={id:'saved-draft',conversationId:'conversation',title:'Saved draft',prompt:'Original',projectId:null,modelId:'',status:'draft',createdAt:'today',revision:1};
  const state={tasks:[draft],projects:[],theme:'light',revision:1,settingsRevision:0};const w=window as any;
  w.desktop={readWorkspace:async()=>structuredClone(state),getProvider:async()=>({configured:true,model:'fixture',baseUrl:'http://localhost/v1'}),getDevice:async()=>({name:'Windows fixture'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},onOpenConversation:(fn:any)=>{w.openDraft=()=>fn({kind:'draft',recordId:'saved-draft'});return()=>{};},startRun:async(input:any)=>{w.sent=input;return {id:'run',title:'Sent',status:'completed',messages:[],tools:[],approvals:[],model:'fixture',createdAt:'today'};}};
  w.advanceRevision=()=>{state.tasks[0].revision=2;state.revision=2;};
 });
 await page.goto('/');await page.waitForFunction(()=>!!(window as any).openDraft);await page.evaluate(()=>(window as any).openDraft());const input=page.getByRole('textbox',{name:'任务内容'});await expect(input).toHaveValue('Original');await input.fill('Edited unsent text');
 await page.reload({waitUntil:'domcontentloaded'});await expect(input).toHaveValue('Edited unsent text');await expect(page.locator('.draft-context-bar')).toContainText('Saved draft');
 await page.evaluate(()=>(window as any).advanceRevision());await page.getByRole('button',{name:'发送任务',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).sent)).toMatchObject({draftId:'saved-draft',draftRevision:2,prompt:'Edited unsent text'});
});
test('drafts from another window are not imported into this window',async({page,context})=>{
 await start(page);await page.getByRole('textbox',{name:'继续对话'}).fill('window one');const other=await context.newPage();await start(other);await expect(other.getByRole('textbox',{name:'继续对话'})).toHaveValue('');await other.getByRole('textbox',{name:'继续对话'}).fill('window two');await reload(page);await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('window one');await other.close();
});

for(const state of ['accepted','absent'] as const)test(`reload reconciles a pending send as ${state} without submitting again`,async({page})=>{
 await page.addInitScript(()=>{(window as any).desktop={composerSendStatus:async()=>({state:sessionStorage.getItem('server-state')||'pending',runId:'draft-a'})};});
 await start(page);await page.evaluate(()=>{(window as any).send=async()=>{sessionStorage.setItem('server-calls',String(Number(sessionStorage.getItem('server-calls')||0)+1));return new Promise(()=>{});};});
 const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('submitted body');await page.getByRole('button',{name:'发送后续消息',exact:true}).click();await expect(input).toHaveValue('');await input.fill('new unsent text');await reload(page);
 await expect(input).toHaveValue('new unsent text');await expect(page.getByRole('status').filter({hasText:'正在确认发送结果'})).toBeVisible();await input.press('Enter');expect(await page.evaluate(()=>sessionStorage.getItem('server-calls'))).toBe('1');
 await page.evaluate(value=>sessionStorage.setItem('server-state',value),state);
 await expect(input).toHaveValue(state==='accepted'?'new unsent text':'submitted body\n\nnew unsent text');await expect(page.getByRole('status').filter({hasText:'正在确认发送结果'})).toHaveCount(0);expect(await page.evaluate(()=>sessionStorage.getItem('server-calls'))).toBe('1');
});

test('storage failure prevents sending an unrecorded request',async({page})=>{
 await start(page);await page.getByRole('textbox',{name:'继续对话'}).fill('retain me');await page.evaluate(()=>{(window as any).send=async()=>{throw Error('MUST NOT SEND');};Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError');};});await page.getByRole('button',{name:'发送后续消息',exact:true}).click();await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('retain me');await expect(page.getByRole('alert')).toContainText('刷新前请先复制');
});

test('reload restores the reader anchor and per-turn disclosure without opening other turns',async({page})=>{
 await page.addInitScript(()=>{(window as any).fixtureMessages=Array.from({length:12},(_,i)=>[{id:'u'+i,role:'user',text:'Question '+i,timing:{outcome:'completed'}},{id:'thought'+i,role:'assistant',kind:'reasoning',text:'Thought '+i},{id:'a'+i,role:'assistant',phase:'final_answer',text:('Answer '+i+'\n\n').repeat(18)}]).flat();});
 await start(page);const viewport=page.getByRole('region',{name:'任务消息'}),turn=page.locator('[data-turn-id="u4"]');await expect.poll(()=>viewport.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(2);
 await page.getByRole('button',{name:'第 5 轮：Question 4',exact:true}).click();await turn.locator('.turn-progress-toggle').click();await expect(turn.locator('.turn-progress-toggle')).toHaveAttribute('aria-expanded','true');
 await page.evaluate(()=>{const viewport=document.querySelector('.conversation-scroll')!,anchor=document.querySelector('[data-turn-id="u4"]')!;viewport.scrollTop+=anchor.getBoundingClientRect().top-viewport.getBoundingClientRect().top-20;});
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('amble.reading.v1:draft-a')||'null')?.following)).toBe(false);await page.getByRole('textbox',{name:'继续对话'}).fill('reader draft');
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('amble.reading.v1:draft-a')!));await reload(page);
 await expect(turn.locator('.turn-progress-toggle')).toHaveAttribute('aria-expanded','true');await expect(page.getByRole('textbox',{name:'继续对话'})).toHaveValue('reader draft');
 await expect.poll(()=>page.locator(`[data-turn-id="${saved.turnId}"]`).evaluate((el,offset)=>Math.abs(el.getBoundingClientRect().top-el.closest('.conversation-scroll')!.getBoundingClientRect().top-offset),saved.offset)).toBeLessThan(3);
 await page.getByRole('button',{name:'第 6 轮：Question 5',exact:true}).click();await expect(page.locator('[data-turn-id="u5"] .turn-progress-toggle')).toHaveAttribute('aria-expanded','false');
});

test('expanded long message restores its page without loading the entire body',async({page})=>{
 await page.addInitScript(()=>{const w=window as any;w.fixtureMessages=[{id:'u',role:'user',text:'Long message'},{id:'long',role:'assistant',phase:'final_answer',text:'Tail preview',textPreview:true,textVersion:'v1'}];w.desktop={getMessageText:async({offset=0}:any)=>({text:('Page '+offset+'\n').padEnd(64000,'x'),offset,total:128000,version:'v1'})};});
 await start(page);await page.getByRole('button',{name:'分段查看全文',exact:true}).click();await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.locator('.markdown')).toContainText('Page 64000');await reload(page);await expect(page.getByRole('button',{name:'收起全文',exact:true})).toBeVisible();await expect(page.locator('.markdown')).toContainText('Page 64000');await expect(page.getByRole('button',{name:'下一页',exact:true})).toBeDisabled();
});

test('reload retrieves missing history pages to restore an older reading anchor',async({page})=>{
 await page.addInitScript(()=>{const w=window as any,all=Array.from({length:40},(_,i)=>[{id:'old-u'+i,role:'user',text:'Old question '+i,timing:{outcome:'completed'}},{id:'old-a'+i,role:'assistant',phase:'final_answer',text:('Old answer '+i+'\n\n').repeat(5)}]).flat(),paged=sessionStorage.getItem('reload-paged');w.fixtureMessages=paged?all.slice(40):all;w.fixtureHistory=paged?{historyBefore:'old-u20',turnOffset:20,totalTurns:40}:{};w.pagesRead=0;w.desktop={getRunPage:async()=>{w.pagesRead++;return {id:'draft-a',status:'completed',messages:all.slice(0,40),tools:[],approvals:[],historyBefore:null,turnOffset:0,totalTurns:40};}};});
 await start(page);const viewport=page.getByRole('region',{name:'任务消息'});await expect.poll(()=>viewport.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(2);await page.locator('[data-turn-id="old-u8"]').scrollIntoViewIfNeeded();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('amble.reading.v1:draft-a')||'null')?.following)).toBe(false);const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('amble.reading.v1:draft-a')!));await page.evaluate(()=>sessionStorage.setItem('reload-paged','1'));await reload(page);
 await expect.poll(()=>page.evaluate(()=>(window as any).pagesRead)).toBe(1);await expect.poll(()=>page.locator(`[data-turn-id="${saved.turnId}"]`).evaluate((el,offset)=>Math.abs(el.getBoundingClientRect().top-el.closest('.conversation-scroll')!.getBoundingClientRect().top-offset),saved.offset)).toBeLessThan(3);
});
