import {test,expect} from '@playwright/test';
test('locale-only projection preserves unsaved form input and never submits',async({page})=>{
 await page.goto('/tests/fixtures/declarative-ui.html');await page.evaluate(async()=>{
  await import('/src/styles.css');await import('/src/shadcn.css');
  const React=await import('/node_modules/.vite/deps/react.js'),DOM=await import('/node_modules/.vite/deps/react-dom_client.js'),{default:Forms}=await import('/src/TaskForms.tsx');
  const template={title:'Request',steps:[{id:'first',title:'Details',fields:[{name:'note',label:'Note',type:'text'}]}],submit:{kind:'chat',label:'Send',confirmation:'onSubmit'}};
  const flow={id:'localization',runId:'r',turnKey:'t',revision:0,status:'editing',step:0,drafts:{first:{note:''}},template};
  const root=(DOM.createRoot||DOM.default.createRoot)(document.getElementById('preview')!);(window as any).calls=[];(window as any).desktop={forms:{action:async(i:any)=>{(window as any).calls.push(i);return flow;}}};
  const render=(displayTemplate:any)=>root.render((React.createElement||React.default.createElement)(Forms,{flows:[{...flow,displayTemplate}],archived:false}));render(template);
  (window as any).switchLocale=()=>render({...template,title:'申请',steps:[{...template.steps[0],title:'详情',fields:[{name:'note',label:'说明',type:'text'}]}],submit:{...template.submit,label:'发送'}});
 });
 await page.getByLabel('Note',{exact:true}).fill('Unsaved business input');await page.evaluate(()=>(window as any).switchLocale());
 await expect(page.getByLabel('说明',{exact:true})).toHaveValue('Unsaved business input');await expect(page.getByText('申请',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).calls.length)).toBe(0);
});
test('locale-only collection projection preserves selection and page',async({page})=>{
 await page.goto('/tests/fixtures/declarative-ui.html');await page.evaluate(async()=>{
  await import('/src/styles.css');await import('/src/shadcn.css');
  const React=await import('/node_modules/.vite/deps/react.js'),DOM=await import('/node_modules/.vite/deps/react-dom_client.js'),{default:Ui}=await import('/src/TaskUi.tsx');
  const template=await fetch('/specs/extensions/examples/declarative-ui/requests.json').then(r=>r.json());const flow={kind:'ui',id:'requests',runId:'r',revision:0,template,data:{values:{},rows:Array.from({length:22},(_,i)=>({id:'R'+i,subject:'Request '+i,status:'open',owner:'User',notes:''}))},submissions:[]};
  const root=(DOM.createRoot||DOM.default.createRoot)(document.getElementById('preview')!);(window as any).calls=[];(window as any).desktop={forms:{action:async(i:any)=>{(window as any).calls.push(i);return flow;}}};
  const render=(displayTemplate:any)=>root.render((React.createElement||React.default.createElement)(Ui,{flow:{...flow,displayTemplate},archived:false}));render(template);(window as any).switchLocale=()=>render({...template,title:'Requests in English'});
 });
 await page.getByRole('button',{name:'下一页'}).click();await page.getByRole('checkbox',{name:'选择 R21',exact:true}).check();await page.evaluate(()=>(window as any).switchLocale());
 await expect(page.getByText('Requests in English',{exact:true})).toBeVisible();await expect(page.getByRole('checkbox',{name:'选择 R21',exact:true})).toBeChecked();await expect(page.getByRole('listitem')).toHaveCount(2);expect(await page.evaluate(()=>(window as any).calls.length)).toBe(0);
});
