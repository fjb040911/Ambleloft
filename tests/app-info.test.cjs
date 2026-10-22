const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {appInfo}=require('../electron/app-info.cjs');
test('installed versions use their own build metadata and disclose only diagnostic fields',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-about-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'dist'));
 const app={getAppPath:()=>root,getVersion:()=> '0.6.0',isPackaged:true};
 const write=value=>fs.writeFile(path.join(root,'dist/build-info.json'),JSON.stringify(value));
 await write({version:'0.6.0',commit:'abcdef123456',dirty:false,builtAt:'2026-10-22T00:00:00.000Z',secret:'must-not-leak',path:root});
 const info=appInfo(app);assert.equal(info.commit,'abcdef123456');assert.equal(info.channel,'packaged');assert.equal(info.version,'0.6.0');assert.equal(JSON.stringify(info).includes(root),false);assert.equal(JSON.stringify(info).includes('must-not-leak'),false);
 await write({version:'0.5.0',commit:'abcdef123456',dirty:true});assert.equal(appInfo(app).commit,null);
 await write({version:'0.6.0',commit:'/private/path',builtAt:'invalid',dirty:'yes'});assert.equal(appInfo(app).commit,null);assert.equal(appInfo(app).dirty,null);assert.equal(appInfo(app).builtAt,null);
 await fs.unlink(path.join(root,'dist/build-info.json'));assert.equal(appInfo(app).version,'0.6.0');assert.equal(appInfo(app).commit,null);
});
