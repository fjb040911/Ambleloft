import {test,expect} from '@playwright/test';
test('opening an archived extension draft offers restore instead of an unsendable composer',async({page})=>{
 await page.addInitScript(()=>{
  const draft={id:'draft',conversationId:'conversation',title:'扩展草稿',prompt:'预填内容',projectId:null,modelId:'',status:'draft',createdAt:'today',archivedAt:'today',revision:1};
  let state:any={tasks:[draft],projects:[],theme:'light',revision:1,settingsRevision:0};
  (window as any).desktop={readWorkspace:async()=>structuredClone(state),patchWorkspace:async(input:any)=>{for(const c of input.changes)if(c.kind==='draft')state.tasks=[{...c.value,revision:2}];state.revision++;return structuredClone(state);},getProvider:async()=>({configured:false}),getDevice:async()=>({name:'Test'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},onOpenConversation:(fn:any)=>{(window as any).__openDraft=()=>fn({kind:'draft',recordId:'draft'});return()=>{};}};
 });
 await page.goto('/');await page.getByRole('textbox',{name:'任务内容'}).waitFor();await page.evaluate(()=>(window as any).__openDraft());
 await expect(page.getByRole('dialog')).toContainText('这份草稿已归档');
 await expect(page.getByRole('button',{name:'继续此任务',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'还原并继续'}).click();
 await expect(page.getByRole('textbox',{name:'任务内容'})).toHaveValue('预填内容');
 await expect(page.getByText('正在继续已有草稿',{exact:false})).toBeVisible();
 expect(await page.evaluate(async()=>{const s=await (window as any).desktop.readWorkspace();return {id:s.tasks[0].conversationId,archived:s.tasks[0].archivedAt};})).toEqual({id:'conversation',archived:null});
 await page.getByRole('button',{name:'以当前内容新建聊天'}).click();
 await expect(page.getByRole('textbox',{name:'任务内容'})).toHaveValue('预填内容');
 await expect(page.locator('.draft-context-bar')).toHaveCount(0);
});
