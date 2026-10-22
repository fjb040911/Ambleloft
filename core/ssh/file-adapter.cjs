const path=require('node:path').posix;
// Read-only SFTP-shaped adapter for existing preview/rendering code. Container
// writes use the transactional helper, never a sequence of per-byte exec calls.
function containerAdapter(docker,project,root){
 const request=(op,file,extra={})=>docker.file(project.connectionId,project.environment,{op,root,path:path.relative(root,file),...extra});
 const wrap=(promise,callback)=>promise.then(value=>callback(null,value),callback);
 return {
  stat(file,cb){wrap(request('stat',file).then(s=>({...s,isFile:()=>s.file,isDirectory:()=>s.directory})),cb);},
  readdir(file,cb){wrap(request('list',file).then(list=>list.entries.map(e=>({filename:e.name,attrs:{isSymbolicLink:()=>false,isDirectory:()=>e.directory,isFile:()=>!e.directory}}))),cb);},
  open(file,_flags,cb){wrap(request('bytes',file,{limit:33554432}).then(r=>Buffer.from(r.data,'base64')),cb);},
  read(buffer,target,offset,length,position,cb){const n=buffer.copy(target,offset,position,position+length);cb(null,n);},
  close(_handle,cb){cb(null);},
 };
}
module.exports={containerAdapter};
