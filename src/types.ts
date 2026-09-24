export interface Skill {id:string;name:string;description:string;enabled:boolean;version:number;revision:string;hash:string;path:string;files:string[];sourcePath:string;createdAt:string;updatedAt:string}
export interface SkillDetail extends Skill {body:string}
export interface SkillSnapshot {id:string;name:string;description:string;version:number;hash:string;path:string;body:string}
export interface SkillImportResult {skill?:Skill;duplicate?:Skill;token?:string}
export interface SkillsAPI {list():Promise<Skill[]>;detail(id:string):Promise<SkillDetail>;import(options?:{replaceId?:string;asNew?:boolean;token?:string}):Promise<SkillImportResult|null>;update(input:{id:string;enabled?:boolean;version?:number;name?:string;description?:string;body?:string}):Promise<Skill>;remove(id:string):Promise<void>}
export type Page = 'home' | 'projects' | 'extension-view' | 'plugins' | 'devices' | 'settings';
export type Theme = 'system' | 'light' | 'dark';
export interface ModelLimits {contextWindow?:number;autoCompactTokenLimit?:number;maxOutputTokens?:number}
export interface ProviderCatalog {defaultId:string|null;providers:ProviderConfig[]}
export type ImageInputCapability = 'unknown'|'supported'|'unsupported';
export interface ProviderConfig { id?:string; name?:string; models?:string[]; baseUrl: string; model: string; executable: string; hasKey: boolean; configured: boolean; detectedExecutable?: string; bundledEngine?: boolean; engineVersion?: string; engineError?: string; protocol?: 'auto'|'responses'|'chat'; webSearch?: 'disabled'|'live'; reasoningSummary?: boolean; limits?:ModelLimits; modelLimits?:Record<string,ModelLimits>; modelImageInputs?:Record<string,ImageInputCapability> }
export interface ProviderInput { id?:string; create?:boolean; name?:string; models?:string[]; baseUrl: string; model: string; executable: string; apiKey?: string; clearKey?: boolean; protocol?: 'auto'|'responses'|'chat'; webSearch?: 'disabled'|'live'; reasoningSummary?: boolean; limits?:ModelLimits; modelLimits?:Record<string,ModelLimits>; modelImageInputs?:Record<string,ImageInputCapability> }
export interface TurnTiming { startedAt: string; finishedAt?: string; durationMs?: number; outcome?: 'completed' | 'failed' | 'interrupted' }
export interface TaskPlan {turnKey:string;explanation:string;steps:{step:string;status:'pending'|'inProgress'|'completed'}[]}
export interface DeliveredFile {id:string;turnKey:string;path:string;name:string;size:number;modifiedAt:string}
export interface AgentRun {
  queued?:boolean;
  summaryOnly?:boolean;historyBefore?:string|null;turnOffset?:number;totalTurns?:number;
  lastEventAt?:string;plans?:TaskPlan[];artifacts?:DeliveredFile[];
  id: string; permission?:'default'|'full'; archivedAt?:string|null; providerId?:string; title: string; projectId: string | null; cwd: string; model: string; baseUrl: string;
  createdAt: string; updatedAt?: string; status: 'preparing' | 'running' | 'waiting' | 'stopping' | 'completed' | 'failed' | 'interrupted'; error: string;
  messages: { skills?:SkillSnapshot[]; id: string; role: 'user' | 'assistant'; modelChange?:string|null; text: string; kind?: 'reasoning'; reasoningFormat?: 'summary'|'text'; status?: string; timing?: TurnTiming; phase?: 'commentary' | 'final_answer'; turnKey?: string; order?: number }[];
  tools: { id: string; type: string; label: string; status: string; detail: string; progress?:string; turnKey?: string; order?: number }[];
  retrying?:boolean;
  questions?:{id:string;blocking:boolean;questions:{id:string;header:string;question:string;isSecret?:boolean;options?:{label:string;description:string}[]|null}[]}[];
  approvals: { id: string; method: string; detail: string; progress?:string }[];
}
export interface Task { selectedSkillIds?:string[]; archivedAt?:string|null; id: string; title: string; prompt: string; modelId: string; projectId: string | null; status: 'draft'; createdAt: string }
export interface Project { id: string; name: string; path: string; description?: string; createdAt: string }
export interface Workspace { tasks: Task[]; projects: Project[]; theme: Theme; fontScale?:number; language?: 'system'|'zh-CN'|'en' }
export interface Device { name: string; chip: string; memoryGB: number | null; freeMemoryGB: number | null; platform: string; arch: string; mode: 'desktop' | 'preview' }
export interface Capability { id: string; name: string; category: string; description: string; icon: 'folder' | 'pen' | 'research'; color: string; prompt: string; permissions: string[] }
declare global {
  interface Window {
    desktop?: {
      extensions?: {list():Promise<ExtensionSnapshot>;install():Promise<ExtensionSnapshot>;enable(input:{id:string;enabled:boolean}):Promise<ExtensionSnapshot>;remove(id:string):Promise<ExtensionSnapshot>;command(id:string):Promise<{extensionId:string;viewId:string}>};
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
      listRuns(): Promise<AgentRun[]>;
      startRun(input: { selectedSkillIds?:string[]; permission?:'default'|'full'; attachments?:{name:string;path:string}[]; confirmProviderChange?:boolean; providerId?:string; model?:string; prompt: string; projectId?: string | null; runId?: string }): Promise<AgentRun>;
      accessArtifact(input:{runId:string;id:string;preview?:boolean}):Promise<(DeliveredFile&{text:string})|null>;
      stopRun(id: string): Promise<void>;
      answerRun(input:{runId:string;requestId:string;answers:Record<string,string>}):Promise<void>;
      approveRun(input: { runId: string; approvalId: string; decision: 'accept' | 'decline' }): Promise<void>;
      onRun(callback: (run: AgentRun) => void): () => void;
      getDevice(): Promise<Device>;
      readWorkspace(): Promise<Workspace>;
      saveWorkspace(state: Workspace): Promise<void>;
      selectFolder(): Promise<{ name: string; path: string } | null>;
      onCommand(callback: (command: string) => void): () => void;
    };
  }
}

export interface FileContext {projectId:string;runId?:string}
export interface FileEntry {name:string;path:string;directory:boolean}
export interface FileListing {entries:FileEntry[];truncated:boolean}
export interface FilePreview {path:string;name:string;size:number;version:string;kind:'markdown'|'html'|'image'|'pdf'|'code'|'unsupported';text?:string;truncated:boolean;reason?:string;unchanged?:false}
export interface FileApplication {id:string;name:string}
export interface ProjectFilesAPI {
 context(input:FileContext):Promise<{root:string;baseUrl:string}>;
 list(input:FileContext&{path:string;hidden:boolean}):Promise<FileListing>;
 search(input:FileContext&{query:string;hidden:boolean}):Promise<FileListing>;
 read(input:FileContext&{path:string;version?:string}):Promise<FilePreview|{unchanged:true;version:string}>;
 apps(input:FileContext&{path:string}):Promise<FileApplication[]>;
 open(input:FileContext&{path:string;application?:string;action?:'reveal'}):Promise<FileApplication|null>;
}

export interface ExtensionManifest {id:string;name:string;version:string;apiVersion:'1';description?:string;contributes:{views?:{id:string;title:string;body:string}[];commands?:{id:string;title:string;viewId:string}[]}}
export interface ExtensionSnapshot {capabilities:Record<string,number>;installed:{manifest:ExtensionManifest;enabled:boolean}[]}
