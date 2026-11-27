import {useState} from 'react';
import {BookOpen,ChevronDown,FolderCode,Package,Upload} from 'lucide-react';
import {Button} from './components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from './components/ui/dropdown-menu';
import {Spinner} from './components/ui/spinner';
import {extensionsChanged} from './extensions';
import {useSkillImport} from './SkillImport';
import {t} from './i18n';

export default function LocalInstallMenu({onError}:{onError:(message:string)=>void}){
 const [installing,setInstalling]=useState(false);
 const skill=useSkillImport(onError);
 const busy=installing||skill.busy;
 const extensions=window.desktop?.extensions;
 async function installExtension(development:boolean){
  if(!extensions||busy)return;
  setInstalling(true);
  onError('');
  try{
   await extensions.install(development?{development:true}:undefined);
   extensionsChanged();
  }catch(error){onError(error instanceof Error?error.message:String(error));}
  finally{setInstalling(false);}
 }
 return <>
  <DropdownMenu>
   <DropdownMenuTrigger render={<Button variant="outline" disabled={busy}/>}>
    {busy?<Spinner data-icon="inline-start"/>:<Upload data-icon="inline-start"/>}{t('从本地安装')}<ChevronDown data-icon="inline-end"/>
   </DropdownMenuTrigger>
   <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]" aria-label={t('从本地安装')}>
    <DropdownMenuGroup>
     <DropdownMenuItem disabled={!window.desktop?.skills?.import} onClick={()=>void skill.importSkill()}>
      <BookOpen/><span className="flex flex-col"><span>{t('技能文件夹')}</span><small className="text-xs text-muted-foreground">{t('包含 SKILL.md')}</small></span>
     </DropdownMenuItem>
     <DropdownMenuItem disabled={!extensions?.install} onClick={()=>void installExtension(false)}>
      <Package/><span className="flex flex-col"><span>{t('扩展安装包')}</span><small className="text-xs text-muted-foreground">.amble-extension · .zip · .json</small></span>
     </DropdownMenuItem>
    </DropdownMenuGroup>
    <DropdownMenuSeparator/>
    <DropdownMenuGroup><DropdownMenuItem disabled={!extensions?.install} onClick={()=>void installExtension(true)}>
     <FolderCode/>{t('加载扩展开发目录')}
    </DropdownMenuItem></DropdownMenuGroup>
   </DropdownMenuContent>
  </DropdownMenu>
  {skill.conflict}
 </>;
}
