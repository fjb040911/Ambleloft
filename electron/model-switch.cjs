const {randomUUID}=require('node:crypto');
const {abortable}=require('../core/automation/inference-deadline.cjs');
const {findCodex}=require('./codex-rpc.cjs');
const {prepareEngineHome}=require('./engine.cjs');
const {startChatBridge,usesChat}=require('./chat-bridge.cjs');
const {fingerprint,redact}=require('./provider.cjs');
const {imageInputInstructions}=require('./model-capabilities.cjs');
const choice=config=>({providerId:config.id,model:config.model});
function validate(input){if(!input||typeof input.providerId!=='string'||!input.providerId||typeof input.model!=='string'||!input.model.trim())throw Error('请选择有效的模型服务和模型');}
function confirmCrossing(run,config,input){if((run.baseUrl!==config.baseUrl||run.providerId&&run.providerId!==config.id)&&input.confirmProviderChange!==true)throw Error('切换服务需要确认将会话历史发送到新的端点');}
async function switchModel(input){
 validate(input);
 const run=this.runs.find(r=>r.id===input.runId);if(!run)throw Error('任务不存在');
 const config=await abortable(this.provider.secret(input.providerId,input.model),AbortSignal.timeout(30000));
 confirmCrossing(run,config,input);
 const previous={providerId:run.providerId,model:run.model};
 const queued=[...this.contexts.values()].find(c=>c.run===run&&!c.done&&!c.cancelled);
 if(queued?.run.queued&&!queued.launched){
  if(queued.permissionTransition)throw Error('执行设置正在切换，请等待结果');
  if(run.collaboration)await this.spaces?.authorizeRun(run);
  if(!queued.launched&&!queued.done&&!queued.cancelled){
   if(queued.remoteProject)config.remoteOnly=true;
   const record={id:randomUUID(),requested:choice(config),previous,state:'configured',effective:null,startedAt:new Date().toISOString()};
   queued.pendingModelConfig=config;queued.pendingModelChange=record;this.conversation.stop(queued);delete queued.conversationAbort;queued.config=config;run.modelChange=record;
   this.changed(run);await this.persist();return structuredClone(record);
  }
 }
 return require('./permission-switch.cjs').switchPermission.call(this,{runId:run.id,permission:run.permission||'default'}, {
  requested:choice(config),previous,
  reconnect:async(context,check)=>{
   if(context.remoteProject)config.remoteOnly=true;
   const executable=await findCodex(config.executable);check();
   const home=context.rpcLocation?.home||await prepareEngineHome(this.directory),cwd=context.rpcLocation?.cwd||run.cwd;
   const nextSession=randomUUID();
   const bridge=await startChatBridge(config,nextSession,!usesChat(config),diagnostic=>{if(context.config===config)this.modelDiagnostic(context,diagnostic);},require('../core/project-insights/usage.cjs').observer(this.database,{projectId:run.projectId,runId:run.id,turnId:context.turnKey,providerId:config.id,model:config.model,purpose:'development',origin:run.collaboration?'workforce-expert':'chat'}));
   try{check();}catch(e){bridge?.close();throw e;}
   // Archived engine threads contain the full history. Replace only the transport,
   // model credentials and adapter; the host context and input services survive.
   const oldConfig=context.config;
   this.conversation.stop(context);delete context.conversationAbort;
   await context.rpc.close();
   try{check();}catch(e){bridge?.close();throw e;}
   context.bridge?.close();context.bridge=bridge;
   context.config=config;context.lastModelDiagnostic=null;
   if(context.engineParameters){const oldImages=imageInputInstructions(oldConfig);context.engineParameters={...context.engineParameters,model:config.model,developerInstructions:(oldImages?context.engineParameters.developerInstructions.replace(oldImages,''):context.engineParameters.developerInstructions)+imageInputInstructions(config)};}
   let rpc;
   rpc=this.rpcFactory({executable,home,cwd,config:bridge?.config||config,extensionMcp:context.extensionChannel?.config,
    notification:m=>{if(context.rpc===rpc)this.notification(context,m);},request:m=>{if(context.rpc===rpc)this.request(context,m);},
    exit:e=>{if(context.rpc===rpc&&!context.done&&!context.permissionTransition)void this.finish(context,'failed',redact(e.message,config.apiKey));}});
   context.rpc=rpc;context.rpcLocation={home,cwd};run.modelSessionId=nextSession;
   await rpc.call('initialize',{clientInfo:{name:'atelier',version:require('../package.json').version}});check();rpc.send({method:'initialized',params:{}});
  },
  parameters:()=>({model:config.model,modelProvider:'atelier'}),
  matches:applied=>applied.model===config.model&&applied.modelProvider==='atelier',
  commit:()=>{run.providerId=config.id;run.model=config.model;run.baseUrl=config.baseUrl;run.providerFingerprint=fingerprint(config);}
 });
}
module.exports={switchModel,validate,confirmCrossing,choice};
