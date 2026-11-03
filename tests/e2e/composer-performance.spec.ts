import {test,expect} from '@playwright/test';

test('typing and deleting in long history avoids transcript renders and synchronous textarea measurement',async({page})=>{
 await page.goto('/tests/fixtures/declarative-ui.html');
 await page.evaluate(async()=>{
  await import('/src/shadcn.css');await import('/src/styles.css');await import('/src/workspace-polish.css');
  const React=(await import('/node_modules/.vite/deps/react.js')).default,DOM=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {default:Conversation}=await import('/src/Conversation.tsx');
  const messages=Array.from({length:40},(_,i)=>[{id:`u${i}`,role:'user',text:`Question ${i}`},{id:`a${i}`,role:'assistant',phase:'final_answer',get text(){(window as any).historyTextReads++;return ('## Result '+i+'\n\nA paragraph of **rich text** and `inline code`.\n\n').repeat(8)+'```typescript\nconst value = 42;\n```';}}]).flat();
  (window as any).historyTextReads=0;(window as any).textareaMeasurements=0;
  const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'scrollHeight')!;
  Object.defineProperty(Element.prototype,'scrollHeight',{configurable:true,get(){if(this.tagName==='TEXTAREA')(window as any).textareaMeasurements++;return descriptor.get!.call(this);}});
  document.getElementById('preview')!.style.cssText='height:800px;max-width:1000px;margin:auto';
  const run={id:'perf',title:'History',model:'test',baseUrl:'http://localhost',cwd:'/tmp',status:'completed',messages,tools:[],approvals:[]};
  DOM.createRoot(document.getElementById('preview')!).render(React.createElement(Conversation,{run,catalog:{providers:[]},visible:true,send:async()=>{},stop:()=>{},approve:async()=>{},openSettings:()=>{},openChanges:()=>{},submitting:false}));
 });
 const input=page.getByRole('textbox',{name:'继续对话'});await expect(input).toBeVisible();await input.focus();
 // Wait for retained history blocks and initial scroll anchoring to settle.
 let previous=-1;await expect.poll(async()=>{const count=await page.evaluate(()=>(window as any).historyTextReads);const stable=count===previous;previous=count;return stable;},{intervals:[100]}).toBe(true);
 await page.evaluate(()=>{(window as any).historyTextReads=0;(window as any).textareaMeasurements=0;});
 const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
 const before=await session.send('Performance.getMetrics');
 await input.pressSequentially('Typing a new draft while keeping the rich history untouched.');
 for(let i=0;i<20;i++)await input.press('Backspace');
 const after=await session.send('Performance.getMetrics');
 const counts=await page.evaluate(()=>({historyTextReads:(window as any).historyTextReads,textareaMeasurements:(window as any).textareaMeasurements}));
 console.log(JSON.stringify({counts,metrics:Object.fromEntries(after.metrics.filter(m=>['ScriptDuration','LayoutDuration','RecalcStyleDuration'].includes(m.name)).map(m=>[m.name,m.value-before.metrics.find(b=>b.name===m.name)!.value]))}));
 await expect(input).toHaveValue('Typing a new draft while keeping the rich history untouched.'.slice(0,-20));
 expect(counts.historyTextReads).toBe(0);expect(counts.textareaMeasurements).toBe(0);
});
