const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{_electron}=require('@playwright/test');
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
(async()=>{const app=await _electron.launch({args:['.',`--user-data-dir=${path.join(out,'profile')}`],env:{...process.env,ATELIER_DEV:'0'}});try{
 const page=await app.firstWindow();await page.waitForFunction(()=>window.desktop);const stop=await require('./correlated-performance.cjs').start(app,page,out);const markers=[];
 await page.waitForTimeout(300);markers.push({kind:'main-cpu',at:Date.now()});await app.evaluate(()=>{const end=performance.now()+180;while(performance.now()<end){Math.sqrt(Math.random());}});
 await page.waitForTimeout(1000);markers.push({kind:'main-wait',at:Date.now()});await app.evaluate(()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,220));
 await page.waitForTimeout(1000);markers.push({kind:'renderer-cpu',at:Date.now()});await page.evaluate(()=>{setTimeout(()=>{const end=performance.now()+180;while(performance.now()<end){Math.sqrt(Math.random());}},0);});await page.waitForTimeout(300);
 await stop();const main=JSON.parse(fs.readFileSync(path.join(out,'main-events.json'))),renderer=JSON.parse(fs.readFileSync(path.join(out,'renderer-events.json')));assert.ok(main.events.filter(e=>e.kind==='main-gap').length>=2);assert.ok(renderer.some(e=>e.kind==='longtask'&&e.ms>=150));assert.ok(fs.statSync(path.join(out,'main.cpuprofile')).size>0);assert.ok(fs.statSync(path.join(out,'renderer.cpuprofile')).size>0);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,markers,main,renderer},null,2));
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
