import {useState} from 'react';
import {Button} from './components/ui/button';
import {t} from './i18n';
import './catalog-tag-filters.css';
export default function CatalogTagFilters({tags,value,onChange}:{tags:{id:string;label:string;count:number}[];value:string;onChange(value:string):void}){
 const [expanded,setExpanded]=useState(false);
 if(!tags.length)return null;
 const visible=expanded?tags:tags.filter((tag,index)=>index<12||tag.id===value);
 return <div className="catalog-tag-filters" role="group" aria-label={t('按标签筛选')}>{visible.map(tag=><Button key={tag.id} variant={value===tag.id?'secondary':'outline'} size="sm" aria-pressed={value===tag.id} onClick={()=>onChange(value===tag.id?'':tag.id)}>{tag.label}<span className="text-muted-foreground">{tag.count}</span></Button>)}{tags.length>12&&<Button variant="ghost" size="sm" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{t(expanded?'收起标签':'更多标签')}</Button>}</div>;
}
