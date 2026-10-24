import {test,expect} from '@playwright/test';

test('Enter keeps action colors through sending, generation and stopping',async({page})=>{
 await page.goto('/tests/fixtures/declarative-ui.html');
 await page.evaluate(async()=>{
  await import('/src/shadcn.css');await import('/src/styles.css');await import('/src/workspace-polish.css');
  const reactModule=await import('/node_modules/.vite/deps/react.js'),domModule=await import('/node_modules/.vite/deps/react-dom_client.js');
  const React=reactModule.default||reactModule,DOM=domModule.default||domModule;
  const {default:Composer}=await import('/src/ChatComposer.tsx');
  function Harness(){
   const [value,setValue]=React.useState('测试发送'),[stage,setStage]=React.useState('ready');
   (window as any).setStage=setStage;
   return React.createElement(Composer,{value,onChange:setValue,onSubmit:()=>setStage('sending'),disabled:stage==='sending',sending:stage==='sending',active:stage==='active'||stage==='stopping',stopping:stage==='stopping',onStop:()=>setStage('stopping'),canSend:!!value,label:'任务内容',placeholder:'输入',sendLabel:'发送',skills:null,controls:null});
  }
  DOM.createRoot(document.getElementById('preview')!).render(React.createElement(Harness));
 });
 const action=page.locator('.composer-bottom > button');
 const colors=()=>action.evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,fg:s.color,opacity:s.opacity,parentOpacity:getComputedStyle(el.closest('[data-slot=input-group]')!).opacity};});
 for(const theme of ['light','dark','system']){
  await page.emulateMedia({colorScheme:'dark'});
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;(window as any).setStage('ready');},theme);
  await expect(action).toHaveAccessibleName('发送');await expect(action).toBeEnabled();
  await expect(action).toHaveCSS('color',theme==='light'?'rgb(255, 255, 255)':'rgb(28, 30, 35)');
  const before=await colors();
  await page.getByRole('textbox',{name:'任务内容'}).press('Enter');
  await expect(action).toBeDisabled();await expect(action.locator('[data-slot="spinner"]')).toHaveCSS('width','14px');expect(await colors()).toEqual(before);
  await page.evaluate(()=>(window as any).setStage('active'));
  await expect(action).toHaveAccessibleName('停止');await expect(action.locator('svg')).toHaveCSS('width','12px');await expect(action).toHaveCSS('width','32px');expect(await colors()).toEqual(before);
  await action.click();await expect(action).toBeDisabled();expect(await colors()).toEqual(before);
 }
});
