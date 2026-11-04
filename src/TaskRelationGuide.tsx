import {useEffect,useRef,useState} from 'react';
import FormFields,{type FormValues} from './FormFields';
import {Button} from './components/ui/button';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Textarea} from './components/ui/textarea';
import {useCopy} from './WorkforceInputs';
import type {TaskRelationGuide as Guide} from './workforce-types';

export default function TaskRelationGuide({draftId,guide,disabled,dirty,answer,refine}:{draftId:string;guide:Guide;disabled:boolean;dirty:boolean;answer(packageId:string,values:FormValues):Promise<boolean>;refine(message:string):void}){
 const L=useCopy(),storageKey='workforce.relation-answers:'+draftId;
 const [selected,setSelected]=useState(guide.nodes[0]?.packageId),[clarification,setClarification]=useState(()=>{try{return localStorage.getItem(storageKey+':clarification')||'';}catch{return '';}});
 const [saved,setSaved]=useState<Record<string,{signature:string;values:FormValues}>>(()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{return {};}});
 const [confirmed,setConfirmed]=useState(''),submitting=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 const node=guide.nodes.find(n=>n.packageId===selected)||guide.nodes[0];
 useEffect(()=>{if(confirmed)heading.current?.focus({preventScroll:true});},[node?.packageId,confirmed]);
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{}},[saved,storageKey]);
 useEffect(()=>{try{localStorage.setItem(storageKey+':clarification',clarification);}catch{}},[clarification,storageKey]);
 if(!node)return null;
 const signature=JSON.stringify([node.fields,node.prefill]),values=saved[node.packageId]?.signature===signature?saved[node.packageId].values:node.prefill;
 const fields=node.fields.filter(f=>!f.visibleWhen||values[f.visibleWhen.field]===f.visibleWhen.equals);
 const incomplete=fields.some(f=>f.required&&!String(values[f.name]??'').trim());
 return <section className="wf-guide-question" aria-label={L('补齐项目关系','Complete project relationships')}>
  <h3>{L('补齐项目关系','Complete project relationships')} · {guide.nodes.length}</h3>
  <p className="wf-muted">{L('逐项核对下方建议。确认一项后继续下一项，已确认的项目职责与交接约定会保存，后续流程可直接复用。','Review one suggestion at a time. Confirming an item continues to the next; confirmed responsibilities and handoffs are saved for future workflows.')}</p>
  {confirmed&&<p role="status" className="wf-muted">{L(`已保存「${confirmed}」的关系，请继续核对下一项。`,`Relationships for “${confirmed}” are saved. Review the next item below.`)}</p>}
  {guide.nodes.length>1&&<NativeSelect aria-label={L('选择待补齐节点','Select unresolved task')} value={node.packageId} disabled={disabled} onChange={e=>setSelected(e.target.value)}>{guide.nodes.map(n=><NativeSelectOption key={n.packageId} value={n.packageId}>{n.title}</NativeSelectOption>)}</NativeSelect>}
  <h4 ref={heading} tabIndex={-1}>{node.title}</h4><p>{node.reason}</p>
  <p className="wf-muted">{L('需要增删协作项目时，也可使用下方的节点配置。','To add or remove related projects, use the node configuration below.')}</p>
  {dirty&&<p role="status">{L('任务草稿已修改，请先检查并保存草稿，再确认关系。','The draft changed. Check and save it before confirming relationships.')}</p>}
  <FormFields fields={fields} values={values} locked={disabled||dirty} change={(name,value)=>setSaved(old=>({...old,[node.packageId]:{signature,values:{...values,[name]:value}}}))}/>
  <div className="wf-actions"><Button disabled={disabled||dirty||incomplete} onClick={async()=>{if(submitting.current||disabled||dirty||incomplete)return;submitting.current=true;try{if(await answer(node.packageId,values)){setConfirmed(node.title);setSelected('');setSaved(old=>{const next={...old};delete next[node.packageId];return next;});}}finally{submitting.current=false;}}}>{L('确认关系并用于后续流程','Confirm and reuse in future workflows')}</Button></div>
  <details><summary>{L('建议不合适？让 AI 调整关系','Need a different suggestion? Ask AI to refine')}</summary>
   <Textarea aria-label={L('补充项目关系要求','Clarify project relationships')} value={clarification} disabled={disabled} onChange={e=>setClarification(e.target.value)} placeholder={L('例如：前端调用 API 项目，测试项目负责联调。','For example: the web client calls the API project; the test project verifies integration.')}/>
   <Button variant="outline" disabled={disabled} onClick={()=>refine(clarification)}>{L('仅补齐关系，保留任务内容','Refine relationships only · keep task content')}</Button>
  </details>
 </section>;
}
