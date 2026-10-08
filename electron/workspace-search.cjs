function searchWorkspace({runs,workspace,extensions,skills=[],recent={}},query='',kind='all'){
 const words=query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 const matches=text=>words.every(word=>text.normalize('NFKC').toLocaleLowerCase().includes(word));
 const results=[];
 const add=(item,text)=>{if((kind==='all'||kind===item.kind)&&matches(item.title+' '+text)){
  const lower=text.toLocaleLowerCase();const at=words.length?Math.max(0,lower.indexOf(words[0])-45):0;
  results.push({...item,date:[item.date||'',recent[item.kind+':'+item.id]||''].sort().at(-1),snippet:(at?'…':'')+text.slice(at,at+180).replace(/\s+/g,' ')});
 }};
 for(const run of runs.filter(r=>!r.archivedAt))add({id:run.id,kind:'task',title:run.title,projectId:run.projectId,date:run.updatedAt||run.createdAt},run.messages.map(m=>m.text||'').join('\n'));
 for(const task of workspace.tasks.filter(t=>!t.archivedAt))add({id:task.id,kind:'task',draft:true,title:task.title,projectId:task.projectId,date:task.updatedAt||task.createdAt},task.prompt||'');
 for(const project of workspace.projects)add({id:project.id,kind:'project',title:project.name,date:project.updatedAt||project.createdAt},project.description||'');
 for(const item of extensions.installed.filter(i=>i.enabled))add({id:item.manifest.id,kind:'extension',title:item.manifest.name,date:item.updatedAt||''},item.manifest.description||'');
 for(const skill of skills)add({id:skill.id,kind:'skill',title:skill.name,date:skill.updatedAt},skill.description||'');
 return results.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
}
module.exports={searchWorkspace};
