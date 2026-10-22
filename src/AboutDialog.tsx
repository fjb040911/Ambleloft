import {useEffect,useState,type MouseEvent,type ReactNode} from 'react';
import {ArrowUpRight,Check,Copy} from 'lucide-react';
import ManagementDialog from './ManagementDialog';
import {Button} from './components/ui/button';
import {Separator} from './components/ui/separator';
import {t,useLanguage} from './i18n';
import type {AppInfo} from './types';

const repository='https://github.com/fjb040911/Ambleloft';
const channels={development:'源码开发版',packaged:'安装版',browser:'浏览器预览'};
const systems:Record<string,string>={darwin:'macOS',win32:'Windows',linux:'Linux',browser:'Browser'};
export default function AboutDialog({close}:{close():void}) {
  const language=useLanguage();
  const [info,setInfo]=useState<AppInfo|null>(null);
  const [loadError,setLoadError]=useState(false);
  const [notice,setNotice]=useState('');
  const [copied,setCopied]=useState(false);
  useEffect(()=>{
    let active=true;
    const read=window.desktop
      ? window.desktop.getAppInfo?.() ?? Promise.reject(Error('App information unavailable'))
      : Promise.resolve({...__AMBLE_BUILD__,channel:'browser' as const,platform:'browser',osVersion:'',arch:''});
    read.then(value=>{if(active)setInfo(value);}).catch(()=>{if(active)setLoadError(true);});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),2500);return()=>clearTimeout(timer);},[copied]);
  async function open(event:MouseEvent<HTMLAnchorElement>,url:string) {
    if(!window.desktop)return;
    event.preventDefault();setNotice('');
    try {await window.desktop.openLink(url);}catch{setNotice('无法打开链接，请稍后重试。');}
  }
  function link(label:string,url:string,subtle=false):ReactNode {
    return <Button variant={subtle?'link':'outline'} size="sm" nativeButton={false} role="link" render={<a href={url} target="_blank" rel="noopener noreferrer" onClick={event=>void open(event,url)}/>}>{t(label)}{!subtle&&<ArrowUpRight data-icon="inline-end"/>}</Button>;
  }
  function footerLink(label:string,url:string) {
    return <a className="text-xs text-muted-foreground no-underline underline-offset-4 hover:text-foreground hover:underline" href={url} target="_blank" rel="noopener noreferrer" onClick={event=>void open(event,url)}>{t(label)}</a>;
  }
  async function copy() {
    if(!info)return;
    // Deliberately whitelist fields: never copy device names, paths, accounts or credentials.
    const text=[`Ambleloft ${info.version}`,`${t('运行方式')}: ${t(channels[info.channel])}`,`${t('系统')}: ${systems[info.platform]||info.platform} ${info.osVersion} ${info.arch}`.trim(),`${t('构建提交')}: ${info.commit||t('未提供')}${info.dirty===true?' ('+t('含未提交更改')+')':''}`,...(info.builtAt?[`${t('构建时间')}: ${info.builtAt}`]:[])].join('\n');
    setNotice('');
    try {if(window.desktop)await window.desktop.copyText(text);else await navigator.clipboard.writeText(text);setCopied(true);}catch{setNotice('复制失败，请重试。');}
  }
  return <ManagementDialog title={t('关于 Ambleloft')} busy={false} close={close} className="about-dialog">
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <img src="./brand/icon-128.png" alt="" className="size-14 shrink-0"/>
        <div className="flex min-w-0 flex-col gap-1"><h2 className="text-xl font-semibold tracking-tight">Ambleloft</h2><p className="text-sm text-muted-foreground">{t('让现有软件，拥有新的交互入口。')}</p></div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('开源桌面 AI Agent，为软件团队构建自己的业务 Agent 提供底座。通过技能、声明式表单和扩展，将对话连接到业务系统与开发环境。')}</p>
      <div className="flex flex-col gap-1 text-sm" aria-live="polite">
        {info?<><p className="font-medium">v{info.version}<span className="mx-2 text-muted-foreground" aria-hidden="true">·</span>{t(channels[info.channel])}</p>{info.commit&&<p className="text-xs text-muted-foreground">{t('构建提交')} <span className="font-mono">{info.commit}</span>{info.dirty===true&&` · ${t('含未提交更改')}`}</p>}</>:<p className="text-muted-foreground">{t(loadError?'暂时无法读取版本信息，请重启应用后重试。':'正在读取版本信息…')}</p>}
      </div>
      <nav aria-label={t('产品与帮助')} className="flex flex-wrap gap-2">
        {link('官方网站',`https://ambleloft.com/${language==='en'?'en':'zh'}/`)}
        {link('使用文档',`https://ambleloft.com/${language==='en'?'en':'zh'}/docs/overview/`)}
        {link('GitHub',repository)}
      </nav>
      <Separator/>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">{link('查看更新说明',repository+'/releases',true)}{link('反馈问题',repository+'/issues',true)}</div>
        <Button variant="outline" size="sm" disabled={!info} onClick={()=>void copy()}>{copied?<Check data-icon="inline-start"/>:<Copy data-icon="inline-start"/>}{t(copied?'已复制':'复制版本信息')}</Button>
      </div>
      {notice&&<p role="alert" className="text-sm text-destructive">{t(notice)}</p>}
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">{footerLink('Apache-2.0 许可证',repository+'/blob/main/LICENSE')}<span aria-hidden="true">·</span>{footerLink('第三方声明',repository+'/blob/main/THIRD_PARTY_NOTICES.md')}</div>
    </div>
  </ManagementDialog>;
}
