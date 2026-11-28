import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from './components/ui/card';
import {Button} from './components/ui/button';
import {t} from './i18n';
import './installed-tool-card.css';
export function ToolCardHeader({Icon,title,details,children}:{Icon:LucideIcon;title:ReactNode;details?:ReactNode;children:ReactNode}){
 return <CardHeader className="store-tool-header">
  <div className="store-tool-title">
   <span className="store-kind-icon"><Icon aria-hidden="true"/></span>
   <CardTitle><h2>{title}</h2></CardTitle>
   {details}
  </div>
  <CardDescription>{children}</CardDescription>
 </CardHeader>;
}
export default function InstalledToolCard({id,Icon,title,description,metadata,children,onDetails}:{id?:string;Icon:LucideIcon;title:string;description?:string;metadata:ReactNode;children:ReactNode;onDetails?():void}){
 const ref=useRef<HTMLSpanElement>(null),[clipped,setClipped]=useState(false);
 useEffect(()=>{const el=ref.current;if(!el)return;const measure=()=>setClipped(el.scrollHeight>el.clientHeight+1);measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[description]);
 return <Card className="store-installed-row" data-tool-id={id}>
  <ToolCardHeader Icon={Icon} title={title}><span ref={ref} className={onDetails?'store-installed-summary':'store-created-summary'}>{description}</span>{clipped&&onDetails&&<Button variant="link" size="sm" className="px-0" onClick={onDetails}>{t('查看完整说明')}</Button>}</ToolCardHeader>
  <CardContent className="store-installed-meta">{metadata}</CardContent>
  <CardFooter className="store-row-actions border-border">{children}</CardFooter>
 </Card>;
}
