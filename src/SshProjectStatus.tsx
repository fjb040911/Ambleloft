import {useEffect,useId,useRef,useState} from 'react';
import {Server,CheckCircle2,Unplug,LoaderCircle,AlertCircle,Terminal,Settings2,PlugZap,X,ChevronDown} from 'lucide-react';
import {Button} from './components/ui/button';
import {sshLabels,sshErrorMessage} from './ssh-state';
import type {SshConnection} from './SshProjectFields';
import type {Project} from './types';
import {t} from './i18n';
import './ssh-status.css';
const explanations:Record<string,string>={
 unavailable:'无法读取连接状态，请重新启动桌面应用。',missing:'连接配置已不存在，请重新选择或创建服务器连接。',loading:'正在读取连接状态。',disconnected:'连接后可浏览远端文件、使用终端或执行任务。',
 connecting:'正在建立安全连接，首次连接可能需要确认服务器指纹。',
 reconnecting:'连接已中断，正在自动重试。执行中的命令不会重跑。',
 disconnecting:'正在关闭共享连接。',connected:'文件、终端和 Agent 共用此连接。',
 authentication:'请更新凭据，然后重新测试连接。',untrusted:'请核对服务器指纹和连接配置后再连接。',error:'连接未建立，请检查网络或连接设置后重试。'
};
export default function SshProjectStatus({project,connection,loading,error:syncError,edit,openTerminal,collapsible=false}:{collapsible?:boolean;project:Project;connection?:SshConnection;loading:boolean;error:string;edit():void;openTerminal():void}){
 const api=window.desktop?.ssh;
 const detailsId=useId();
 const preferenceKey='amble.ssh-details.'+project.id;
 const [showDetails,setShowDetails]=useState(()=>{try{return localStorage.getItem(preferenceKey)==='expanded';}catch{return false;}});
 const expanded=!collapsible||showDetails;
 const toggleDetails=()=>{const next=!showDetails;setShowDetails(next);try{localStorage.setItem(preferenceKey,next?'expanded':'collapsed');}catch{/* Keep the control usable when storage is unavailable. */}};
 const [pending,setPending]=useState(''),[error,setError]=useState('');const generation=useRef(0);
 useEffect(()=>{if(connection?.state==='connected')setError('');},[connection?.state]);
 const state=pending||(loading?'loading':syncError?'unavailable':!connection?'missing':connection.state||'disconnected');
 const connected=state==='connected',progress=['connecting','reconnecting'].includes(state),repair=['authentication','untrusted','missing'].includes(state);
 const Icon=state==='connected'?CheckCircle2:progress||state==='loading'||state==='disconnecting'?LoaderCircle:state==='disconnected'?Unplug:AlertCircle;
 const action=async(disconnect=false)=>{if(!api||!project.connectionId)return;const current=++generation.current;setError('');setPending(disconnect?'disconnecting':'connecting');try{await(disconnect?api.disconnect({id:project.connectionId}):api.connect({id:project.connectionId}));}catch(e){if(current===generation.current)setError(sshErrorMessage(e));}finally{if(current===generation.current)setPending('');}};
 const detail=error||syncError||(!pending&&connection?.error)||'';
 const address=connection?`${connection.username}@${connection.host}:${connection.port}`:project.name;
 const badge=<span className="ssh-status-badge" role="status" aria-live="polite"><Icon size={14} aria-hidden="true"/>SSH · {t(sshLabels[state]||sshLabels.error)}</span>;
 return <section className="ssh-status" data-collapsible={collapsible} data-expanded={expanded} data-state={state} aria-label={t('SSH 连接')}>
  {collapsible&&<button type="button" className="ssh-status-summary" onClick={toggleDetails} aria-expanded={expanded} aria-controls={detailsId} aria-label={t(expanded?'收起 SSH 连接详情':'展开 SSH 连接详情')}>
   {badge}<span className="ssh-summary-address" title={address}>{address}</span><code className="ssh-summary-path" title={project.path}>{project.path}</code><span className="ssh-summary-toggle">{t(expanded?'收起':'详情')}<ChevronDown size={14} aria-hidden="true"/></span>
  </button>}
  <div className="ssh-status-body" id={detailsId} hidden={!expanded}>
  <div className="ssh-status-main"><div className="ssh-status-identity"><Server size={18} aria-hidden="true"/><strong title={connection?.name||project.name}>{connection?.name||project.name}</strong>{!collapsible&&badge}</div>
   <p className="ssh-status-address">{connection&&<span title={`${connection.username}@${connection.host}:${connection.port}`}>{connection.username}@{connection.host}:{connection.port}</span>}<code title={project.path}>{project.path}</code></p>
   <p className="ssh-status-help">{t(explanations[state]||explanations.error)}</p>
   {detail&&<p className="ssh-status-error" role="alert">{t(sshErrorMessage(Error(detail)))}</p>}
  </div>
  <div className="ssh-status-actions">
   {connected?<><Button type="button" size="sm" onClick={openTerminal}><Terminal/>{t('打开终端')}</Button><Button type="button" size="sm" variant="ghost" title={t('断开共享连接，使用它的终端和任务会受到影响。')} onClick={()=>void action(true)}><Unplug/>{t('断开连接')}</Button></>:progress?<Button type="button" size="sm" variant="outline" onClick={()=>void action(true)}><X/>{t(state==='reconnecting'?'停止重连':'取消连接')}</Button>:<Button type="button" size="sm" disabled={!api||loading||state==='disconnecting'||!!syncError} onClick={()=>repair||!connection?edit():void action()}>{repair?<Settings2/>:<PlugZap/>}{t(state==='unavailable'?'状态不可用':repair?'检查连接设置':state==='error'?'重新连接':'连接服务器')}</Button>}
   {!repair&&<Button type="button" size="sm" variant="ghost" disabled={progress||state==='disconnecting'} onClick={edit}><Settings2/>{t('连接设置')}</Button>}
  </div>
  </div>
 </section>;
}
