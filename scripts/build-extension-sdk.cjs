const fs=require('node:fs/promises');const path=require('node:path');
async function buildSDK(){const root=path.resolve(__dirname,'../packages/extension-sdk');await fs.mkdir(path.resolve(__dirname,'../dist/sdk'),{recursive:true});await fs.copyFile(path.resolve(__dirname,'../specs/extensions/contracts/sdk.d.ts'),path.join(root,'contracts.d.ts'));await fs.copyFile(path.resolve(__dirname,'../specs/extensions/contracts/extension.schema.json'),path.join(root,'extension.schema.json'));await fs.copyFile(path.resolve(__dirname,'../specs/extensions/contracts/form.schema.json'),path.join(root,'form.schema.json'));return root;}
if(require.main===module)buildSDK().then(root=>console.log('SDK ready: '+root)).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={buildSDK};
