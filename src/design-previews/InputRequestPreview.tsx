import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import InputRequestFields from '../InputRequestFields';
import type {PersistentInputRequest} from '../types';
import {Button} from '../components/ui/button';
import {setLanguage} from '../i18n';
import '../shadcn.css';import '../styles.css';import '../workspace-polish.css';

function Preview({request}:{request:PersistentInputRequest}){
 const [values,setValues]=useState(request.draft),[locked,setLocked]=useState(false),[errors,setErrors]=useState<Record<string,string>>({});
 return <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
  <p className="text-sm text-muted-foreground">正式字段组件预览 · 本页不保存或发送答案</p>
  <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setLocked(!locked)}>切换只读</Button><Button variant="outline" onClick={()=>setErrors({destination:'请选择目的地'})}>显示错误</Button><Button variant="outline" onClick={()=>setLanguage('en')}>English</Button></div>
  <section className="rounded-xl border bg-card p-6 text-card-foreground">
   <header className="mb-6"><p className="mb-2 text-xs text-muted-foreground">待补充信息</p><h1 className="text-lg font-semibold">{request.template.title}</h1><p className="mt-2 text-sm text-muted-foreground">{request.reason}</p></header>
   <InputRequestFields request={{...request,state:locked?'expired':'pending'}} values={values} onChange={(name,value)=>setValues(v=>({...v,[name]:value}))} errors={errors}/>
  </section>
  <output className="break-all text-xs text-muted-foreground" aria-label="预览数据">{JSON.stringify(values)}</output>
 </main>;
}
fetch('/specs/extensions/examples/user-input/travel.json').then(r=>r.json()).then(input=>{
 const definition=input.source.definition,now=new Date().toISOString();
 const request:PersistentInputRequest={id:'preview',runId:'preview',conversationId:'preview',projectId:null,originKey:'model',state:'pending',revision:0,reason:input.reason,template:{version:1,id:'preview',title:definition.title,description:definition.description,steps:[{id:'details',title:definition.title,fields:definition.fields}],submit:{kind:'chat',label:'提交补充信息'}},draft:input.prefill,draftTouched:false,locale:'zh-CN',createdAt:now,updatedAt:now};
 createRoot(document.getElementById('root')!).render(<Preview request={request}/>);
});
