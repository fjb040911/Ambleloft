import {BriefcaseBusiness, MessageCircle, FolderOpen, Users, BookOpen, LibraryBig} from 'lucide-react';
import ProjectCategoryIcon from './ProjectCategoryIcon';
import ExtensionCategoryIcon from './ExtensionCategoryIcon';
import {SidebarMenu, SidebarMenuItem, SidebarMenuButton} from './components/ui/sidebar';
import {t, useLanguage} from './i18n';

// Both layouts use the same order, names and icons.
export const workspaceGroups = [
  {id:'projects', label:'项目', Icon:ProjectCategoryIcon},
  {id:'chats', label:'任务', Icon:MessageCircle},
  {id:'workforce', label:'协作工作平台', Icon:BriefcaseBusiness},
  {id:'extensions', label:'扩展', Icon:ExtensionCategoryIcon},
] as const;
export type WorkspaceGroup = typeof workspaceGroups[number]['id'];
export const workforcePages = [
  {id:'spaces', label:'项目空间', Icon:FolderOpen},
  {id:'employees', label:'我的专家', Icon:Users},
  {id:'store', label:'角色库', Icon:BookOpen},
  {id:'knowledge', label:'知识与决策', Icon:LibraryBig},
] as const;
export type WorkforceView = typeof workforcePages[number]['id'];

export function WorkforceNavigation({current, disabled, onSelect}:{current:WorkforceView|null; disabled?:boolean; onSelect(view:WorkforceView):void}) {
  useLanguage();
  return <SidebarMenu>{workforcePages.map(({id,label,Icon})=><SidebarMenuItem key={id}>
    <SidebarMenuButton variant="navigation" className="workforce-nav-row h-auto min-h-9 rounded-lg py-2 text-sm font-normal data-active:font-medium data-active:text-[var(--text)]" isActive={current===id} aria-current={current===id?'page':undefined} disabled={disabled} onClick={()=>onSelect(id)}>
      <Icon aria-hidden="true"/><span>{t(label)}</span>
    </SidebarMenuButton>
  </SidebarMenuItem>)}</SidebarMenu>;
}
