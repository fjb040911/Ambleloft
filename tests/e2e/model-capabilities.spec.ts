import {test,expect} from '@playwright/test';

test('image capability is editable and persists separately for each model',async({page})=>{
 await page.addInitScript(()=>{
  let provider=JSON.parse(localStorage.getItem('image-provider')||'null')||{id:'p',name:'Local models',model:'text-model',models:['text-model','vision-model'],configured:true,baseUrl:'http://localhost/v1',hasKey:false,executable:''};
  (window as any).desktop={getProvider:async()=>provider,listProviders:async()=>({defaultId:'p',providers:[provider]}),saveProvider:async(input:any)=>{provider={...provider,...input};localStorage.setItem('image-provider',JSON.stringify(provider));return provider;},readWorkspace:async()=>({tasks:[],projects:[],theme:'light',language:'zh-CN'}),saveWorkspace:async()=>{},listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},getDevice:async()=>({mode:'desktop',name:'Mac',memoryGB:64})};
 });
 const open=async()=>{
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('button',{name:'模型提供商',exact:true}).click();
  await page.getByRole('button',{name:'编辑',exact:true}).click();
 };
 await page.goto('/');await open();
 await expect(page.getByLabel('text-model · 图片输入能力')).toHaveValue('unknown');
 await expect(page.getByLabel('vision-model · 图片输入能力')).toHaveValue('unknown');
 await page.getByLabel('text-model · 图片输入能力').selectOption('unsupported');
 await page.getByLabel('vision-model · 图片输入能力').selectOption('supported');
 await page.getByRole('button',{name:'保存配置',exact:true}).click();
 await expect(page.getByRole('button',{name:'编辑',exact:true})).toBeVisible();
 await page.reload();await open();
 await expect(page.getByLabel('text-model · 图片输入能力')).toHaveValue('unsupported');
 await expect(page.getByLabel('vision-model · 图片输入能力')).toHaveValue('supported');
 await page.getByLabel('可选模型',{exact:true}).fill('text-model\nvision-model\nnew-model');
 await expect(page.getByLabel('new-model · 图片输入能力')).toHaveValue('unknown');
});
