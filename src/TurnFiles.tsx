import {useMemo} from 'react';
import type {AgentRun,DeliveredFile,TurnFileChanges} from './types';
import {fileKey,turnFileOutputs} from '../electron/file-output-policy.mjs';
import DeliveredFiles from './DeliveredFiles';
import TurnChanges from './TurnChanges';
export default function TurnFiles({run,turnKey,openFile,openReference,openChanges}:{run:AgentRun;turnKey:string;openFile?(file:DeliveredFile):void;openReference?(path:string):void;openChanges(batch:TurnFileChanges):void}){
 const {deliveries,batches,remaining}=useMemo(()=>turnFileOutputs(run,turnKey),[run,turnKey]);
 return <><DeliveredFiles runId={run.id} files={deliveries} openFile={openFile} reviewFile={file=>{
  const batch=batches.find(batch=>batch.files.some(change=>fileKey(run.cwd,change.path)===fileKey(run.cwd,file.path)));
  return batch?()=>openChanges({...batch,files:batch.files.filter(change=>fileKey(run.cwd,change.path)===fileKey(run.cwd,file.path))}):undefined;
 }}/>{remaining.filter(batch=>batch.files.length).map(batch=><TurnChanges key={batch.turnKey} changes={batch} open={()=>openChanges(batch)} openFile={openReference}/>)}</>;
}
