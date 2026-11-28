import {useEffect,useId,useState} from 'react';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Field,FieldLabel} from './components/ui/field';
import {Separator} from './components/ui/separator';
import {extensionsChanged} from './extensions';
import {useLanguage} from './i18n';
import type {ExtensionConfiguration} from './types';

type Action='grant'|'saveSecret'|'test';
export default function ConnectorSettings({id,data,disabled,granted,current,onChanged}:{
 id:string;data:ExtensionConfiguration;disabled:boolean;granted:boolean;current:boolean;onChanged?():void;
}){
 const field=useId(),english=useLanguage()==='en',label=(zh:string,en:string)=>english?en:zh;
 const [saved,setSaved]=useState<boolean>(),[busy,setBusy]=useState<Action|null>(null);
 const [query,setQuery]=useState(''),[credentialNotice,setCredentialNotice]=useState(''),[testNotice,setTestNotice]=useState('');
 const api=window.desktop?.extensions?.connector;
 const {generation,revision}=data;
 const errorText=(error:unknown)=>String(error instanceof Error?error.message:error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
 useEffect(()=>{
  setSaved(undefined);setCredentialNotice('');setTestNotice('');
  if(!api||!granted||!current)return;
  let active=true;
  api({id,generation,revision,action:'status'}).then(result=>{if(active)setSaved(result.saved);})
   .catch(error=>{if(active)setCredentialNotice(errorText(error));});
  return ()=>{active=false;};
 },[api,id,revision,generation,granted,current]);
 const run=async(action:Action)=>{
  if(!api||disabled||busy||!current)return;
  setBusy(action);
  const notify=action==='test'?setTestNotice:setCredentialNotice;
  notify('');
  try{
   if(action==='grant'){
    const snapshot=await window.desktop!.extensions!.grants({id,capabilities:['secrets']});
    if(snapshot.installed.find(item=>item.manifest.id===id)?.grants?.some(g=>g.capability==='secrets'&&g.resource==='self'))onChanged?.();
    extensionsChanged();
   }else{
    const result=await api({id,generation,revision,action,query});
    if(action==='saveSecret'){setSaved(result.saved);onChanged?.();notify(label('密钥已保存，尚未验证服务。','Key saved. The service has not been tested.'));}
    else notify(result.count?label('检索成功，命中 '+result.count+' 个片段。','Search succeeded: '+result.count+' hits.'):label('服务已响应，但没有命中。','Service responded, but no excerpts matched.'));
   }
  }catch(error){notify(errorText(error));}finally{setBusy(null);}
 };
 return <section className="mt-6 flex flex-col gap-4"><Separator/><h3>{label('访问凭据','Credentials')}</h3>
 {!granted?<><p>{label('录入 API Key 前，需要授权此扩展使用安全凭据存储。','Allow this extension to use secure credential storage before entering an API key.')}</p>
 <Button type="button" variant="outline" className="self-start" disabled={!api||!!busy||disabled||!current} onClick={()=>void run('grant')}>{label('去授权','Grant access')}</Button></>:<>
 {saved!==undefined&&<p>{saved?label('当前地址已保存密钥','Key saved for this address'):label('当前地址未配置密钥','No key for this address')}</p>}
 <Button type="button" variant="outline" className="self-start" disabled={!api||!!busy||disabled||!current||saved===undefined} onClick={()=>void run('saveSecret')}>{label('录入 / 更换 API Key','Enter / replace API key')}</Button></>}
 <span role="status">{disabled?label('请先保存修改。','Save your changes first.'):credentialNotice}</span>
 <Separator/><Field><FieldLabel htmlFor={field}>{label('测试检索','Test retrieval')}</FieldLabel><Input id={field} value={query} maxLength={2000} placeholder={label('输入一个已入库文档能回答的问题','Ask about an indexed document')} onChange={event=>{setQuery(event.target.value);setTestNotice('');}}/></Field>
 <Button type="button" className="self-start" disabled={!api||!!busy||disabled||!current||!granted||!saved||!query.trim()} onClick={()=>void run('test')}>{label('测试检索','Test retrieval')}</Button>
 <span role="status">{busy==='test'?label('正在检索…','Searching…'):testNotice}</span></section>;
}
