const {validate,CAPABILITIES}=require('./registry.cjs');
// The database dependency is injected; extensions never receive this handle.
class ExtensionService {
 constructor(database){this.database=database;this.items=[];this.queue=Promise.resolve();}
 async initialize(){
  const saved=await this.database.call('readSetting',{key:'platform.extensions.v1'});
  if(saved!==null&&saved!==undefined&&!Array.isArray(saved))throw new Error('Invalid extension state');
  const seen=new Set();
  this.items=(saved||[]).map(item=>{
   if(!item||typeof item.enabled!=='boolean')throw new Error('Invalid extension state');
   const manifest=validate(item.manifest);
   if(seen.has(manifest.id))throw new Error('Duplicate extension state');seen.add(manifest.id);
   return {manifest,enabled:item.enabled};
  });
 }
 snapshot(){return structuredClone({capabilities:CAPABILITIES,installed:this.items});}
 mutate(action){
  const result=this.queue.then(async()=>{
   const next=action(structuredClone(this.items));
   await this.database.call('writeSetting',{key:'platform.extensions.v1',value:next});
   this.items=next;return this.snapshot();
  });
  this.queue=result.catch(()=>{});return result;
 }
 install(input){const manifest=validate(input);return this.mutate(items=>{if(items.some(i=>i.manifest.id===manifest.id))throw new Error('扩展已安装，请先卸载旧版本。');return [...items,{manifest,enabled:true}];});}
 setEnabled(id,enabled){if(typeof id!=='string'||typeof enabled!=='boolean')throw new Error('Invalid extension update');return this.mutate(items=>{const item=items.find(i=>i.manifest.id===id);if(!item)throw new Error('扩展不存在');item.enabled=enabled;return items;});}
 remove(id){return this.mutate(items=>{if(!items.some(i=>i.manifest.id===id))throw new Error('扩展不存在');return items.filter(i=>i.manifest.id!==id);});}
 execute(id){
  for(const {manifest,enabled} of this.items){if(!enabled)continue;const command=manifest.contributes.commands?.find(c=>c.id===id);if(command)return {extensionId:manifest.id,viewId:command.viewId};}
  throw new Error('命令不存在或扩展已停用');
 }
}
module.exports={ExtensionService};
