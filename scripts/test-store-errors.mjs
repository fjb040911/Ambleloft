// Renderer-only regression for catalog trust and recoverable error presentation.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try{
 for(const language of ['zh-CN','en']){
  const en=language==='en';const page=await browser.newPage({viewport:{width:1240,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(language=>{
   window.__storeMode='connected';window.__installs=0;
   window.desktop={readWorkspace:async()=>({tasks:[],projects:[],language,theme:'light'}),getDevice:async()=>({mode:'desktop'}),getProvider:async()=>({configured:false}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},skills:{list:async()=>[]},extensions:{list:async()=>({installed:[],capabilities:{}})},store:{onOpen:()=>()=>{},pendingOpen:async()=>null,onOpenError:fn=>{window.__openError=fn;return()=>{};},pendingOpenError:async()=>({code:'STORE_UNTRUSTED_SOURCE'}),onChanged:()=>()=>{},install:async()=>{window.__installs++;},catalog:async()=>{if(window.__storeMode==='network')throw TypeError('fetch failed');return {source:window.__storeMode==='unconfigured'?null:{id:'test',title:'Test'},items:[],installed:[],busy:[],stale:window.__storeMode!=='connected',error:window.__storeMode==='signature'?'STORE_INVALID_SIGNATURE':window.__storeMode==='unconfigured'?'STORE_NOT_CONFIGURED':undefined};}}};
  },language);
  await page.goto('http://127.0.0.1:5182/');await expect(page.locator('.skill-extension-center')).toBeVisible();
  const message=en?'This link uses an untrusted catalog':'此链接来自尚未信任的目录';await expect(page.getByRole('alert')).toContainText(message);await expect(page.locator('.skill-extension-center')).not.toContainText('STORE_UNTRUSTED_SOURCE');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>window.__installs),0);
  await page.getByRole('button',{name:en?'Dismiss notice':'关闭提示',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(()=>window.__openError({code:'STORE_UNTRUSTED_SOURCE'}));await expect(page.getByRole('alert')).toContainText(message);await page.getByRole('button',{name:en?'Dismiss notice':'关闭提示',exact:true}).click();
  const refresh=page.getByRole('button',{name:en?'Refresh catalog':'刷新目录',exact:true});
  await page.evaluate(()=>window.__storeMode='network');await refresh.click();await expect(page.getByRole('alert')).toContainText(en?'Connection failed. Check your network':'连接失败，请检查网络');await expect(page.locator('.skill-extension-center')).not.toContainText('fetch failed');
  await page.evaluate(()=>window.__storeMode='signature');await refresh.click();await expect(page.getByRole('alert')).toContainText(en?'Catalog or package validation failed':'目录或安装包校验未通过');await expect(page.locator('.skill-extension-center')).not.toContainText('STORE_INVALID_SIGNATURE');
  await page.evaluate(()=>window.__storeMode='unconfigured');await refresh.click();await expect(page.locator('.skill-extension-center')).toContainText(en?'No curated catalog connected':'未连接精选目录');await expect(page.locator('.skill-extension-center')).not.toContainText('store/README.md');await expect(page.locator('.skill-extension-center')).not.toContainText(en?'internal test version':'当前为内部测试版');await expect(page.locator('.skill-extension-center')).not.toContainText('STORE_NOT_CONFIGURED');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS zh/en Store errors: startup/runtime untrusted link, no dialog/install/trust escalation, network retry, signature failure, unconfigured state without internal setup instructions.');
}finally{await browser.close();}
