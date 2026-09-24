import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import type {FileContext,OfficePreview as OfficeData} from './types';
import {t} from './i18n';
import './office-preview.css';
const Slides=lazy(()=>import('./PresentationPreview'));
function columnName(index:number){let result='';for(index++;index;index=Math.floor((index-1)/26))result=String.fromCharCode(65+(index-1)%26)+result;return result;}
function Spreadsheet({data}:{data:Extract<OfficeData,{kind:'spreadsheet'}>}){
 const [sheetName,setSheetName]=useState(data.sheets[0]?.name||''),[top,setTop]=useState(0),[height,setHeight]=useState(500),[selected,setSelected]=useState('');
 const host=useRef<HTMLDivElement>(null);
 const sheet=data.sheets.find(s=>s.name===sheetName)||data.sheets[0];
 useEffect(()=>{if(!host.current)return;const observer=new ResizeObserver(entries=>setHeight(entries[0].contentRect.height));observer.observe(host.current);return()=>observer.disconnect();},[]);
 const start=Math.min(Math.max(0,(sheet?.rows.length||1)-1),Math.max(0,Math.floor(top/30)-4)),end=Math.min(sheet?.rows.length||0,start+Math.ceil(height/30)+10);
 return <div className="sheet-viewer"><div className="sheet-tabs" role="tablist" aria-label={t('工作表')}>{data.sheets.map(s=><button key={s.name} role="tab" aria-selected={sheet?.name===s.name} onClick={()=>{setSheetName(s.name);setTop(0);setSelected('');if(host.current){host.current.scrollTop=0;host.current.scrollLeft=0;}}}>{s.name}</button>)}</div>
  <div className="sheet-value" title={selected}>{selected||t('只读预览 · 点击单元格查看内容')}</div>
  {data.truncated&&<div className="file-warning">{t('表格较大，部分内容未展示，请使用外部应用查看完整内容。')}</div>}
  <div className="sheet-scroll" ref={host} onScroll={e=>setTop(e.currentTarget.scrollTop)}>
   {!sheet?.rows.length?<p className="file-empty">{t('空工作表')}</p>:<table aria-label={sheet.name} aria-rowcount={sheet.rows.length+1}><thead><tr><th>#</th>{Array.from({length:sheet.columns},(_,i)=><th key={i}>{columnName(i)}</th>)}</tr></thead><tbody>
    {start>0&&<tr aria-hidden="true"><td colSpan={sheet.columns+1} style={{height:start*30,padding:0,border:0}}/></tr>}
    {sheet.rows.slice(start,end).map((row,i)=><tr key={start+i} aria-rowindex={start+i+2}><th>{start+i+1}</th>{row.map((cell,c)=><td key={c} title={cell} onClick={()=>setSelected(`${columnName(c)}${start+i+1}: ${cell}`)}>{cell}</td>)}</tr>)}
    {end<sheet.rows.length&&<tr aria-hidden="true"><td colSpan={sheet.columns+1} style={{height:(sheet.rows.length-end)*30,padding:0,border:0}}/></tr>}
   </tbody></table>}
  </div><div className="office-footnote">{t('显示单元格保存的结果；不重新计算公式，不展示图表和完整排版。')}</div>
 </div>;
}
export default function OfficePreview({context,path,version,reload=0,baseUrl,showRefresh=false}:{context:FileContext;path:string;version?:string;reload?:number;baseUrl:string;showRefresh?:boolean}){
 const [data,setData]=useState<OfficeData|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const initial=useRef(true);
 useEffect(()=>{
  let cancelled=false;setBusy(true);setError('');
  const timer=setTimeout(()=>{
   const api=window.desktop?.projectFiles;
   if(!api?.office){setError(t('请在桌面应用中查看文件'));setBusy(false);return;}
   api.office({...context,path,version}).then(value=>{if(!cancelled)setData(value);}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setBusy(false);});
  },initial.current?0:1500);initial.current=false;
  return()=>{cancelled=true;clearTimeout(timer);};
 },[context.projectId,context.runId,context.artifactId,path,version,reload,retry]);
 return <div className="office-preview">{showRefresh&&<div className="office-inline-toolbar"><button className="secondary-button" aria-label={t('刷新文件')} onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/>{t('刷新文件')}</button></div>}
  {(busy||error)&&<div className={error?'file-warning office-status':'file-notice office-status'} role={error?'alert':'status'}><span>{error?t(error):t(data?'正在更新预览…':'正在准备文档预览…')}{error&&data?' '+t('当前显示上次成功的预览。'):''}</span>{error&&<button className="secondary-button" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/>{t('重试')}</button>}</div>}
  {data?.kind==='spreadsheet'?<Spreadsheet data={data}/>:data?.kind==='presentation'?<Suspense fallback={<p>{t('正在加载…')}</p>}><Slides url={baseUrl+path.split('/').map(encodeURIComponent).join('/')+'?office='+data.asset} slides={data.slides} legacy={data.legacy}/></Suspense>:!busy&&!error?<p>{t('没有可预览的内容')}</p>:null}
 </div>;
}
