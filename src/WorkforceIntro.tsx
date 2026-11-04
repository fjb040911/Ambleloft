import type {ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import {Users,BriefcaseBusiness,BookOpen,ArrowRight,Plus,Search,FileText,History,CheckCheck} from 'lucide-react';
import {Button} from './components/ui/button';
import {useCopy} from './WorkforceInputs';

// One visual contract for the four workbench landing pages. No fixed height:
// headings, translations and narrow layouts determine the space they need.
export function WorkforceIntro({tone,title,description,actions,children,className=''}:{tone:'lilac'|'cream'|'mint'|'pink';title:ReactNode;description:string;actions:ReactNode;children:ReactNode;className?:string}){
 return <header className={`wf-intro ${className}`} data-tone={tone}><div className="wf-intro-copy"><h1>{title}</h1><p>{description}</p><div className="wf-actions">{actions}</div></div>{children}</header>;
}
export function WorkforceIntroMap({Icon,title,nodes,caption,label}:{Icon:LucideIcon;title:string;nodes:{Icon:LucideIcon;title:string;description:string}[];caption:string;label:string}){
 return <div className="wf-intro-map" role="group" aria-label={label}><strong><Icon aria-hidden="true"/>{title}</strong><div className="wf-intro-map-line" aria-hidden="true"/><div className="wf-intro-map-nodes">{nodes.map(({Icon,title,description})=><div key={title}><Icon aria-hidden="true"/><span>{title}</span><small>{description}</small></div>)}</div><p>{caption}</p></div>;
}
export function ExpertIntro({add,browse}:{add():void;browse():void}){
 const L=useCopy();
 return <WorkforceIntro tone="mint" title={<>{L('让专业的事，','Give specialized work')}<br/>{L('交给你的 AI 专家。','to your AI experts.')}</>} description={L('定义每位专家的职责、技能与常用模型。所需技能会自动准备，配置好的专家可以参与多个项目空间，按各自分工协作。','Define each expert’s responsibilities, skills and preferred model. Required skills are prepared automatically, and configured experts can work across project spaces.')} actions={<><Button onClick={add}><Plus data-icon="inline-start"/>{L('添加专家','Add expert')}</Button><Button variant="ghost" onClick={browse}>{L('浏览角色库','Browse role library')}<ArrowRight data-icon="inline-end"/></Button></>}>
 <WorkforceIntroMap Icon={Users} title={L('我的专家','My experts')} label={L('专家结合职责与技能参与协作','Experts combine responsibilities and skills')} nodes={[{Icon:BriefcaseBusiness,title:L('专业职责','Responsibilities'),description:L('工作方法与交付要求','Methods and deliverables')},{Icon:BookOpen,title:L('所需技能','Required skills'),description:L('自动准备与全局复用','Prepared and reused')}]} caption={L('配置一次 · 多个空间复用','Configure once · Work across spaces')}/>
 </WorkforceIntro>;
}
export function KnowledgeIntro({search,spaces}:{search():void;spaces():void}){
 const L=useCopy();
 return <WorkforceIntro tone="pink" title={<>{L('让每一次决定，','Keep every decision')}<br/>{L('都有据可查。','grounded in its sources.')}</>} description={L('汇集项目空间中设为执行依据的文档。按关键词、空间或专家范围查找，核对原文与版本，再用于下一次工作。','Find execution references from your project spaces. Search by keyword, space or expert access, then check the source and revision before reusing it.')} actions={<><Button onClick={search}><Search data-icon="inline-start"/>{L('搜索执行依据','Search execution references')}</Button><Button variant="ghost" onClick={spaces}>{L('查看项目空间','View project spaces')}<ArrowRight data-icon="inline-end"/></Button></>}>
 <WorkforceIntroMap Icon={CheckCheck} title={L('执行依据','Execution references')} label={L('执行依据保留原文版本和来源','Execution references retain their versions and origins')} nodes={[{Icon:FileText,title:L('原文与版本','Source and version'),description:L('查看当前有效内容','Review current reference content')},{Icon:History,title:L('来源与决定','Origin and decisions'),description:L('追溯依据与替代关系','Trace reference changes')}]} caption={L('查找 · 核对 · 复用','Find · Verify · Reuse')}/>
 </WorkforceIntro>;
}
