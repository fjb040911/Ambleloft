export interface Skill {id:string;name:string;description:string;enabled:boolean;version:number;revision:string;hash:string;path:string;files:string[];sourcePath:string;createdAt:string;updatedAt:string}
export interface SkillDetail extends Skill {body:string}
export interface SkillSnapshot {id:string;name:string;description:string;version:number;hash:string;path:string;body:string}
export interface SkillImportResult {skill?:Skill;duplicate?:Skill;token?:string}
export interface SkillFilePreview {path:string;size:number;kind:'markdown'|'text'|'image'|'unsupported';text?:string;dataUrl?:string;reason?:string}
export interface SkillsAPI {readFile(input:{id:string;file:string}):Promise<SkillFilePreview>;list():Promise<Skill[]>;detail(id:string):Promise<SkillDetail>;import(options?:{replaceId?:string;asNew?:boolean;token?:string}):Promise<SkillImportResult|null>;update(input:{id:string;enabled?:boolean;version?:number;name?:string;description?:string;body?:string}):Promise<Skill>;remove(id:string):Promise<void>}
export type Page = 'home' | 'messages' | 'projects' | 'extension-view' | 'plugins' | 'devices' | 'settings';
export type Theme = 'system' | 'light' | 'dark';
export interface ModelLimits {contextWindow?:number;autoCompactTokenLimit?:number;maxOutputTokens?:number}
export interface ProviderCatalog {defaultId:string|null;providers:ProviderConfig[]}
export type ImageInputCapability = 'unknown'|'supported'|'unsupported';
export interface ProviderConfig { id?:string; name?:string; models?:string[]; baseUrl: string; model: string; executable: string; hasKey: boolean; configured: boolean; detectedExecutable?: string; bundledEngine?: boolean; engineVersion?: string; engineError?: string; protocol?: 'auto'|'responses'|'chat'; webSearch?: 'disabled'|'live'; reasoningSummary?: boolean; limits?:ModelLimits; modelLimits?:Record<string,ModelLimits>; modelImageInputs?:Record<string,ImageInputCapability> }
export interface ProviderInput { id?:string; create?:boolean; name?:string; models?:string[]; baseUrl: string; model: string; executable: string; apiKey?: string; clearKey?: boolean; protocol?: 'auto'|'responses'|'chat'; webSearch?: 'disabled'|'live'; reasoningSummary?: boolean; limits?:ModelLimits; modelLimits?:Record<string,ModelLimits>; modelImageInputs?:Record<string,ImageInputCapability> }
export interface TurnTiming { startedAt: string; finishedAt?: string; durationMs?: number; outcome?: 'completed' | 'failed' | 'interrupted' }
export interface TaskPlan {turnKey:string;explanation:string;steps:{step:string;status:'pending'|'inProgress'|'completed'}[]}
export interface DeliveredFile {id:string;turnKey:string;path:string;name:string;size:number;modifiedAt:string}
export interface FileChange {id:string;path:string;status:'added'|'modified'|'deleted';additions?:number;deletions?:number;reason?:string;hunks?:{oldStart:number;oldLines:number;newStart:number;newLines:number;lines:string[]}[]}
export interface TurnFileChanges {turnKey:string;files:FileChange[];notice?:string}
export interface TaskApp {id:string;turnKey:string;title:string;extensionName:string;extensionId:string;resourceUri:string}
export interface AgentRun {
  taskApps?:TaskApp[];
  conversationId?:string;draftId?:string;
  fileChanges?:TurnFileChanges[];
  queued?:boolean;
  lastTurnStartedAt?:string;summaryOnly?:boolean;historyBefore?:string|null;turnOffset?:number;totalTurns?:number;
  lastEventAt?:string;plans?:TaskPlan[];artifacts?:DeliveredFile[];
  id: string; permission?:'default'|'full'; archivedAt?:string|null; providerId?:string; title: string; projectId: string | null; cwd: string; model: string; baseUrl: string;
  createdAt: string; updatedAt?: string; status: 'preparing' | 'running' | 'waiting' | 'stopping' | 'completed' | 'failed' | 'interrupted'; error: string;
  messages: { model?:string; skills?:SkillSnapshot[]; id: string; role: 'user' | 'assistant'; modelChange?:string|null; text: string; kind?: 'reasoning'; reasoningFormat?: 'summary'|'text'; status?: string; timing?: TurnTiming; phase?: 'commentary' | 'final_answer'; turnKey?: string; order?: number }[];
  tools: { commandActions?: {type:'read'|'listFiles'|'search'|'unknown';name?:string;path?:string;query?:string}[]; id: string; type: string; label: string; status: string; detail: string; progress?:string; turnKey?: string; order?: number }[];
  retrying?:boolean;
  questions?:{id:string;blocking:boolean;questions:{id:string;header:string;question:string;isSecret?:boolean;options?:{label:string;description:string}[]|null}[]}[];
  approvals: { id: string; method: string; detail: string; progress?:string }[];
}
export interface Task { conversationId?:string;revision?:number; selectedSkillIds?:string[]; archivedAt?:string|null; id: string; title: string; prompt: string; modelId: string; projectId: string | null; status: 'draft'; createdAt: string }
export interface Project { revision?:number; id: string; name: string; path: string; description?: string; createdAt: string }
export interface Workspace { revision?:number;settingsRevision?:number; tasks: Task[]; projects: Project[]; theme: Theme; layoutMode?: 'classic'|'activity'; fontScale?:number; language?: 'system'|'zh-CN'|'en' }
export interface WorkspaceChange {kind:'project'|'draft'|'settings';action:'put'|'delete'|'patch';id?:string;expectedRevision:number|null;value?:Project|Task|Partial<Pick<Workspace,'theme'|'language'|'fontScale'|'layoutMode'>>}
export interface Device { name: string; chip: string; memoryGB: number | null; freeMemoryGB: number | null; platform: string; arch: string; mode: 'desktop' | 'preview' }
export interface Capability { id: string; name: string; category: string; description: string; icon: 'folder' | 'pen' | 'research'; color: string; prompt: string; permissions: string[] }
declare global {
  interface Window {
    desktop?: {
      taskApps?: {
        onContextChanged(listener:(value:{sessionId:string;context:unknown})=>void):()=>void;
        open(input:{runId:string;appId:string}):Promise<{sessionId:string;url:string}>;
        close(input:{sessionId:string}):Promise<void>;
        rpc(input:{sessionId:string;message:unknown}):Promise<any>;
        onClosed(listener:(value:{sessionId:string})=>void):()=>void;
      };
      authentication?: {sessions():Promise<{id:string;extensionName:string;account:{name:string};expiresAt:number}[]>;disconnect(input:{id:string}):Promise<void>;connections(input?:{action?:'list'|'save'|'remove'|'default';expectedRevision?:number;value?:Partial<EnterpriseConnection>;id?:string|null}):Promise<ConnectionCatalog>;onChanged(listener:()=>void):()=>void};
      messages?: {
        execute(input:{messageId:string;actionId:string;expectedRevision:number}):Promise<{ok:boolean;error?:{code:string}}> ;
        list(input?:{source?:string;filter?:'all'|'unread'|'pending'}):Promise<{items:HostMessage[];unread:number}>;
        sources():Promise<MessageSource[]>;
        markRead(input:{id:string}):Promise<HostMessage>;
        dismiss(input:{id:string}):Promise<HostMessage>;
        bulk(input:{source?:string;filter?:'all'|'unread'|'pending';action:'read'|'clearRead'}):Promise<{count:number}>;
        setPreferences(input:{source:string;preferences:{receive:boolean;muted:boolean}}):Promise<{receive:boolean;muted:boolean}>;
        onChanged(listener:()=>void):()=>void;
      };
      newWindow?():Promise<boolean>;
      onOpenConversation?(listener:(ref:{kind:string;recordId:string;projectId:string})=>void):()=>void;
      extensionPage?:{
        open(input:{extensionId:string;slotId:string}):Promise<{pageInstanceId:string}>;
        layout(input:{slotId:string;bounds:{x:number;y:number;width:number;height:number};visible:boolean}):Promise<void>;
        close(input:{slotId:string}):Promise<void>;
        context(input:{projectId:string|null;locale:string}):Promise<void>;
        overlay(input:{key:string;enabled:boolean}):boolean;
        respond(input:{id:string;cancel?:boolean;remember?:boolean;projectId?:string;value?:string}):Promise<void>;
        onClosed(listener:(data:{slotId:string})=>void):()=>void;
        onInteraction(listener:(data:ExtensionInteractionRequest)=>void):()=>void;
        onInteractionClose(listener:(id:string)=>void):()=>void;
      };
      extensions?: {details?(id:string):Promise<{readme:string;publisher:string;size:number|null}>;configuration(input:{id:string;action?:'get'|'save'|'reset';generation?:number;expectedRevision?:number;value?:unknown}):Promise<ExtensionConfiguration>;resetConfirmations(input:{id:string}):Promise<ExtensionSnapshot>;development(input:{id:string;url:string}):Promise<boolean>;onChanged?(listener:()=>void):()=>void;activate(id:string):Promise<ExtensionSnapshot>;list():Promise<ExtensionSnapshot>;install(input?:{development?:boolean}):Promise<ExtensionSnapshot>;rollback(input:{id:string;digest:string}):Promise<ExtensionSnapshot>;grants(input:{id:string;revoke?:boolean;projectId?:string;capabilities?:string[]}):Promise<ExtensionSnapshot>;enable(input:{id:string;enabled:boolean}):Promise<ExtensionSnapshot>;remove(id:string):Promise<ExtensionSnapshot>;command(id:string):Promise<{extensionId:string;viewId:string;when?:string;visible?:boolean}>};
      skills?: SkillsAPI;
      projectFiles?: ProjectFilesAPI;
      selectAttachments(): Promise<{name:string;path:string}[]>;
      copyText(text: string): Promise<void>;
      openLink(url: string): Promise<void>;
      getProvider(id?:string): Promise<ProviderConfig>;
      listProviders(): Promise<ProviderCatalog>;
      setDefaultProvider(id:string): Promise<ProviderCatalog>;
      removeProvider(id:string): Promise<ProviderCatalog>;
      saveProvider(input: ProviderInput): Promise<ProviderConfig>;
      testProvider(id?:string): Promise<{ message: string }>;
      editRun(input: {id: string; title?: string; projectId?: string | null; remove?: boolean; archived?:boolean}): Promise<AgentRun[]>;
      openProject(id: string): Promise<void>;
      getRunPage?(input:{id:string;before?:string;limit?:number}):Promise<AgentRun>;
      touchSearchItem?(input:{kind:string;id:string}):Promise<void>;
      searchWorkspace?(input:{query:string;kind:string;cursor?:string}):Promise<{items:SearchResult[];total:number;next:string|null}>;
      listRuns(): Promise<AgentRun[]>;
      startRun(input: { draftId?:string;draftRevision?:number; selectedSkillIds?:string[]; permission?:'default'|'full'; attachments?:{name:string;path:string}[]; confirmProviderChange?:boolean; providerId?:string; model?:string; prompt: string; projectId?: string | null; runId?: string }): Promise<AgentRun>;
      accessArtifact(input:{runId:string;id:string;preview?:boolean}):Promise<(DeliveredFile&{text:string})|null>;
      stopRun(id: string): Promise<void>;
      answerRun(input:{runId:string;requestId:string;answers:Record<string,string>}):Promise<void>;
      approveRun(input: { runId: string; approvalId: string; decision: 'accept' | 'decline' }): Promise<void>;
      onRun(callback: (run: AgentRun) => void): () => void;
      getDevice(): Promise<Device>;
      readWorkspace(): Promise<Workspace>;
      saveWorkspace(state: Workspace): Promise<void>;
      patchWorkspace?(input:{changes:WorkspaceChange[]}):Promise<Workspace>;
      onWorkspace?(callback:(state:Workspace)=>void):()=>void;
      selectFolder(): Promise<{ name: string; path: string } | null>;
      onCommand(callback: (command: string) => void): () => void;
    };
  }
}

