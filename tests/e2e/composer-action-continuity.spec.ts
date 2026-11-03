import {test,expect} from '@playwright/test';

for(const surface of ['task','workforce'])test(`Enter keeps one action and its shape through sending, generation and stopping in ${surface}`,async({page})=>{
 await page.goto('/tests/fixtures/declarative-ui.html');
 await page.evaluate(async(surface)=>{
  await import('/src/shadcn.css');await import('/src/styles.css');await import('/src/workspace-polish.css');await import('/src/workforce.css');document.getElementById('preview')!.className=surface==='workforce'?'workforce':'';
  const reactModule=await import('/node_modules/.vite/deps/react.js'),domModule=await import('/node_modules/.vite/deps/react-dom_client.js');
  const React=reactModule.default||reactModule,DOM=domModule.default||domModule;
  const {default:Composer}=await import('/src/ChatComposer.tsx');
  function Harness(){
   const [value,setValue]=React.useState('测试发送'),[stage,setStage]=React.useState('ready');
   (window as any).setStage=setStage;
   return React.createElement(Composer,{value,onChange:setValue,onSubmit:()=>setStage('sending'),disabled:stage==='sending',sending:stage==='sending',active:stage==='active'||stage==='stopping',stopping:stage==='stopping',onStop:()=>setStage('stopping'),canSend:!!value,label:'任务内容',placeholder:'输入',sendLabel:'发送',skills:null,controls:null});
  }
  DOM.createRoot(document.getElementById('preview')!).render(React.createElement(Harness));
 },surface);
 const action=page.locator('.composer-bottom > button');
 const colors=()=>action.evaluate(el=>{const s=getComputedStyle(el);return {width:s.width,height:s.height,fg:s.color,opacity:s.opacity,parentOpacity:getComputedStyle(el.closest('[data-slot=input-group]')!).opacity};});
 for(const theme of ['light','dark','system']){
  await page.emulateMedia({colorScheme:'dark'});
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;(window as any).setStage('ready');},theme);
  await expect(action).toHaveCount(1);await expect(action).toHaveAccessibleName('发送');await expect(action).toBeEnabled();await expect(action).toHaveCSS('width','32px');await expect(action).toHaveCSS('height','32px');
  await expect(action).toHaveCSS('color',theme==='light'?'rgb(255, 255, 255)':'rgb(28, 30, 35)');
  const before=await colors();
  await page.getByRole('textbox',{name:'任务内容'}).press('Enter');
  await expect(action).toBeDisabled();await expect(action.locator('[data-slot="spinner"]')).toHaveCSS('width','14px');await expect.poll(colors).toEqual({...before,opacity:'0.5',parentOpacity:'0.5'});
  await page.evaluate(()=>(window as any).setStage('active'));
  await expect(action).toHaveAccessibleName('停止');await expect(action.locator('svg')).toHaveCSS('width','12px');await expect(action).toHaveCSS('width','32px');await expect.poll(colors).toEqual(before);
  await action.click();await expect(action).toBeDisabled();await expect.poll(colors).toEqual({...before,opacity:'0.5'});
 }
});
