function validateEnvironment(e){
 if(e===undefined)return;
 if(!e||typeof e!=='object'||Array.isArray(e))throw Error('工作环境无效');
 if(e.kind==='host'&&Object.keys(e).length===1)return;
 const keys=['kind','endpoint','daemonId','containerId','containerName','imageId','user','shell'];
 if(e.kind!=='docker'||Object.keys(e).some(k=>!keys.includes(k))||!/^unix:\/\/\/[^\0\r\n]{1,400}$/.test(e.endpoint||'')||!/^[a-f0-9]{64}$/.test(e.containerId||'')||typeof e.daemonId!=='string'||!e.daemonId||e.daemonId.length>200||typeof e.containerName!=='string'||!e.containerName||e.containerName.length>200||typeof e.imageId!=='string'||e.imageId.length>200||!(e.user===null||typeof e.user==='string'&&/^[a-zA-Z0-9_.-]+(?::[a-zA-Z0-9_.-]+)?$/.test(e.user)&&e.user.length<=120)||!['auto','bash','sh'].includes(e.shell))throw Error('Docker 工作环境无效，请重新选择容器');
}
function environmentKey(e){return !e||e.kind==='host'?'host':JSON.stringify([e.kind,e.endpoint,e.daemonId,e.containerId,e.imageId,e.user,e.shell]);}
function sameTarget(a,b){return !!a&&!!b&&a.connectionId===b.connectionId&&a.path===b.path&&environmentKey(a.environment)===environmentKey(b.environment);}
function targetSnapshot(p){return {connectionId:p.connectionId,path:p.path,...(p.environment?{environment:structuredClone(p.environment)}:{})};}
function targetLabel(p){return p.environment?.kind==='docker'?`${p.environment.containerName} (${p.environment.containerId.slice(0,12)}) → ${p.path}`:p.path;}
module.exports={validateEnvironment,environmentKey,sameTarget,targetSnapshot,targetLabel};
