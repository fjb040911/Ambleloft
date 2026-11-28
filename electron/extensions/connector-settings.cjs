const {createHash}=require('node:crypto');
const {isIP}=require('node:net');
async function connectorAction(service,router,interactions,owner,input){
 const {id,action,generation,revision}=input;
 const item=service.items.find(entry=>entry.id===id);
 const declaration=item?.manifest.contributes?.connectorSettings;
 if(!item?.trusted||!item.enabled||item.pending||!declaration||item.generation!==generation)throw Error('连接设置已变化，请重新打开设置。');
 const context={id,generation};
 const validate=async()=>{
  const current=await service.configuration({id});
  if(current.revision!==revision||current.generation!==generation)throw Error('配置已变化，请重新加载。');
  return current.value;
 };
 const settings=await validate();
 const url=URL.parse(settings[declaration.originField]);
 if(!url||!(url.protocol==='https:'||url.protocol==='http:'&&isIP(url.hostname.replace(/^\[|\]$/g,'')))||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('请先保存有效的服务根地址（域名须用 HTTPS）。');
 const key=declaration.credentialPrefix+createHash('sha256').update(url.origin).digest('hex');
 if(action==='test'){
  const operation=item.manifest.operations.find(entry=>entry.id===declaration.testOperation);
  if(!operation||operation.effect!=='read'||operation.projectScoped||!operation.exposeTo.includes('page')||typeof input.query!=='string'||!input.query.trim())throw Error('测试操作不可用');
  const result=await router.invoke(operation.id,{query:input.query.trim()},{caller:'page',extensionId:id,owner,validate});
  if(!result.ok)throw Error('检索失败：'+result.error.code+'。请检查地址、知识库授权和凭据。');
  if(!Array.isArray(result.value?.hits))throw Error('无法确认检索结果');
  return {count:result.value.hits.length};
 }
 if(!['status','saveSecret'].includes(action))throw Error('INVALID_ARGUMENT');
 await service.check(context,'secrets');
 const prior=await service.database.call('extensionData',{...context,capability:'secrets',kind:'secret',key,write:false});
 if(action==='status')return {saved:prior.value!==null};
 const response=await interactions.request(owner,{kind:'requestSecretInput',extensionId:id,extensionName:service.displayName(item),capabilities:['secrets'],title:'API Key · '+url.origin});
 if(typeof response.value!=='string'||!response.value.length||response.value.length>16000)throw Error('INVALID_ARGUMENT');
 await validate();
 await service.storage(context,key,{kind:'secret',write:true,value:response.value,expectedRevision:prior.revision});
 return {saved:true};
}
module.exports={connectorAction};
