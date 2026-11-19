import {lazy,memo,Suspense,type ComponentProps} from 'react';
const MarkdownContent=lazy(()=>import('./MarkdownContent'));
// Plain text remains readable while the parser loads; never inject raw HTML.
export default memo(function Markdown(props:ComponentProps<typeof MarkdownContent>){
 return <Suspense fallback={<div className="markdown whitespace-pre-wrap">{props.text}</div>}><MarkdownContent {...props}/></Suspense>;
});
