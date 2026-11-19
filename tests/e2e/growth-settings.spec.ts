import {test,expect,type Page} from '@playwright/test';
async function prepare(page:Page){
 await page.addInitScript(()=>{
  const w=window as any;const state={policy:{enabled:1,dailyLimit:20},counts:[{state:'completed',count:4},{state:'queued',count:2}]};w.__growthChanges=[];
  w.desktop={getProvider:async()=>({configured:true,baseUrl:'http://fixture',model:'fixture',executable:'',hasKey:false}),getDevice:async()=>({name:'Test Mac',memoryGB:64,mode:'desktop'}),readWorkspace:async()=>({language:'zh-CN',tasks:[],projects:[],theme:'light'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},saveWorkspace:async()=>{},growth:{status:async()=>structuredClone(state),policy:async(input:any)=>{if(w.__rejectGrowth)throw Error('failed');w.__growthChanges.push(input);state.policy={enabled:Number(input.enabled),dailyLimit:input.dailyLimit};},jobs:async()=>[],dismiss:async()=>{}}};
 });await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();
}
test('settings exposes pause and daily extraction cap without adding a growth homepage',async({page})=>{
 await prepare(page);await expect(page.getByRole('heading',{name:'自动合作沉淀',exact:true})).toBeVisible();await expect(page.getByText('已提炼片段 4',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'暂停自动沉淀',exact:true}).click();await expect(page.getByRole('button',{name:'开启自动沉淀',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'每日提炼上限',exact:true}).selectOption('5');expect(await page.evaluate(()=>(window as any).__growthChanges.at(-1))).toEqual({enabled:false,dailyLimit:5});
 await page.getByRole('button',{name:'开启自动沉淀',exact:true}).click();await expect(page.getByRole('button',{name:'暂停自动沉淀',exact:true})).toBeVisible();
 await page.screenshot({path:test.info().outputPath('growth-settings.png')});
});
test('failed policy update keeps the current state and displays a recoverable error',async({page})=>{
 await prepare(page);await page.evaluate(()=>{(window as any).__rejectGrowth=true;});await page.getByRole('button',{name:'暂停自动沉淀',exact:true}).click();await expect(page.getByRole('alert')).toContainText('保存失败');await expect(page.getByRole('button',{name:'暂停自动沉淀',exact:true})).toBeVisible();
});
