import {useEffect,useRef,useState} from 'react';
import {WandSparkles,ArrowRight,Download,Settings2,ChevronDown} from 'lucide-react';
import {Button} from './components/ui/button';
import {Alert,AlertDescription} from './components/ui/alert';
import {t,formatDateTime} from './i18n';
import type {AgentRun} from './types';
export const CREATOR_ID='builtin-skill-master';
export interface CreationState{
 runId:string;revision:number;stage:'brief'|'building'|'ready'|'installed';kind:'skill'|'extension';title:string;summary:string;nextStep:string;trialPrompt:string;limitations:string;trial:'pending'|'confirmed';
 prepared?:{source:string;digest:string};installed?:{id:string;kind:'skill'|'extension';hasConfiguration:boolean};
 delivery?:{environment?:string[];settings?:string[];permissions?:string[];unverified?:string[]};
 readiness?:{versionCurrent:boolean;configuration:'saved'|'not-saved'|'not-needed'|'unknown';connection:'unverified'};trialStale?:boolean;
 evidence?:{id:string;method:'package-validation'|'user-trial';source:'host'|'user';artifactDigest:string;scope:string;at:string;current:boolean;environment:{platform:string;arch:string;hostVersion?:string}}[];
}
export interface CreationAPI{
 read(input:{runId:string}):Promise<CreationState|null>;
 install(input:{runId:string;expectedRevision:number}):Promise<CreationState>;
 trial(input:{runId:string;expectedRevision:number}):Promise<CreationState>;
 onChanged(listener:(event:{runId:string})=>void):()=>void;
}
export function CreationGuide({run,active,onPrompt,openSettings,hasPendingInput=false}:{run:AgentRun;active:boolean;hasPendingInput?:boolean;onPrompt(text:string,skillId?:string):void;openSettings(section:string):void}){
 const api=window.desktop?.creation;
 const [state,setState]=useState<CreationState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const alive=useRef(true),generation=useRef(0);
 const refresh=async()=>{if(!api)return;const ticket=++generation.current;try{const result=await api.read({runId:run.id});if(alive.current&&ticket===generation.current){setState(result);setError('');}}catch(e){if(alive.current&&ticket===generation.current)setError((e as Error).message);}};
 useEffect(()=>{alive.current=true;void refresh();const off=api?.onChanged(e=>{if(e.runId===run.id)void refresh();});const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>{alive.current=false;generation.current++;off?.();window.removeEventListener('focus',focus);};},[run.id,api]);
 if(!api||run.archivedAt)return null;
 const act=async(action:'install'|'trial')=>{if(!state||busy)return;setBusy(true);setError('');try{const result=await api[action]({runId:run.id,expectedRevision:state.revision});if(alive.current){generation.current++;setState(result);}}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}};
 if(!state)return error?<Alert variant="destructive"><AlertDescription>{error}<Button variant="ghost" size="sm" onClick={()=>void refresh()}>{t('重新加载')}</Button></AlertDescription></Alert>:null;
 const status=state.trialStale?'版本或设置已变化，请重新试用':state.trial==='confirmed'?'已试用确认':({brief:'了解需求',building:'生成与验证',ready:'文件已检查，待安装',installed:state.installed?.hasConfiguration?'已安装，请配置并试用':'已安装，待试用'}[state.stage]);
 const resume=()=>onPrompt(t('继续创建。请先读取创建进度和待回答问题，保留已确认的信息，从未完成的步骤继续。'),CREATOR_ID);
 return <section className="creation-guide mb-4 min-w-0 px-1" aria-label={t('创建进度')}>
  <details className="group/creation">
   <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
    <span className="min-w-0 flex-1 break-words font-medium">{state.title||t('创建技能 / 扩展')}</span>
    <span className="text-xs text-muted-foreground">{t(status)}</span>
    <span className="flex items-center gap-1 text-xs text-muted-foreground">{t('方案与验证详情')}<ChevronDown className="size-3.5 group-open/creation:rotate-180" aria-hidden="true"/></span>
   </summary>
   <div className="mt-2 max-h-[20dvh] overflow-y-auto overscroll-contain border-l border-border pl-3 text-sm">
    <div className="flex max-w-prose flex-col gap-3 py-1">
     <p className="whitespace-pre-wrap break-words">{state.summary||t('需求正在整理中')}</p>
     {state.summary&&<p className="text-muted-foreground">{t('交付形式')}：{state.kind==='skill'?'Skill':t('扩展')}</p>}
     {state.prepared&&<><p className="break-all text-muted-foreground">{t('生成目录')}：{state.prepared.source}</p><p className="text-muted-foreground">{t('文件检查通过不代表外部系统或设备已验证。')}</p></>}
     {state.limitations&&<p className="whitespace-pre-wrap break-words text-muted-foreground">{state.limitations}</p>}
     {state.delivery&&Object.entries(state.delivery).filter(([,items])=>items?.length).map(([key,items])=><div key={key}><p className="font-medium">{t(({environment:'所需环境',settings:'安装设置',permissions:'所需权限',unverified:'尚未验证'} as Record<string,string>)[key])}</p><ul className="mt-1 list-disc pl-5 text-muted-foreground">{items!.map((item,i)=><li key={i} className="break-words">{item}</li>)}</ul></div>)}
     {state.readiness&&state.installed?.kind==='extension'&&<p className="text-muted-foreground">{t(state.readiness.configuration==='saved'?'配置已保存；外部连接尚未验证。':state.readiness.configuration==='not-saved'?'请按需填写安装设置；外部连接尚未验证。':'安装状态不代表外部连接已验证。')}</p>}
     {!!state.evidence?.length&&<div aria-label={t('验证记录')} className="flex flex-col gap-2">
      <p className="font-medium">{t('验证记录')}</p>
      {state.evidence.slice(-5).reverse().map(item=><div key={item.id} className="text-xs text-muted-foreground">
       <p>{t(item.method==='package-validation'?'宿主文件检查':'用户试用确认')} · {t(item.current?'当前版本':'历史记录')} · {formatDateTime(item.at)}</p>
       <p className="break-all">{item.artifactDigest.slice(0,12)} · {item.environment.platform}/{item.environment.arch}{item.environment.hostVersion?` · Ambleloft ${item.environment.hostVersion}`:''}</p>
      </div>)}
      <p className="text-xs text-muted-foreground">{t('文件检查、业务运行和用户验收分别记录；未执行的验证不会标记通过。')}</p>
     </div>}
     {state.trialPrompt&&<p className="break-words text-muted-foreground">{t('试用方式')}：{state.trialPrompt}</p>}
    </div>
   </div>
  </details>
  {!hasPendingInput&&<p className="mt-1 text-sm text-muted-foreground">{state.trial==='confirmed'?t('已记录你的试用结果，可以继续使用或改进。'):state.stage==='ready'?t('安装已检查的版本，然后在对话中试用。'):state.stage==='installed'?t('试用符合预期后，再确认创建完成。'):state.nextStep||t('先说说想解决的问题，AI 会逐步帮你完善。')}</p>}
  {error&&<Alert variant="destructive" className="mt-3"><AlertDescription>{error}<Button variant="ghost" size="sm" onClick={()=>void refresh()}>{t('重新加载')}</Button></AlertDescription></Alert>}
  {!hasPendingInput&&<div className="mt-3 flex flex-wrap items-center gap-2">
   {state.stage==='ready'&&<Button size="sm" disabled={busy||active} onClick={()=>void act('install')}><Download data-icon="inline-start"/>{t(busy?'正在安装…':'安装并启用')}</Button>}
   {state.stage==='installed'&&<>
    {state.installed?.kind==='extension'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>openSettings('plugins:'+state.installed!.id)}><Settings2 data-icon="inline-start"/>{t('设置与权限')}</Button>}
    <Button size="sm" disabled={busy||active||state.readiness?.versionCurrent===false} onClick={()=>onPrompt(state.trialPrompt,state.installed?.kind==='skill'?state.installed.id:undefined)}>{t('准备试用')}<ArrowRight data-icon="inline-end"/></Button>
    {state.trial!=='confirmed'&&<Button size="sm" variant="outline" disabled={busy||active||state.readiness?.versionCurrent===false} onClick={()=>void act('trial')}>{t('我已试用，通过')}</Button>}
   </>}
   <Button size="sm" variant="ghost" disabled={busy||active} onClick={resume}>{t(state.stage==='brief'||state.stage==='building'?'继续创建':'继续改进')}</Button>
  </div>}
 </section>;
}
