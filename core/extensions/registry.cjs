// Declarative contributions only. Executable extensions require a separate host.
const CAPABILITIES=Object.freeze({'ui.views':1,'ui.commands':1});
const text=(value,max=120)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
function validate(manifest){
 if(!manifest||!/^([a-z0-9-]+)\.([a-z0-9-]+)$/.test(manifest.id)||manifest.id.length>120||manifest.apiVersion!=='1')throw new Error('Invalid extension identity or API version');
 if(!text(manifest.name)||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw new Error('Invalid extension name or version');
 const allowed=['id','name','description','version','apiVersion','requiredCapabilities','optionalCapabilities','contributes'];
 if(Object.keys(manifest).some(key=>!allowed.includes(key)))throw new Error('Unsupported manifest field; executable extensions are not supported yet');
 for(const key of ['requiredCapabilities','optionalCapabilities'])if(manifest[key]!==undefined&&(!Array.isArray(manifest[key])||manifest[key].some(v=>!text(v))))throw new Error('Invalid capability list');
 for(const capability of manifest.requiredCapabilities||[])if(!Object.hasOwn(CAPABILITIES,capability))throw new Error('Unsupported capability: '+capability);
 if(manifest.description!==undefined&&!text(manifest.description,2000))throw new Error('Invalid description');
 const contributions=manifest.contributes;
 if(!contributions||typeof contributions!=='object'||Array.isArray(contributions)||Object.keys(contributions).some(k=>!['views','commands'].includes(k)))throw new Error('Unsupported contribution');
 const views=contributions.views||[],commands=contributions.commands||[];
 if(!Array.isArray(views)||!Array.isArray(commands)||views.length>20||commands.length>50)throw new Error('Invalid contribution list');
 const ids=new Set();
 for(const item of [...views,...commands]){
  if(!item||!text(item.id,180)||!item.id.startsWith(manifest.id+'.')||!text(item.title)||ids.has(item.id))throw new Error('Invalid contribution identity');
  ids.add(item.id);
 }
 for(const view of views)if(!text(view.body,50000)||Object.keys(view).some(k=>!['id','title','body'].includes(k)))throw new Error('Invalid view');
 for(const command of commands)if(!views.some(view=>view.id===command.viewId)||Object.keys(command).some(k=>!['id','title','viewId'].includes(k)))throw new Error('Invalid command target');
 return structuredClone(manifest);
}
class ExtensionRegistry {
 constructor(){this.capabilities=CAPABILITIES;this.entries=new Map();}
 register(input){
  const manifest=validate(input);
  if(this.entries.has(manifest.id))throw new Error('Extension already registered');
  this.entries.set(manifest.id,manifest);
  return ()=>{if(this.entries.get(manifest.id)===manifest)this.entries.delete(manifest.id);};
 }
 list(){return structuredClone([...this.entries.values()]);}
}
module.exports={ExtensionRegistry,validate,CAPABILITIES};
