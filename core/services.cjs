// Platform-neutral composition. Electron supplies storage, credentials and event delivery.
const {ExtensionService}=require('./extensions/service.cjs');
const {createStore}=require('../electron/store.cjs');
const {createProviderStore}=require('../electron/provider.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {createSkills}=require('../electron/skills.cjs');
const {createProjectFiles}=require('../electron/project-files.cjs');
function createCoreServices({directory,database,encryption,publish}){
 const workspace=createStore(directory,database);
 const providers=createProviderStore(directory,encryption,database);
 const skills=createSkills(directory,database);
 const tasks=new AgentRuntime({directory,database,provider:providers,workspace,skills,publish});
 const files=createProjectFiles({cacheDirectory:require('node:path').join(directory,'office-preview'),getWorkspace:()=>workspace.read(),getRuns:()=>tasks.runs,
 getApprovedApps:async()=>await database.call('readSetting',{key:'fileApplications'})||[],
 setApprovedApps:value=>database.call('writeSetting',{key:'fileApplications',value})});
 const path=require('node:path'),fs=require('node:fs');
 const packagedValidator=process.resourcesPath&&path.join(process.resourcesPath,'tools/extension-manifest.cjs');
 const extensions=new ExtensionService(database,{directory,encryption,validator:packagedValidator&&fs.existsSync(packagedValidator)?packagedValidator:undefined});
 const messages=new (require('./extensions/message-service.cjs').MessageService)(database);
 extensions.messages=messages;
 return {workspace,providers,skills,tasks,files,extensions,messages};
}
module.exports={createCoreServices};
