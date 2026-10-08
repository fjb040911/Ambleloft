const fs=require('node:fs/promises');const path=require('node:path');const {build}=require('esbuild');const {buildSDK}=require('./build-extension-sdk.cjs');const {packExtension}=require('./pack-extension.cjs');
async function buildDemo({output=path.resolve(__dirname,'../dist/extensions')}={}){
 const sdk=await buildSDK(),source=path.resolve(__dirname,'../examples/extensions/project-card'),directory=path.join(output,'project-card');await fs.rm(directory,{recursive:true,force:true});await fs.mkdir(directory,{recursive:true});
 const manifest=JSON.parse(await fs.readFile(path.join(source,'extension.json'),'utf8'));delete manifest.$schema;await fs.writeFile(path.join(directory,'extension.json'),JSON.stringify(manifest,null,2)+'\n');
 for(const name of (await fs.readdir(source)).filter(n=>n.startsWith('extension.nls')))await fs.copyFile(path.join(source,name),path.join(directory,name));
 await fs.cp(path.join(source,'web'),path.join(directory,'web'),{recursive:true});
 const packageMeta=JSON.parse(await fs.readFile(path.join(sdk,'package.json'),'utf8')),dependency=path.join(directory,'node_modules',packageMeta.name);await fs.mkdir(dependency,{recursive:true});
 for(const name of ['package.json',...packageMeta.files])await fs.copyFile(path.join(sdk,name),path.join(dependency,name));
 await build({entryPoints:[path.join(source,'src/extension.ts')],outfile:path.join(directory,'dist/extension.cjs'),bundle:true,platform:'node',format:'cjs',target:'node22',external:['@ambleloft/extension-sdk']});
 await build({entryPoints:[path.join(source,'src/page.ts')],outfile:path.join(directory,'web/app.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',alias:{'@ambleloft/extension-sdk/webview':path.join(sdk,'webview.mjs')}});
 const result=await packExtension(directory,path.join(output,'project-card.amble-extension'),{force:true});return {directory,...result};
}
if(require.main===module)buildDemo().then(r=>console.log(JSON.stringify(r,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={buildDemo};
