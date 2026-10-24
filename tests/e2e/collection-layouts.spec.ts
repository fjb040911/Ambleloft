import {test,expect} from '@playwright/test';
async function mount(page:any,{readOnly=false,file=false}={}){
 await page.goto('/tests/fixtures/declarative-ui.html');
 await page.evaluate(async({readOnly,file})=>{
  await import('/src/styles.css');await import('/src/shadcn.css');await import('/src/tokens.css');
  document.body.style.margin='0';document.getElementById('preview')!.style.padding='16px';
  const React=await import('/node_modules/.vite/deps/react.js'),DOM=await import('/node_modules/.vite/deps/react-dom_client.js'),{default:Ui}=await import('/src/TaskUi.tsx');
  const template=await fetch('/specs/extensions/examples/declarative-ui/'+(file?'review-cards':'requests')+'.json').then(r=>r.json());
  const rows=Array.from({length:22},(_,i)=>file?{id:'R'+i,title:'跨目录的组件缺少说明 '+i,severity:'high',status:'open',file:'src/'+('very-long-directory/'.repeat(8))+'Component.tsx',details:'完整问题说明'}:{id:'R'+i,subject:'服务请求 '+i,description:'用户需要调整发货时间。'.repeat(4),status:i===1?'closed':'open',owner:'陈晨',notes:'已联系仓库，等待确认'});
  let flow={kind:'ui',id:'requests',runId:'r',revision:0,readOnly,template,data:{values:{},rows,state:'ready',coverage:'详细范围说明'.repeat(50),summary:'此次请求的背景信息'},submissions:[]};
  (window as any).calls=[];(window as any).desktop={forms:{action:async(input:any)=>{(window as any).calls.push(input);flow={...flow,revision:flow.revision+1,submissions:[{id:'s',label:'跟进所选',status:'queued'}]};return flow;}}};
  (DOM.createRoot||DOM.default.createRoot)(document.getElementById('preview')!).render((React.createElement||React.default.createElement)(Ui,{flow,archived:false}));
 },{readOnly,file});
}
test('generic cards share selection, pagination, filters and raw action targets with table',async({page})=>{
 await mount(page);await expect(page.getByRole('listitem')).toHaveCount(20);
 await expect(page.getByText('此次请求的背景信息')).toBeHidden();
 await page.getByRole('button',{name:'查看说明与范围'}).click();await expect(page.getByText('此次请求的背景信息')).toBeVisible();
 await page.getByRole('listitem').first().getByRole('button',{name:'查看详情'}).click();await expect(page.getByRole('listitem').first().getByText('已联系仓库，等待确认')).toBeVisible();
 await expect(page.getByRole('listitem').nth(1).getByRole('button',{name:'跟进',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'选择 R0',exact:true}).check();await page.getByRole('button',{name:'下一页'}).click();await page.getByRole('checkbox',{name:'选择 R21',exact:true}).check();
 await page.getByRole('button',{name:'表格视图'}).click();await expect(page.getByRole('table')).toBeVisible();await expect(page.getByRole('checkbox',{name:'选择 R21',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'卡片视图'}).click();await expect(page.getByRole('listitem')).toHaveCount(2);
 await page.getByRole('textbox',{name:'搜索'}).fill('已完成');await expect(page.getByRole('listitem')).toHaveCount(1);
 await page.getByRole('button',{name:'跟进所选',exact:true}).click();expect(await page.evaluate(()=>(window as any).calls[0])).toMatchObject({action:'submit',actionId:'follow-selected',rowKeys:['R0','R21']});await expect(page.getByText('等待发送',{exact:true})).toBeVisible();
});
test('cards remain readable at narrow widths and retain file controls and readonly browsing',async({page})=>{
 await page.setViewportSize({width:390,height:900});await mount(page,{readOnly:true,file:true});
 await expect(page.getByRole('checkbox',{name:'选择 R0',exact:true})).toBeDisabled();await expect(page.getByRole('listitem').first().getByRole('button',{name:'修复',exact:true})).toBeDisabled();
 await page.getByRole('listitem').first().getByRole('button',{name:/查看文件/}).click();await expect(page.getByRole('button',{name:'复制路径',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'定位文件',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'复制路径',exact:true})).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/collection-cards-narrow.png'});
 await page.getByRole('button',{name:'表格视图'}).click();await expect(page.getByRole('table')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('production preview renders both business examples and reports mock delivery',async({page})=>{
 await page.goto('/tests/fixtures/collection-layouts.html');
 await expect(page.getByRole('listitem')).toHaveCount(2);
 await page.getByRole('button',{name:'选择本页',exact:true}).click();await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(2);
 await page.getByRole('button',{name:'清除选择',exact:true}).click();await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(0);
 await page.getByRole('listitem').first().getByRole('button',{name:'跟进',exact:true}).click();await expect(page.locator('main > p[role=status]')).toContainText('REQ-101');
 await page.getByRole('button',{name:'查看文件审查示例'}).click();await expect(page.getByText('邀请面板未处理重复提交',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'切换明暗'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:'test-results/collection-cards-dark.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'表格视图'}).click();await expect(page.getByRole('table')).toBeVisible();await page.screenshot({path:'test-results/collection-table-dark.png',fullPage:true,animations:'disabled'});
});
