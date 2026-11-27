import {test,expect,type Page} from '@playwright/test';
import {catalogPage} from '../../core/catalog-store/pagination.cjs';
import {listingCategories} from '../../core/catalog-store/discovery-categories.cjs';
async function openCenter(page:Page,language='zh-CN',longDescriptions=false){
 await page.exposeFunction('storePage', (items:any[],input:any) => {
  const entries=items.map(item=>({...item,categories:listingCategories(item)}));
  return input.detailId?{items:entries.filter(item=>item.id===input.detailId)}:catalogPage(entries,input.page||{},'fixture');
 });
 await page.addInitScript(({language,longDescriptions})=>{
  const local=(zh:string,en=zh)=>({zh,en});
  const items=Array.from({length:61},(_,i)=>({id:'tool-'+i,entityName:'tool-'+i,kind:i%2?'extension':'skill',title:local('研究工具 '+i,'Research tool '+i),summary:local('整理项目资料，核对来源并生成清晰的工作记录。','Organize project sources and produce clear working notes.'),description:local('完整详情 '+i,'Full details '+i),publisher:'Ambleloft',license:'MIT',categoryIds:i%2?['content']:['analysis'],tags:i%2?['writing']:['research'],trialPrompt:local('请开始研究 '+i),runtime:local('本地项目','Local projects'),setup:local('无需额外配置','No setup required'),release:{version:'1.0.0',status:'published',reviewedAt:new Date().toISOString(),reviewedBy:'Team',changelog:local('首次发布','Initial release'),artifactSha256:'a'.repeat(64)}}));
  // Two distinct skills in the published catalog share this legacy runtime note.
  for(const i of [0,2])items[i].runtime=local('Existing authorized project/file tools; external tools only if the task needs them');
  items[0].summary=local('把功能列表转为可衡量的结果。','Turn feature lists into measurable outcomes.');
  items[2].summary=local('比较架构方案的适用条件。','Compare when each architecture pattern fits.');
  const localSkills=Array.from({length:40},(_,i)=>({id:'s'+i,name:'本地技能 '+i,description:longDescriptions&&i===0?'When the user wants to edit, review, or improve existing marketing copy. '.repeat(24)+'End of full description.':'整理资料',enabled:true,version:1}));
  const w=window as any;w.__pages=[];w.__failMore=false;
  w.desktop={readWorkspace:async()=>({tasks:[],projects:[],theme:'light',language}),getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},skills:{list:async()=>localSkills,detail:async(id:string)=>({...localSkills.find(item=>item.id===id),body:'# Test skill',files:[]}),listSystem:async()=>[],onChanged:()=>()=>{}},extensions:{list:async()=>({installed:[],capabilities:{}})},store:{pendingOpen:async()=>null,onChanged:()=>()=>{},onOpen:(fn:any)=>{w.__openListing=fn;return()=>{};},catalog:async(input:any={})=>{
   w.__pages.push(input);if(input.page?.cursor&&w.__failMore){w.__failMore=false;throw Error('offline');}
   if(input.page?.query==='slow'){await new Promise(resolve=>{w.__finishSlow=resolve;});}
   const meta={source:{id:'curated',title:'Curated'},installed:[],busy:[],stale:false};
   return {...meta,...await w.storePage(items,input)};
  }}};
 },{language,longDescriptions});
 await page.goto('/');await page.locator('.activity-rail').getByRole('button',{name:language==='en'?'Extensions':'扩展',exact:true}).click();await page.getByRole('button',{name:language==='en'?'Skills & extensions':'技能与扩展',exact:true}).click();
}
test('catalog loads bounded pages, retries in place, filters globally and opens unlisted details',async({page})=>{
 await openCenter(page);const center=page.locator('.skill-extension-center');
 await expect(center.locator('.store-installed-row')).toHaveCount(24);
 await center.getByRole('tab',{name:'发现',exact:true}).click();await expect(center.locator('.store-card')).toHaveCount(24);
 await page.evaluate(()=>{(window as any).__failMore=true;});await center.locator('.store-load-more').scrollIntoViewIfNeeded();await expect(center.getByRole('alert')).toContainText('加载下一页失败');await expect(center.locator('.store-card')).toHaveCount(24);
 await center.getByRole('button',{name:'重试',exact:true}).click();await expect(center.locator('.store-card')).toHaveCount(48);
 await center.locator('.store-load-more').scrollIntoViewIfNeeded();await expect(center.locator('.store-card')).toHaveCount(61);await expect(center.locator('.store-load-more')).toHaveCount(0);
 await center.getByRole('searchbox').fill('Research tool 60');await expect(center.locator('.store-card')).toHaveCount(1);await expect(center.locator('.store-card')).toContainText('研究工具 60');
 await center.getByRole('button',{name:'清除筛选',exact:true}).click();await expect(center.locator('.store-card')).toHaveCount(24);
 await center.locator('.store-keywords > summary').click();
 await center.getByLabel('按标签筛选').getByRole('button',{name:/writing/}).click();await expect(center.locator('.store-results [role=status]')).toContainText('共 30 项');await expect(center.locator('.store-card').first()).toContainText('研究工具 1');
 await page.evaluate(()=>{(window as any).__openListing({sourceId:'curated',listingId:'tool-60'});});await expect(page.getByRole('dialog')).toContainText('完整详情 60');await page.keyboard.press('Escape');
 expect(await page.evaluate(()=>(window as any).__pages.filter((p:any)=>!p.detailId).every((p:any)=>p.page.limit===24))).toBe(true);
});
test('slow search results never overwrite the latest query',async({page})=>{
 await openCenter(page);const center=page.locator('.skill-extension-center');await center.getByRole('tab',{name:'发现',exact:true}).click();await expect(center.locator('.store-card')).toHaveCount(24);
 await center.getByRole('searchbox').fill('slow');await expect.poll(()=>page.evaluate(()=>!!(window as any).__finishSlow)).toBe(true);
 await center.getByRole('searchbox').fill('Research tool 60');await expect(center.locator('.store-card')).toHaveCount(1);
 await page.evaluate(()=>(window as any).__finishSlow());await expect(center.locator('.store-card')).toHaveCount(1);await expect(center.locator('.store-card')).toContainText('研究工具 60');
});
test('catalog layouts remain readable in light, dark and narrow views',async({page})=>{
 await openCenter(page);const center=page.locator('.skill-extension-center');await expect(center.locator('.store-installed-row')).toHaveCount(24);await page.screenshot({path:'/tmp/store-installed-light.png'});await center.getByRole('tab',{name:'发现',exact:true}).click();await expect(center.locator('.store-card')).toHaveCount(24);
 await page.screenshot({path:'/tmp/store-discover-light.png'});
 await center.getByRole('searchbox').fill('Research tool 2');await expect(center.locator('.store-card')).toHaveCount(15);await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await expect.poll(()=>center.getByRole('searchbox').evaluate(el=>Math.min(...getComputedStyle(el).color.match(/\d+/g)!.slice(0,3).map(Number)))).toBeGreaterThan(180);await page.screenshot({path:'/tmp/store-discover-dark.png'});
 await page.setViewportSize({width:620,height:900});await expect(center.locator('.store-card').first()).toBeVisible();expect(await center.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:'/tmp/store-discover-narrow.png'});
});

