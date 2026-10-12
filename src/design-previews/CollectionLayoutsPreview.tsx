import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import TaskUi,{type UiFlow} from '../TaskUi';
import {Button} from '../components/ui/button';
import {Alert,AlertDescription} from '../components/ui/alert';
import '../styles.css';import '../tokens.css';import '../shadcn.css';

// This preview uses the production renderer. Only the submission transport is mocked.
function Preview({templates}:{templates:UiFlow['template'][]}){
 const [example,setExample]=useState(0),[dark,setDark]=useState(false),[sent,setSent]=useState('');
 const template=templates[example];
 const flow:UiFlow={kind:'ui',id:'preview-'+example,runId:'preview',revision:0,template,submissions:[],data:{values:{},state:'ready',summary:'按钮会将选中条目的意图发送到当前任务。本页仅演示投递，不启动真实任务。',coverage:'使用正式 TaskUi 组件，可切换布局、筛选、多选、展开详情和查看文件引用。',rows:example===0?[
 {id:'REQ-101',subject:'调整订单交付时间',description:'客户希望将交付时间提前到周五，需要与仓库确认库存和配送安排。',status:'open',owner:'陈晨',notes:'客户已确认收货地址，待仓库反馈。'},
 {id:'REQ-102',subject:'补发上月服务账单',description:'财务需要一份包含采购编号的账单副本。',status:'closed',owner:'林晓',notes:'已发送账单副本并收到确认。'},
 ]:[
 {id:'ISSUE-101',title:'邀请面板未处理重复提交',severity:'high',status:'open',file:'src/features/team-projects/components/invitations/ProjectInvitationReviewPanel.tsx',details:'请求期间应保留进度并阻止重复提交，同时允许失败后重试。'},
 {id:'ISSUE-102',title:'设置页缺少保存结果反馈',severity:'low',status:'open',file:'src/features/organization/components/Settings.tsx',details:'用户保存后无法确认是否成功，建议显示明确的成功或失败反馈。'},
 ]}};
 (window as unknown as {desktop:unknown}).desktop={forms:{action:async(input:{actionId:string;rowKeys?:string[]})=>{const action=template.actions.find(a=>a.id===input.actionId);setSent(`${action?.label} · ${input.rowKeys?.join('、')||'全部符合条件的条目'}（演示）`);return {...flow,revision:1,submissions:[{id:'preview-submission',label:action?.label||'',status:'delivered'}]};}}};
 return <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setExample(example===0?1:0);setSent('');}}>{example===0?'查看文件审查示例':'查看服务请求示例'}</Button><Button variant="outline" onClick={()=>{document.documentElement.dataset.theme=dark?'light':'dark';setDark(!dark);}}>切换明暗</Button></div><Alert><AlertDescription>正式任务组件预览 · 交互不发送真实任务</AlertDescription></Alert><TaskUi key={example} flow={flow} archived={false}/>{sent&&<p role="status">{sent}</p>}</main>;
}
Promise.all(['requests','review-cards'].map(name=>fetch('/specs/extensions/examples/declarative-ui/'+name+'.json').then(r=>r.json()))).then(templates=>createRoot(document.getElementById('root')!).render(<Preview templates={templates}/>));
