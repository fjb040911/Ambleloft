/** Source developer preview (M1 + M2 automation). Not a stable 1.0 contract or published SDK version. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type Capability = 'projects.read' | 'projects.path.read' | 'conversations.create'
  | 'conversations.open' | 'agent.hooks' | 'conversations.read' | 'background.jobs' | 'project.activity.read' | 'project.usage.read' | 'project.summaries.generate' | 'storage' | 'configuration' | 'secrets';
export type ErrorCode = 'INVALID_ARGUMENT' | 'INVALID_OUTPUT' | 'NOT_FOUND' | 'UNSUPPORTED'
  | 'UNTRUSTED' | 'DISABLED' | 'FORBIDDEN' | 'GRANT_REQUIRED' | 'INTERACTION_REQUIRED'
  | 'SOURCE_EXPIRED' | 'RANGE_TOO_LARGE' | 'MODEL_UNAVAILABLE' | 'CANCELLED' | 'TIMEOUT' | 'OUTCOME_UNKNOWN' | 'BUSY' | 'CONFLICT'
  | 'ACTIVATION_FAILED' | 'HOST_UNAVAILABLE' | 'STORAGE_UNAVAILABLE' | 'QUOTA_EXCEEDED' | 'INTERNAL';
export interface Failure {
  code: ErrorCode;
  message: string;
  requestId: string;
  effectStatus: 'notStarted' | 'unknown' | 'completed';
  /** Diagnostic metadata, never credentials, stack traces, or full input by default. */
  details?: JsonObject;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };
