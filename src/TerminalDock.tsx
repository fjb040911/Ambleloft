import {lazy, Suspense, useLayoutEffect, useState, type ComponentProps} from 'react';
import RenderErrorBoundary from './RenderErrorBoundary';
import {Button} from './components/ui/button';
import {t} from './i18n';
import type TerminalPanel from './TerminalPanel';
import type {TerminalRequest} from './TerminalPanel';

let terminalImportFailed = false;

async function loadTerminalPanel() {
  try {
    // Chromium retains rejected imports by URL for the lifetime of the page.
    if (terminalImportFailed) return await import('./TerminalPanel.tsx?terminal-retry');
    return await import('./TerminalPanel');
  } catch (error) {
    terminalImportFailed = true;
    throw error;
  }
}

function ScopedTerminal({dismissError, ...props}: ComponentProps<typeof TerminalPanel> & {dismissError: () => void}) {
  const [Panel] = useState(() => lazy(loadTerminalPanel));
  return <RenderErrorBoundary fallback={
    <div hidden={!props.open} className="flex items-center justify-between gap-3 border-t px-4 py-2">
      <span role="alert">{t('终端界面未能打开。可以收起后重试。')}</span>
      <Button variant="outline" size="sm" onClick={dismissError}>{t('收起终端')}</Button>
    </div>
  }>
    <Suspense fallback={null}><Panel {...props}/></Suspense>
  </RenderErrorBoundary>;
}

type Dock = {
  context: TerminalRequest;
  request: {serial:number; directory?:string};
  open: boolean;
};

export default function TerminalDock({projectId,runId,viewId,setSettingsOpen}: TerminalRequest & {setSettingsOpen:(open:boolean)=>void}) {
  const scope = JSON.stringify([projectId,runId,viewId]);
  const [docks,setDocks] = useState<Record<string,Dock>>({});
  useLayoutEffect(()=>{
    const open = (event:Event) => {
      const directory = (event as CustomEvent).detail?.directory;
      setSettingsOpen(false);
      setDocks(previous=>({...previous,[scope]:{
        context:{projectId,runId,viewId},
        request:{serial:(previous[scope]?.request.serial||0)+1,directory},
        open:true,
      }}));
    };
    window.addEventListener('terminal:open',open);
    return ()=>window.removeEventListener('terminal:open',open);
  },[scope,projectId,runId,viewId,setSettingsOpen]);

  // Retain panel preferences per task. Only the visible panel mounts a terminal screen.
  return <>{Object.entries(docks).map(([key,dock])=><ScopedTerminal key={key}
    context={dock.context} request={dock.request} open={key===scope&&dock.open}
    hide={()=>setDocks(previous=>({...previous,[key]:{...previous[key],open:false}}))}
    dismissError={()=>setDocks(previous=>{const next={...previous};delete next[key];return next;})}
  />)}</>;
}
