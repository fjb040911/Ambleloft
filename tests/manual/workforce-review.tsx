import React from 'react';import {createRoot} from 'react-dom/client';
import App from '../../src/App';import {ConfirmationProvider} from '../../src/Confirmation';
import '../../src/shadcn.css';import '../../src/shimmer.css';import '../../src/styles.css';import '../../src/workspace-polish.css';import '../../src/windows-layout.css';
createRoot(document.getElementById('root')!).render(<ConfirmationProvider><div className="fixed bottom-3 right-4 z-50 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground pointer-events-none">真实模型试跑记录 · 独立资料目录 · 只读审阅</div><App/></ConfirmationProvider>);
