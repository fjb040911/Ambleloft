import type {AgentRun,TurnFileChanges,DeliveredFile} from '../src/types';
type EvidenceRun=Pick<AgentRun,'cwd'|'tools'|'artifacts'|'fileChanges'>;
export function fileKey(cwd:string,file:string):string;
export function writePaths(run:EvidenceRun,turnKey:string):Set<string>;
export function attributedChanges(run:EvidenceRun,batch:TurnFileChanges):TurnFileChanges;
export function turnFileOutputs(run:EvidenceRun,turnKey:string):{deliveries:DeliveredFile[];batches:TurnFileChanges[];remaining:TurnFileChanges[]};
