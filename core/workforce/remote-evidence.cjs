// Read-only, bounded fingerprint of the assigned remote project. No source body
// is returned or sent to a review model. Missing Python, unreadable files, large
// trees and concurrent writes produce incomplete evidence, never a false pass.
const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
const script=String.raw`import os,json,hashlib,subprocess,stat
root=os.path.realpath('.')
ignored={'.git','node_modules','.venv','venv','__pycache__'}
rows=[]; total=0; complete=True
def inaccessible(error):
 global complete
 complete=False
try:
 for base,dirs,files in os.walk(root,followlinks=False,onerror=inaccessible):
  for name in list(dirs):
   p=os.path.join(base,name)
   if name in ignored: dirs.remove(name)
   elif os.path.islink(p): complete=False; dirs.remove(name)
  for name in sorted(files):
   p=os.path.join(base,name); before=os.lstat(p)
   if not stat.S_ISREG(before.st_mode): complete=False; continue
   total+=before.st_size
   if len(rows)>=3000 or total>67108864: raise RuntimeError('limit')
   h=hashlib.sha256()
   with open(p,'rb') as f:
    while True:
     chunk=f.read(65536)
     if not chunk: break
     h.update(chunk)
   after=os.lstat(p)
   if (before.st_size,before.st_mtime_ns,before.st_ino)!=(after.st_size,after.st_mtime_ns,after.st_ino): complete=False
   rows.append([os.path.relpath(p,root),h.hexdigest()])
except Exception: complete=False
head=None
try:
 r=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True,timeout=2)
 if r.returncode==0: head=r.stdout.strip()
except Exception: pass
print(json.dumps({'digest':hashlib.sha256(json.dumps(sorted(rows),ensure_ascii=True,separators=(',',':')).encode()).hexdigest(),'head':head,'files':len(rows),'complete':complete,'scope':'project-source-v1'}))`;
async function capture(ssh,project,signal){
 const result=await ssh.execute(project.connectionId,project.path,'python3 -c '+quote(script),{signal,environment:project.environment,timeoutMs:8000});
 if(result.exitCode!==0||result.truncated)throw Error('远端版本记录不可用');
 const value=JSON.parse(result.stdout);
 if(!/^[a-f0-9]{64}$/.test(value.digest)||typeof value.complete!=='boolean'||value.scope!=='project-source-v1')throw Error('远端版本记录无效');
 return {...value,at:new Date().toISOString()};
}
module.exports={capture,script};
