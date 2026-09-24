import {Maximize2,Workflow} from 'lucide-react';
import PreviewDialog from '../PreviewDialog';
import {t,useLanguage} from '../i18n';
import { lazy, Suspense, useEffect, useId, useState } from 'react';
import DOMPurify from 'dompurify';
import { copyText } from '../clipboard';
const Chart = lazy(() => import('./Chart'));
const Drawio = lazy(() => import('./Drawio'));
let mermaidQueue = Promise.resolve();
function cleanSvg(source: string) {
  return DOMPurify.sanitize(source, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'image', 'a', 'script'], FORBID_ATTR: ['href', 'xlink:href'] });
}
function Mermaid({ source }: { source: string }) {
  const id = 'diagram-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState(''); const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false; setSvg(''); setError('');
    const timer = setTimeout(() => {
      mermaidQueue = mermaidQueue.catch(() => {}).then(async () => {
        if (cancelled) return;
        try {
          const mermaid = (await import('mermaid')).default;
          // Global htmlLabels overrides the deprecated flowchart setting in Mermaid 11.
          // Keep labels in SVG text so sanitization does not discard HTML labels.
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', suppressErrorRendering: true, maxTextSize: 50000,
            htmlLabels: false, flowchart: { htmlLabels: false },
            secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering', 'htmlLabels'] });
          const { svg } = await mermaid.render(id, source.replace(/^(?:[ \t]|&#(?:x20|32);|&nbsp;)+/gim, indentation=>indentation.replace(/&#(?:x20|32);|&nbsp;/gi, ' ')));
          if (!cancelled) setSvg(cleanSvg(svg));
        } catch (error) {
          if (!cancelled) {
            const detail=error instanceof Error?error.message:String(error);
            setError(t('图表尚未完整或语法不受支持，可切换源码查看。')+'\n'+detail.slice(0,1200));
          }
        }
      });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source, id]);
  return error ? <p className="artifact-error" role="alert">{error}</p> : svg ? <img className="diagram-svg" alt={t("Mermaid 图表")} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} /> : <p role="status">{t('正在生成图表…')}</p>;
}
export default function Artifact({ language, source }: { language: string; source: string }) {
  useLanguage();
  const [raw, setRaw] = useState(false); const [copy, setCopy] = useState('复制');
  const [expanded, setExpanded] = useState(false);
  const [previewOpen,setPreviewOpen]=useState(false);
  return <section className={`artifact ${expanded ? 'artifact-expanded' : ''}`} aria-label={`${language} 图表`}>
    <div className="artifact-toolbar"><strong>{language === 'drawio' ? t('draw.io · 基础预览') : language}</strong><div>
      <button type="button" onClick={() => setRaw(!raw)}>{raw ? t('预览') : t('源码')}</button>
      {language==='mermaid'?<button type="button" aria-label={t('最大化 Mermaid 图表')} title={t('最大化 Mermaid 图表')} onClick={()=>setPreviewOpen(true)}><Maximize2 size={16}/></button>:<button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? t('收起') : t('放大')}</button>}
      <button type="button" onClick={async () => { try { await copyText(source); setCopy('已复制'); } catch { setCopy('复制失败'); } }}>{t(copy)}</button>
      <button type="button" onClick={() => { const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = `diagram.${language === 'echarts' ? 'json' : language === 'mermaid' ? 'mmd' : language}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>{t('下载')}</button>
    </div></div>
    {raw ? <pre>{source}</pre> : source.length > 50000 ? <p className="artifact-error">{t('内容过大，请查看源码或下载。')}</p> : <div className="artifact-preview"><Suspense fallback={<p>{t('正在加载预览…')}</p>}>
      {language === 'mermaid' ? <Mermaid source={source} /> : language === 'echarts' ? <Chart source={source} /> : language === 'drawio' ? <Drawio source={source} /> : <img className="diagram-svg" alt={t("SVG 图形")} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg(source))}`} />}
    </Suspense></div>}
    {previewOpen&&<PreviewDialog name={t('Mermaid 图表')} icon={<Workflow size={18}/>} contentClass="is-diagram" maximizedOnly close={()=>setPreviewOpen(false)}>
      <div className="mermaid-dialog-canvas">{source.length>50000?<p className="artifact-error">{t('内容过大，请查看源码或下载。')}</p>:<Mermaid source={source}/>}</div>
    </PreviewDialog>}
  </section>;
}
