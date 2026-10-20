const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {ENGINE_VERSION,probeVersion}=require('../electron/engine.cjs');
module.exports=async context=>{
 const arch={1:'x64',3:'arm64'}[context.arch];
 if(process.platform!=='linux'||context.electronPlatformName!=='linux'||arch!==process.arch)throw Error('Linux package must be built on the target Linux architecture');
 const root=path.join(context.packager.projectDir,'vendor/engine',`linux-${arch}`);
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 if(manifest.version!==ENGINE_VERSION||manifest.platform!=='linux'||manifest.arch!==arch)throw Error('Engine manifest mismatch');
 for(const [file,expected] of Object.entries(manifest.files)){
  const full=path.resolve(root,file),relative=path.relative(root,full);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Engine resource outside bundle');
  if(createHash('sha256').update(await fs.readFile(full)).digest('hex')!==expected)throw Error(`Engine resource changed: ${file}`);
 }
 await probeVersion(path.join(root,'bin/codex'));
 await require('./verify-terminal.cjs')(context);
};
