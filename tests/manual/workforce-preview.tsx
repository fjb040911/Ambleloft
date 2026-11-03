import React from 'react';import {createRoot} from 'react-dom/client';
import Workforce from '../../src/Workforce';import {ConfirmationProvider} from '../../src/Confirmation';import {setLanguage} from '../../src/i18n';
import '../../src/shadcn.css';import '../../src/styles.css';import '../../src/workspace-polish.css';
setLanguage(new URLSearchParams(location.search).get('lang')==='en'?'en':'zh-CN');
const projects=[{id:'qa-gateway',name:'api-gateway',path:'/example/api-gateway',createdAt:new Date().toISOString()},{id:'qa-router',name:'model-router',path:'/example/model-router',createdAt:new Date().toISOString()}];
createRoot(document.getElementById('root')!).render(<ConfirmationProvider><div style={{padding:'8px 24px',background:'var(--surface)',fontSize:12,color:'var(--muted)'}}>隔离验证窗口 · 真实 Store / 安装 / 保存 · 示例项目仅用于交互检查，未启用模型执行</div><Workforce projects={projects} catalog={{defaultId:null,providers:[]}} onUse={()=>alert('任务入口已触发；请在桌面宿主中执行模型任务。')} onOpenTask={()=>{}} onManageSkills={()=>alert('全局技能保存在此验证窗口的独立资料目录。')} onAddProject={()=>{}}/></ConfirmationProvider>);
