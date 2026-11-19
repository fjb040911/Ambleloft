// Launch the installed project Electron without Playwright's browser feature flags.
// CDP is bound to ephemeral localhost ports and used only for synthetic profiles.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('@playwright/test');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function launch({args,env}){
 const profile=args.find(a=>a.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);if(!profile)throw Error('An isolated profile is required');
 const portFile=path.join(profile,'DevToolsActivePort');fs.rmSync(portFile,{force:true});
 let inspectorUrl;const child=spawn(require('electron'),[...args,'--inspect=0','--remote-debugging-port=0'],{env,cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',()=>{});child.stderr.on('data',chunk=>{const match=chunk.toString().match(/Debugger listening on (ws:\/\/[^\s]+)/);if(match)inspectorUrl=match[1];});
 const deadline=Date.now()+30000;
 while(!inspectorUrl||!fs.existsSync(portFile)){if(child.exitCode!==null)throw Error('Native Electron exited before debugging became ready');if(Date.now()>deadline){child.kill();throw Error('Native Electron debugging startup timed out');}await sleep(50);}
 const socket=new WebSocket(inspectorUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});let sequence=0;const pending=new Map();
 socket.addEventListener('message',event=>{const value=JSON.parse(String(event.data)),entry=pending.get(value.id);if(!entry)return;pending.delete(value.id);if(value.error)entry.reject(Error(value.error.message));else entry.resolve(value.result);});
 socket.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Native main debugger disconnected'));pending.clear();});
 const call=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const browser=await chromium.connectOverCDP('http://127.0.0.1:'+fs.readFileSync(portFile,'utf8').split('\n')[0]);
 const evaluate=async(fn,arg)=>{const result=await call('Runtime.evaluate',{expression:`(${fn.toString()})(process.mainModule.require('electron'),${JSON.stringify(arg)??'undefined'})`,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;};
 let closed=false;
 return{process:()=>child,evaluate,firstWindow:async()=>{while(!browser.contexts()[0]?.pages().length)await sleep(30);return browser.contexts()[0].pages()[0];},close:async()=>{if(closed)return;closed=true;const exited=child.exitCode!==null?Promise.resolve():new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native Electron did not exit')),20000);child.once('exit',()=>{clearTimeout(timer);resolve();});});await evaluate(({app})=>app.quit()).catch(()=>{});socket.close();await exited;await browser.close().catch(()=>{});}};
}
module.exports={launch};
