import { useId, useMemo, useState } from 'react';
import { Inflate } from 'pako';
function parse(source: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('不支持 XML 实体');
  const doc = new DOMParser().parseFromString(source, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML 尚未完整');
  return doc;
}
function diagramXml(element: Element) {
  const model = element.querySelector('mxGraphModel');
  if (model) return model;
  const text = element.textContent?.trim() || '';
  if (text.startsWith('<')) return parse(text).documentElement;
  let length = 0; const chunks: Uint8Array[] = [];
  const inflate = new Inflate({ raw: true });
  inflate.onData = chunk => { length += chunk.length; if (length > 1000000) throw new Error('图形解压后过大'); chunks.push(chunk as Uint8Array); };
  inflate.push(Uint8Array.from(atob(text), c => c.charCodeAt(0)), true);
  if (inflate.err) throw new Error('压缩图形无法解码');
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return parse(decodeURIComponent(new TextDecoder().decode(bytes))).documentElement;
}
const num = (element: Element | null, key: string, fallback = 0) => { const n = Number(element?.getAttribute(key) ?? fallback); return Number.isFinite(n) ? Math.max(-100000, Math.min(100000, n)) : fallback; };
const plain = (value: string) => new DOMParser().parseFromString(value.replace(/<br\s*\/?\s*>/gi, '\n'), 'text/html').body.textContent || '';
const color = (value: string | undefined, fallback: string) => value && /^(#[\da-f]{3,8}|[a-z]+)$/i.test(value) ? value : fallback;
export default function Drawio({ source }: { source: string }) {
  const id = 'arrow-' + useId().replace(/[^\w]/g, ''); const [page, setPage] = useState(0);
  const result = useMemo(() => {
    try {
      const doc = parse(source); const diagrams = [...doc.querySelectorAll('diagram')];
      const root = diagrams.length ? diagramXml(diagrams[Math.min(page, diagrams.length - 1)]) : doc.documentElement;
      if (root.tagName !== 'mxGraphModel') throw new Error('需要 mxGraphModel 或 mxfile XML');
      const all = [...root.querySelectorAll('mxCell')]; if (all.length > 500) throw new Error('图形过大，请下载查看');
      const cells = all.filter(cell => cell.getAttribute('vertex') === '1').map(cell => {
        const g = cell.querySelector('mxGeometry'); const style = Object.fromEntries((cell.getAttribute('style') || '').split(';').filter(Boolean).map(s => { const [key, value = '1'] = s.split('='); return [key, value]; }));
        return { id: cell.id, parent: cell.getAttribute('parent'), x: num(g,'x'), y: num(g,'y'), w: num(g,'width',120), h: num(g,'height',60), style, text: plain(cell.getAttribute('value') || cell.parentElement?.getAttribute('label') || '') };
      });
      const byId = new Map(cells.map(c => [c.id, c]));
      const positioned = cells.map(c => { let x=c.x,y=c.y,parent=c.parent; const seen=new Set([c.id]); while(parent && byId.has(parent) && !seen.has(parent)) { seen.add(parent); const p=byId.get(parent)!; x+=p.x;y+=p.y;parent=p.parent; } return {...c,x,y}; });
      const positions = new Map(positioned.map(c => [c.id,c]));
      const edges = all.filter(c=>c.getAttribute('edge')==='1').map(c=>{
        const a=positions.get(c.getAttribute('source') || ''), b=positions.get(c.getAttribute('target') || '');
        const g=c.querySelector('mxGeometry'); const start=g?.querySelector('[as="sourcePoint"]') || null, end=g?.querySelector('[as="targetPoint"]') || null;
        let x1=a ? a.x+a.w/2:num(start,'x'), y1=a ? a.y+a.h/2:num(start,'y'), x2=b ? b.x+b.w/2:num(end,'x'), y2=b ? b.y+b.h/2:num(end,'y');
        const dx=x2-x1,dy=y2-y1;
        const boundary=(w:number,h:number)=>Math.min(dx ? w/2/Math.abs(dx):Infinity,dy ? h/2/Math.abs(dy):Infinity);
        if((dx||dy)&&a){const t=boundary(a.w,a.h);x1+=dx*t;y1+=dy*t;}
        if((dx||dy)&&b){const t=boundary(b.w,b.h);x2-=dx*t;y2-=dy*t;}
        return { id:c.id, x1,y1,x2,y2, text:plain(c.getAttribute('value') || '') };
      });
      const xs=[0,...positioned.flatMap(c=>[c.x,c.x+c.w]),...edges.flatMap(e=>[e.x1,e.x2])],ys=[0,...positioned.flatMap(c=>[c.y,c.y+c.h]),...edges.flatMap(e=>[e.y1,e.y2])];
      const x=Math.min(...xs)-25,y=Math.min(...ys)-25,w=Math.max(...xs)-x+25,h=Math.max(...ys)-y+25;
      return { cells:positioned,edges,viewBox:`${x} ${y} ${Math.max(w,100)} ${Math.max(h,100)}`, pages:diagrams.map((d,i)=>d.getAttribute('name') || `第 ${i+1} 页`) };
    } catch(error) { return { error:(error as Error).message }; }
  }, [source,page]);
  if ('error' in result) return <p className="artifact-error">{result.error}。可切换源码或下载。</p>;
  return <>{result.pages.length > 1 && <select aria-label="图形页面" value={Math.min(page,result.pages.length-1)} onChange={e=>setPage(Number(e.target.value))}>{result.pages.map((name,i)=><option key={i} value={i}>{name}</option>)}</select>}
    <svg className="drawio-canvas" viewBox={result.viewBox} role="img" aria-label="draw.io 基础图形"><defs><marker id={id} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#68778d" /></marker></defs>
      {result.edges.map(e=><g key={e.id}><line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#68778d" strokeWidth="1.5" markerEnd={`url(#${id})`} /><text x={(e.x1+e.x2)/2} y={(e.y1+e.y2)/2-8} textAnchor="middle" fontSize="12" fill="#334155">{e.text}</text></g>)}
      {result.cells.map(c=><g key={c.id} transform={`translate(${c.x} ${c.y})`}>
        {c.style.ellipse || c.style.shape==='ellipse' ? <ellipse cx={c.w/2} cy={c.h/2} rx={c.w/2} ry={c.h/2} fill={color(c.style.fillColor,'#edf3fc')} stroke={color(c.style.strokeColor,'#8096b5')} /> : c.style.rhombus || c.style.shape==='rhombus' ? <polygon points={`${c.w/2},0 ${c.w},${c.h/2} ${c.w/2},${c.h} 0,${c.h/2}`} fill={color(c.style.fillColor,'#edf3fc')} stroke={color(c.style.strokeColor,'#8096b5')} /> : <rect width={c.w} height={c.h} rx={c.style.rounded==='1'?10:0} fill={color(c.style.fillColor,'#edf3fc')} stroke={color(c.style.strokeColor,'#8096b5')} />}
        <text x={c.w/2} y={c.h/2} textAnchor="middle" dominantBaseline="middle" fontSize="13" fill={color(c.style.fontColor,'#26364b')}>{c.text.split('\n').map((line,i,lines)=><tspan key={i} x={c.w/2} dy={i===0 ? -(lines.length-1)*8 : 16}>{line}</tspan>)}</text>
      </g>)}
    </svg><p className="fine-print">基础预览支持节点、连线和多页。自定义形状、复杂路由及样式请下载到 draw.io 查看。</p></>;
}
