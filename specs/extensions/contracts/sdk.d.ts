/** M1 developer preview, SDK 0.1.0-alpha.1. Not a stable 1.0 contract. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type Capability = 'projects.read' | 'projects.path.read' | 'conversations.create'
  | 'conversations.open' | 'storage' | 'configuration' | 'secrets';
export type ErrorCode = 'INVALID_ARGUMENT' | 'INVALID_OUTPUT' | 'NOT_FOUND' | 'UNSUPPORTED'
  | 'UNTRUSTED' | 'DISABLED' | 'FORBIDDEN' | 'GRANT_REQUIRED' | 'INTERACTION_REQUIRED'
  | 'CANCELLED' | 'TIMEOUT' | 'OUTCOME_UNKNOWN' | 'BUSY' | 'CONFLICT'
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
export interface InvocationContext {
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
export interface ExtensionContext {
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
  l10n: { t(key: string, args?: Record<string, string | number>): string };
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
