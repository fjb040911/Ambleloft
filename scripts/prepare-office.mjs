import {build} from 'esbuild';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const result=await build({entryPoints:['electron/office-worker.cjs'],outfile:'build/office-worker.cjs',bundle:true,platform:'node',format:'cjs',target:'node22',legalComments:'eof',metafile:true});
const packages=new Set(Object.keys(result.metafile.inputs).filter(p=>p.startsWith('node_modules/')).map(p=>{const parts=p.split('/');return parts[1].startsWith('@')?parts.slice(0,3).join('/'):parts.slice(0,2).join('/');}));
let notices='Office preview third-party licenses\n\n';
for(const dir of packages){const pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));const files=(await readdir(dir)).filter(name=>/^licen[cs]e(?:\.|$)/i.test(name));notices+=`${pkg.name} ${pkg.version} (${pkg.license||'see license'})\n`;for(const file of files)notices+=await readFile(path.join(dir,file),'utf8')+'\n';notices+='\n';}
await writeFile('build/office-LICENSES.txt',notices);
