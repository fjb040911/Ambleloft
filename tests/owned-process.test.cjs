const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {stopOwnedProcess,spawnOwnedProcess}=require('../electron/owned-process.cjs');
test('Windows tree shutdown keeps the owned root alive until enumeration and shares concurrent cleanup',async()=>{
 let complete,calls=0;const child={pid:123,exitCode:null,signalCode:null,kill(){throw Error('root terminated before tree enumeration');}};
 const execute=(file,args,options,cb)=>{calls++;assert.ok(file.endsWith('taskkill.exe'));assert.deepEqual(args,['/PID','123','/T','/F']);assert.equal(options.windowsHide,true);complete=cb;};
 const a=stopOwnedProcess(child,{platform:'win32',execute}),b=stopOwnedProcess(child,{platform:'win32',execute});assert.equal(a,b);assert.equal(calls,1);complete(null);await a;
});
test('tree cleanup failures are surfaced and an exited root is never targeted by PID',async()=>{
 let killed=false;const child={pid:123,exitCode:null,signalCode:null,kill(){killed=true;}};
 await assert.rejects(stopOwnedProcess(child,{platform:'win32',execute:(f,a,o,cb)=>cb(Error('denied'))}),{code:'ENGINE_TREE_CLEANUP_FAILED'});assert.equal(killed,true);
 await stopOwnedProcess({pid:123,exitCode:0,signalCode:null},{platform:'win32',execute(){throw Error('reused PID targeted');}});
});
test('Windows shutdown terminates a cwd-holding grandchild and allows bounded Windows directory cleanup',{skip:process.platform!=='win32',timeout:20000},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'owned-engine-tree-')),ready=path.join(root,'ready.json');
 const code=`const {spawn}=require('child_process');const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:process.cwd(),windowsHide:true,stdio:'ignore'});require('fs').writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:p.pid}));setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['-e',code],{cwd:root,stdio:'ignore',windowsHide:true});const exited=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
 t.after(async()=>{await stopOwnedProcess(child);await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
 const deadline=Date.now()+5000;while(!await fs.stat(ready).catch(()=>null)){if(Date.now()>deadline)throw Error('grandchild did not start');await new Promise(r=>setTimeout(r,25));}
 const grandchild=JSON.parse(await fs.readFile(ready,'utf8'));assert.doesNotThrow(()=>process.kill(grandchild.pid,0));
 await Promise.all([stopOwnedProcess(child),exited]);
 await assert.rejects(fs.access(ready).then(async()=>{const until=Date.now()+3000;while(Date.now()<until){try{process.kill(grandchild.pid,0);}catch(e){throw e;}await new Promise(r=>setTimeout(r,25));}return;}),{code:'ESRCH'});
 await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});await assert.rejects(fs.stat(root),{code:'ENOENT'});
});

for(const natural of [false,true])test('Windows Job owns descendants after '+(natural?'engine exit':'requested tree termination'),{skip:process.platform!=='win32',timeout:20000},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'owned-job-')),ready=path.join(root,'ready.json');
 const code="const p=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});p.unref();require('fs').writeFileSync('ready.json',JSON.stringify({pid:p.pid}));"+(natural?'process.exit(7)':'setInterval(()=>{},1000)');
 const child=spawnOwnedProcess(spawn,process.execPath,['-e',code],{cwd:root,stdio:'ignore'});const exited=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
 t.after(async()=>{await stopOwnedProcess(child);await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
 const deadline=Date.now()+5000;while(!await fs.stat(ready).catch(()=>null)){assert.ok(Date.now()<deadline,'child did not start');await new Promise(r=>setTimeout(r,25));}
 const descendant=JSON.parse(await fs.readFile(ready,'utf8'));if(!natural)await stopOwnedProcess(child);const exit=await exited;if(natural)assert.equal(exit,7);
 const until=Date.now()+3000;while(true){try{process.kill(descendant.pid,0);}catch(e){assert.equal(e.code,'ESRCH');break;}assert.ok(Date.now()<until,'orphan survived');await new Promise(r=>setTimeout(r,25));}
 await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});
});

test('Windows Job preserves Unicode arguments, empty strings, cwd and stdio',{skip:process.platform!=='win32',timeout:10000},async()=>{
 const args=['','中文😀','quote"value','trailing\\','two words','line\nnext'];
 const child=spawnOwnedProcess(spawn,process.execPath,['-e','process.stdout.write(JSON.stringify({args:process.argv.slice(1),cwd:process.cwd(),env:process.env.OWNED_TEST}))','--',...args],{cwd:process.cwd(),env:{...process.env,OWNED_TEST:'synthetic'},stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);const code=await new Promise((r,j)=>{child.on('close',r);child.on('error',j);});assert.equal(code,0,errors);assert.deepEqual(JSON.parse(output),{args,cwd:process.cwd(),env:'synthetic'});
});

test('Windows Job cleans descendants when its application owner exits',{skip:process.platform!=='win32',timeout:15000},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'owned-app-exit-')),ready=path.join(root,'ready.json');
 const engine="require('fs').writeFileSync('ready.json',JSON.stringify({pid:process.pid}));setInterval(()=>{},1000)";
 const code="const {spawn}=require('child_process');require("+JSON.stringify(require.resolve('../electron/owned-process.cjs'))+").spawnOwnedProcess(spawn,process.execPath,['-e',"+JSON.stringify(engine)+"],{cwd:process.cwd(),stdio:'ignore'});setInterval(()=>{},1000)";
 const owner=spawn(process.execPath,['-e',code],{cwd:root,stdio:'ignore',windowsHide:true});const exited=new Promise(r=>owner.once('exit',r));
 t.after(async()=>{if(owner.exitCode===null&&owner.signalCode===null)owner.kill();await exited;await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
 const deadline=Date.now()+5000;while(!await fs.stat(ready).catch(()=>null)){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,25));}
 const {pid}=JSON.parse(await fs.readFile(ready,'utf8'));owner.kill();await exited;
 const until=Date.now()+5000;while(true){try{process.kill(pid,0);}catch(e){assert.equal(e.code,'ESRCH');break;}assert.ok(Date.now()<until,'engine outlived application');await new Promise(r=>setTimeout(r,25));}
 await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});
});
