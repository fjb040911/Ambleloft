const {id}=require('./contract.cjs');
const active=new Set(['preparing','running','waiting','stopping']);
const methods={
 async withdrawDocument(input){
  if(!id(input.id))throw Error('资料标识无效');
  const affected=await this.change(state=>{
   const source=state.documents.find(d=>d.id===input.id);
   if(!source||source.revision!==input.expectedRevision)throw Error('资料已变化，请刷新');
   this.writable(state,source.spaceId);
   const ids=new Set([source.id]);let changed=true;
   while(changed){changed=false;for(const doc of state.documents)if(!ids.has(doc.id)&&doc.versions.some(v=>(v.sourceRefs||[]).some(r=>ids.has(r.id)))){ids.add(doc.id);changed=true;}}
   for(const doc of state.documents.filter(d=>ids.has(d.id))){
    doc.deletedAt ||= new Date().toISOString();doc.withdrawnBySource=source.id;doc.adoptedRevision=null;
   }
   return [...ids];
  });
  // Invalidate the execution context, not just the list item. An old model
  // thread must never be resumed after a source it saw has been withdrawn.
  for(const run of this.runtime.runs){
   if(!run.collaboration?.documents?.some(d=>affected.includes(d.id))&&!run.collaboration?.retrievedRefs?.some(d=>affected.includes(d.id)))continue;
   run.collaboration.sourceRevoked=true;
   for(const ref of run.collaboration.documents||[])if(affected.includes(ref.id))delete ref.body;
   if(active.has(run.status))await this.runtime.stop(run.id);
   this.runtime.changed?.(run);
  }
  await this.runtime.persist?.();
  await this.memoryProvider?.invalidate?.({documentIds:affected});
  return {documentIds:affected};
 },
 async restoreDocument(input){
  return this.change(state=>{
   const doc=state.documents.find(d=>d.id===input.id);
   if(!doc||doc.revision!==input.expectedRevision)throw Error('资料已变化，请刷新');
   this.writable(state,doc.spaceId);
   if(doc.versions.some(v=>(v.sourceRefs||[]).some(r=>state.documents.find(d=>d.id===r.id)?.deletedAt)))throw Error('请先恢复来源资料，再核对衍生产物');
   delete doc.deletedAt;delete doc.withdrawnBySource;doc.adoptedRevision=null;doc.updatedAt=new Date().toISOString();
   return doc;
  });
 }
};
module.exports={documentAccessMethods:methods};
