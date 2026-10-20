import {useEffect,useState} from 'react';
import type {SshConnection} from './SshProjectFields';
export const sshLabels:Record<string,string>={unavailable:'状态不可用',missing:'未配置',loading:'读取状态…',connecting:'连接中',connected:'已连接',disconnected:'未连接',disconnecting:'正在断开',reconnecting:'正在重连',authentication:'需要认证',untrusted:'身份校验失败',error:'连接失败'};
export function sshErrorMessage(error:unknown){const message=(error as Error)?.message||String(error);return /No handler registered for ['"]ssh:/.test(message)?'SSH 功能尚未在当前桌面进程中加载，请完全退出并重新启动应用。开发模式请重新运行 npm run dev，仅刷新窗口无效。':message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');}
export function useSshConnections(){
 const api=window.desktop?.ssh;
 const [snapshot,setSnapshot]=useState<{connections:SshConnection[];loading:boolean;error:string}>({connections:[],loading:true,error:''});
 useEffect(()=>{if(!api){setSnapshot({connections:[],loading:false,error:'SSH 功能不可用，请重新启动桌面应用。'});return;}let live=true,revision=0;
  const load=async()=>{const current=++revision;try{const connections=await api.list();if(live&&current===revision)setSnapshot({connections,loading:false,error:''});}catch(e){if(live&&current===revision)setSnapshot(old=>({...old,loading:false,error:sshErrorMessage(e)}));}};
  const off=api.onChanged(()=>void load());void load();return()=>{live=false;off();};
 },[api]);
 return snapshot;
}