test('English discovery labels and results are localized',async({page})=>{
 await openCenter(page,'en');const center=page.locator('.skill-extension-center');await center.getByRole('tab',{name:'Discover',exact:true}).click();await expect(center.locator('.store-card')).toHaveCount(24);await expect(center.locator('.store-results [role=status]')).toContainText('Showing 24 of 61 items');await expect(center.getByLabel('Filter by purpose')).toBeVisible();await center.getByRole('searchbox').fill('Research tool 60');await expect(center.locator('.store-card')).toContainText('Research tool 60');await expect(center.getByRole('button',{name:'Clear filters',exact:true})).toBeVisible();
 const details=center.getByRole('button',{name:'View details: Research tool 60',exact:true});await details.focus();await details.press('Enter');await expect(page.getByRole('dialog')).toContainText('Full details 60');await page.keyboard.press('Escape');await expect(details).toBeFocused();await details.hover();await center.locator('.store-card').screenshot({path:'/tmp/store-details-button.png'});
});

test('installed shadcn cards align footers and keep long descriptions accessible',async({page})=>{
 await openCenter(page,'zh-CN',true);const cards=page.locator('.store-installed-row');await expect(cards).toHaveCount(24);
 await expect(cards.first()).toHaveAttribute('data-slot','card');await expect(cards.first().getByRole('button',{name:'查看完整说明'})).toBeVisible();
 const summary=cards.first().locator('.store-installed-summary');expect(await summary.evaluate(el=>el.clientHeight<=parseFloat(getComputedStyle(el).lineHeight)*4+1&&el.scrollHeight>el.clientHeight)).toBe(true);
 const a=(await cards.nth(0).locator('[data-slot=card-footer]').boundingBox())!,b=(await cards.nth(1).locator('[data-slot=card-footer]').boundingBox())!;expect(Math.abs(a.y-b.y)).toBeLessThan(2);
 await cards.first().scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/installed-cards-aligned-light.png'});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await expect(cards.first().getByRole('button',{name:'查看完整说明'})).toHaveCSS('color','rgb(237, 237, 237)');await expect(cards.first().locator('[data-slot=badge]')).toHaveCSS('color','rgb(237, 237, 237)');await page.screenshot({path:'/tmp/installed-cards-aligned-dark.png'});
 await cards.first().getByRole('button',{name:'查看完整说明'}).click();await expect(page.getByRole('dialog')).toContainText('End of full description.');await page.keyboard.press('Escape');
 await page.setViewportSize({width:620,height:900});await expect(cards.first()).toBeVisible();expect(await page.locator('.skill-extension-center').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:'/tmp/installed-cards-aligned-narrow.png'});
});

