const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {TextSpool,read,chunks}=require('../electron/text-spool.cjs');
test('thousands of immutable segments reuse one owned read handle and close it before cleanup',t=>{
 const store=new TextSpool();t.after(()=>store.close());const refs=[];for(let i=0;i<2000;i++){const v=store.createSegment();store.append(v,i+' 中文😀\n');refs.push(store.snapshot(v));}
 const ref=refs[0],original=fs.openSync;let opens=0;fs.openSync=function(file,flags,...rest){if(file===ref.file&&flags==='r')opens++;return original.call(this,file,flags,...rest)};
 try{for(let i=0;i<refs.length;i++)assert.equal(read(refs[i]),i+' 中文😀\n');assert.equal(read(ref,0,0),'');}finally{fs.openSync=original;}
 assert.equal(opens,1);assert.equal(store.readHandles.size,1);const fd=store.readHandles.get(ref.file).fd;store.close();assert.throws(()=>fs.fstatSync(fd),{code:'EBADF'});assert.equal(fs.existsSync(store.directory),false);
});
test('read handle budget protects active iterators, eviction and cancellation release leases',t=>{
 const store=new TextSpool();t.after(()=>store.close());store.maxReadHandles=1;const first=store.snapshot(store.create('a'.repeat(70000))),second=store.snapshot(store.create('b'.repeat(70000)));
 const iterator=chunks(first);assert.equal(iterator.next().value.length,32768);assert.throws(()=>read(second),/HANDLE_LIMIT/);assert.equal(store.readHandles.size,1);iterator.return();assert.equal(read(second).length,70000);assert.equal(store.readHandles.size,1);
 const stopped=chunks(second);stopped.next();store.close();assert.throws(()=>stopped.next(),/TEXT_SPOOL_CLOSED/);assert.equal(fs.existsSync(store.directory),false);
});
test('cached reads reject replacement and a replacement racing the initial open',t=>{
 for(const cached of [false,true]){const store=new TextSpool();t.after(()=>store.close());const ref=store.snapshot(store.create('owned')),backup=ref.file+'.old';if(cached)assert.equal(read(ref),'owned');
 const replace=()=>{fs.renameSync(ref.file,backup);fs.writeFileSync(ref.file,Buffer.from('untrusted','utf16le'))};
 if(cached){replace();assert.throws(()=>read(ref),/FILE_REPLACED/);}else{const original=fs.openSync;fs.openSync=function(file,...args){if(file===ref.file&&args[0]==='r')replace();return original.call(this,file,...args)};try{assert.throws(()=>read(ref),/FILE_REPLACED/);}finally{fs.openSync=original;}}
 store.close();assert.equal(fs.existsSync(store.directory),false);}
});