export interface FileContext {projectId?:string;runId?:string;artifactId?:string}
export interface FileEntry {name:string;path:string;directory:boolean}
export interface FileListing {entries:FileEntry[];truncated:boolean}
export interface FilePreview {path:string;name:string;size:number;version:string;kind:'markdown'|'html'|'image'|'pdf'|'code'|'spreadsheet'|'presentation'|'unsupported';text?:string;truncated:boolean;reason?:string;unchanged?:false}
export interface FileApplication {id:string;name:string}
export type OfficePreview = {version:string;asset:string}&({kind:'spreadsheet';sheets:{name:string;rows:string[][];columns:number;truncated:boolean}[];truncated:boolean}|{kind:'presentation';slides:{number:number;notes:string}[];legacy?:boolean});
export interface ProjectFilesAPI {
 office(input:FileContext&{path:string;version?:string}):Promise<OfficePreview>;
 context(input:FileContext):Promise<{root:string;baseUrl:string}>;
 list(input:FileContext&{path:string;hidden:boolean}):Promise<FileListing>;
 search(input:FileContext&{query:string;hidden:boolean}):Promise<FileListing>;
 read(input:FileContext&{path:string;version?:string}):Promise<FilePreview|{unchanged:true;version:string}>;
 apps(input:FileContext&{path:string}):Promise<FileApplication[]>;
 open(input:FileContext&{path:string;application?:string;action?:'reveal'}):Promise<FileApplication|null>;
}

