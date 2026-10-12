import {test,expect} from '@playwright/test';
async function setup(page:any,options:{archived?:boolean;project?:boolean}={}){
 await page.goto('/tests/fixtures/declarative-ui.html');await page.evaluate(async(o:any)=>{
  await import('/src/shadcn.css');await import('/src/tokens.css');await import('/src/styles.css');
  const React=await import('/node_modules/.vite/deps/react.js'),ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js'),{default:Ui}=await import('/src/TaskUi.tsx');const template=await fetch('/specs/extensions/examples/declarative-ui/review.json').then(r=>r.json());template.rows.columns=['file'];template.rows.filterFields=['severity'];
  const rows=[{id:'A',severity:'high',file:'src/billing/shared/components/Settings.tsx',status:'open'},{id:'B',severity:'low',file:'src/organization/shared/components/Settings.tsx',status:'open'},{id:'C',severity:'high',file:'src/'+('超长目录/'.repeat(12))+'配置👨‍👩‍👧‍👦验证'.repeat(10)+'.tsx',status:'open'}];
  const flow={kind:'ui',id:'review',runId:'r',projectId:o.project===false?undefined:'p',revision:7,readOnly:o.archived,template,data:{rows,state:'ready'},submissions:[]};(window as any).paths=rows.map(r=>r.file);(window as any).calls=[];(window as any).desktop={copyText:async(path:string)=>{if((window as any).failCopy)throw Error('clipboard failure');(window as any).copiedPath=path;},forms:{action:async(input:any)=>{(window as any).calls.push(input);if((window as any).failLocate)throw Error('文件不存在或暂时无法访问');return flow;}}};
  (ReactDOM.createRoot||ReactDOM.default.createRoot)(document.getElementById('preview')!).render((React.createElement||React.default.createElement)(Ui,{flow,archived:!!o.archived}));
 },options);
}
test('formal task table uses full-instance directory hints and bound host actions',async({page})=>{
 await setup(page);const file=page.getByRole('button',{name:/查看文件 Settings.tsx.*billing/});await expect(file).toBeVisible();await expect(page.getByText('…/billing/shared/components',{exact:true})).toBeVisible();await page.getByRole('combobox',{name:'严重程度'}).selectOption('high');await expect(page.getByText('…/billing/shared/components',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/查看文件 Settings.tsx.*organization/})).toHaveCount(0);
 await file.focus();await expect(page.locator('[data-slot=tooltip-content]')).toContainText('src/billing/shared/components/Settings.tsx');await file.click();const popup=page.locator('[data-slot=popover-content]');await expect(popup).toContainText('src/billing/shared/components/Settings.tsx');expect(await page.evaluate(()=>(window as any).calls)).toEqual([]);
 await popup.getByRole('button',{name:'复制路径',exact:true}).click();expect(await page.evaluate(()=>(window as any).copiedPath)).toBe('src/billing/shared/components/Settings.tsx');await popup.getByRole('button',{name:'定位文件',exact:true}).click();expect(await page.evaluate(()=>(window as any).calls)).toEqual([{runId:'r',id:'review',revision:7,action:'location',rowKey:'A'}]);
 await page.evaluate(()=>{(window as any).failLocate=true;});await popup.getByRole('button',{name:'定位文件',exact:true}).click();await expect(popup.getByRole('status')).toHaveText('文件不存在或暂时无法访问');await page.keyboard.press('Escape');await expect(file).toBeFocused();
 const long=page.getByRole('button',{name:/查看文件 配置/});await expect(long).toContainText('.tsx');await long.click();await popup.getByRole('button',{name:'复制路径',exact:true}).click();expect(await page.evaluate(()=>(window as any).copiedPath===(window as any).paths[2])).toBe(true);
 for(const width of [360,640]){await page.setViewportSize({width,height:800});await expect(popup).toHaveCSS('opacity','1');const box=await popup.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);}
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});await page.screenshot({path:'test-results/task-file-reference-dark.png',animations:'disabled'});
});
test('history and missing projects keep copy accessible and disable location',async({page})=>{
 for(const options of [{archived:true},{project:false}]){
  await setup(page,options);await page.getByRole('button',{name:/查看文件 Settings.tsx.*billing/}).click();const popup=page.locator('[data-slot=popover-content]');await expect(popup.getByRole('button',{name:'定位文件',exact:true})).toBeDisabled();await popup.getByRole('button',{name:'复制路径',exact:true}).click();expect(await page.evaluate(()=>(window as any).copiedPath)).toBe('src/billing/shared/components/Settings.tsx');
  await page.evaluate(()=>{(window as any).failCopy=true;});await popup.getByRole('button',{name:'已复制',exact:true}).click();await expect(popup.getByRole('status')).toHaveText('复制失败，请选中上方路径手动复制。');expect(await page.evaluate(()=>(window as any).calls)).toEqual([]);
 }
});

test('production component fits a 240px container and preserves grapheme tails',async({page})=>{
 await page.goto('/tests/fixtures/declarative-ui.html');await page.evaluate(async()=>{
  await import('/src/shadcn.css');await import('/src/tokens.css');await import('/src/styles.css');const React=await import('/node_modules/.vite/deps/react.js'),ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js'),{default:Reference}=await import('/src/HostFileReference.tsx');const root=document.getElementById('preview')!;root.style.width='240px';(ReactDOM.createRoot||ReactDOM.default.createRoot)(root).render((React.createElement||React.default.createElement)(Reference,{path:'src/财务/'+('👨‍👩‍👧‍👦报销配置'.repeat(20))+'.tsx',canLocate:false,onLocate:async()=>{}}));
 });const trigger=page.getByRole('button',{name:/查看文件/});await expect(trigger).toContainText('.tsx');expect(await trigger.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await trigger.focus();await page.keyboard.press('Enter');await expect(page.locator('[data-slot=popover-content]')).toBeVisible();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
});
