export type * from './contracts';
import type {Activate,Deactivate} from './contracts';
export declare function defineExtension(extension:{activate:Activate;deactivate?:Deactivate}):Readonly<{activate:Activate;deactivate?:Deactivate}>;
