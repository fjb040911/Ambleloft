import {useRef} from 'react';
import Markdown from './Markdown';
import FileCode from './FileCode';
import FileTypeIcon from './FileTypeIcon';
import PreviewDialog from './PreviewDialog';

export default function ArtifactPreview({name,text,close}:{name:string;text:string;close():void}) {
 const position=useRef(0);
 const markdown=/\.(md|markdown)$/i.test(name);
 return <PreviewDialog name={name} icon={<FileTypeIcon name={name}/>} contentClass={markdown?'is-markdown':'is-code'} close={close}>
  {markdown?<Markdown text={text}/>:<FileCode artifactPreview text={text} path={name} wrap={true} position={position.current} onScroll={top=>{position.current=top;}}/>}
 </PreviewDialog>;
}
