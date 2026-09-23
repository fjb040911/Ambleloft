import {useState} from 'react';
import SkillManager from './SkillManager';
import {extensionsChanged,openExtensionView,useExtensions} from './extensions';
import {t} from './i18n';
export default function ExtensionsPage(){
 const {snapshot,error:loadError}=useExtensions();const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const act=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await action();extensionsChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <div className="content-page"><div className="section-heading"><h1>{t('扩展')}</h1><button className="secondary-button" disabled={busy||!window.desktop?.extensions} onClick={()=>void act(()=>window.desktop!.extensions!.install())}>{t('安装扩展')}</button></div><p className="page-description">{t('为工作台连接工具、上下文与业务流程。')}</p>
 {(error||loadError)&&<p className="error-banner" role="alert">{error||loadError}</p>}
 <section className="settings-group"><h2>Extension</h2>{!snapshot.installed.length&&<p>{t('尚未安装扩展。')}</p>}<p className="fine-print">{t('当前支持声明式页面和导航命令，不执行扩展脚本。工具、连接器及团队协作将通过后续扩展接口接入。')}</p></section>
 {snapshot.installed.map(({manifest,enabled})=><section className="settings-group" key={manifest.id}><div className="section-heading"><h2>{manifest.name}</h2><span className="badge neutral">{t(enabled?'已启用':'已停用')}</span></div><p>{manifest.description}</p><small>{manifest.id} · v{manifest.version}</small><div className="settings-actions">{enabled&&manifest.contributes.commands?.map(command=><button key={command.id} className="secondary-button" disabled={busy} onClick={()=>void act(async()=>{const target=await window.desktop!.extensions!.command(command.id);openExtensionView(target.viewId);})}>{command.title}</button>)}<button className="secondary-button" disabled={busy} onClick={()=>void act(()=>window.desktop!.extensions!.enable({id:manifest.id,enabled:!enabled}))}>{t(enabled?'停用':'启用')}</button><button className="text-button danger" disabled={busy} onClick={()=>{if(window.confirm(t('卸载此扩展？现有聊天和项目不会删除。')))void act(()=>window.desktop!.extensions!.remove(manifest.id));}}>{t('卸载')}</button></div></section>)}
 <SkillManager query=""/></div>;
}
