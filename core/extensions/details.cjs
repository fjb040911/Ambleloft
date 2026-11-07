const fs=require('node:fs/promises');const path=require('node:path');
// Older packages may put a translated section after their primary README.
function localizedReadme(text,locale){
 const match=/^## English\s*$/m.exec(text);
 if(!match||!/[\u3400-\u9fff]/.test(text.slice(0,match.index)))return text;
 return (String(locale).toLowerCase().startsWith('zh')?text.slice(0,match.index):text.slice(match.index+match[0].length)).trim();
}
async function extensionDetails(service,id){
 const item=service.items.find(i=>i.id===id);if(!item)throw Error('扩展不存在');
 const result={readme:'',publisher:item.manifest.publisher||'',size:null};
 if(item.kind!=='package'||!service.packages)return result;
 const revision=item.revisions?.find(r=>r.digest===item.active);if(!revision?.relativePath)return result;
 const root=path.resolve(service.packages.root,revision.relativePath);
 const relative=path.relative(service.packages.root,root);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('扩展路径无效');
 if(await fs.realpath(root)!==root)throw Error('扩展路径无效');
 const entries=await fs.readdir(root);const locale=service.options?.locale||'en';
 const names=String(locale).toLowerCase().startsWith('zh')?['readme.zh-cn.md','readme.zh.md','readme.md']:['readme.en.md','readme.md'];
 const name=names.map(candidate=>entries.find(n=>n.toLowerCase()===candidate)).find(Boolean);
 if(name){const target=path.join(root,name);const stat=await fs.lstat(target);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=1024*1024)result.readme=localizedReadme(await fs.readFile(target,'utf8'),locale);}
 let size=0,count=0;async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(++count>20000)throw Error('扩展文件过多');const target=path.join(dir,entry.name);if(entry.isDirectory())await walk(target);else if(entry.isFile())size+=(await fs.stat(target)).size;}}
 await walk(root);result.size=size;return result;
}
module.exports={extensionDetails};
