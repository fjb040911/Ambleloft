import {CodeBlock as TraceCodeBlock,CodeBlockContent} from './components/ui/code-block';
import {Button} from './components/ui/button';
import {t, useLanguage} from './i18n';
import { createContext, useContext, memo, type ReactNode, isValidElement } from 'react';
import ReactMarkdown, {type Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import Artifact from './renderers/Artifact';
import {useCopyFeedback} from './hooks/use-copy-feedback';
import 'katex/dist/katex.min.css';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}
export function CopyButton({ text }: { text: string }) {
  useLanguage();
  const {status,copy}=useCopyFeedback();
  return <Button type="button" variant="ghost" size="sm" aria-live="polite" onClick={()=>void copy(text)}> {t(status)} </Button>;
}
function CodeBlock({ children }: { children?: ReactNode }) {
  const child = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const language = /language-([^\s]+)/.exec(child?.props.className || '')?.[1]?.toLowerCase() || 'text';
  const source = textOf(children).replace(/\n$/, '');
  const format = ['mermaid', 'echarts', 'drawio', 'svg'].includes(language) ? language : language === 'xml' && /<mx(GraphModel|file)/.test(source) ? 'drawio' : '';
  return format ? <Artifact language={format} source={source} /> : <div className="code-block"><div className="artifact-toolbar"><span>{language}</span><CopyButton text={source} /></div><pre>{children}</pre></div>;
}
type MarkdownResources={resourceUrl?:(path:string)=>string;onFileLink?:(path:string)=>void};
const ResourceContext=createContext<MarkdownResources>({});
// Renderer identities must survive streaming updates. Inline component functions
// remount tables, images and links on every token (losing scroll and focus).
const MarkdownLink:NonNullable<Components['a']>=({children,href})=>{
 const {onFileLink}=useContext(ResourceContext);
 return /^https?:\/\//i.test(href||'')?<a href={href} title={href} target="_blank" rel="noopener noreferrer" onClick={event=>{if(window.desktop){event.preventDefault();void window.desktop.openLink(href!).catch(()=>{});}}}>{children}</a>:onFileLink&&href?<a href={href} title={href} onClick={event=>{event.preventDefault();onFileLink(href);}}>{children}</a>:<span title={href}>{children}</span>;
};
const MarkdownImage:NonNullable<Components['img']>=({alt,src})=>{
 const {resourceUrl}=useContext(ResourceContext);
 return resourceUrl&&src&&!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src)?<img src={resourceUrl(src)} alt={alt||''} loading="lazy"/>:<span className="image-placeholder">{t('图片：')}{alt||t('未命名')}{t('（外部图片暂不自动加载）')}</span>;
};
const MarkdownTable:NonNullable<Components['table']>=({children})=><div className="table-scroll"><table>{children}</table></div>;
const TracePre:NonNullable<Components['pre']>=({children})=><TraceCodeBlock size="sm"><CodeBlockContent wrap className="max-h-64">{textOf(children).replace(/\n$/,'')}</CodeBlockContent></TraceCodeBlock>;
const components:Components={pre:CodeBlock,a:MarkdownLink,img:MarkdownImage,table:MarkdownTable};
const traceComponents:Components={...components,pre:TracePre};
export default memo(function Markdown({ text, resourceUrl, onFileLink, context }: MarkdownResources & { context?:'trace'; text: string }) {
  useLanguage();
  return <ResourceContext.Provider value={{resourceUrl,onFileLink}}><div className={context==='trace'?"trace-markdown text-sm leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_blockquote]:border-l [&_blockquote]:pl-3 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold":"markdown"}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { strict: false, trust: false }], [rehypeHighlight, { detect: false }]]} components={context==='trace'?traceComponents:components}>{text}</ReactMarkdown></div></ResourceContext.Provider>;
});
