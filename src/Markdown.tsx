import {t, useLanguage} from './i18n';
import { memo, useState, type ReactNode, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import Artifact from './renderers/Artifact';
import { copyText } from './clipboard';
import 'katex/dist/katex.min.css';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}
export function CopyButton({ text }: { text: string }) {
  useLanguage();
  const [status, setStatus] = useState('复制');
  return <button type="button" className="text-button" onClick={async () => { try { await copyText(text); setStatus('已复制'); } catch { setStatus('复制失败'); } }}> {t(status)} </button>;
}
function CodeBlock({ children }: { children?: ReactNode }) {
  const child = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const language = /language-([^\s]+)/.exec(child?.props.className || '')?.[1]?.toLowerCase() || 'text';
  const source = textOf(children).replace(/\n$/, '');
  const format = ['mermaid', 'echarts', 'drawio', 'svg'].includes(language) ? language : language === 'xml' && /<mx(GraphModel|file)/.test(source) ? 'drawio' : '';
  return format ? <Artifact language={format} source={source} /> : <div className="code-block"><div className="artifact-toolbar"><span>{language}</span><CopyButton text={source} /></div><pre>{children}</pre></div>;
}
export default memo(function Markdown({ text, resourceUrl, onFileLink }: { text: string; resourceUrl?:(path:string)=>string; onFileLink?:(path:string)=>void }) {
  useLanguage();
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { strict: false, trust: false }], [rehypeHighlight, { detect: false }]]} components={{
    pre: CodeBlock,
    a: ({ children, href }) => /^https?:\/\//i.test(href || '') ? <a href={href} title={href} target="_blank" rel="noopener noreferrer" onClick={event => { if (window.desktop) { event.preventDefault(); void window.desktop.openLink(href!).catch(() => {}); } }}>{children}</a> : onFileLink && href ? <a href={href} onClick={event=>{event.preventDefault();onFileLink(href);}}>{children}</a> : <span title={href}>{children}</span>,
    img: ({ alt, src }) => resourceUrl && src && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src) ? <img src={resourceUrl(src)} alt={alt||''} loading="lazy"/> : <span className="image-placeholder">{t('图片：')}{alt || t('未命名')}{t('（外部图片暂不自动加载）')}</span>,
    table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
  }}>{text}</ReactMarkdown></div>;
});
