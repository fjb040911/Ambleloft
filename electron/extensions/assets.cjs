const fs=require('node:fs/promises');const path=require('node:path');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
const CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
async function resource(root,origin,request){
 try{
  const url=new URL(request.url);if(!['GET','HEAD'].includes(request.method)||`${url.protocol}//${url.host}`!==origin||url.username||url.password)return new Response(null,{status:403});
  const relative=decodeURIComponent(url.pathname).replace(/^\//,'');if(!relative||relative.includes('\\')||relative.includes(':')||relative.includes('\0')||relative.split('/').some(s=>!s||s==='.'||s==='..'))return new Response(null,{status:403});
  let target=root;for(const segment of relative.split('/')){target=path.join(target,segment);if((await fs.lstat(target)).isSymbolicLink())return new Response(null,{status:403});}
  const canonical=await fs.realpath(root);if(canonical!==root)return new Response(null,{status:403});const resolved=await fs.realpath(target),rel=path.relative(canonical,resolved);if(rel.startsWith('..')||path.isAbsolute(rel))return new Response(null,{status:403});
  const stat=await fs.stat(target);if(!stat.isFile()||stat.size>32*1024*1024)return new Response(null,{status:403});
  const type=MIME[path.extname(target).toLowerCase()];if(!type)return new Response(null,{status:403});
  return new Response(request.method==='HEAD'?null:await fs.readFile(target),{headers:{'Content-Type':type,'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch{return new Response(null,{status:404});}
}
module.exports={resource,CSP};
