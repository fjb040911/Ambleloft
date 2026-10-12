import {test,expect} from '@playwright/test';

for(const layoutMode of ['activity','classic'])test(`${layoutMode}: sidebar and content follow the pointer without width animation`,async({page})=>{
 await page.addInitScript(({layoutMode})=>localStorage.setItem('atelier.workspace.v1',JSON.stringify({layoutMode,theme:'light',language:'zh-CN',projects:Array.from({length:8},(_,i)=>({id:'p'+i,name:'测试项目 '+i,path:'/tmp',createdAt:'2026-01-01'})),tasks:Array.from({length:40},(_,i)=>({id:'t'+i,title:'比较长的任务名称用来检测实时宽度 '+i,prompt:'测试',status:'draft',modelId:'',projectId:'p'+Math.floor(i/5),createdAt:'2026-01-01'}))})),{layoutMode});
 await page.goto('/');
 const initial=layoutMode==='activity'?256:224;const offset=layoutMode==='activity'?60:0;
 await expect(page.locator('.workspace-sidebar-container')).toHaveCSS('width',`${initial}px`);
 const handle=page.getByRole('separator',{name:'调整首页侧栏宽度'});const box=(await handle.boundingBox())!;
 await page.mouse.move(box.x+3,box.y+80);await page.mouse.down();
 for(const delta of [120,40,150,0]){
  await page.mouse.move(box.x+3+delta,box.y+80);
  // Read actual geometry immediately, rather than polling until a transition ends.
  const actual=await page.evaluate(()=>{
   const elements=[...document.querySelectorAll('[data-slot=sidebar-gap],.workspace-sidebar-container')];
   return {widths:elements.map(el=>el.getBoundingClientRect().width),transitions:elements.map(el=>getComputedStyle(el).transitionProperty),contentLeft:document.querySelector('.main-shell')!.getBoundingClientRect().left,animations:elements.flatMap(el=>el.getAnimations()).length};
  });
  expect(actual.widths).toEqual([initial+delta,initial+delta]);
  expect(actual.contentLeft).toBe(offset+initial+delta);
  expect(actual.transitions).toEqual(['none','none']);expect(actual.animations).toBe(0);
 }
 await page.mouse.up();
 await expect(page.locator('html')).not.toHaveClass(/sidebar-resizing/);
 // Collapse/expand keeps its normal transition once direct manipulation ends.
 expect(await page.locator('[data-slot=sidebar-gap]').evaluate(el=>getComputedStyle(el).transitionProperty)).toBe('width');
});
