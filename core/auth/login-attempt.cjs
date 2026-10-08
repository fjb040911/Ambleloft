const http=require('node:http');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const random=()=>randomBytes(32).toString('base64url');
// One ephemeral listener per explicit login. No tokens or codes are rendered.
async function createLoginAttempt({timeoutMs=180000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>600000)throw Error('INVALID_ARGUMENT');
 const state=random(),nonce=random(),verifier=random();
 let finish,timer,settled=false;
 const result=new Promise(resolve=>{finish=resolve;});
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/plain; charset=utf-8');
  res.setHeader('Content-Security-Policy',"default-src 'none'");
  if(req.method!=='GET'||url.pathname!=='/callback'){res.writeHead(404);res.end('Not found');return;}
  const candidate=url.searchParams.get('state')||'';
  if(url.searchParams.getAll('state').length!==1||Buffer.byteLength(candidate)!==Buffer.byteLength(state)||!timingSafeEqual(Buffer.from(candidate),Buffer.from(state))){res.writeHead(400);res.end('Invalid login request');return;}
  if(settled){res.writeHead(410);res.end('Login attempt ended');return;}
  const codes=url.searchParams.getAll('code'),errors=url.searchParams.getAll('error');
  if(codes.length===1&&codes[0]&&codes[0].length<=8192&&!errors.length){res.end('Login received. You can return to AmbleLoft.');end({status:'callback',code:codes[0],parameters:url.searchParams.toString()});}
  else if(errors.length===1&&!codes.length){res.end('Login was not completed. You can return to AmbleLoft.');end({status:'denied'});}
  else{res.writeHead(400);res.end('Invalid login response');end({status:'invalid'});}
 });
 function end(value){if(settled)return;settled=true;clearTimeout(timer);server.close();server.closeIdleConnections();finish(value);}
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 server.on('error',()=>end({status:'failed'}));
 timer=setTimeout(()=>end({status:'timeout'}),timeoutMs);timer.unref?.();
 return {state,nonce,verifier,challenge:createHash('sha256').update(verifier).digest('base64url'),redirectUri:`http://127.0.0.1:${server.address().port}/callback`,result,cancel:()=>end({status:'cancelled'})};
}
module.exports={createLoginAttempt};
