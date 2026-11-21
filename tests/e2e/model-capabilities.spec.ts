import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('atelier.active-view.v1', JSON.stringify({page:'home',activeGroup:'chats'}));
  let provider=JSON.parse(localStorage.getItem('image-provider')||'null')||{id:'p',name:'Local models',model:'text-model',models:['text-model','vision-model'],configured:true,baseUrl:'http://localhost/v1',hasKey:false,executable:''};
  (window as any).desktop={getProvider:async()=>provider,listProviders:async()=>({defaultId:'p',providers:[provider]}),saveProvider:async(input:any)=>{provider={...provider,...input};localStorage.setItem('image-provider',JSON.stringify(provider));return provider;},readWorkspace:async()=>({tasks:[],projects:[],theme:'light',language:'zh-CN'}),saveWorkspace:async()=>{},listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},getDevice:async()=>({mode:'desktop',name:'Mac',memoryGB:64})};
 });
});

test('image capability is editable and persists separately for each model',async({page})=>{
 const open=async()=>{
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('button',{name:'模型提供商',exact:true}).click();
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  await page.getByRole('button',{name:'模型能力与协议',exact:true}).click();
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

test('renaming the primary model replaces its picker entry and keeps additional models', async ({page}) => {
 await page.goto('/');
 const picker = page.getByRole('button', {name:'选择模型', exact:true});
 await picker.click();
 await page.getByRole('button', {name:'配置模型服务'}).click();
 await page.getByRole('button', {name:'编辑', exact:true}).click();
 await page.getByLabel('模型 ID', {exact:true}).fill('glm-5.3');
 await page.getByRole('button', {name:'保存配置', exact:true}).click();
 await expect(page.getByRole('button', {name:'编辑', exact:true})).toBeVisible();
 await page.getByRole('button', {name:'返回应用', exact:true}).click();
 await picker.click();
 const menu = page.getByRole('dialog', {name:'模型列表'});
 await expect(menu.getByRole('option')).toHaveText(['glm-5.3', 'vision-model']);
 await menu.getByRole('option', {name:'glm-5.3 Local models'}).click();
 await expect(picker).toContainText('glm-5.3');
});

test('an additional model on a saved service card is directly editable and removable', async ({page}) => {
 await page.goto('/');
 await page.evaluate(() => localStorage.setItem('image-provider', JSON.stringify({
  id:'p', name:'zhipu', model:'glm-5.3', models:['GLM', 'glm-5.3'],
  configured:true, baseUrl:'http://localhost/v1', hasKey:false, executable:'',
 })));
 await page.reload();
 const picker = page.getByRole('button', {name:'选择模型', exact:true});
 await picker.click();
 await page.getByRole('button', {name:'配置模型服务'}).click();
 await expect(page.getByText('GLM · glm-5.3', {exact:true})).toBeVisible();
 await page.getByRole('button', {name:'编辑', exact:true}).click();
 await expect(page.getByLabel('模型 ID', {exact:true})).toHaveValue('glm-5.3');
 const additionalModels = page.getByLabel('可选模型', {exact:true});
 await expect(additionalModels).toBeVisible();
 await expect(additionalModels).toHaveValue('GLM');
 await additionalModels.fill('');
 await page.getByRole('button', {name:'保存配置', exact:true}).click();
 await expect(page.locator('.settings-workspace').getByText('glm-5.3', {exact:true})).toBeVisible();
 await expect(page.getByText('GLM · glm-5.3', {exact:true})).toHaveCount(0);
 await page.getByRole('button', {name:'返回应用', exact:true}).click();
 await picker.click();
 await expect(page.getByRole('dialog', {name:'模型列表'}).getByRole('option')).toHaveText(['glm-5.3']);
});
