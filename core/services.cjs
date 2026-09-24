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
 const files=createProjectFiles({getWorkspace:()=>workspace.read(),getRuns:()=>tasks.runs,
 getApprovedApps:async()=>await database.call('readSetting',{key:'fileApplications'})||[],
 setApprovedApps:value=>database.call('writeSetting',{key:'fileApplications',value})});
 return {workspace,providers,skills,tasks,files,extensions:new ExtensionService(database)};
}
module.exports={createCoreServices};
