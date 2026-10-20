// Platform-neutral composition. Electron supplies storage, credentials and event delivery.
const {ExtensionService}=require('./extensions/service.cjs');
const {createStore}=require('../electron/store.cjs');
const {createProviderStore}=require('../electron/provider.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {createSkills}=require('../electron/skills.cjs');
const {createProjectFiles}=require('../electron/project-files.cjs');
function createCoreServices({directory,database,encryption,publish,fileApplications}){
 const workspace=createStore(directory,database);
 const providers=createProviderStore(directory,encryption,database);
 const skills=createSkills(directory,database);
 const tasks=new AgentRuntime({directory,database,provider:providers,workspace,skills,publish});
 const localFiles=createProjectFiles({applications:fileApplications,cacheDirectory:require('node:path').join(directory,'office-preview'),getWorkspace:()=>workspace.read(),getRuns:()=>tasks.runs,
 getApprovedApps:async()=>await database.call('readSetting',{key:'fileApplications'})||[],
 setApprovedApps:value=>database.call('writeSetting',{key:'fileApplications',value})});
 const ssh=new (require('./ssh/service.cjs').SshService)({database,encryption});
 const remoteFiles=new (require('./ssh/files.cjs').RemoteFiles)({ssh,workspace,runs:()=>tasks.runs,directory});
 tasks.ssh=ssh;tasks.remoteFiles=remoteFiles;
 const files=Object.fromEntries(Object.keys(localFiles).map(method=>[method,async(input,...rest)=>{
  if(method==='resource')return new URL(input.url).hostname.startsWith('ssh-')?remoteFiles.resource(input):localFiles.resource(input);
  const project=input?.projectId?(await workspace.read()).projects.find(p=>p.id===input.projectId):null;
  if(project?.type==='ssh'){if(typeof remoteFiles[method]!=='function')throw Error('远端项目暂不支持此操作');return remoteFiles[method](input,...rest);}
  return localFiles[method](input,...rest);
 }]));
 const path=require('node:path'),fs=require('node:fs');
 const packagedValidator=process.resourcesPath&&path.join(process.resourcesPath,'tools/extension-manifest.cjs');
 const extensions=new ExtensionService(database,{directory,encryption,validator:packagedValidator&&fs.existsSync(packagedValidator)?packagedValidator:undefined});
 const messages=new (require('./extensions/message-service.cjs').MessageService)(database);
 extensions.messages=messages;
 const automation=new (require('./automation/service.cjs').AutomationService)({database,extensions,providers});extensions.automation=automation;
 return {workspace,providers,skills,tasks,files,ssh,remoteFiles,extensions,messages,automation};
}
module.exports={createCoreServices};
