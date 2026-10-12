import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FileCode2,Copy,Check,FolderOpen,Sun,Moon,PanelLeft} from 'lucide-react';
import {Button} from '../components/ui/button';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '../components/ui/card';
import {Popover,PopoverTrigger,PopoverContent,PopoverHeader,PopoverTitle,PopoverDescription} from '../components/ui/popover';
import {TooltipProvider,Tooltip,TooltipTrigger,TooltipContent} from '../components/ui/tooltip';
import {Separator} from '../components/ui/separator';
import {Badge} from '../components/ui/badge';
import {ToggleGroup,ToggleGroupItem} from '../components/ui/toggle-group';
import '../tokens.css';import '../shadcn.css';import './file-reference-preview.css';

const examples=[
 {path:'src/features/team-projects/components/invitations/ProjectInvitationReviewPanel.tsx',line:42},
 {path:'src/features/billing/components/Settings.tsx',line:18},
 {path:'src/features/organization/components/Settings.tsx',line:67},
 {path:'src/财务报销/差旅与交通费用/申请表单/差旅费用明细及票据核验组件.tsx',line:126},
];
function splitPath(path:string){const cut=Math.max(path.lastIndexOf('/'),path.lastIndexOf('\\'));return {filename:path.slice(cut+1),directory:cut<0?'':path.slice(0,cut),folders:(cut<0?'':path.slice(0,cut)).split(/[\\/]/).filter(Boolean)};}
function Filename({value}:{value:string}){const characters=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value),x=>x.segment);const head=characters.length>30?characters.slice(0,-14).join(''):value;const tail=characters.length>30?characters.slice(-14).join(''):'';return <span className="flex min-w-0"><span className="truncate">{head}</span>{tail&&<span className="shrink-0">{tail}</span>}</span>;}
function FileReference({path,line,connected=true}:{path:string;line?:number;connected?:boolean}){
 const [open,setOpen]=useState(false),[tooltip,setTooltip]=useState(false),[copied,setCopied]=useState(false),[notice,setNotice]=useState('');const {filename,folders}=splitPath(path);
 const copy=async()=>{try{await navigator.clipboard.writeText(path);setCopied(true);setNotice('已复制完整项目相对路径');}catch{setNotice('复制失败，请选中上方路径手动复制。');}};
 return <Popover open={open} onOpenChange={value=>{setOpen(value);setCopied(false);setNotice('');}}>
 <Tooltip open={open?false:tooltip} onOpenChange={setTooltip}>
 <TooltipTrigger render={<PopoverTrigger render={<Button variant="ghost" className="h-auto w-full min-w-0 justify-start px-2 py-2 text-left" aria-label={`查看文件 ${filename} 的完整路径`}/>}/> }>
 <FileCode2 data-icon="inline-start"/><span className="flex min-w-0 flex-1 flex-col gap-1"><Filename value={filename}/><span className="flex min-w-0 items-center gap-2 text-muted-foreground"><span className="truncate">{folders.length>2?'…/':''}{folders.slice(-2).join('/')||'项目根目录'}</span>{line&&<span className="shrink-0">第 {line} 行</span>}</span></span>
 </TooltipTrigger>
 <TooltipContent style={{maxWidth:'min(32rem, calc(100vw - 2rem))'}} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{path}{line?`\n第 ${line} 行`:''}</TooltipContent>
 </Tooltip>
 <PopoverContent align="start" style={{width:'min(25rem, calc(100vw - 2rem))'}} className="gap-3 p-4">
 <PopoverHeader><PopoverTitle>文件位置</PopoverTitle><PopoverDescription>项目内的相对路径{line?`，第 ${line} 行`:''}</PopoverDescription></PopoverHeader>
 <p className="max-h-48 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] select-text">{path}</p><Separator/>
 <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>void copy()}>{copied?<Check data-icon="inline-start"/>:<Copy data-icon="inline-start"/>}{copied?'已复制':'复制路径'}</Button><Button disabled={!connected} onClick={()=>setNotice('演示：正式接入后，在文件管理器中定位这个文件。')}><FolderOpen data-icon="inline-start"/>定位文件</Button></div>
 {!connected&&<PopoverDescription>未关联本地项目，暂时无法定位文件。你仍可以查看和复制路径。</PopoverDescription>}
 <span role="status" aria-live="polite">{notice}</span>
 </PopoverContent></Popover>;
}
function Preview(){
 const [dark,setDark]=useState(false),[narrow,setNarrow]=useState(false),[taskNotice,setTaskNotice]=useState('');
 return <TooltipProvider delay={400}><main className="preview-shell">
 <header className="preview-header"><div><span className="preview-brand">Ambleloft</span><p>文件引用交互原型</p></div><div className="flex flex-wrap items-center gap-2"><ToggleGroup multiple={false} value={[narrow?'narrow':'wide']} onValueChange={values=>{if(values[0])setNarrow(values[0]==='narrow');}} variant="outline"><ToggleGroupItem value="wide">常规宽度</ToggleGroupItem><ToggleGroupItem value="narrow">窄窗口</ToggleGroupItem></ToggleGroup><Button variant="outline" size="icon" aria-label={dark?'切换浅色':'切换深色'} onClick={()=>{const next=!dark;setDark(next);document.documentElement.dataset.theme=next?'dark':'light';}}>{dark?<Sun/>:<Moon/>}</Button></div></header>
 <section className="preview-intro"><h1>先看清文件，再看完整路径。</h1><p>文件名是主要信息，目录和行号帮助辨认位置。悬停或键盘聚焦查看完整路径，点击展开可复制的路径与文件操作。</p></section>
 <div className="preview-stage" style={{maxWidth:narrow?360:860}}>
 <Card><CardHeader><CardTitle>文件引用</CardTitle><CardDescription>设计样例，不连接实际项目。所有路径都是示例数据。</CardDescription></CardHeader><CardContent className="flex min-w-0 flex-col gap-2">{examples.map(item=><FileReference key={item.path} {...item}/>)}<Separator/><FileReference path={'src/设计系统/'+('超长目录名称/'.repeat(15))+'国际化配置与扩展权限校验器.configuration.ts'} connected={false}/></CardContent></Card>
 <section className="preview-context"><div className="flex items-center gap-2"><PanelLeft/><h2>放进任务卡片</h2></div><p>文件信息只占固定区域，操作按钮保持独立。</p><Card><CardContent className="flex min-w-0 flex-col gap-4 pt-4"><div className="flex items-center justify-between gap-3"><Badge variant="secondary">待处理</Badge><span className="text-muted-foreground">ISSUE-001</span></div><p>将页面中的业务请求移动到服务层。</p><div className="preview-reference-row"><div className="min-w-0 flex-1"><FileReference {...examples[0]}/></div><Button variant="outline" onClick={()=>setTaskNotice('演示：已选择处理这条问题。正式应用中会发送到当前聊天。')}>修复问题</Button></div>{taskNotice&&<p role="status">{taskNotice}</p>}</CardContent></Card></section>
 </div>
 <footer className="preview-notes"><p>建议采用这一套通用组件，在任务卡片、扩展 UI 和结果列表中复用。</p><p>完整路径不滚动播放，不在列表中展开成多行。复制内容始终保留原始路径。</p></footer>
 </main></TooltipProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
