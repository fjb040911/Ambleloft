const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {readAttachmentImage,MAX_IMAGE_BYTES}=require('../electron/attachment-images.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA4kAAAAASUVORK5CYII=','base64');
test('image previews return raster data and thumbnails instead of file URLs',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'image-preview-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,'截图.png');await fs.writeFile(file,png);
 assert.deepEqual(await readAttachmentImage({path:file}),{dataUrl:'data:image/png;base64,'+png.toString('base64')});
 const image={isEmpty:()=>false,getSize:()=>({width:1000,height:500}),resize(options){assert.equal(options.width,192);return {toDataURL:()=> 'data:image/png;base64,thumbnail'};}};
 assert.deepEqual(await readAttachmentImage({path:file,thumbnail:true},{createThumbnailFromPath:async()=>image,createFromBuffer:()=>image}),{dataUrl:'data:image/png;base64,thumbnail'});
});
test('missing, oversized and non-image files fail without exposing their contents',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'image-preview-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const fake=path.join(root,'fake.png');await fs.writeFile(fake,'<svg onload="alert(1)">private content</svg>');
 await assert.rejects(readAttachmentImage({path:fake}),/无法预览/);
 await assert.rejects(readAttachmentImage({path:root}),/无法预览/);
 await assert.rejects(readAttachmentImage({path:'relative.png'}),/路径无效/);
 await assert.rejects(readAttachmentImage({path:path.join(root,'missing.png')}),/不可访问/);
 await fs.truncate(fake,MAX_IMAGE_BYTES+1);await assert.rejects(readAttachmentImage({path:fake}),/25 MB/);
});
test('sent attachment metadata survives runtime restart and history pagination',async t=>{
 const {AgentRuntime}=require('../electron/agent-runtime.cjs'),{createProviderStore}=require('../electron/provider.cjs'),{pageRun}=require('../electron/history-pages.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'image-history-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,'截图.png');await fs.writeFile(file,png);
 const provider=createProviderStore(root,{});await provider.save({create:true,name:'Fixture',baseUrl:'https://fixture.example/v1',model:'fixture',executable:process.execPath});
 const runtime=new AgentRuntime({directory:root,provider,workspace:{read:async()=>({projects:[]})},publish(){},rpcFactory:()=>({close(){}})});await runtime.init();runtime.execute=async()=>{};
 try{const run=await runtime.start({prompt:'看一下图片',attachments:[{name:'截图.png',path:file}]});await runtime.finish(runtime.active,'completed');assert.deepEqual(run.messages[0].attachments,[{name:'截图.png',path:file}]);}finally{await runtime.shutdown();}
 const restored=new AgentRuntime({directory:root,publish(){}});await restored.init();
 try{const message=pageRun(restored.runs[0]).messages[0];assert.deepEqual(message.attachments,[{name:'截图.png',path:file}]);assert.ok(!JSON.stringify(message).includes('data:image'));}finally{await restored.shutdown();}
});
