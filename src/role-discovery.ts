import type {RoleDiscovery} from './workforce-types';
export {discoveryScore,searchRoles} from '../core/catalog-store/role-search.mjs';
export const emptyDiscovery=():RoleDiscovery=>({categoryIds:[],tags:[],keywords:{'zh-CN':[],en:[]}});
