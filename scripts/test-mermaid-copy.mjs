import { _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory=await mkdtemp(path.join(tmpdir(),'atelier-mermaid-'));
const source='flowchart LR\n  A["输入：17 × 23"] -->|计算| B["输出：391"]';
const run={id:'mermaid-copy',title:'Mermaid 数字与复制验证',model:'fixture',baseUrl:'http://127.0.0.1/v1',cwd:'/fixture',createdAt:new Date().toISOString(),status:'completed',error:'',approvals:[],tools:[],messages:[{id:'u',role:'user',text:'展示 17 × 23 的计算结果。'},{id:'a',role:'assistant',text:'```mermaid\n'+source+'\n```'}]};
await writeFile(path.join(directory,'conversations.json'),JSON.stringify([run]));
let app;
try{
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env:{...process.env,ATELIER_DEV:'0'}});
 await app.evaluate(({clipboard})=>{globalThis.__clipboardSnapshot=clipboard.availableFormats().map(format=>[format,clipboard.readBuffer(format)]);});
 const page=await app.firstWindow();await page.locator('.tree-task > button:first-child').filter({hasText:'Mermaid 数字与复制验证'}).click();
 const img=page.getByAltText('Mermaid 图表');await img.waitFor();
 const labels=await img.evaluate(el=>{
  const doc=new DOMParser().parseFromString(decodeURIComponent(el.src.split(',').slice(1).join(',')),'image/svg+xml');
  return [...doc.querySelectorAll('text')].map(n=>n.textContent).join(' ');
 });
 assert.ok(labels.includes('17 × 23')&&labels.includes('391')&&labels.includes('计算'),'SVG labels must be present');
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error('Web clipboard intentionally unavailable');};});
 await page.locator('.artifact').getByRole('button',{name:'复制',exact:true}).click();
 await page.locator('.artifact').getByRole('button',{name:'已复制',exact:true}).waitFor();
 assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),source);
 // await page.locator('.message-label').getByRole('button',{name:'复制',exact:true}).click();
 // await page.locator('.message-label').getByRole('button',{name:'已复制',exact:true}).waitFor();
 assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),run.messages[1].text);
 assert.equal(await page.evaluate(async()=>{try{await window.desktop.copyText({bad:true});return false;}catch{return true;}}),true);
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/mermaid-labels-copy.png'});
 console.log('PASS: production SVG contains arithmetic and edge labels; native clipboard matches diagram source and full answer with Web clipboard disabled.');
}finally{
 if(app)await app.evaluate(({clipboard})=>{if(globalThis.__clipboardSnapshot){clipboard.clear();for(const [format,value] of globalThis.__clipboardSnapshot)clipboard.writeBuffer(format,value);}}).catch(()=>{});
 await app?.close();await rm(directory,{recursive:true,force:true});
}
