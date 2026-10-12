import {expect,type Page} from '@playwright/test';
export async function prepare(page:Page){
 await page.setViewportSize({width:1600,height:900});
 await page.addInitScript(()=>{
  const files:Record<string,any>={
   'README.md':{kind:'markdown',text:'# 项目说明\n\n只读文件预览'},
   'src/main.ts':{kind:'code',text:'const answer = 42;\nconsole.log(answer);'},
   'index.html':{kind:'html',text:'<h1>Hello</h1>'},
   'report.docx':{kind:'unsupported',reason:'此格式请使用外部应用打开。'},
  };
  (window as any).__files=files;
  const run={id:'run',projectId:'p',title:'项目任务',cwd:'/actual-task-root',model:'fixture',baseUrl:'http://localhost',status:'completed',createdAt:new Date().toISOString(),messages:[{id:'u',role:'user',text:'查看文件'},{id:'a',role:'assistant',text:'请查看右侧项目文件。'}],tools:[],approvals:[],error:''};
  (window as any).__panelRun=run;
  (window as any).desktop={
   readWorkspace:async()=>({tasks:[],projects:[{id:'p',name:'Demo',path:'/project',createdAt:''}],theme:'light',layoutMode:'classic'}),saveWorkspace:async()=>{},
   getDevice:async()=>({mode:'desktop'}),getProvider:async()=>({configured:false}),listRuns:async()=>[run],onRun:(fn:any)=>{(window as any).__panelEmit=fn;return()=>{};},onCommand:()=>()=>{},
   copyText:async(text:string)=>{(window as any).__copied=text;},
   projectFiles:{
    context:async(input:any)=>({root:input.runId?'/actual-task-root':'/project',baseUrl:'atelier-preview://fixture/'}),
    list:async(input:any)=>({entries:input.path==='src'?[{name:'main.ts',path:'src/main.ts',directory:false}]:[{name:'src',path:'src',directory:true},...['README.md','index.html','report.docx'].map(path=>({name:path,path,directory:false}))],truncated:false}),
    search:async(input:any)=>({entries:Object.keys(files).filter(path=>path.toLowerCase().includes(input.query.toLowerCase())).map(path=>({name:path.split('/').pop(),path,directory:false})),truncated:false}),
    read:async(input:any)=>{(window as any).__readContext=input;if(!files[input.path])throw new Error('文件已删除');const file=files[input.path];const version=file.text||'1';return input.version===version?{unchanged:true,version}:{...file,path:input.path,name:input.path.split('/').pop(),size:100,version,truncated:false};},
    apps:async()=>[{id:'vscode',name:'Visual Studio Code'}],open:async(input:any)=>{(window as any).__opened=input;return {id:input.application||'default',name:'Visual Studio Code'};},
   },
  };
 });
 await page.goto('/');
}
export async function project(page:Page){await page.getByRole('combobox',{name:'当前项目',exact:true}).click();await page.getByRole('option',{name:'Demo',exact:true}).click();await page.getByRole('button',{name:'显示侧边面板',exact:true}).click();await expect(page.getByRole('region',{name:'项目文件面板'})).toBeVisible();await expect(page.locator('.file-tree')).toBeVisible();await page.locator('.file-panel-slot').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished));});}