export interface Disposable { dispose(): void }
export interface Project { id: string; name: string; description: string }
export interface ConversationRef { id: string; projectId: string; state: 'draft' | 'started' }
export interface InvokeOptions { signal?: AbortSignal }
export interface KvEntry { value: Json; revision: number }
export interface ScopedStorage {
  get(key: string): Promise<KvEntry | null>;
  /** null means create only when absent (including after delete); revisions remain monotonic. */
  set(key: string, value: Json, expectedRevision: number | null): Promise<number>;
  delete(key: string, expectedRevision: number): Promise<void>;
}
export interface ProjectResources {
  /** projectId must match the invocation's bound project. */
  getProject(projectId: string): Promise<Project>;
  getProjectPath(projectId: string): Promise<string>;
  createConversation(input: { projectId: string; title: string; initialPrompt?: string }): Promise<ConversationRef>;
  /** Page invocation only; Agent gets INTERACTION_REQUIRED. Creating a draft does not open or run it. */
  openConversation(conversationId: string): Promise<void>;
}
export type LocalizedText = string | {key:string;args?:Record<string,string|number|boolean>};
export interface InvocationContext {
  /** Effective UI language captured before dispatch. */
  readonly locale: string;
  /** Host-owned form identity; never supplied by extension page input. */
  form?: FormInvocationContext;
  message?: {invocationId:string;messageId:string;actionId:string};
  readonly requestId: string;
  readonly caller: 'page' | 'agent';
  readonly projectId?: string;
  readonly signal: AbortSignal;
  readonly resources: ProjectResources;
  /** Page Operation only. Declare timeoutMs:120000 for interactive login. */
  readonly authentication: {requestSession(resourceId:string):Promise<AuthenticationSession>};
}
export type OperationHandler = (input: JsonObject, context: InvocationContext) => Promise<JsonObject>;
export interface TurnReference {conversationId:string;turnId:string;version:number}
/** Source preview. UTC half-open interval [from,to), at most 90 days. */
export interface ProjectInsightQuery {projectId:string;from:string;to:string;timezone:string;cursor?:string;limit?:number}
export interface InsightCoverage {measurement:'client-observed';since:string;reasons:string[];excludedOrigins:string[];metadataRetentionDays:number;sourceRetentionDays:number}
export interface InsightPage<T> {items:T[];nextCursor:string|null;watermark:string;coverage:InsightCoverage}
export interface ProjectActivity {id:string;projectId:string;type:'conversation.turn.terminal';status:string;occurredAt:string;sourceRef:TurnReference;sourceAvailability:'available'|'unavailable'|'expired'}
export interface ProjectUsage {id:string;hostRequestId:string;attempt:number;providerRequestId:string|null;projectId:string|null;runId:string|null;turnId:string|null;parentThreadId:string|null;jobId:string|null;providerId:string|null;model:string|null;purpose:'development'|'summary'|'other';origin:string;startedAt:string;finishedAt:string|null;status:'running'|'succeeded'|'failed'|'cancelled'|'unknown';counts:{input:number|null;output:number|null;total:number|null;cachedInput:number|null;reasoningOutput:number|null};quality:'reported'|'unknown';schemaVersion:1;revision:number}
export interface ProjectSummary {id:string;projectId:string;status:'preparing'|'generating'|'ready'|'partial'|'failed'|'unknown'|'cancelled';createdAt:number;completedBatches:number;totalBatches:number;items:{text:string;sourceRefs:TurnReference[];evidenceStatus:'reported'}[];sourceRefs:TurnReference[];modelRef:{providerId:string;model:string};ruleVersion:string;usageJobIds:string[];usageRecords:ProjectUsage[];coverage:{sourceCount:number;summarizedCount:number;reasons:string[]};blockedReason:string|null}
export interface ProjectInsights {
 /** Only projects currently granted project.activity.read; no filesystem paths. */
 projects:{list():Promise<Project[]>};
 activity:{list(input:ProjectInsightQuery):Promise<InsightPage<ProjectActivity>>};
 usage:{list(input:ProjectInsightQuery & {purpose?:ProjectUsage['purpose'];model?:string}):Promise<InsightPage<ProjectUsage>>};
 summaries:{
  /** Host-managed opt-in model policy. This API cannot change it. */
  policy(projectId:string):Promise<{paused:boolean;providerId:string;providerName:string;model:string;dailyLimit:number}>;
  prepare(input:{projectId:string;turns:TurnReference[];requestKey:string;ruleVersion:string;language:'zh-CN'|'en';modelRef:{providerId:string;model:string}}):Promise<ProjectSummary>;
  get(id:string):Promise<ProjectSummary>;
  /** An in-flight request may become unknown, never automatically retried. */
  cancel(id:string):Promise<ProjectSummary>;
 };
}
export interface TurnSnapshot extends TurnReference {projectId:string;status:string;messages:{id:string;role:string;text:string}[]}
export type HookEvent = (TurnReference & {type:'conversation.turn.completed'}) | {type:'background.job.completed';jobId:string;status:BackgroundJob['status']};
export type HookEnvelope = HookEvent & {eventId:string;projectId:string;occurredAt:string};
export interface BackgroundJob {id:string;eventKey:string;projectId:string;status:'queued'|'running'|'succeeded'|'failed'|'unknown'|'cancelled';providerId:string;model:string;createdAt:number;result?:Json;error?:string}
export interface BackgroundJobInput {projectId:string;eventKey:string;prompt:string;turns:TurnReference[];outputSchema:JsonObject}
export interface ExtensionContext {
  /** Probe before using optional localization increments on older hosts. */
  readonly capabilities: {projectInsights:1;skillLocalization:1;templateLocalization:1;notificationLocalization:1;liveLocalization:1};
  /** Synchronous registration during activate; returning resolves the durable delivery (ACK).
   * At least once: deduplicate effects with eventId. Maximum duration 30 seconds. */
  hooks:{register(handler:string,callback:(event:HookEnvelope,context:{signal:AbortSignal;projectId:string;requestId:string;locale:string})=>void|Promise<void>):Disposable};
  projectInsights: ProjectInsights;
  conversations:{getTurn(reference:TurnReference):Promise<TurnSnapshot>};
  /** eventKey is scoped to this installation; reuse with identical input returns the same job. */
  jobs:{submit(input:BackgroundJobInput):Promise<BackgroundJob>;get(jobId:string):Promise<BackgroundJob>};
  readonly extensionId: string;
  readonly packageRevision: string;
  /** Registration is synchronous during activate; only manifest handler names are valid. */
  operations: { register(handler: string, callback: OperationHandler): Disposable };
  storage: ScopedStorage;
  authentication: ExtensionAuthentication;
  configuration: {
    get(): Promise<JsonObject>;
    onDidChange(listener: (value: JsonObject) => void): Disposable;
  };
  secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  context: { set(key: string, value: boolean | string | number): Promise<void> };
  l10n: { readonly locale:string; onDidChangeLocale(listener:(locale:string)=>void):Disposable; t(key: string, args?: Record<string, string | number | boolean>): string };
  subscriptions: Disposable[];
}
/** Export these functions from manifest main. */
export type Activate = (context: ExtensionContext) => void | Promise<void>;
export type Deactivate = () => void | Promise<void>;

export interface HostContext {
  protocolVersion: '1';
  extensionId: string;
  pageInstanceId: string;
  locale: string;
  theme: 'light' | 'dark';
  supportedMethods: string[];
}
export interface WebviewClient {
  initialize(): Promise<HostContext>;
  /** Host applies confirmation policy; page clicks are not approval evidence.
   * No approval token is returned; host confirms and dispatches the exact request. */
  invoke(operationId: string, input: JsonObject, options?: InvokeOptions): Promise<Result<JsonObject>>;
  /** Host-owned picker plus explicit grant UI; null if user cancels. */
  selectProject(input: { capabilities: Capability[] }): Promise<Result<Project | null>>;
  requestGrant(input: { projectId: string; capabilities: Capability[] }): Promise<Result<boolean>>;
  /** A host-rendered secure field; value is never returned to this page. */
  requestSecretInput(input: { key: string; title: string }): Promise<Result<{ saved: boolean }>>;
  onHostContextChanged(listener: (context: HostContext) => void): Disposable;
}

