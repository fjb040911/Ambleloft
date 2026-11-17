export type TaskFileEvidence={path:string;contentHash:string;byteSize:number;startLine:number;endLine:number;capturedAt:string;evidenceTime:string;recorded:{turnKey:string|null;status:string;partial:boolean;beforeHash?:string|null;additions?:number|null;deletions?:number|null;afterHash:string|null};recordedVersionMatch:boolean|null;currentState?:string};
export type ExpertReference={ref:{id:string;sourceKey:string;revisionKey:string;semanticHash:string;stateFingerprint:string};title:string;kind:string;authority:string;cited?:boolean;fileEvidence?:TaskFileEvidence};
export type TaskContextInfo={revision:number;capturedAt:string;status:string;included:number;omissions:{kind:string;reason:string}[];files?:TaskFileEvidence[]};
export type ExpertChatTurn={taskContextInfo?:TaskContextInfo;id:string;roundId?:string;ordinal?:number;attempt?:number;phase?:string;employee:{id:string;name:string};text:string;answer?:string;unresolvedQuestions?:string[];status:string;error?:string;createdAt:string;references:ExpertReference[];contextUnavailable?:boolean;model?:string;domainId?:string};
export type ExpertChatState={id:string;revision:number;anchor:{id:string;kind:'draft'|'run';recordId:string;projectId:string|null};excludedSourceKeys:string[];turns:ExpertChatTurn[]};
export type ExpertChatAPI={
 directory():Promise<{employees:{id:string;name:string;description:string}[];domains:{id:string;name:string}[]}>;
 read(input:{conversationId:string}):Promise<ExpertChatState>;
 submit(input:{commandId:string;conversationId?:string;projectId?:string|null;text:string;selectedEmployeeIds:string[];domainId?:string;replyToContributionId?:string}):Promise<{conversationId:string;turnId:string;turnIds?:string[]}>;
 retry(input:{conversationId:string;turnId:string;commandId:string;expectedAttempt:number}):Promise<{conversationId:string;turnId:string}>;
 revokeTaskContext(input:{conversationId:string;turnId:string}):Promise<ExpertChatState>;
 cancel(input:{conversationId:string;turnId:string;attempt?:number}):Promise<void>;
 exclude(input:{conversationId:string;sourceKey:string}):Promise<ExpertChatState>;
 source(input:{conversationId:string;turnId:string;sourceId:string}):Promise<{title:string;body:string;conditions?:string}>;
 export(input:{conversationId:string}):Promise<string>;
 onChanged(listener:(event:{conversationId:string})=>void):()=>void;
};
