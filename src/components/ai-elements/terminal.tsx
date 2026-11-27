import {useLayoutEffect,useRef} from 'react';
import {SquareTerminal} from 'lucide-react';
import {CodeBlock,CodeBlockActions,CodeBlockContent,CodeBlockCopyButton} from '../ui/code-block';
import {hasStackTrace,StackTraceFrames} from './stack-trace';
import {t} from '../../i18n';

export function Terminal({command,output,live,failed}:{command:string;output:string;live:boolean;failed:boolean}){
  const viewport=useRef<HTMLPreElement>(null);
  const follow=useRef(true);
  useLayoutEffect(()=>{
    const node=viewport.current;
    if(node&&live&&follow.current)node.scrollTop=node.scrollHeight;
  },[output,live]);
  if(failed&&hasStackTrace(output))return <StackTraceFrames text={output}/>;
  // Omit leading blank lines in the preview. Copy always uses the original output.
  const visible=output.replace(/^(?:[ \t]*\r?\n)+/,'');
  return <div data-slot="terminal">
    <CodeBlock size="sm" variant="muted">
      <CodeBlockContent ref={viewport} wrap className="max-h-64" aria-label={t('工具输出')} onScroll={()=>{
        const node=viewport.current;
        if(node)follow.current=node.scrollHeight-node.clientHeight-node.scrollTop<8;
      }}>{visible || t(live?'等待输出…':'命令没有输出')}</CodeBlockContent>
      <CodeBlockActions>
        {command&&<CodeBlockCopyButton value={command} aria-label={t('复制命令')} title={t('复制命令')}><SquareTerminal/></CodeBlockCopyButton>}
        {output&&<CodeBlockCopyButton value={output} aria-label={t('复制输出')} title={t('复制输出')}/>}
      </CodeBlockActions>
    </CodeBlock>
  </div>;
}
