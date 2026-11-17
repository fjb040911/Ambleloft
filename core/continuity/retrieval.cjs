const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase();
function terms(query){
 const result=normalize(query).match(/[a-z0-9_]{2,}/g)||[];
 for(const segment of normalize(query).match(/[\p{Script=Han}]+/gu)||[])for(let i=0;i<segment.length-1;i++)result.push(segment.slice(i,i+2));
 return [...new Set(result)].slice(0,100);
}
function rank(sources,query){
 const tokens=terms(query);
 const score=s=>tokens.reduce((n,t)=>n+(normalize(s.title).includes(t)?4:0)+(normalize(s.body).includes(t)?1:0),0);
 return sources.map(s=>({s,score:score(s)})).sort((a,b)=>b.score-a.score||Number(b.s.authority==='adopted')-Number(a.s.authority==='adopted')||a.s.id.localeCompare(b.s.id)).map(r=>r.s);
}
module.exports={terms,rank};
