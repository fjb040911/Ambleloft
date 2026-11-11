import React from 'react';
import {createRoot} from 'react-dom/client';
import RenderErrorBoundary from '../../src/RenderErrorBoundary';
import '../../src/shadcn.css';
let broken=true;
Object.assign(window,{repairTranscript:()=>{broken=false;},desktop:{exportRunDiagnostics:async()=>{document.body.dataset.exported='true';return {saved:true};}}});
function Transcript(){if(broken)throw Error('Synthetic transcript rendering failure');return <p>Transcript recovered</p>;}
createRoot(document.getElementById('root')!).render(<><nav>Sidebar remains available</nav><RenderErrorBoundary runId="fixture"><Transcript/></RenderErrorBoundary></>);
