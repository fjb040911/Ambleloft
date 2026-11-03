import {WorkforceIntro,WorkforceIntroMap} from './WorkforceIntro';
import {useState,useRef} from 'react';
import {RoleDetails} from './WorkforceRoleDetails';
import {ArrowRight,BookOpen,BriefcaseBusiness,FolderOpen,HelpCircle,Layers,LoaderCircle,Plus,RefreshCw,Search,Sparkles,Users} from 'lucide-react';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from './components/ui/card';
import {InputGroup,InputGroupInput,InputGroupAddon} from './components/ui/input-group';
import {Alert,AlertDescription} from './components/ui/alert';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription,EmptyContent} from './components/ui/empty';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './components/ui/dialog';
import {useLanguage} from './i18n';
import type {RoleCatalog,RoleTemplate} from './workforce-types';
const useCopy=()=>{const language=useLanguage();return(zh:string,en:string)=>language==='en'?en:zh;};
// Presentation copy from the approved v0.3 prototype. Actual roles and skill
// declarations always come from the verified Store, never the demo inventory.
const captions:Record<string,[string,string]>={
 'amble.product':['先把问题问清楚','Start with the right questions'],
 'amble.architecture':['让模块有共同约定','Give modules a shared contract'],
 'amble.web-ui':['把体验做到细节里','Make every interaction count'],
 'amble.integration':['让系统真正连接起来','Connect systems that matter'],
 'amble.copy':['说清楚产品的价值','Make the product’s value clear'],
 'amble.tutorial':['让第一次使用更顺畅','Make the first steps easier'],
 'amble.qa':['让结果经得起验证','Put the results to the test'],
};
const examples:Record<string,Array<[string,string]>>={
 'amble.product':[['梳理用户需求并制定验收标准','Turn user needs into acceptance criteria'],['比较产品方案并明确取舍','Compare product options and trade-offs']],
 'amble.architecture':[['分析系统边界与接口设计','Review system boundaries and APIs'],['比较架构方案并制定迁移计划','Compare architecture options and plan migration']],
 'amble.web-ui':[['评审界面并提出交互优化','Review a UI and suggest interaction improvements'],['整理组件与视觉规范','Define component and visual guidelines']],
 'amble.integration':[['设计并实现服务接口','Design and implement a service API'],['排查系统集成问题','Investigate integration issues']],
 'amble.copy':[['优化产品介绍与界面文案','Improve product messaging and interface copy'],['为目标用户撰写推广内容','Write audience-specific marketing copy']],
 'amble.tutorial':[['编写可执行的使用教程','Write an actionable tutorial'],['整理接口说明与故障排查文档','Document APIs and troubleshooting']],
 'amble.qa':[['根据需求设计测试与验收用例','Design tests and acceptance cases'],['复现缺陷并整理回归结果','Reproduce defects and report regression results']],
 'amble.frontend':[['实现响应式页面与组件','Build responsive pages and components'],['检查页面交互和性能','Review interface behavior and performance']],
 'amble.data':[['分析数据并整理关键发现','Analyze data and summarize findings'],['制作清晰的数据图表','Create clear data visualizations']],
 'amble.devops':[['检查构建与发布流程','Review build and release workflows'],['制定服务监控与恢复方案','Plan service monitoring and recovery']],
};
export function RoleLibrary({catalog,loading,refresh,create,select,quickAdd}:{catalog:RoleCatalog|null;loading:boolean;refresh():void;create():void;select(role:RoleTemplate):Promise<boolean>;quickAdd(role:RoleTemplate):Promise<boolean>}){
 const L=useCopy(),language=useLanguage(),[query,setQuery]=useState(''),[detail,setDetail]=useState<RoleTemplate|null>(null);
 const [adding,setAdding]=useState<string|null>(null),[addError,setAddError]=useState('');const addingRef=useRef(false);
 const add=async(item:RoleTemplate)=>{if(addingRef.current)return false;addingRef.current=true;setAdding(item.id);setAddError('');try{return await quickAdd(item);}catch(e){setAddError((e as Error).message);return false;}finally{addingRef.current=false;setAdding(null);}};
 const detailTrigger=useRef<HTMLElement|null>(null);
 const inspect=(role:RoleTemplate,trigger:HTMLElement)=>{detailTrigger.current=trigger;setDetail(role);};
 const matches=(catalog?.items||[]).filter(item=>[item.zh.name,item.en.name,item.zh.responsibilities,item.en.responsibilities,...item.skills.flatMap(s=>[s.label,s.labelEn||'',s.name])].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <section className="wf-library" aria-label={L('角色库','Role library')}>
  <WorkforceIntro className="wf-catalog-hero" tone="cream" title={<>{L('找到专业搭档，','Find a professional partner,')}<br/>{L('再让它适合你的业务。','then make the role your own.')}</>} description={L('选择合适的角色直接添加，或先查看详情并调整职责和技能。添加后会自动准备所需技能。','Add a role with its default skills, or review and customize it first. Skills are prepared after adding.')} actions={<Button onClick={create}>{L('自己设计一个角色','Design your own role')}<Plus data-icon="inline-end"/></Button>}>
   <WorkforceIntroMap Icon={BookOpen} title={L('角色模板','Role templates')} label={L('角色模板包含专业职责和推荐技能','Role templates include responsibilities and recommended skills')} nodes={[{Icon:BriefcaseBusiness,title:L('专业职责','Responsibilities'),description:L('方法与交付标准','Methods and standards')},{Icon:Sparkles,title:L('推荐技能','Recommended skills'),description:L('按专业方向精选','Curated for the role')}]} caption={L('选择模板 · 按需定制 · 添加专家','Choose · Customize · Add an expert')}/>
  </WorkforceIntro>
  <div className="wf-library-heading"><div><h2>{L('官方精选角色','Curated roles')}</h2><p>{L('技能按能力推荐，可以替换；不会强制绑定某一个品牌或工具。','Skills are recommended by capability. Replace them to fit your tools and workflow.')}</p></div><div className="wf-library-tools"><InputGroup><InputGroupAddon><Search/></InputGroupAddon><InputGroupInput type="search" aria-label={L('搜索角色或职责','Search roles or responsibilities')} placeholder={L('搜索角色或职责','Search roles or responsibilities')} value={query} onChange={e=>setQuery(e.target.value)}/></InputGroup><Button variant="ghost" size="icon" aria-label={L('刷新角色库','Refresh role library')} disabled={loading} onClick={refresh}>{loading?<LoaderCircle className="animate-spin"/>:<RefreshCw/>}</Button></div></div>
  {addError&&<Alert variant="destructive"><AlertDescription>{addError}</AlertDescription></Alert>}{catalog?.error&&<Alert><AlertDescription>{L('角色库暂时无法刷新。已加载的角色仍可查看，也可以自己设计角色。','The library could not be refreshed. Browse loaded roles or design your own.')}<Button variant="outline" size="sm" disabled={loading} onClick={refresh}>{L('重试','Retry')}</Button><details><summary>{L('查看原因','Show details')}</summary>{catalog.error}</details></AlertDescription></Alert>}
  {!catalog?<p role="status">{L('正在读取角色库…','Loading role library…')}</p>:<><p className="sr-only" role="status">{matches.length} {L('个匹配角色','matching roles')}</p><div className="wf-role-grid">{matches.map(item=>{const value=language==='en'?item.en:item.zh,defaults=item.skills.filter(s=>s.defaultSelected!==false),optional=item.skills.length-defaults.length,caption=captions[item.id],index=catalog.items.indexOf(item);return <Card className="wf-role-card" key={item.id}>
   <div className="wf-role-banner" data-tone={['lilac','mint','cream','lilac','pink','mint','cream'][index%7]}><BriefcaseBusiness aria-hidden="true"/><CardTitle><h3><button type="button" className="wf-role-name" aria-label={L('查看角色：','View role: ')+value.name} onClick={event=>inspect(item,event.currentTarget)}>{value.name}</button></h3></CardTitle><Badge variant="outline">{L('可自定义','Customizable')}</Badge></div>
   <CardHeader>{caption&&<strong className="wf-role-caption">{L(...caption)}</strong>}<CardDescription>{value.responsibilities}</CardDescription></CardHeader>
   <CardContent><div className="wf-skill-tags">{defaults.map(skill=><Badge key={skill.name} variant="secondary">{language==='en'?skill.labelEn||skill.label:skill.label}</Badge>)}</div></CardContent>
   <CardFooter><small>{defaults.length} {L('项默认技能','default skills')}{optional>0&&` · ${optional} ${L('项可选','optional')}`}</small><div className="wf-role-card-actions"><Button size="sm" variant="ghost" onClick={event=>inspect(item,event.currentTarget)} aria-label={L('查看详情：','View details: ')+value.name}>{L('详情','Details')}</Button><Button size="sm" disabled={!!adding} aria-label={L('添加专家：','Add expert: ')+value.name} onClick={()=>void add(item)}>{adding===item.id&&<LoaderCircle className="animate-spin" data-icon="inline-start"/>}{adding===item.id?L('添加中','Adding'):L('添加','Add')}</Button></div></CardFooter>
  </Card>;})}</div>{!matches.length&&<Empty><EmptyHeader><EmptyTitle>{query?L('没有匹配的角色','No matching roles'):L('暂无可用角色','No roles available')}</EmptyTitle><EmptyDescription>{query?L('换一个关键词，或根据自己的职责需求设计角色。','Try another search or design a role for your needs.'):L('可以先设计自己的角色，或刷新目录重试。','Design your own role or refresh the library.')}</EmptyDescription></EmptyHeader><EmptyContent>{query&&<Button variant="outline" onClick={()=>setQuery('')}>{L('清除搜索','Clear search')}</Button>}<Button onClick={create}>{L('自己设计角色','Design a role')}</Button></EmptyContent></Empty>}</>}
 {detail&&<RoleDetails examples={(examples[detail.id]||[]).map(item=>L(...item))} kind="template" definition={{...(language==='en'?detail.en:detail.zh),skills:detail.skills.map(skill=>({...skill,label:language==='en'?skill.labelEn||skill.label:skill.label,purpose:language==='en'?skill.purposeEn||skill.purpose:skill.purpose,reason:language==='en'?skill.reasonEn||skill.reason:skill.reason,usage:language==='en'?skill.usageEn||skill.usage:skill.usage,runtime:language==='en'?skill.runtimeEn||skill.runtime:skill.runtime}))}} metadata={detail.publisher} returnFocus={detailTrigger.current} actionLabel={L('添加专家','Add expert')} onAction={()=>add(detail)} onCustomize={()=>select(detail)} onClose={()=>setDetail(null)}/>}
 </section>;
}
export function WorkspaceIntro({create,employees,expertCount,firstSpace=true}:{create():void;employees():void;expertCount:number;firstSpace?:boolean}){const L=useCopy();return <WorkforceIntro className="wf-space-guide" tone="lilac" title={<>{L('让多个项目，','Bring your projects together')}<br/>{L('有一支共同的 AI 团队。','with one AI team.')}</>} description={L('把已有项目关联到一个空间，让不同职责的 AI 专家一起讨论、执行，并留下可以追溯的成果。','Link existing projects, work with specialized AI experts, and keep discussions and results traceable.')} actions={<><Button onClick={create}>{firstSpace?L('创建第一个项目空间','Create your first space'):L('创建项目空间','Create a project space')}<ArrowRight data-icon="inline-end"/></Button><Button variant="ghost" onClick={employees}>{expertCount?L(`${expertCount} 位专家`,`${expertCount} ${expertCount===1?'expert':'experts'}`):L('先添加专家','Add experts first')}</Button></>}>
 <WorkforceIntroMap Icon={Layers} title={L('项目空间','Project space')} label={L('项目空间关联已有项目和 AI 专家','A space links existing projects and AI experts')} nodes={[{Icon:FolderOpen,title:L('已有项目','Existing projects'),description:L('本地 / SSH / Docker','Local / SSH / Docker')},{Icon:Users,title:L('AI 专家','AI experts'),description:L('各自的职责与技能','Roles and skills')}]} caption={L('讨论 · 文档 · 任务 · 决策','Discussion · Documents · Tasks · Decisions')}/>
 </WorkforceIntro>;}
export function WorkforceHelp(){const L=useCopy(),[open,setOpen]=useState(false);return <><Button variant="ghost" onClick={()=>setOpen(true)}><HelpCircle data-icon="inline-start"/>{L('概念说明','How it works')}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="wf-dialog sm:max-w-[720px] p-6 flex"><DialogHeader><DialogTitle>{L('几个概念，一次分清楚','A few concepts, clearly explained')}</DialogTitle><DialogDescription>{L('角色、专家和空间各负责一件事。','Roles, experts and spaces each have a clear purpose.')}</DialogDescription></DialogHeader><div className="wf-concept-list">{[
 {Icon:BriefcaseBusiness,tone:'lilac',title:L('角色模板：专业的起点','Role templates: a professional starting point'),body:L('提供职责、工作方法与推荐技能。按你的业务修改，提交专家配置时，宿主自动准备声明的技能。','Start with responsibilities, methods and recommended skills. Customize them for your business; the host prepares declared skills when you submit the expert configuration.')},
 {Icon:Users,tone:'mint',title:L('AI 专家：长期使用的搭档','AI experts: long-term partners'),body:L('保存专业方向、职责与技能，可以参与多个空间。历史知识按授权查询，每个任务都有独立的工作上下文。','Save specialization, responsibilities and skills for use across spaces. Each task has its own context; historical knowledge requires authorization.')},
 {Icon:Layers,tone:'cream',title:L('项目空间：围绕目标组织工作','Project spaces: organize work around a goal'),body:L('关联已有项目和专家，组织讨论、资料和任务。不需要新建磁盘目录，也不会移动原项目。','Link existing projects and experts, and organize discussions, documents and tasks. No new root directory or project migration is required.')}
 ].map(({Icon,tone,title,body})=><section className="wf-concept-row" key={tone}><span data-tone={tone}><Icon aria-hidden="true"/></span><div><h3>{title}</h3><p>{body}</p></div></section>)}</div></DialogContent></Dialog></>;}
