// Exercise the actual Vite config and Electron development entry in an isolated profile.
import {createServer} from 'vite';
import {_electron as electron} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory=await mkdtemp(path.join(tmpdir(),'atelier-dev-'));
let server,app;
try {
 if(process.env.ATELIER_TEST_REUSE_DEV!=='1'){server=await createServer();await server.listen();}
 const response=await fetch('http://127.0.0.1:5173');assert.equal(response.status,200);
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env:{...process.env,ATELIER_DEV:'1'}});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.getByRole('textbox',{name:'任务内容',exact:true}).waitFor();
 assert.equal(new URL(page.url()).hostname,'127.0.0.1');
 assert.equal((await page.evaluate(()=>window.desktop.getDevice())).mode,'desktop');
 assert.ok(await page.evaluate(()=>!!document.querySelector('script[src="/@vite/client"]')));
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'test-results/dev-startup.png'});
 console.log('PASS development startup: IPv4 server, rendered Electron UI, desktop bridge and Vite HMR client');
} finally {await app?.close();await server?.close();await rm(directory,{recursive:true,force:true});}
