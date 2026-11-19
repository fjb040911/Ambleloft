import {test,expect,type Page} from '@playwright/test';
async function prepare(page:Page){
 await page.addInitScript(()=>{
  const w=window as any,employees=[{id:'pm',name:'产品经理',description:'需求分析'},{id:'arch',name:'架构师',description:'系统设计'},{id:'qa',name:'测试专家',description:'验证'},{id:'ops',name:'运维专家',description:'运行维护'},{id:'security',name:'安全专家',description:'安全检查'}];
  const state=JSON.parse(sessionStorage.getItem('parallel-state')||'null')||{id:'conversation',revision:0,anchor:{id:'conversation',kind:'draft',recordId:'draft',projectId:null},turns:[],excludedSourceKeys:[]};
  const workspace={language:'zh-CN',tasks:state.turns.length?[{id:'draft',conversationId:'conversation',revision:1,title:'并行讨论',prompt:'',modelId:'',projectId:null,status:'draft',createdAt:new Date().toISOString()}]:[],projects:[],theme:'light'};
  let changed=(_:any)=>{};const emit=()=>{sessionStorage.setItem('parallel-state',JSON.stringify(state));changed({conversationId:'conversation'});};w.__parallelSubmits=[];w.__parallelRetries=[];w.__runtimeStarts=0;
  w.__complete=(id:string)=>{const turn=state.turns.findLast((t:any)=>t.employee.id===id);turn.status='completed';turn.answer=turn.employee.name+'的独立回答';emit();};
  w.__fail=(id:string)=>{const turn=state.turns.findLast((t:any)=>t.employee.id===id);turn.status='failed';turn.error='模型暂时不可用';emit();};
  w.desktop={getProvider:async()=>({configured:true,baseUrl:'http://fixture',model:'fixture',executable:'',hasKey:false}),getDevice:async()=>({name:'Test Mac',memoryGB:64,mode:'desktop'}),readWorkspace:async()=>structuredClone(workspace),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},saveWorkspace:async()=>{},startRun:async()=>{w.__runtimeStarts++;throw Error('unexpected execution');},expertChat:{
   directory:async()=>({employees,domains:[{id:'inventory',name:'库存领域'}]}),read:async()=>structuredClone(state),onChanged:(fn:any)=>{changed=fn;return()=>{};},
   submit:async(input:any)=>{w.__parallelSubmits.push(input);if(!workspace.tasks.length)workspace.tasks.push({id:'draft',conversationId:'conversation',revision:1,title:'并行讨论',prompt:'',modelId:'',projectId:null,status:'draft',createdAt:new Date().toISOString()});const roundId='round-'+state.turns.length;
    const turns=input.selectedEmployeeIds.map((id:string,index:number)=>({id:roundId+'-'+id,roundId,ordinal:index,attempt:1,employee:employees.find(e=>e.id===id),text:input.text,status:'responding',createdAt:new Date().toISOString(),model:id+'-model',references:id==='pm'?[{ref:{id:'pm-source',sourceKey:'pm-key',revisionKey:'v1',semanticHash:'hash',stateFingerprint:'state'},title:'库存规范',kind:'space-document',authority:'adopted',cited:true}]:[]}));state.turns.push(...turns);emit();return {conversationId:state.id,turnId:turns[0].id,turnIds:turns.map((t:any)=>t.id)};},
   cancel:async(input:any)=>{state.turns.find((t:any)=>t.id===input.turnId).status='cancelled';emit();},
   retry:async(input:any)=>{w.__parallelRetries.push(input);const turn=state.turns.find((t:any)=>t.id===input.turnId);turn.attempt++;turn.status='responding';delete turn.error;emit();return {conversationId:state.id,turnId:turn.id};},
   exclude:async(input:any)=>{state.excludedSourceKeys.push(input.sourceKey);state.revision++;for(const turn of state.turns)if(turn.references.some((r:any)=>r.ref.sourceKey===input.sourceKey)){turn.status='cancelled';turn.contextUnavailable=true;delete turn.answer;}emit();return structuredClone(state);},
   source:async()=>({title:'库存规范',body:'来源正文'}),export:async()=>state.turns.map((t:any)=>t.employee.name+':'+t.answer).join('\n')
  }};
 });await page.goto('/');
}
async function select(page:Page,name:string){const input=page.locator('textarea:visible').last();await input.fill('@'+name);await input.press('End');await page.getByRole('option').filter({hasText:name}).click();}
async function sendPair(page:Page){await select(page,'产品经理');await select(page,'架构师');await page.locator('textarea:visible').last().fill('请独立讨论库存约束');await page.getByRole('button',{name:'发送给专家',exact:true}).click();await expect(page.locator('.expert-turn')).toHaveCount(2);}
const card=(page:Page,name:string)=>page.locator('.expert-turn').filter({has:page.locator('.expert-speaker strong').filter({hasText:name})});
test('multiple recipients launch one round with a single question and stable independent cards',async({page})=>{
 await prepare(page);await sendPair(page);await expect(page.locator('.expert-question')).toHaveCount(1);expect(await page.evaluate(()=>(window as any).__parallelSubmits[0].selectedEmployeeIds)).toEqual(['pm','arch']);
 await page.evaluate(()=>(window as any).__complete('arch'));await expect(card(page,'架构师')).toContainText('架构师的独立回答');await expect(card(page,'产品经理')).toContainText('专家正在回复');await expect(page.locator('.expert-speaker strong')).toHaveText(['产品经理','架构师']);
 await page.screenshot({path:test.info().outputPath('p4-parallel.png')});expect(await page.evaluate(()=>(window as any).__runtimeStarts)).toBe(0);
 await card(page,'产品经理').getByRole('button',{name:'停止回复',exact:true}).click();await expect(card(page,'产品经理').getByRole('button',{name:'重试此专家'})).toBeVisible();await expect(card(page,'架构师')).toContainText('架构师的独立回答');
});
test('retry updates only the failed expert in place and preserves the successful answer',async({page})=>{
 await prepare(page);await sendPair(page);await page.evaluate(()=>{(window as any).__fail('pm');(window as any).__complete('arch');});await card(page,'产品经理').getByRole('button',{name:'重试此专家'}).click();await expect(card(page,'产品经理')).toContainText('第 2 次尝试');await expect(card(page,'架构师')).toContainText('架构师的独立回答');expect(await page.evaluate(()=>(window as any).__parallelRetries[0].expectedAttempt)).toBe(1);await expect(page.locator('.expert-turn')).toHaveCount(2);
});
test('excluding one expert source does not stop the independent peer and remains visible after reopening',async({page})=>{
 await prepare(page);await sendPair(page);await card(page,'产品经理').getByText('本轮背景 1 项 · 引用 1 项').click();await card(page,'产品经理').getByRole('button',{name:'本次不使用',exact:true}).click();await expect(card(page,'产品经理')).toContainText('背景已失效或被排除');await expect(card(page,'架构师')).toContainText('专家正在回复');await page.evaluate(()=>(window as any).__complete('arch'));
 await page.reload();await page.getByRole('navigation',{name:'分组导航'}).getByRole('button',{name:'任务',exact:true}).click();await page.locator('.tree-task > button:first-child').filter({hasText:'并行讨论'}).click();await expect(page.locator('.expert-turn')).toHaveCount(2);await expect(page.locator('.expert-recipient')).toContainText('2/4');await expect(card(page,'架构师')).toContainText('架构师的独立回答');
});
test('recipient limit is explicit, removable and narrow layouts remain usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await prepare(page);for(const name of ['产品经理','架构师','测试专家','运维专家'])await select(page,name);await expect(page.locator('.expert-recipient')).toContainText('4/4');
 const input=page.locator('textarea:visible').last();await input.fill('@安全专家');await input.press('End');await expect(page.getByRole('option').filter({hasText:'安全专家'})).toHaveAttribute('aria-disabled','true');await input.press('Escape');await page.getByRole('button',{name:'移除专家 测试专家',exact:true}).click();await expect(page.locator('.expert-recipient')).toContainText('3/4');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('p4-parallel-mobile.png')});
});
