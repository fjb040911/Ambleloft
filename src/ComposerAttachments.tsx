import {Folder,X} from 'lucide-react';
import {Attachment,AttachmentMedia,AttachmentContent,AttachmentTitle,AttachmentActions,AttachmentAction} from './components/ui/attachment';
import type {ComposerOptions} from './ComposerControls';
import {t} from './i18n';
export default function ComposerAttachments({value,onChange,disabled}:{value:ComposerOptions;onChange(value:ComposerOptions):void;disabled?:boolean}) {
 if(!value.attachments?.length)return null;
 return <div className="flex min-w-0 flex-wrap gap-2" aria-label={t('附件')}>{value.attachments.map(file=><Attachment size="sm" key={file.path} title={file.path}><AttachmentMedia variant="icon"><Folder/></AttachmentMedia><AttachmentContent><AttachmentTitle>{file.name}</AttachmentTitle></AttachmentContent><AttachmentActions><AttachmentAction aria-label={`${t('移除附件')} ${file.name}`} disabled={disabled} onClick={()=>onChange({...value,attachments:value.attachments?.filter(f=>f.path!==file.path)})}><X/></AttachmentAction></AttachmentActions></Attachment>)}</div>;
}
