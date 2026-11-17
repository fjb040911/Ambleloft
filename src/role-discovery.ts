import type {RoleDefinition,RoleTemplate,RoleDiscovery} from './workforce-types';

export const emptyDiscovery=():RoleDiscovery=>({categoryIds:[],tags:[],keywords:{'zh-CN':[],en:[]}});
const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const contains=(text:string,term:string)=>{
  if(!/^[a-z0-9]+$/.test(term))return text.includes(term);
  return new RegExp(`(^|[^a-z0-9])${term}($|[^a-z0-9])`).test(text);
};
// Search both languages locally. No expert configuration is sent to the Store or a model.
export function discoveryScore(role:RoleTemplate|RoleDefinition,query:string):number {
  const versions='zh' in role?[role.zh,role.en]:[role];
  const names=versions.map(v=>v.name),meta=role.discovery;
  const aliases=Object.values(meta?.keywords||{}).flat();
  const tags=(meta?.tags||[]).flatMap(t=>Object.values(t.title));
  const body=versions.flatMap(v=>[v.domain,v.responsibilities,v.deliverables,v.methods]);
  const skills=role.skills.flatMap(s=>[s.name,s.label,'labelEn' in s?String(s.labelEn||''):'']);
  const fields=[...names.map(s=>[s,8] as const),...aliases.map(s=>[s,7] as const),...tags.map(s=>[s,5] as const),...skills.map(s=>[s,3] as const),...body.map(s=>[s,1] as const)].map(([s,w])=>[normalize(s||''),w] as const);
  const q=normalize(query);if(!q)return 0;
  let score=0;
  for(const term of q.split(' ')){
    const weight=Math.max(0,...fields.filter(([text])=>contains(text,term)).map(([,w])=>w));
    if(!weight)return -1;score+=weight;
  }
  return score+(names.some(s=>normalize(s)===q)?100:aliases.some(s=>normalize(s)===q)?80:0);
}
export function searchRoles<T extends RoleTemplate|RoleDefinition>(roles:T[],query:string,categoryId='',tagId=''):T[]{
  return roles.map((role,index)=>({role,index,score:discoveryScore(role,query)}))
    .filter(({role,score})=>score>=0&&(!categoryId||role.discovery?.categoryIds.includes(categoryId))&&(!tagId||role.discovery?.tags.some(t=>t.id===tagId)))
    .sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.role);
}
