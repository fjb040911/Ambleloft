import {test,expect,type Page} from '@playwright/test';
async function prepare(page:Page){
 await page.addInitScript(()=>{
  const stamp='2026-11-01T09:00:00Z';
  const project={id:'project',name:'示例项目',path:'/tmp/fixture',createdAt:stamp};
  const expert={id:'expert',name:'测试专家',domain:'测试',responsibilities:'检查结果',deliverables:'结果',methods:'验证',skills:[],requirements:[],status:'ready',revision:1,createdAt:stamp,updatedAt:stamp};
  const makeRun=(id:string,title:string,extra:any={})=>({id,title,projectId:null,cwd:'/tmp/fixture',createdAt:stamp,model:'fixture',baseUrl:'http://fixture',status:'completed',error:'',messages:[{id:id+'-u',role:'user',text:title},{id:id+'-a',role:'assistant',phase:'final_answer',text:title+'的交付内容'}],tools:[],approvals:[],...extra});
  const origin={spaceId:'space',spaceName:'归属空间',requestId:'work-request',mode:'work'};
  const runs=[makeRun('normal','普通聊天'),makeRun('expert','独立专家聊天',{employee:expert}),makeRun('work','协作执行记录',{projectId:'project',collaboration:origin}),makeRun('discussion-run','协作讨论记录',{collaboration:{...origin,requestId:'discussion-request',mode:'discussion'}}),makeRun('archived','归档协作记录',{archivedAt:stamp,collaboration:origin}),makeRun('normal-archived','普通归档聊天',{archivedAt:stamp})];
  const snapshot:any={spaces:[{id:'space',name:'归属空间',purpose:'归属测试',projectIds:['project'],members:[{employeeId:'expert',assignment:'验证',projectIds:['project']}],revision:1,createdAt:stamp,updatedAt:stamp}],documents:[],requests:[{id:'work-request',spaceId:'space',prompt:'执行验证',mode:'work',projectId:'project',createdAt:stamp,documentRefs:[],participants:[{employeeId:'expert',runId:'work',status:'completed',output:'协作执行记录的交付内容'}]},{id:'discussion-request',spaceId:'space',prompt:'讨论验证主题',mode:'discussion',projectId:null,createdAt:stamp,documentRefs:[],participants:[{employeeId:'expert',runId:'discussion-run',status:'completed',output:'讨论结果'}]}],plans:[{id:'plan',spaceId:'space',revision:1,name:'验证计划',goal:'核对记录归属',status:'paused',createdAt:stamp,updatedAt:stamp,events:[],packages:[{id:'node',status:'review',definition:{id:'node',title:'验证节点',ownerId:'expert',mode:'work',projectId:'project',instruction:'检查结果',deliverables:'结果',acceptance:'核对完成',dependencies:[],documentRefs:[]},attempts:[{id:'attempt',number:1,planRevision:1,requestId:'work-request',runId:'work',status:'completed',startedAt:stamp,resultHash:'hash',inputRefs:[]}]}]}]};
  (window as any).__ownership={runs,snapshot};
  (window as any).desktop={
   getProvider:async()=>({configured:true,baseUrl:'http://fixture',model:'fixture',executable:'',hasKey:false}),getDevice:async()=>({name:'Test Mac',memoryGB:64,mode:'desktop'}),
   readWorkspace:async()=>({language:'zh-CN',layoutMode:'classic',tasks:[],projects:[project],theme:'light'}),saveWorkspace:async()=>{},
   listRuns:async()=>structuredClone(runs),getRunPage:async({id}:any)=>structuredClone(runs.find(r=>r.id===id)),onRun:()=>()=>{},onCommand:()=>()=>{},
   onOpenConversation:(fn:any)=>{(window as any).__openConversation=fn;return()=>{};},
   workforce:{snapshot:async()=>({employees:[expert],globalSkills:[]}),roles:async()=>({items:[]}),onChanged:()=>()=>{}},
   spaces:{snapshot:async()=>structuredClone(snapshot)},forms:{list:async()=>[],onChanged:()=>()=>{}},
  };
 });
 await page.goto('/');
 await expect(page.locator('.tree-task').filter({hasText:'普通聊天'})).toBeVisible();
}
test('ordinary lists exclude collaboration records but preserve standalone experts and archive access',async({page})=>{
 await prepare(page);
 await expect(page.locator('.tree-task').filter({hasText:'独立专家聊天'})).toBeVisible();
 await expect(page.locator('.tree-task').filter({hasText:/协作执行记录|协作讨论记录|归档协作记录/})).toHaveCount(0);
 await page.locator('.tree-task > button:first-child').filter({hasText:'普通聊天'}).click();
 await expect(page.getByText('普通聊天的交付内容',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'任务',exact:true}).click();
 await expect(page.getByText('普通归档聊天',{exact:true})).toBeVisible();
 await expect(page.getByText('归档协作记录',{exact:true})).not.toBeVisible();
});
test('search opens the owning node and notification opens the owning discussion',async({page})=>{
 await prepare(page);
 await page.getByRole('button',{name:'搜索工作台',exact:true}).click();
 await page.getByPlaceholder('搜索任务名称或对话内容').fill('协作执行记录');
 await page.getByRole('option').filter({hasText:'协作执行记录'}).click();
 await expect(page.getByRole('region',{name:'任务详情与验收'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'验证节点',exact:true})).toBeVisible();
 await expect(page.getByRole('tab',{name:'任务',exact:true})).toHaveAttribute('aria-selected','true');
 await page.evaluate(()=>(window as any).__openConversation({kind:'run',recordId:'discussion-run'}));
 await expect(page.getByRole('tab',{name:'讨论',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('heading',{name:'讨论验证主题',exact:true})).toBeVisible();
 // Opening the same node again must consume a fresh destination even in the same space.
 await page.evaluate(()=>(window as any).__openConversation({kind:'run',recordId:'work'}));
 await expect(page.getByRole('heading',{name:'验证节点',exact:true})).toBeVisible();
});
test('full execution records remain accessible inside the workspace and return to their discussion',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>(window as any).__openConversation({kind:'run',recordId:'discussion-run'}));
 await expect(page.getByRole('heading',{name:'讨论验证主题',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'完整任务',exact:true}).click();
 await expect(page.getByRole('button',{name:'返回协作工作',exact:true})).toBeVisible();
 await expect(page.getByRole('article',{name:'助手消息'}).getByText('协作讨论记录的交付内容',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'返回协作工作',exact:true}).click();
 await expect(page.getByRole('heading',{name:'讨论验证主题',exact:true})).toBeVisible();
 // An old record still opens read-only if its owning space was removed.
 await page.evaluate(()=>{(window as any).__ownership.snapshot.spaces=[];(window as any).__openConversation({kind:'run',recordId:'archived'});});
 await expect(page.getByText('归档协作记录的交付内容',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'继续对话'}).fill('继续');
 await expect(page.getByRole('button',{name:'发送后续消息'})).toBeDisabled();
});