export interface ExtensionManifest {icon?:{light:string;dark:string};id:string;name:string;version:string;apiVersion:'1';description?:string;contributes:{views?:{id:string;title:string;body:string}[];commands?:{id:string;title:string;viewId:string;when?:string;visible?:boolean}[]}}
export interface ExtensionSnapshot {capabilities:Record<string,number>;diagnostics?:string[];installed:{manifest:ExtensionManifest;generation?:number;enabled:boolean;sourceMode?:string;operations?:{id:string;title:string;description?:string}[];home?:{title:string;when?:string};hasConfiguration?:boolean;hasBackend?:boolean;runtime?:{state:string;diagnostic?:string|null;activeCalls:number;queuedCalls:number};kind?:"legacy"|"package";trusted?:boolean;active?:string;diagnostic?:string;grants?:{capability:string;resource:string}[];revisions?:{digest:string;version:string}[];permissions?:{capability:string;scope:string}[]}[]}

export interface ExtensionInteractionRequest {id:string;extensionName:string;extensionId:string;kind:string;capabilities:string[];description?:string;caller?:string;impact?:string[];input?:unknown;allowRemember?:boolean;title?:string;key?:string;project?:string;projects?:{id:string;name:string;description:string}[]}

export interface SearchResult {id:string;kind:'task'|'project'|'extension'|'skill';title:string;snippet:string;date?:string;projectId?:string|null;draft?:boolean}

