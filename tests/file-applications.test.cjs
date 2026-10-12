const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createFileApplications}=require('../electron/file-applications.cjs');
const icon='data:image/png;base64,aWNvbg==';
const absent=async()=>{throw Error('not installed');};
test('macOS metadata includes icons, deduplicates default and keeps file paths as arguments',async()=>{
 const calls=[];const service=createFileApplications({platform:'darwin',stat:absent,getIcon:async()=>icon,execute:async(...args)=>{calls.push(args);return {stdout:JSON.stringify({defaultPath:'/Applications/Browser.app',apps:[{path:'/Applications/Browser.app',name:'Browser',icon},{path:'/Applications/Editor.app',name:'Editor',icon}]})};}});
 const file='/tmp/a "quoted" file.html',result=await service.list(file);
 assert.equal(calls[0][1].at(-1),file);assert.equal(result[0].id,'default');assert.equal(result[0].name,'Browser');assert.equal(result[0].icon,icon);assert.equal(result[0].applicationId,'/Applications/Browser.app');assert.equal(result.filter(a=>a.name==='Browser').length,1);
 await service.list(file);assert.equal(calls.length,1);await service.list('/tmp/second.html');assert.equal(calls.length,2);
});
test('supplemental code editors are available for text, not images, PDF or Office files',async()=>{
 const service=createFileApplications({platform:'darwin',stat:async id=>{if(id==='/Applications/Cursor.app')return {isDirectory:()=>true};throw Error('absent');},execute:async()=>({stdout:'{"apps":[]}'})});
 for(const ext of ['md','js','ts'])assert.ok((await service.list('/tmp/file.'+ext)).some(a=>a.name==='Cursor'));
 for(const ext of ['png','pdf','docx'])assert.deepEqual((await service.list('/tmp/file.'+ext)).map(a=>a.id),['default']);
});
test('Windows uses native association IDs, preserves Unicode names/icons, isolates command data and opens the chosen handler',async()=>{
 const calls=[],file='C:\\资料\\a & $(test) "quote".html',id='windows:C:\\Program Files\\Browser\\browser.exe';
 const service=createFileApplications({platform:'win32',execute:async(...args)=>{calls.push(args);return {stdout:JSON.stringify([{id,name:'浏览器',icon,isDefault:true},{id:'windows:AppXPhotos',name:'照片',icon}])};}});
 const apps=await service.list(file);assert.equal(apps.length,2);assert.equal(apps[0].name,'浏览器');assert.equal(apps[0].applicationId,id);assert.equal(apps[0].icon,icon);
 assert.match(calls[0][0],/WindowsPowerShell\\v1\.0\\powershell\.exe$/);assert.ok(calls[0][1].includes('-STA'));assert.ok(!calls[0][1].join(' ').includes(file));assert.equal(calls[0][2].env.ATELIER_FILE_APP_PATH,file);
 assert.equal((await service.open(file,id)).name,'浏览器');assert.equal(calls[1][2].env.ATELIER_FILE_APP_ACTION,'open');assert.equal(calls[1][2].env.ATELIER_FILE_APP_ID,id);
});
test('Windows custom executables launch without shell parsing or waiting for the editor to exit',async()=>{
 const calls=[],service=createFileApplications({platform:'win32',getIcon:async()=>icon,stat:async()=>({isFile:()=>true}),spawn:(...args)=>{calls.push(args);const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});
 const app='C:\\Program Files\\Editor.exe',file='C:\\docs\\a & b.md';await service.open(file,app);
 assert.equal(calls[0][0],app);assert.deepEqual(calls[0][1],[file]);assert.equal(calls[0][2].shell,false);
 let options;assert.equal(await service.choose({showOpenDialog:async(_window,value)=>{options=value;return {filePaths:[app]};}},null),app);assert.deepEqual(options.filters[0].extensions,['exe']);
 await assert.rejects(service.open(file,'C:\\unsafe.cmd'),/应用已不可用/);
});
test('discovery failure keeps system opening available and launch errors remain visible',async()=>{
 for(const platform of ['win32','darwin','linux']){
  const service=createFileApplications({platform,stat:absent,execute:async()=>{throw Error('unavailable');}});assert.equal((await service.list('/tmp/test.txt'))[0].id,'default');
 }
 const service=createFileApplications({platform:'win32',execute:async()=>{throw Error('native open failed');}});await assert.rejects(service.open('C:\\a.md','windows:missing'),/native open failed/);
});

test('Windows native association bridge compiles and enumerates handlers', {skip:process.platform!=='win32'},async()=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const execute=require('node:util').promisify(require('node:child_process').execFile);
 const source=await fs.readFile(path.join(__dirname,'../electron/windows-file-applications.ps1'),'utf8');
 const result=await execute(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{windowsHide:true,timeout:20000,maxBuffer:4*1024*1024,env:{...process.env,ATELIER_FILE_APP_ACTION:'list',ATELIER_FILE_APP_PATH:path.join(os.tmpdir(),'file-app-test.txt')}});
 const apps=JSON.parse(result.stdout.replace(/^\uFEFF/,''));assert.ok(Array.isArray(apps));for(const app of apps){assert.match(app.id,/^windows:/);assert.equal(typeof app.name,'string');}
});