test('discovery card and centered detail dialog add the same listing only on explicit action',async({page})=>{
 await openCenter(page);
 await page.evaluate(()=>{
  const w=window as any;
  w.installRequests=[];
  w.desktop.store.install=async(input:any)=>{w.installRequests.push(input);return {cancelled:true};};
 });
 await page.getByRole('tab',{name:'发现',exact:true}).click();
 const card=page.locator('.store-card').first();
 await card.getByRole('button',{name:'添加：研究工具 0',exact:true}).click();
 await card.getByRole('button',{name:'查看详情：研究工具 0',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toHaveClass(/wf-role-detail/);
 await expect(dialog.locator('.wf-role-detail-body')).toHaveCSS('overflow-y','auto');
 const bounds=await dialog.boundingBox();
 expect(Math.abs(bounds!.x+bounds!.width/2-page.viewportSize()!.width/2)).toBeLessThan(2);
 await expect(dialog).toContainText('完整详情 0');
 expect(await page.evaluate(()=>(window as any).installRequests.length)).toBe(1);
 await dialog.getByRole('button',{name:'添加：研究工具 0',exact:true}).click();
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(card.getByRole('button',{name:'查看详情：研究工具 0',exact:true})).toBeFocused();
 expect(await page.evaluate(()=>(window as any).installRequests)).toEqual(Array(2).fill({sourceId:'curated',listingId:'tool-0'}));
});

test('entering discovery checks expiry and offers an in-place retry beside cached results', async ({page}) => {
 await openCenter(page);
 const center=page.locator('.skill-extension-center');
 await expect(center.locator('.store-installed-row')).toHaveCount(24);
 await page.evaluate(()=>{
  const store=(window as any).desktop.store, read=store.catalog;
  let expired=true;
  store.catalog=async(input:any)=>{
   if(input.refresh)expired=false;
   const result=await read(input);
   return {...result,stale:expired,error:expired&&input.refreshIfExpired?'STORE_DOWNLOAD_FAILED':undefined};
  };
 });
 const discover=center.getByRole('tab',{name:'发现',exact:true});
 await discover.click();
 const alert=center.getByRole('alert'),add=center.getByRole('button',{name:'添加：研究工具 0',exact:true});
 await expect(alert).toContainText('下载失败');
 await expect(alert).toContainText('正在显示上次保存的目录');
 await expect(center.locator('.store-card')).toHaveCount(24);
 await expect(add).toBeDisabled();
 await alert.getByRole('button',{name:'重试'}).click();
 await expect(alert).toHaveCount(0);
 await expect(add).toBeEnabled();
 await center.getByRole('tab',{name:/^已安装/}).click();
 await discover.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__pages.filter((input:any)=>input.refreshIfExpired).length)).toBe(2);
});

