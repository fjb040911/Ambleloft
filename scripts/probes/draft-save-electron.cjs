// Isolated real database/preload/renderer regression; no model or user profile.
const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'amble-draft-save-'));let app;try{
 app=await _electron.launch({args:['.','--user-data-dir='+dir],env:{...process.env,ATELIER_DEV:'0'}});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 const prompt='Ordinary draft regression 中文';
 await page.getByRole('textbox',{name:'任务内容',exact:true}).fill(prompt);
 await page.getByRole('button',{name:'保存任务草稿',exact:true}).click();
 await expect.poll(()=>page.evaluate(async text=>(await window.desktop.readWorkspace()).tasks.filter(t=>t.prompt===text).length,prompt)).toBe(1);
 await page.reload();await expect(page.getByRole('textbox',{name:'任务内容',exact:true})).toHaveValue(prompt);
 const saved=await page.evaluate(async text=>(await window.desktop.readWorkspace()).tasks.find(t=>t.prompt===text),prompt);
 assert.equal(saved.status,'draft');assert.equal(saved.employeeId,undefined);assert.equal(saved.employeeName,undefined);
 console.log(JSON.stringify({passed:true,checks:['ordinary draft accepted by real database','one durable record','reload restores draft','no empty expert metadata']}));
}finally{await app?.close();await fs.rm(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
