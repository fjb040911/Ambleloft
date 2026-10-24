import {useEffect,useImperativeHandle,useRef,useState,type Ref} from 'react';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Field,FieldGroup,FieldLabel,FieldDescription} from './components/ui/field';
import {Alert,AlertTitle,AlertDescription} from './components/ui/alert';
import {Check,Folder,ArrowUp,ArrowLeft,ChevronDown,ChevronRight,Plus,Server} from 'lucide-react';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import DockerProjectFields from './DockerProjectFields';
import {t} from './i18n';
import type {Project,RemoteEnvironment,DockerEnvironment} from './types';
export type SshConnection={id:string;name:string;host:string;port:number;username:string;authType:'password'|'key'|'agent';privateKeyPath?:string;remember?:boolean;state?:string;error?:string};
export type SshAPI={
 list():Promise<SshConnection[]>;save(input:SshConnection&{password?:string;passphrase?:string}):Promise<SshConnection>;
 connect(input:{id:string}):Promise<SshConnection[]>;disconnect(input:{id:string}):Promise<SshConnection[]>;
 dockerList(input:{id:string;endpoint?:string}):Promise<DockerList>;dockerEnter(input:{id:string;environment:DockerEnvironment}):Promise<DockerReady>;dockerStart(input:{id:string;environment:DockerEnvironment}):Promise<DockerReady>;
 browse(input:{id:string;path?:string;environment?:RemoteEnvironment}):Promise<{path:string;parent:string;entries:{name:string;path:string}[];storage?:string;writable?:boolean;truncated?:boolean}>;
 validate(input:{id:string;path:string;environment?:RemoteEnvironment}):Promise<{path:string}>;key():Promise<string|null>;onChanged(listener:()=>void):()=>void;
};
export type DockerList={endpoint:string;endpoints:string[];daemonId:string;containers:{id:string;name:string;image:string;state:string;status:string}[]};
export type DockerReady={environment:DockerEnvironment;path:string;uid:number;shell:string;shells:string[];writable:boolean};
export type SshProjectState={busy:boolean;ready:boolean;editing:boolean;configuring:boolean;canContinue:boolean;canCancelWait:boolean;action:string;hint:string;title?:string};
export type SshProjectHandle={submit():void;back():void;cancelWait():void};
const restartMessage='SSH 功能尚未在当前桌面进程中加载，请完全退出并重新启动应用。开发模式请重新运行 npm run dev，仅刷新窗口无效。';
function sshError(error:unknown){const message=(error as Error)?.message||String(error);return /No handler registered for ['"]ssh:/.test(message)?restartMessage:message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');}
function errorHelp(message:string){
 if(/authentication|permission denied.*publickey|All configured authentication|SSH 密码|解密 SSH 凭据/i.test(message))return '服务器拒绝了当前凭据，请检查用户名并重新认证。';
 if(/timed? ?out|超时|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i.test(message))return '无法连接服务器，请检查主机、端口和网络后重试。';
 if(/SSH Agent 不可用/i.test(message))return '本机 SSH Agent 不可用，请启用它或改用密码、私钥认证。';
 return '操作未完成，请查看详情后重试。';
}
const empty=():SshConnection=>({id:crypto.randomUUID(),name:'',host:'',port:22,username:'',authType:'password',remember:true});
type Mode='select'|'create'|'edit'|'configure';
export default function SshProjectFields({project,change,onStateChange,ref}:{project:Project;change(project:Project):void;onStateChange(state:SshProjectState):void;ref?:Ref<SshProjectHandle>}){
 const api=window.desktop?.ssh;
 const [mode,setMode]=useState<Mode>(project.connectionId?'configure':'select');
 const [choice,setChoice]=useState(project.connectionId||''),[connections,setConnections]=useState<SshConnection[]>([]);
 const [draft,setDraft]=useState<SshConnection>(empty),[password,setPassword]=useState(''),[passphrase,setPassphrase]=useState('');
 const newDraft=useRef<{draft:SshConnection;password:string;passphrase:string}|null>(null);
 const [available,setAvailable]=useState(false),[loaded,setLoaded]=useState(false),[phase,setPhase]=useState(''),[dockerBusy,setDockerBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[saved,setSaved]=useState(false);
 const [dockerMode,setDockerMode]=useState(project.environment?.kind==='docker');
 const [folder,setFolder]=useState<Awaited<ReturnType<SshAPI['browse']>>|null>(null);
 const root=useRef<HTMLElement>(null),focusTarget=useRef(project.connectionId?'#ssh-change':''),version=useRef(0),live=useRef(true);
 const editing=mode==='create'||mode==='edit',busy=!!phase||dockerBusy;
 const selected=connections.find(c=>c.id===(mode==='select'?choice:project.connectionId));
 const connected=selected?.state==='connected',configuring=mode==='configure'&&!!connected;
 const validDraft=!!draft.host.trim()&&!!draft.username.trim()&&Number.isInteger(draft.port)&&draft.port>=1&&draft.port<=65535&&(draft.authType!=='password'||!!password)&&(draft.authType!=='key'||!!draft.privateKeyPath);
 const ready=available&&configuring&&(!dockerMode||project.environment?.kind==='docker');
 const canContinue=available&&!busy&&(editing?validDraft:!!selected);
 const action=phase||(configuring?'':editing?'保存并连接':connected?'继续':'连接服务器');
 const hint=phase||(editing?saved?'连接配置已保存，可修改后重试。':'连接后再选择项目的工作目录。':mode==='select'?'选择一个连接，或新建 SSH 连接。':!connected?'连接服务器后继续配置项目。':dockerMode&&project.environment?.kind!=='docker'?'选择容器和工作目录后即可保存。':'');
 useEffect(()=>{live.current=true;return()=>{live.current=false;version.current++;};},[]);
 useEffect(()=>{if(!api)return;let active=true;let request=0;const load=()=>{const id=++request;void api.list().then(items=>{if(active&&id===request){setConnections(items);setAvailable(true);setLoaded(true);}}).catch(e=>{if(active&&id===request){setAvailable(false);setLoaded(true);setError(sshError(e));}});};load();const off=api.onChanged(load);return()=>{active=false;off();};},[api]);
 useEffect(()=>{onStateChange({busy,ready,editing,configuring,canContinue,canCancelWait:!!phase,action,hint,title:editing?mode==='create'?'新建 SSH 连接':'修改 SSH 连接':undefined});},[busy,ready,editing,configuring,canContinue,phase,action,hint,mode,onStateChange]);
 useEffect(()=>{if(!focusTarget.current||busy)return;const el=root.current?.querySelector<HTMLElement>(focusTarget.current);if(el){el.focus();focusTarget.current='';}},[mode,busy,folder,error,connected]);
 const move=(next:Mode,target:string)=>{focusTarget.current=target;setMode(next);setError('');setNotice('');};
 // Cancelling only abandons this editor's wait; shared SSH sessions may serve other tasks.
 const cancelWait=()=>{version.current++;setPhase('');setNotice('已取消等待。连接可能仍在后台完成，可稍后重试。');};
 const work=async(label:string,fn:(active:()=>boolean)=>Promise<void>)=>{
  if(phase||dockerBusy)return;const token=++version.current;const active=()=>live.current&&version.current===token;
  setPhase(label);setError('');setNotice('');
  try{await fn(active);}catch(e){if(active()){setError(sshError(e));focusTarget.current='[role="alert"]';}}
  finally{if(active())setPhase('');}
 };
 const back=()=>{if(busy)cancelWait();if(mode==='create')newDraft.current={draft,password,passphrase};move(project.connectionId?'configure':'select',project.connectionId?'#ssh-change':connections.length?'#ssh-connection':'#ssh-new');};
 const begin=(edit=false)=>{
  if(edit&&selected){setDraft({...selected});setPassword('');setPassphrase('');}
  else{const cached=newDraft.current;setDraft(cached?.draft||empty());setPassword(cached?.password||'');setPassphrase(cached?.passphrase||'');}
  setSaved(false);move(edit?'edit':'create','#ssh-host');
 };
 const connect=()=>void work(editing?'正在保存连接…':'正在连接服务器…',async active=>{
  if(!api)return;
  let connection=selected;
  if(editing){connection=await api.save({...draft,password,passphrase});if(!active())return;setDraft({...connection,remember:draft.remember});setSaved(true);setPhase('正在连接服务器…');}
  if(!connection)return;
  const items=!editing&&connection.state==='connected'?connections:await api.connect({id:connection.id});if(!active())return;
  setConnections(items);
  const same=project.connectionId===connection.id;
  change({...project,connectionId:connection.id,...(!same?{path:'',environment:undefined}:{})});
  setChoice(connection.id);if(!same)setDockerMode(false);
  setFolder(null);setPassword('');setPassphrase('');if(mode==='create')newDraft.current=null;
  move('configure',same&&dockerMode?'[name="work-environment"]':'#ssh-browse');
 });
 const browse=(path?:string)=>void work('正在读取目录…',async active=>{
  if(!api||!project.connectionId)return;
  const result=await api.browse({id:project.connectionId,path:path||project.path||undefined});if(!active())return;
  setFolder(result);focusTarget.current='#ssh-use-directory';
 });
 useImperativeHandle(ref,()=>({submit:()=>{if(canContinue&&!configuring)connect();},back,cancelWait}));
 return <section ref={root} className="project-ssh" aria-label={t('服务器连接')} aria-busy={busy}>
  {editing?<>
   <p className="project-editor-intro">{t('填写服务器信息。验证连接后，再选择项目的工作目录。')}</p>
   <fieldset className="project-editor-fields" disabled={busy}>
    <FieldGroup>
     <Field><FieldLabel htmlFor="ssh-host">{t('主机 / IP')}</FieldLabel><Input id="ssh-host" placeholder="192.168.1.10" autoComplete="off" value={draft.host} onChange={e=>setDraft({...draft,host:e.target.value})}/></Field>
     <Field><FieldLabel htmlFor="ssh-user">{t('SSH 用户名')}</FieldLabel><Input id="ssh-user" autoComplete="off" value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value})}/></Field>
     <Field><FieldLabel htmlFor="ssh-auth">{t('认证方式')}</FieldLabel><NativeSelect id="ssh-auth" value={draft.authType} onChange={e=>setDraft({...draft,authType:e.target.value as SshConnection['authType']})}><NativeSelectOption value="password">{t('密码')}</NativeSelectOption><NativeSelectOption value="key">{t('私钥')}</NativeSelectOption><NativeSelectOption value="agent">SSH Agent</NativeSelectOption></NativeSelect></Field>
     {draft.authType==='password'&&<Field><FieldLabel htmlFor="ssh-password">{t('SSH 密码')}</FieldLabel><Input id="ssh-password" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field>}
     {draft.authType==='key'&&<><Field><FieldLabel htmlFor="ssh-key">{t('私钥文件')}</FieldLabel><div className="project-directory-input"><Input id="ssh-key" value={draft.privateKeyPath||''} readOnly/><Button type="button" variant="outline" onClick={()=>void work('正在选择私钥…',async active=>{const value=await api?.key();if(active()&&value)setDraft({...draft,privateKeyPath:value});})}>{t('选择私钥')}</Button></div></Field><Field><FieldLabel htmlFor="ssh-passphrase">{t('私钥口令（可选）')}</FieldLabel><Input id="ssh-passphrase" type="password" autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)}/></Field></>}
     {draft.authType==='agent'?<FieldDescription>{t('使用本机 SSH Agent 中已加载的密钥。')}</FieldDescription>:<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.remember} onChange={e=>setDraft({...draft,remember:e.target.checked})}/>{t('使用系统安全存储记住凭据')}</label>}
     <details className="project-description"><summary>{t('高级设置')}<ChevronDown/></summary><FieldGroup>
      <Field><FieldLabel htmlFor="ssh-port">{t('端口')}</FieldLabel><Input id="ssh-port" type="number" min={1} max={65535} aria-invalid={!Number.isInteger(draft.port)||draft.port<1||draft.port>65535} value={draft.port} onChange={e=>setDraft({...draft,port:Number(e.target.value)})}/></Field>
      <Field><FieldLabel htmlFor="ssh-name">{t('连接名称')}</FieldLabel><Input id="ssh-name" placeholder={t('可留空，默认使用主机地址')} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></Field>
     </FieldGroup></details>
     <FieldDescription>{t('不记住凭据时，仅在本次应用运行期间保留。首次连接需核对服务器指纹。')}</FieldDescription>
    </FieldGroup>
   </fieldset>
  </>:mode==='select'?<>
   <div className="project-section-heading"><strong>{t('选择服务器')}</strong>{project.connectionId&&<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={back}><ArrowLeft data-icon="inline-start"/>{t('返回项目配置')}</Button>}</div>
   {!loaded&&api?<p className="project-editor-intro" role="status">{t('正在加载连接…')}</p>:connections.length?<Field><FieldLabel htmlFor="ssh-connection">{t('已保存的连接')}</FieldLabel><NativeSelect id="ssh-connection" disabled={busy} value={choice} onChange={e=>{setChoice(e.target.value);setError('');setNotice('');}}><NativeSelectOption value="">{t('请选择连接')}</NativeSelectOption>{connections.map(c=><NativeSelectOption key={c.id} value={c.id}>{c.name} · {c.username}@{c.host}:{c.port}</NativeSelectOption>)}</NativeSelect><FieldDescription>{t(selected?.state==='connected'?'此连接已就绪，可以继续配置项目。':'选择连接后，无需重复填写服务器信息。')}</FieldDescription></Field>:<p className="project-editor-intro">{t('还没有保存的连接。添加服务器后，可在多个项目中复用。')}</p>}
   <Button id="ssh-new" type="button" variant="outline" disabled={busy||!available} onClick={()=>begin()}><Plus data-icon="inline-start"/>{t('新建 SSH 连接')}</Button>
  </>:<>
   <div className="project-connection-summary"><Server aria-hidden="true"/><div><strong>{selected?.name||t('服务器连接')}</strong><span>{selected?`${selected.username}@${selected.host}:${selected.port}`:t('请选择连接')}</span></div>{connected&&<span className="project-connected"><Check aria-hidden="true"/>{t('已连接')}</span>}<Button id="ssh-change" type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>{setChoice(project.connectionId||'');move('select','#ssh-connection');}}>{t('更换')}</Button></div>
   <div className="project-connection-actions"><Button type="button" variant="ghost" size="sm" disabled={busy||!selected} onClick={()=>begin(true)}>{t('修改连接 / 重新认证')}</Button></div>
   {connected&&<>
    <fieldset className="project-location" disabled={busy}><legend>{t('工作环境')}</legend><div className="project-location-options">{[{value:false,label:'服务器'},{value:true,label:'Docker 容器'}].map(option=><label className="project-location-option" key={option.label}><input type="radio" name="work-environment" checked={dockerMode===option.value} onChange={()=>{setDockerMode(option.value);setFolder(null);change({...project,path:'',environment:undefined});}}/><span>{t(option.label)}</span></label>)}</div></fieldset>
    {!dockerMode&&<Button id="ssh-browse" type="button" variant="outline" disabled={busy} onClick={()=>browse()}><Folder data-icon="inline-start"/>{t('浏览远端目录')}</Button>}
    {dockerMode&&<DockerProjectFields key={project.connectionId} project={project} change={change} onBusy={setDockerBusy}/>}
   </>}
  </>}
  {folder&&configuring&&!dockerMode&&<div className="project-folder-browser"><div className="project-folder-toolbar"><Button size="icon-sm" aria-label={t('上级目录')} type="button" variant="ghost" disabled={busy||folder.path===folder.parent} onClick={()=>browse(folder.parent)}><ArrowUp/></Button><code title={folder.path}>{folder.path}</code><Button id="ssh-use-directory" size="sm" type="button" disabled={busy} onClick={()=>{change({...project,path:folder.path,name:project.name||folder.path.split('/').filter(Boolean).pop()||project.name});setFolder(null);document.getElementById('project-name')?.focus();}}>{t('使用此目录')}</Button></div><div className="project-folder-list" aria-label={t('远端文件夹')}>{folder.entries.length?folder.entries.map(e=><button type="button" disabled={busy} key={e.path} onClick={()=>browse(e.path)}><Folder/><span>{e.name}</span><ChevronRight/></button>):<p>{t('此目录中没有子文件夹，可直接使用当前目录。')}</p>}</div></div>}
  {notice&&<p className="project-editor-intro" role="status">{t(notice)}</p>}
  {(!api||error)&&<Alert tabIndex={-1}><AlertTitle>{t(!api||error===restartMessage?restartMessage:errorHelp(error))}</AlertTitle>{error&&error!==restartMessage&&<AlertDescription><details><summary>{t('技术详情')}</summary><p className="break-all">{t(error)}</p></details>{!editing&&selected&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>begin(true)}>{t('重新认证')}</Button>}</AlertDescription>}</Alert>}
 </section>;
}
