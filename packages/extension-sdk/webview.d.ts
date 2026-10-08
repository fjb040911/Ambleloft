import type {Failure,HostContext,Result,WebviewClient} from './contracts';
export type * from './contracts';
/** Create in an Ambleloft extension page, then await initialize before calling. */
export declare function createClient():WebviewClient;
export declare class ExtensionError extends Error {
 readonly failure:Failure;
 readonly code:Failure['code'];
 readonly effectStatus:Failure['effectStatus'];
 constructor(failure:Failure);
}
/** Throws ExtensionError on failure. Never automatically retries an invocation. */
export declare function unwrap<T>(result:Result<T>):T;