// Host UI transport only; extension SDK uses a separate restricted projection.
export interface HostMessage {id:string;eventKey:string;source?:string;title:string;body:string;category:'notice'|'actionRequired';severity:'info'|'warning'|'error';businessType:string|null;businessState:'pending'|'resolved'|null;validity:'active'|'expired'|'withdrawn';revision:number;receivedAt:number;updatedAt:number;expiresAt:number|null;readAt:number|null;dismissedAt:number|null;executions?:{id:string;actionId:string;effect?:'read'|'write';state:'prepared'|'dispatching'|'accepted'|'completed'|'failed'|'unknown'|'notExecuted'}[];actions:{id:string;label:string;commandId:string;effect?:'read'|'write';arguments?:unknown}[]}
export interface MessageSource {id:string;name:string;installed:boolean;enabled?:boolean;preferences:{receive:boolean;muted:boolean}}

export interface EnterpriseConnection {id:string;name:string;issuer:string;clientId:string;tenant:string}
export interface ConnectionCatalog {revision:number;defaultId:string|null;connections:EnterpriseConnection[]}

export interface ConfigurationSchema {type:string;description?:string;properties?:Record<string,ConfigurationSchema>;required?:string[];enum?:Array<string|number|boolean|null>;minimum?:number;maximum?:number;minLength?:number;maxLength?:number}
export interface ExtensionConfiguration {schema:ConfigurationSchema;value:Record<string,unknown>;revision:number;generation:number}
