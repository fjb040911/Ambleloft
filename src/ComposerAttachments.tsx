import ChatAttachments from './ChatAttachments';
import type {ComposerOptions} from './ComposerControls';
export default function ComposerAttachments({value,onChange,disabled}:{value:ComposerOptions;onChange(value:ComposerOptions):void;disabled?:boolean}) {
 return <ChatAttachments compact files={value.attachments||[]} disabled={disabled} onRemove={path=>onChange({...value,attachments:value.attachments?.filter(file=>file.path!==path)})}/>;
}
