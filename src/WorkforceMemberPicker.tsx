import {useState} from 'react';
import {Search,Plus} from 'lucide-react';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Checkbox} from './components/ui/checkbox';
import {FieldSet,FieldLegend,FieldDescription} from './components/ui/field';
import {InputGroup,InputGroupAddon,InputGroupInput} from './components/ui/input-group';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription} from './components/ui/empty';
import {Alert,AlertDescription} from './components/ui/alert';
import {FormField,useCopy} from './WorkforceInputs';
import type {Employee,Space,SpaceValue} from './workforce-types';
import type {Project} from './types';

export type MemberSelectionDraft={space:Space;value:SpaceValue};
export function WorkforceMemberPicker({employees,projects,value,change,addExpert,disabled=false}:{employees:Employee[];projects:Project[];value:SpaceValue;change(value:SpaceValue):void;addExpert?():void;disabled?:boolean}){
 const L=useCopy(),[query,setQuery]=useState('');
 const visible=employees.filter(e=>[e.name,e.domain,e.responsibilities,...e.skills.map(s=>s.label)].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 const status=(e:Employee)=>({ready:L('可开始工作','Ready'),saved:L('技能待准备','Needs preparation'),activating:L('技能准备中','Preparing skills'),failed:L('准备失败','Preparation failed'),interrupted:L('准备已中断','Preparation interrupted'),conflict:L('配置需要核对','Check configuration')}[e.status]||L('状态待确认','Status unknown'));
 return <FieldSet><FieldLegend>{L('选择参与专家','Choose your team')}</FieldLegend><FieldDescription>{L('按职责与技能选人，再安排本空间的分工。选择不会立即启动任务。','Choose by responsibilities and skills, then assign work in this space. Selection does not start tasks.')}</FieldDescription>
 <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">{employees.length>0&&<InputGroup className="min-w-0 sm:flex-1"><InputGroupAddon><Search/></InputGroupAddon><InputGroupInput type="search" aria-label={L('搜索专家姓名、职责或技能','Search experts by name, responsibility or skill')} placeholder={L('搜索姓名、职责或技能','Search name, responsibilities or skills')} value={query} onChange={e=>setQuery(e.target.value)}/></InputGroup>}{addExpert&&<Button variant="outline" disabled={disabled} onClick={addExpert}><Plus data-icon="inline-start"/>{L('从角色库添加专家','Add from role library')}</Button>}</div>
 <p className="wf-muted" role="status">{L('已选','Selected')} {value.members.length} {L('位专家','experts')}{query&&` · ${L('匹配','Matches')} ${visible.length}`}</p>
 {value.members.filter(m=>!employees.some(e=>e.id===m.employeeId)).map(m=><Alert key={m.employeeId}><AlertDescription>{L('此空间仍关联一位已移除的专家；可以移除关联，历史记录会保留。','This expert was removed. History is preserved.')}<Button variant="ghost" disabled={disabled} onClick={()=>change({...value,members:value.members.filter(v=>v.employeeId!==m.employeeId)})}>{L('移除关联','Remove association')}</Button></AlertDescription></Alert>)}
 {!visible.length&&<Empty><EmptyHeader><EmptyTitle>{employees.length?L('没有匹配的专家','No matching experts'):L('先添加一位专家','Add your first expert')}</EmptyTitle><EmptyDescription>{employees.length?L('试试职责或技能关键词，已选成员不会因筛选而移除。','Try a responsibility or skill. Filtering does not remove selected members.'):L('从角色库选择适合目标的专家，添加后返回这里继续安排。','Choose a role for your goal, then return here to assign your team.')}</EmptyDescription></EmptyHeader>{!!query&&<Button variant="ghost" onClick={()=>setQuery('')}>{L('清除搜索','Clear search')}</Button>}</Empty>}
 {visible.map(e=>{const member=value.members.find(m=>m.employeeId===e.id);return <section key={e.id} className="wf-member-editor" aria-label={e.name}>
 <div className="flex items-start justify-between gap-3"><label className="wf-check min-w-0"><Checkbox disabled={disabled} aria-label={L('选择专家：','Select expert: ')+e.name} checked={!!member} onCheckedChange={checked=>change({...value,members:checked?[...value.members,{employeeId:e.id,assignment:'',projectIds:[]}]:value.members.filter(m=>m.employeeId!==e.id)})}/><span><strong>{e.name}</strong><small>{e.domain||L('通用方向','General')}</small></span></label><Badge variant="secondary">{status(e)}</Badge></div>
 <p className="wf-muted line-clamp-2">{e.responsibilities||L('尚未填写职责，可查看档案后确认。','No responsibilities provided. Review the profile before choosing.')}</p>
 <details><summary>{L('查看档案与技能','Profile and skills')} · {e.skills.length}</summary><dl className="wf-role-definition"><div><dt>{L('职责','Responsibilities')}</dt><dd>{e.responsibilities||'—'}</dd></div><div><dt>{L('预期交付','Deliverables')}</dt><dd>{e.deliverables||'—'}</dd></div><div><dt>{L('工作方法','Methods')}</dt><dd>{e.methods||'—'}</dd></div></dl><div className="flex flex-wrap gap-2">{e.skills.map((s,i)=><Badge variant="outline" key={i}>{s.label}</Badge>)}</div>{!e.skills.length&&<p className="wf-muted">{L('按职责工作，无额外技能。','Works from responsibilities, with no additional skills.')}</p>}</details>
 {member&&<div className="wf-member-details"><FormField disabled={disabled} label={e.name+L('在本空间的分工',' assignment in this space')} value={member.assignment} onChange={assignment=>change({...value,members:value.members.map(m=>m.employeeId===e.id?{...m,assignment}:m)})} maxLength={2000}/><FieldSet><FieldLegend>{L('可施工项目','Assigned projects')}</FieldLegend><div className="wf-participants">{value.projectIds.map(id=><label key={id}><Checkbox disabled={disabled} checked={member.projectIds.includes(id)} onCheckedChange={checked=>change({...value,members:value.members.map(m=>m.employeeId===e.id?{...m,projectIds:checked?[...m.projectIds,id]:m.projectIds.filter(p=>p!==id)}:m)})}/>{projects.find(p=>p.id===id)?.name||id}</label>)}</div><FieldDescription>{L('未分配项目也可参与讨论；执行前会检查专家与项目是否就绪。','Members can discuss without a project. Readiness is checked before execution.')}</FieldDescription></FieldSet></div>}
 </section>;})}
 </FieldSet>;
}
