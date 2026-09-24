import {useState} from 'react';
import {PanelRight,Maximize2,Minimize2} from 'lucide-react';
import FileTypeIcon from './FileTypeIcon';
import {t} from './i18n';
import type {TurnFileChanges} from './types';
import './file-changes.css';
export default function FileChangesPanel({changes,close}:{changes:TurnFileChanges;close():void}){
 const [full,setFull]=useState(false);
 const additions=changes.files.reduce((sum,file)=>sum+(file.additions||0),0),deletions=changes.files.reduce((sum,file)=>sum+(file.deletions||0),0);
 return <aside className={`changes-panel${full?' expanded':''}`} aria-label={t('本轮文件变更')}>
  <header><strong>{t('本轮文件变更')}</strong><button className="icon-button" aria-label={t(full?'还原面板':'展开面板')} onClick={()=>setFull(!full)}>{full?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button><button className="icon-button" aria-label={t('关闭变更面板')} onClick={close}><PanelRight size={20}/></button></header>
  <div className="changes-scroll"><p>{changes.files.length} {t('个文件')} <span className="diff-added">+{additions}</span> <span className="diff-deleted">−{deletions}</span></p>
   <p className="fine-print">{t('对比本轮执行前后工作目录中的文件；包含期间的外部修改。忽略依赖、构建和缓存目录。')}</p>
   {changes.notice&&<p role="status" className="error-banner">{t(changes.notice)}</p>}
   {changes.files.map(file=><details className="file-diff" key={file.id}>
    <summary><FileTypeIcon name={file.path}/><span className="diff-path" title={file.path}>{file.path}</span><small>{t({added:'已新增',modified:'已修改',deleted:'已删除'}[file.status])}</small>{file.additions!==undefined&&<span className="diff-added">+{file.additions}</span>}{file.deletions!==undefined&&<span className="diff-deleted">−{file.deletions}</span>}</summary>
    {file.hunks?.length?<div className="diff-code" tabIndex={0} aria-label={`${file.path} ${t('文本差异')}`}>{file.hunks.map((hunk,index)=>{
     let oldLine=hunk.oldStart,newLine=hunk.newStart;
     return <div key={index}><div className="diff-hunk">@@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</div>{hunk.lines.map((line,i)=>{const type=line[0],old=type===' '||type==='-'?oldLine++:'',next=type===' '||type==='+'?newLine++:'';return <div key={i} className={`diff-line ${type==='+'?'addition':type==='-'?'deletion':''}`}><span>{old}</span><span>{next}</span><code>{line}</code></div>;})}</div>;
    })}</div>:<p className="fine-print">{t(file.reason||'文件内容无可显示的文本差异')}</p>}
   </details>)}
  </div>
 </aside>;
}