/** Host-generated identity for a user-confirmed declarative form action. */
export interface FormInvocationContext { flowInstanceId: string; stepId: string; submissionId: string; templateDigest: string; conversationId: string }
export type FormRecoveryInput = { submissionId: string; projectId?: string };
export type FormRecoveryResult<T extends JsonObject = JsonObject> = { status: "succeeded"; result: T } | { status: "notExecuted" } | { status: "unknown" };

/** Host-owned opaque grant; no tokens or other extensions' accounts. */
export interface AuthenticationSession {id:string;resourceId:string;connectionId:string;account:{id:string;name:string};scopes:string[];expiresAt:number}
export interface ExtensionAuthentication {
 onDidChangeSessions(listener:()=>void):Disposable;
 getSession(resourceId:string):Promise<AuthenticationSession|null>;
 disconnect(resourceId:string):Promise<void>;
 request(input:{sessionId:string;path:string;method?:'GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'HEAD';body?:string}):Promise<{status:number;body:string;contentType:string}>;
}

/** Source-preview skill UI contract; not an ExtensionContext execution API. */
export interface DeclarativeUiData { values?: Record<string, unknown>; rows: Record<string, unknown>[]; state?: 'ready'|'empty'|'incomplete'|'failed'|'uninitialized'; summary?: string; coverage?: string; baseline?: ManagedRepairBaseline }
export interface DeclarativeUiBinding { from?: string; value?: unknown }
export interface DeclarativeUiAction { id: string; label: string; kind: 'chat'; scope: 'data'|'row'|'selection'|'all'; prompt: string; input?: Record<string, DeclarativeUiBinding>; eligible?: {field: string; notEquals: unknown}; managedRepair?: true }
export interface DeclarativeUiTemplate { version: 1; id: string; type: 'editor'|'collection'; title: string; description?: string; fields?: Record<string, unknown>[]; rows: { key: string; fields: Record<string, unknown>[]; layout?: 'table'|'cards'; card?: {titleField: string; descriptionField?: string; badgeFields?: string[]; metadataFields?: string[]}; columns?: string[]; detailFields?: string[]; unique?: string[]; filterFields?: string[]; location?: {pathField: string}; valueLabels?: Record<string, Record<string, string>> }; actions: DeclarativeUiAction[] }

/** Optional amble-form v1 increments; probe forms_capabilities at runtime. */
export interface DeclarativeFormCapabilities {declarativeForms:1;singleClickChat:1;fieldDependencies:1;conditionalFields:1;groupToggle:1;switch:1;readSubmission:1}
export interface DeclarativeFormField {
 name:string;label:string;type:'text'|'textarea'|'number'|'money'|'date'|'select'|'checkbox'|'switch'|'group-toggle';
 required?:boolean;help?:string;placeholder?:string;options?:{label:string;value:string}[];
 dependsOn?:string[];visibleWhen?:{field:string;equals:string|number|boolean};
 minLength?:number;maxLength?:number;minimum?:number|string;maximum?:number|string;integer?:boolean;currency?:string;scale?:number;
}
export interface DeclarativeFormChatSubmit {kind:'chat';label:string;confirmation?:'always'|'onSubmit'}
export interface DeclarativeFormSubmission {
 submissionId:string;instanceId:string;runId:string;conversationId:string;projectId?:string;source:string;sourceRevision:string|number;templateDigest:string;
 values:Record<string,Record<string,string|number|boolean>>;initialValues:Record<string,Record<string,string|number|boolean>>;touched:Record<string,boolean>;
 template:JsonObject;deliveryStatus:string;
}

/** Opt-in ui_present/ui_update baseline. Does not detect files added outside refs. */
export interface ManagedRepairBaseline {
 version:1; scope:'enumerated-files';
 refs:{kind:'report'|'rules'|'source';path:string;sha256:string}[];
 /** Previous uncertain submission, only after an explicit new review with a changed report. */
 reviewOf?:string;
}
/** finished means the model turn ended normally, never that a repair passed review. */
export type ManagedRepairStatus = 'queued'|'executing'|'finished'|'conflict'|'failed'|'reviewRequired'|'reviewed';
export interface ManagedRepairExecution {deliveryStatus:string;status:ManagedRepairStatus;error:string|null;scope:'enumerated-files'}
/** Probe ui_capabilities before enabling managedRepair; not an ExtensionContext API. */
export interface ManagedRepairCapabilities {managedRepair:1;managedRepairLocalOnly:true;managedRepairScope:'enumerated-files'}
