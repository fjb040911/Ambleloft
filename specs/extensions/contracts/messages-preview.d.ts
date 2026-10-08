/** Experimental local-only runtime described by message-runtime-handoff.md.
 * Supports persistent Operation actions. No account-scoped messages.
 * Requires all five context.messages methods; no old-host emulation. */
import type {ExtensionContext} from './sdk';
export type MessageCategory = 'notice' | 'actionRequired';
export type MessageSeverity = 'info' | 'warning' | 'error';
export interface LocalMessageInput {
  eventKey: string;
  title: string;
  body: string;
  category: MessageCategory;
  severity?: MessageSeverity;
  businessType?: string | null;
  /** Unix milliseconds. Current host checks a nonnegative safe integer. */
  expiresAt?: number | null;
  actions?: MessageAction[];
}
export interface LocalMessage {
  id: string;
  eventKey: string;
  title: string;
  body: string;
  category: MessageCategory;
  severity: MessageSeverity;
  businessType: string | null;
  actions: MessageAction[];
  expiresAt: number | null;
  validity: 'active' | 'expired' | 'withdrawn';
  businessState: 'pending' | 'resolved' | null;
  revision: number;
  receivedAt: number;
  updatedAt: number;
  // No readAt, dismissedAt, profile/source/account identity or tokens.
}
export type PublishResult =
  | {status: 'published'; id: string; revision: number; remind: boolean}
  | {status: 'duplicate' | 'dismissed'; id: string}
  | {status: 'rejected'};
export interface LocalMessagePatch {
  title?: string;
  body?: string;
  severity?: MessageSeverity;
  actions?: MessageAction[];
  expiresAt?: number | null;
  businessState?: 'pending' | 'resolved' | null;
  validity?: 'active' | 'expired' | 'withdrawn';
}
export interface MessagePreferences {receive: boolean; muted: boolean}
export interface MessageAction {id:string;label:string;commandId:string;arguments?:Record<string,unknown>}
export interface MessageActionInvocation {id:string;messageId:string;actionId:string;operationId:string;revision:number;state:'prepared'|'dispatching'|'accepted'|'completed'|'failed'|'unknown'|'notExecuted';remoteTaskId?:string;createdAt:number;updatedAt:number}
export interface ActionResultReport {invocationId:string;reportId:string;expectedRevision:number;outcome:'accepted'|'completed'|'failed'|'unknown';remoteTaskId?:string;messageUpdate?:{patch:LocalMessagePatch;expectedRevision:number}}
export interface LocalMessages {
  listActionInvocations():Promise<MessageActionInvocation[]>;
  reportActionResult(input:ActionResultReport):Promise<{invocation:MessageActionInvocation;message:LocalMessage|null}>;
  publish(input: LocalMessageInput): Promise<PublishResult>;
  /** Missing, suppressed or dismissed records return null. */
  getByEventKey(eventKey: string): Promise<LocalMessage | null>;
  /** Projection is null if the user has dismissed the message. */
  update(id: string, patch: LocalMessagePatch, expectedRevision: number): Promise<LocalMessage | null>;
  withdraw(id: string, expectedRevision: number): Promise<LocalMessage | null>;
  getPreferences(): Promise<MessagePreferences>;
}
/** Throws an Error with code=UNSUPPORTED if the runtime is absent.
 * Methods preserve host promise rejections without guessing missing host error codes. */
export declare function getMessages(context: ExtensionContext): LocalMessages;
