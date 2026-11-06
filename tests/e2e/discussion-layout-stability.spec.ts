import {test,expect} from '@playwright/test';
for(const platform of ['darwin','win32'])test(`discussion geometry stays stable through streaming on ${platform}`,async({page})=>{
 await page.setViewportSize({width:1600,height:1070});
 await page.addInitScript(({platform})=>{
  const stamp='2026-11-01T09:00:00Z';
  const project={id:'project',name:'示例项目',path:'/tmp/fixture',createdAt:stamp};
  const expert={id:'expert',name:'测试专家',domain:'测试',responsibilities:'检查结果',deliverables:'结果',methods:'验证',skills:[],requirements:[],status:'ready',revision:1,createdAt:stamp,updatedAt:stamp};
  const makeRun=(id:string,title:string,extra:any={})=>({id,title,projectId:null,cwd:'/tmp/fixture',createdAt:stamp,model:'fixture',baseUrl:'http://fixture',status:'completed',error:'',messages:[{id:id+'-u',role:'user',text:title},{id:id+'-a',role:'assistant',phase:'final_answer',text:title+'的交付内容'}],tools:[],approvals:[],...extra});
  const origin={spaceId:'space',spaceName:'归属空间',requestId:'work-request',mode:'work'};
  const runs=[makeRun('normal','普通聊天'),makeRun('expert','独立专家聊天',{employee:expert}),makeRun('work','协作执行记录',{projectId:'project',collaboration:origin}),makeRun('discussion-run','协作讨论记录',{collaboration:{...origin,requestId:'discussion-request',mode:'discussion'}}),makeRun('archived','归档协作记录',{archivedAt:stamp,collaboration:origin}),makeRun('normal-archived','普通归档聊天',{archivedAt:stamp})];
  const snapshot:any={spaces:[{id:'space',name:'归属空间',purpose:'归属测试',projectIds:['project'],members:[{employeeId:'expert',assignment:'验证',projectIds:['project']}],revision:1,createdAt:stamp,updatedAt:stamp}],documents:[],requests:[{id:'work-request',spaceId:'space',prompt:'执行验证',mode:'work',projectId:'project',createdAt:stamp,documentRefs:[],participants:[{employeeId:'expert',runId:'work',status:'completed',output:'协作执行记录的交付内容'}]},{id:'discussion-request',spaceId:'space',prompt:'讨论验证主题',mode:'discussion',projectId:null,createdAt:stamp,documentRefs:[],participants:[{employeeId:'expert',runId:'discussion-run',status:'completed',output:'讨论结果'}]}],plans:[{id:'plan',spaceId:'space',revision:1,name:'验证计划',goal:'核对记录归属',status:'paused',createdAt:stamp,updatedAt:stamp,events:[],packages:[{id:'node',status:'review',definition:{id:'node',title:'验证节点',ownerId:'expert',mode:'work',projectId:'project',instruction:'检查结果',deliverables:'结果',acceptance:'核对完成',dependencies:[],documentRefs:[]},attempts:[{id:'attempt',number:1,planRevision:1,requestId:'work-request',runId:'work',status:'completed',startedAt:stamp,resultHash:'hash',inputRefs:[]}]}]}]};
  (window as any).__ownership={runs,snapshot};
  (window as any).desktop={
   getProvider:async()=>({configured:true,baseUrl:'http://fixture',model:'fixture',executable:'',hasKey:false}),getDevice:async()=>({name:'Test device',platform,memoryGB:64,mode:'desktop'}),
   readWorkspace:async()=>({language:'zh-CN',layoutMode:'activity',tasks:[],projects:[project],theme:'light'}),saveWorkspace:async()=>{},
   listRuns:async()=>structuredClone(runs),getRunPage:async({id}:any)=>structuredClone(runs.find(r=>r.id===id)),onRun:()=>()=>{},onCommand:()=>()=>{},
   onOpenConversation:(fn:any)=>{(window as any).__openConversation=fn;return()=>{};},
   workforce:{snapshot:async()=>({employees:[expert],globalSkills:[]}),roles:async()=>({items:[]}),onChanged:(fn:any)=>{(window as any).__emitLayout=fn;return()=>{};}},
   spaces:{snapshot:async()=>structuredClone(snapshot)},forms:{list:async()=>[],onChanged:()=>()=>{}},
  };
 },{platform});
 await page.goto('/');
 await page.waitForFunction(()=>typeof (window as any).__openConversation==='function');
 await page.evaluate(()=>{
  const q=(window as any).__ownership,r=q.snapshot.requests.find((r:any)=>r.id==='discussion-request');
  r.host={status:'running',revision:1,steps:[],activity:{phase:'reasoning',reasoning:'检查项目职责与验证目标。\n\n'.repeat(30)}};
  (window as any).__openConversation({kind:'run',recordId:'discussion-run'});
 });
 const footer=page.locator('.wf-discussion-footer'),scroller=page.locator('#main-content'),nav=page.locator('.wf-space-navigation');
 await expect(footer).toBeVisible();
 const geometry=()=>page.evaluate(()=>{
  const main=document.querySelector('#main-content')!,foot=document.querySelector('.wf-discussion-footer')!,nav=document.querySelector('.wf-space-navigation')!;
  return {bottomGap:main.getBoundingClientRect().bottom-foot.getBoundingClientRect().bottom,navTop:nav.getBoundingClientRect().top-main.getBoundingClientRect().top,mainGap:document.querySelector('.conversation-shell')!.getBoundingClientRect().bottom-main.getBoundingClientRect().bottom,outerScroll:[...document.querySelectorAll('.main-shell,.workspace-content,.conversation-shell')].map(e=>e.scrollTop)};
 });
 await expect.poll(async()=>Math.abs((await geometry()).bottomGap)).toBeLessThan(2);
 for(let i=0;i<6;i++){
  await page.evaluate(i=>{
   const h=(window as any).__ownership.snapshot.requests.find((r:any)=>r.id==='discussion-request').host;
   h.activity.reasoning+='继续分析。\n\n'.repeat(20)+`阶段 ${i}`;h.revision++;
   if(i===1)h.steps=[{id:'reply',action:'reply',text:'本轮回复。\n\n'.repeat(70)}];
   if(i===2)h.activity.phase='responding';
   if(i===3){h.status='completed';h.steps[0].text='最终确认结果。';}
   if(i===4){h.status='running';h.activity.phase='reasoning';h.steps=[];}
   (window as any).__emitLayout();
  },i);
  await expect(page.locator('.wf-host-response')).toContainText(`阶段 ${i}`);
  // Move to the live end, then exercise layout changes without moving the shell.
  const available=await page.locator('.wf-main').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--wf-space-available'));
  await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await expect.poll(async()=>Math.abs((await geometry()).bottomGap)).toBeLessThan(2);
  expect(await page.locator('.wf-main').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--wf-space-available'))).toBe(available);
  const state=await geometry();expect(state.mainGap).toBeLessThan(2);expect(state.navTop).toBeGreaterThanOrEqual(-1);expect(state.outerScroll).toEqual([0,0,0]);
  if(i===2){await page.setViewportSize({width:1280,height:740});await expect.poll(async()=>Math.abs((await geometry()).bottomGap)).toBeLessThan(2);await page.setViewportSize({width:1600,height:1070});}
 }
 await page.getByRole('tab',{name:'文档与产物',exact:true}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await expect(footer).toBeInViewport();await expect(nav).toBeInViewport();
 await expect.poll(async()=>Math.abs((await geometry()).bottomGap)).toBeLessThan(2);
 await page.screenshot({path:`/tmp/discussion-stable-${platform}.png`});
});
