import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import electronPath from 'electron';
import { _electron as electron } from '@playwright/test';
const directory = await mkdtemp(path.join(tmpdir(), 'atelier-credential-'));
const env = {...process.env, ATELIER_CREDENTIAL_TEST_DIR: directory, ATELIER_DEV:'0'};
const native = write => new Promise((resolve,reject)=>{
 const child=spawn(electronPath,['tests/fixtures/credential-process.cjs'],{env:{...env,ATELIER_CREDENTIAL_TEST_WRITE:write?'1':'0'},stdio:['ignore','pipe','pipe']});
 let output=''; child.stdout.on('data',chunk=>output+=chunk);
 const timeout=setTimeout(()=>{child.kill();reject(new Error('Native credential test timeout'));},30000);
 child.once('error',reject); child.once('exit',code=>{clearTimeout(timeout);code===0&&output.includes('CREDENTIAL_RESTART_OK')?resolve():reject(new Error('Native credential read failed'));});
});
let app;
try {
 await native(true);
 // Real app entrypoint through Playwright, same isolated directory and OS keychain.
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env});
 const result=await app.evaluate(async({app,safeStorage})=>{
   const requireModule=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json');
   const {createProviderStore}=requireModule('./electron/provider.cjs');
   const store=createProviderStore(app.getPath('userData'),safeStorage);
   const config=await store.secret();
   if(config.apiKey!=='isolated-restart-fixture')throw new Error('Automation could not decrypt native credential');
   await store.save({...config,apiKey:config.apiKey});
   return !app.commandLine.hasSwitch('use-mock-keychain');
 });
 if(!result)throw new Error('Mock keychain still enabled');
 await app.close();app=undefined;
 await native(false);
 await native(false);
 console.log('PASS: native save → Playwright read/save → two native process restarts, no key re-entry.');
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
