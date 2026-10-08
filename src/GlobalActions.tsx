import {createContext,useContext,type ReactNode} from 'react';
import {Bell,Search} from 'lucide-react';
import {MessageBadge} from './MessageCenter';
import {t} from './i18n';

type GlobalActions={openSearch():void;openMessages():void;messagesActive:boolean};
const GlobalActionsContext=createContext<GlobalActions|null>(null);
export function GlobalActionsProvider({value,children}:{value:GlobalActions;children:ReactNode}){
 return <GlobalActionsContext.Provider value={value}>{children}</GlobalActionsContext.Provider>;
}
export function useGlobalActions(){
 const actions=useContext(GlobalActionsContext);
 if(!actions)throw new Error('Global actions require GlobalActionsProvider');
 return actions;
}
export function GlobalSidebarActions({beforeNavigate}:{beforeNavigate?:(action:()=>void)=>void}){
 const {openSearch,openMessages,messagesActive}=useGlobalActions();
 return <div className="window-space global-sidebar-actions"><div className="sidebar-top-actions">
 <button className="icon-button sidebar-search" title={t('搜索工作台')} aria-label={t('搜索工作台')} onClick={openSearch}><Search size={18}/></button>
 <button className={`icon-button sidebar-messages ${messagesActive?'active':''}`} title={t('消息中心')} aria-label={t('消息中心')} aria-pressed={messagesActive} onClick={()=>beforeNavigate?beforeNavigate(openMessages):openMessages()}><Bell size={18}/><MessageBadge/></button>
 </div></div>;
}
