import {cp,mkdir} from 'node:fs/promises';
// Keep PDF fonts, CMaps and decoders local so document preview also works offline.
const destination=new URL('../public/pdfjs/',import.meta.url);
await mkdir(destination,{recursive:true});
for(const directory of ['cmaps','standard_fonts','wasm','iccs']) {
 await cp(new URL(`../node_modules/pdfjs-dist/${directory}/`,import.meta.url),new URL(directory+'/',destination),{recursive:true});
}
await cp(new URL('../node_modules/pdfjs-dist/LICENSE',import.meta.url),new URL('LICENSE',destination));
