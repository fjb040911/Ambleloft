import {test,expect} from '@playwright/test';
const {validateRecord}=require('../../core/workspace-state.cjs');

for(const platform of ['darwin','win32','linux'])test(`ordinary draft survives save and reload without an expert on ${platform}`,async({page})=>{
 await page.exposeFunction('validateDraft',value=>validateRecord('draft',value));
 await page.addInitScript(platform=>{
  const w=window as any;
  const read=()=>JSON.parse(localStorage.getItem('draft-save-fixture')||'{"tasks":[],"projects":[],"theme":"light","revision":0}');
  w.desktop={platform,getDevice:async()=>({platform,mode:'desktop'}),getProvider:async()=>({configured:false}),readWorkspace:async()=>read(),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},
   patchWorkspace:async(input:any)=>{const state=read();for(const change of input.changes){if(change.kind!=='draft'||change.action!=='put')throw Error('Unexpected mutation');await w.validateDraft(change.value);state.tasks=[{...change.value,revision:1},...state.tasks.filter((t:any)=>t.id!==change.id)];}state.revision++;localStorage.setItem('draft-save-fixture',JSON.stringify(state));return state;}
  };
 },platform);
 await page.goto('/');const input=page.getByRole('textbox',{name:'任务内容',exact:true});
 await input.fill('Save an ordinary draft 中文');await page.getByRole('button',{name:'保存任务草稿',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('draft-save-fixture')||'{"tasks":[]}').tasks.length)).toBe(1);
 const tasks=await page.evaluate(()=>JSON.parse(localStorage.getItem('draft-save-fixture')!).tasks);
 expect(tasks).toHaveLength(1);expect(tasks[0].employeeId).toBeUndefined();expect(tasks[0].employeeName).toBeUndefined();
 await page.reload();await expect(input).toHaveValue('Save an ordinary draft 中文');
});
