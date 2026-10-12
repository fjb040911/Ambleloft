import {useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {Card,CardHeader,CardTitle,CardContent,CardDescription} from './components/ui/card';
import {Button} from './components/ui/button';
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from './components/ui/collapsible';
import {t} from './i18n';
import './collection-item-card.css';

/** Business-neutral row composition; data, selection and commands remain owned by TaskUi. */
export default function CollectionItemCard({title,selection,selected,badges,description,metadata,details,actions}:{
 title:ReactNode;selection:ReactNode;selected:boolean;badges?:ReactNode;description?:ReactNode;
 metadata?:{id:string;label:string;content:ReactNode;location:boolean}[];details?:ReactNode;actions?:ReactNode;
}){
 const [open,setOpen]=useState(false);
 return <Card role="listitem" className="collection-item gap-3 [--card-spacing:--spacing(5)]" data-selected={selected}>
  <CardHeader>
   <div className="collection-item-heading"><div className="collection-item-select">{selection}</div><div className="collection-item-heading-copy"><CardTitle className="collection-item-title">{title}</CardTitle>{badges&&<div className="collection-item-badges">{badges}</div>}</div></div>
  </CardHeader>
  <CardContent className="collection-item-body">
   {description&&<CardDescription className="collection-item-description">{description}</CardDescription>}
   {!!metadata?.length&&<dl className="collection-item-metadata">{metadata.map(item=><div key={item.id} className="collection-item-property" data-location={item.location}><dt>{item.label}</dt><dd>{item.content}</dd></div>)}</dl>}
   <Collapsible open={open} onOpenChange={setOpen}>
    <div className="collection-item-controls">{details&&<CollapsibleTrigger render={<Button variant="ghost" size="sm"/>}><ChevronDown className="collection-item-chevron" data-open={open}/>{t('查看详情')}</CollapsibleTrigger>}<div className="collection-item-actions">{actions}</div></div>
    {details&&<CollapsibleContent><div className="collection-item-details">{details}</div></CollapsibleContent>}
   </Collapsible>
  </CardContent>
 </Card>;
}
