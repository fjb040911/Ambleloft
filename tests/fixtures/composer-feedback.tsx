import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ChatComposer from '../../src/ChatComposer';
import ComposerControls from '../../src/ComposerControls';
import RunActivity from '../../src/RunActivity';
import {ConfirmationProvider} from '../../src/Confirmation';
import {setLanguage} from '../../src/i18n';
import type {AgentRun,ModelChange,PermissionChange} from '../../src/types';
import '../../src/shadcn.css';import '../../src/styles.css';
setLanguage('zh');
const choice={providerId:'test',model:'DeepSeek'};
function Fixture(){
 const [state,setState]=useState<ModelChange['state']>('applied'),[mounted,setMounted]=useState(true),[value,setValue]=useState('未发送的输入');
 const model:ModelChange={id:'model',requested:choice,previous:choice,effective:choice,state};
 const permission:PermissionChange={id:'permission',requested:'full',previous:'default',effective:'full',state};
 const run={id:'test',status:'running',createdAt:new Date().toISOString(),lastEventAt:new Date().toISOString()} as AgentRun;
 return <ConfirmationProvider><div style={{padding:16,maxWidth:1000,margin:'auto'}}><nav>{(['switching','configured','applied','failed'] as const).map(s=><button key={s} onClick={()=>setState(s)}>{s}</button>)}<button onClick={()=>setMounted(v=>!v)}>mount</button></nav><p>用于验证普通聊天与讨论共用的输入组件，不调用模型。</p>{mounted&&<div className="conversation-dock"><RunActivity compact run={run} turn={{tools:[1,2,3].map(id=>({id:String(id),status:'running',label:'读取文件',type:'mcpToolCall'})),messages:[],user:{id:'test'}} as never}/><ChatComposer value={value} onChange={setValue} onSubmit={()=>{}} label="测试输入" placeholder="继续" canSend active onStop={()=>{}} sendLabel="发送" followup skills={null} controls={<ComposerControls value={{...choice,permission:'full'}} onChange={()=>{}} catalog={{providers:[],defaultId:''}} modelChange={model} permissionChange={permission}/>}/></div>}</div></ConfirmationProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
