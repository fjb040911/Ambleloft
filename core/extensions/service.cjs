const {validate,CAPABILITIES}=require('./registry.cjs');
const {PackageStore}=require('./packages.cjs');
class ExtensionService {
 constructor(database,options={}){this.database=database;this.options=options;this.items=[];this.queue=Promise.resolve();this.packages=options.directory?new PackageStore(options.directory,options.validator):null;}
 async initialize(){
  await this.packages?.initialize();
  const saved=await this.database.call('readSetting',{key:'platform.extensions.v1'});const legacy=[],diagnostics=[],seen=new Set();
  for(const item of Array.isArray(saved)?saved:[]){try{const manifest=validate(item.manifest);if(typeof item.enabled!=='boolean'||seen.has(manifest.id))throw Error('Invalid legacy record');seen.add(manifest.id);legacy.push({id:manifest.id,kind:'legacy',manifest,enabled:item.enabled,trusted:false,generation:0});}catch{diagnostics.push('已隔离一条无效旧扩展记录');}}
  if(saved&&!Array.isArray(saved))diagnostics.push('旧扩展注册表格式无效，已隔离');
  this.items=await this.database.call('extensionMutation',{action:'initialize',legacy,diagnostics});
  this.diagnostics=(await this.database.call('readSetting',{key:'extensions.migrated'}))?.diagnostics||[];
 }
 snapshot(projectId){return structuredClone({capabilities:CAPABILITIES,diagnostics:this.diagnostics,installed:this.items.map(item=>({...item,
  // Operation execution remains gated on the A6 router.
  manifest:item.kind==='legacy'?item.manifest:{id:item.id,name:this.displayName(item),version:item.manifest?.version||'',description:this.localized(item,item.manifest?.description)||'',icon:item.icons,contributes:{commands:item.manifest?.contributes?.commands?.map(c=>({id:c.id,title:this.localized(item,c.title),viewId:item.id,when:c.when,visible:this.commandVisible(item,c,projectId)}))}},
  permissions:item.kind==='package'?item.manifest?.permissions||[]:[],revisions:item.revisions?.map(r=>({digest:r.digest,version:r.manifest.version})),
  operations:item.kind==='package'?(item.manifest?.operations||[]).filter(op=>op.exposeTo.includes('page')).map(op=>({id:op.id,title:this.localized(item,op.title),description:this.localized(item,op.description)})):[],
  home:item.manifest?.contributes?.home?{title:this.localized(item,item.manifest.contributes.home.title),when:item.manifest.contributes.home.when}:undefined,hasConfiguration:!!item.manifest?.configuration,hasBackend:!!item.manifest?.main,runtime:this.hosts?.snapshot(item.id),sourceMode:item.sourceMode||item.revisions?.find(r=>r.digest===item.active)?.sourceMode
 }))});}
 localized(item,value,locale=this.options.locale||'en'){return require('./localization.cjs').localized(item,value,locale);}
 displayName(item){return this.localized(item,item.manifest?.displayName)||item.id;}
 commandVisible(item,command,projectId){if(!command.when)return true;const types={'project.exists':'boolean'},values={'project.exists':!!projectId};for(const key of item.manifest.contextKeys||[]){types[key.key]=key.type;values[key.key]=this.hosts?.entries.get(item.id)?.context[key.key]??key.default;}try{return require('./condition.cjs').compileCondition(command.when,types)(values);}catch{return false;}}
 attachHosts(hosts){this.hosts=hosts;this.options.stop=async id=>{this.options.invalidatePages?.(id);await hosts.stop(id);};}
 startHost(id){return this.serial(async()=>{await this.hosts.activate(id,{manual:true});return this.snapshot();});}
 async shutdown(){this.closed=true;await this.hosts?.shutdown();await this.queue;}
 serial(action){if(this.closed)return Promise.reject(Error('HOST_UNAVAILABLE: Application is shutting down'));const result=this.queue.then(()=>{if(this.closed)throw Error('HOST_UNAVAILABLE: Application is shutting down');return action();});this.queue=result.catch(()=>{});return result;}
 async change(input){this.items=await this.database.call('extensionMutation',input);if(input.id&&input.action!=='stage'){this.options.pageChanged?.(input.id,input.action);this.hosts?.reconcile(input.id);}this.options.publish?.();return this.snapshot();}
 install(input){const manifest=validate(input);return this.serial(()=>this.change({action:'legacy',id:manifest.id,item:{id:manifest.id,kind:'legacy',manifest,enabled:true,trusted:false,generation:0}}));}
 installPackage(source,mode,confirm){return this.serial(async()=>{
  if(!this.packages)throw Error('Package store unavailable');const revision=await this.packages.prepare(source,mode);
  if(!await confirm(revision))return this.snapshot();
  await this.change({action:'stage',id:revision.id,revision});
  // A4 supplies quiesce before switching a running generation.
  await this.options.stop?.(revision.id);
  return this.change({action:'commit',id:revision.id,digest:revision.digest});
 });}
 rollback(id,digest,confirm){return this.serial(async()=>{
  const item=this.items.find(i=>i.id===id),previous=item?.revisions?.find(r=>r.digest===digest);if(!previous)throw Error('NOT_FOUND: Revision');
  const source=require('node:path').join(this.packages.root,previous.relativePath),checked=await this.packages.prepare(source,'directory');
  if(checked.digest!==digest)throw Error('Package integrity changed');if(!await confirm(checked))return this.snapshot();
  await this.change({action:'stage',id,revision:previous});await this.options.stop?.(id);return this.change({action:'commit',id,digest});
 });}
 setEnabled(id,enabled){if(typeof id!=='string'||typeof enabled!=='boolean')throw Error('Invalid extension update');return this.serial(async()=>{const item=this.items.find(i=>i.id===id);if(enabled&&item?.kind==='package'){if(!item.trusted)throw Error('请先选择版本并确认代码信任');const revision=item.revisions.find(r=>r.digest===item.active);const checked=await this.packages.prepare(require('node:path').join(this.packages.root,revision.relativePath),'directory');if(checked.digest!==item.active)throw Error('Package integrity changed');}await this.options.stop?.(id);return this.change({action:'enable',id,enabled});});}
 remove(id,deleteData=false){return this.serial(async()=>{await this.options.stop?.(id);return this.change({action:'remove',id,deleteData});});}
 setGrants(id,grants,expectedGeneration=this.items.find(i=>i.id===id)?.generation,guard){return this.serial(async()=>{guard?.();await this.hosts?.stop(id);guard?.();return this.change({action:'grants',id,grants,expectedGeneration});});}
 check(context,capability,projectId){if(['projects.read','projects.path.read','conversations.create','conversations.open'].includes(capability)&&context.projectId!==undefined&&context.projectId!==projectId)return Promise.reject(Error('FORBIDDEN: Invocation project mismatch'));return this.database.call('extensionCheck',{id:context.id,generation:context.generation,capability,projectId});}
 configuration(input){return this.serial(async()=>{
  const item=this.items.find(i=>i.id===input?.id);
  if(!item||item.kind!=='package'||!item.manifest.configuration)throw Error('NOT_FOUND: Configuration');
  const context={id:item.id,generation:item.generation};
  if(input.action&&input.action!=='get'){
   if(input.generation!==item.generation)throw Error('CONFLICT: Extension changed');
   if(input.action==='reset'){
    await this.check(context,'configuration');
    await this.database.call('extensionData',{...context,capability:'configuration',kind:'configuration',key:'settings',write:true,value:null,expectedRevision:input.expectedRevision});
    this.hosts?.configurationChanged(item.id,{});
   }else if(input.action==='save')await this.storage(context,'settings',{kind:'configuration',write:true,value:input.value,expectedRevision:input.expectedRevision});
   else throw Error('INVALID_ARGUMENT');
   this.options.publish?.();
  }
  const data=await this.storage(context,'settings',{kind:'configuration'});
  const schema=structuredClone(item.manifest.configuration);
  const localize=node=>{if(node.description)node.description=this.localized(item,node.description);for(const child of Object.values(node.properties||{}))localize(child);if(node.items)localize(node.items);};localize(schema);
  return {schema,value:data.value||{},revision:data.revision,generation:item.generation};
 });}
 async storage(context,key,{kind='kv',write=false,value,expectedRevision,deleteValue=value===null}={}){
  const capability={kv:'storage',secret:'secrets',configuration:'configuration'}[kind];let encoded;
  if(write&&kind==='configuration'){const schema=this.items.find(i=>i.id===context.id)?.manifest.configuration;if(key!=='settings'||!schema||value===null||!(await this.packages.validateValue(schema,value)))throw Error('INVALID_ARGUMENT: Configuration');}
  if(write&&!deleteValue){if(kind==='secret'){if(typeof value!=='string'||!this.options.encryption?.isEncryptionAvailable())throw Error('Secure storage unavailable');encoded=this.options.encryption.encryptString(value).toString('base64');}else encoded=JSON.stringify(value);}
  const result=await this.database.call('extensionData',{id:context.id,generation:context.generation,capability,kind,key,write,value:deleteValue?null:encoded,expectedRevision});
  if(!write)result.exists=result.value!==null;
  if(!write&&result.value!==null){if(kind==='secret'){if(!this.options.encryption?.isEncryptionAvailable())throw Error('Secure storage unavailable');result.value=this.options.encryption.decryptString(Buffer.from(result.value,'base64'));}else result.value=JSON.parse(result.value);}
  await this.check(context,capability);if(write&&kind==='configuration')this.hosts?.configurationChanged(context.id,value);return result;
 }
 execute(id,projectId){for(const item of this.items){if(!item.enabled)continue;const command=item.manifest?.contributes?.commands?.find(c=>c.id===id);if(!command)continue;if(item.kind==='legacy')return {extensionId:item.id,viewId:command.viewId};if(!item.trusted||!item.manifest.contributes.home)throw Error('FORBIDDEN');const types={'project.exists':'boolean'},values={'project.exists':!!projectId};for(const key of item.manifest.contextKeys||[]){types[key.key]=key.type;values[key.key]=this.hosts?.entries.get(item.id)?.context[key.key]??key.default;}for(const condition of [command.when,item.manifest.contributes.home.when])if(condition&&!require('./condition.cjs').compileCondition(condition,types)(values))throw Error('FORBIDDEN');return {extensionId:item.id,viewId:item.id};}throw Error('命令不存在或扩展已停用');}
}
module.exports={ExtensionService};
