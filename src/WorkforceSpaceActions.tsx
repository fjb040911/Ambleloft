import {Archive,ArchiveRestore,MoreHorizontal,Settings2,Trash2} from 'lucide-react';
import {Button} from './components/ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem,DropdownMenuSeparator} from './components/ui/dropdown-menu';
import {useCopy} from './WorkforceInputs';
import type {Space} from './workforce-types';
export type SpaceAction='archive'|'restore'|'delete';
export function SpaceActions({space,busy=false,edit,act}:{space:Space;busy?:boolean;edit?():void;act(space:Space,action:SpaceAction):void}){
 const L=useCopy();
 return <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={busy} aria-label={space.name+L('的空间操作',' space actions')}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-44"><DropdownMenuGroup>
 {edit&&!space.archivedAt&&<DropdownMenuItem onClick={edit}><Settings2/>{L('编辑空间','Edit space')}</DropdownMenuItem>}
 <DropdownMenuItem onClick={()=>act(space,space.archivedAt?'restore':'archive')}>{space.archivedAt?<ArchiveRestore/>:<Archive/>}{space.archivedAt?L('恢复空间','Restore space'):L('归档空间','Archive space')}</DropdownMenuItem>
 <DropdownMenuSeparator/><DropdownMenuItem disabled={!space.archivedAt} variant="destructive" onClick={()=>act(space,'delete')}><Trash2/>{space.archivedAt?L('删除空间…','Delete space…'):L('删除空间（请先归档）','Delete (archive first)')}</DropdownMenuItem>
 </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>;
}
