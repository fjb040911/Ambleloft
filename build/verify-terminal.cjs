const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
module.exports=async context=>{
 const arch={1:'x64',3:'arm64'}[context.arch];
 if(context.electronPlatformName!==process.platform||arch!==process.arch)throw Error('Terminal binaries must be verified on the target platform and architecture');
 const electron=require('electron');
 await promisify(execFile)(electron,[path.join(context.packager.projectDir,'scripts/probes/terminal-native.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},timeout:15000});
};
