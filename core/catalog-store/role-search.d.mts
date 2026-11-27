import type {RoleDefinition,RoleTemplate} from '../../src/workforce-types';
export function discoveryScore(role:RoleTemplate|RoleDefinition,query:string):number;
export function searchRoles<T extends RoleTemplate|RoleDefinition>(roles:T[],query:string,categoryId?:string,tagId?:string):T[];
