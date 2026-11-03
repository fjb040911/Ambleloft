const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {snapshot}=require('../../electron/file-changes.cjs');
const execute=promisify(execFile);
function fingerprint(scan){
 const files=[...scan.files].map(([name,file])=>[name,file.hash||file.signature]).sort((a,b)=>a[0].localeCompare(b[0]));
 return {digest:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files:files.length,complete:!scan.incomplete&&![...scan.files.values()].some(f=>f.limited)};
}
async function capture(root,scan){
 let head=null;try{head=(await execute('git',['rev-parse','HEAD'],{cwd:root,timeout:3000,maxBuffer:4096})).stdout.trim();}catch{}
 return {...fingerprint(scan||await snapshot(root)),head,at:new Date().toISOString()};
}
module.exports={capture,fingerprint};
