import type {ProjectInsights,ProjectUsage} from './contracts';
/** Availability only; does not grant project access or enable a model policy. */
export declare function getProjectInsights(context:unknown):ProjectInsights;
/** Deduplicates stable request IDs by revision. Unknown is never represented as a complete zero. */
export declare function aggregateUsage(records:ProjectUsage[]):{requests:number;unknownRequests:number;input:{known:number;complete:boolean};output:{known:number;complete:boolean};total:{known:number;complete:boolean}};