test('filter discovery by category from a card, combine with search and clear',async({page})=>{
 await openCenter(page);
 const center=page.locator('.skill-extension-center');
 await center.getByRole('tab',{name:'发现',exact:true}).click();
 const categories=center.getByLabel('按用途分类筛选');
 const card=center.locator('.store-card').filter({hasText:'研究工具 1'}).first();
 await card.getByRole('button',{name:'内容与文档',exact:true}).click();
 await expect(categories.getByRole('button',{name:'内容与文档'})).toHaveAttribute('aria-pressed','true');
 await expect(center.locator('.store-results [role=status]')).toContainText('共 30 项');
 await center.getByRole('searchbox').fill('工具 60');
 await expect(center.locator('.store-results [role=status]')).toContainText('共 0 项');
 await categories.getByRole('button',{name:'全部分类'}).click();
 await expect(center.locator('.store-card')).toHaveCount(1);
 await expect(center.locator('.store-card')).toContainText('研究工具 60');
});

for (const language of ['zh-CN','en']) {
 test(language+' discovery cards show the individual purpose and keep shared requirements in details',async({page})=>{
  const zh=language==='zh-CN';
  await openCenter(page,language);
  const center=page.locator('.skill-extension-center');
  await center.getByRole('tab',{name:zh?'发现':'Discover',exact:true}).click();
  for(const [index,summary] of [[0,zh?'把功能列表转为可衡量的结果。':'Turn feature lists into measurable outcomes.'],[2,zh?'比较架构方案的适用条件。':'Compare when each architecture pattern fits.']] as const){
   const title=(zh?'研究工具 ':'Research tool ')+index;
   const card=center.locator('.store-card').filter({has:page.getByRole('button',{name:title,exact:true})});
   await expect(card).toContainText(summary);
   await expect(card).not.toContainText(/Existing authorized|已授权的项目/);
   await card.getByRole('button',{name:title,exact:true}).click();
   const dialog=page.getByRole('dialog');
   await expect(dialog.locator('dt').filter({hasText:zh?'运行环境与要求':'Runtime and requirements'}).locator('+ dd')).toContainText(zh?'已授权的项目和文件工具':'Existing authorized project/file tools');
   await page.keyboard.press('Escape');
  }
 });
}

test('trial for a deep-linked extension uses the example in its detail outside the current page',async({page})=>{
 await openCenter(page,'en');
 await page.evaluate(()=>{
  const w=window as any,store=w.desktop.store,original=store.catalog;
  w.desktop.extensions.list=async()=>({installed:[{kind:'package',manifest:{id:'org.demo',name:'Demo',version:'1.0.0',apiVersion:'1',contributes:{},description:'Demo extension'},enabled:true,trusted:true}],capabilities:{}});
  store.catalog=async(input:any)=>{
   const result=await original(input);
   return {...result,installed:[{sourceId:'curated',listingId:'tool-59',kind:'extension',entityId:'org.demo',releaseVersion:'1.0.0'}],
    items:result.items.map((item:any)=>item.id==='tool-59'?{...item,trialPrompt:{en:'Look up ticket SR-12 and show its current status.',zh:'查询工单 SR-12 的当前状态。'}}:item)};
  };
  window.dispatchEvent(new Event('extensions:changed'));
  w.__openListing({sourceId:'curated',listingId:'tool-59'});
 });
 const detail=page.getByRole('dialog');
 const example='Look up ticket SR-12 and show its current status.';
 await expect(detail.locator('dt').filter({hasText:'Start with this prompt'}).locator('+ dd')).toHaveText(example);
 await detail.getByRole('button',{name:'Prepare a trial',exact:true}).click();
 await expect(page.locator('#store-use-prompt')).toHaveValue(new RegExp('org\\.demo\\)\\nLook up ticket SR-12 and show its current status\\.$'));
});
