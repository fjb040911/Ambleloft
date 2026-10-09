// Resource mutations shared by the database worker; never accepts an arbitrary table name.
const { randomUUID } = require('node:crypto');
const fail = (code, message) => { const error = new Error(`${code}: ${message}`); error.code = code; throw error; };
const text = (v, max, empty = false) => typeof v === 'string' && v.length <= max && (empty || v.trim().length > 0);
function validateRecord(kind, value) {
  if (!value || !text(value.id, 120) || !text(value.title ?? value.name, 120) || !text(value.createdAt, 100, true)) fail('INVALID_ARGUMENT', 'Invalid resource');
  const allowed = kind === 'project' ? ['id','name','path','description','createdAt','revision'] : ['id','title','prompt','modelId','projectId','status','createdAt','archivedAt','selectedSkillIds','revision','conversationId'];
  if (Object.keys(value).some(k => !allowed.includes(k))) fail('INVALID_ARGUMENT', 'Unknown resource field');
  if (kind === 'project') {
    if (!text(value.path, 4096) || value.description !== undefined && !text(value.description, 10000, true)) fail('INVALID_ARGUMENT', 'Invalid project');
  } else {
    if (!text(value.prompt, 20000, true) || !text(value.modelId, 200, true) || value.status !== 'draft' || !(value.projectId === null || text(value.projectId, 120))) fail('INVALID_ARGUMENT', 'Invalid draft');
    if (value.archivedAt != null && !text(value.archivedAt, 100)) fail('INVALID_ARGUMENT', 'Invalid archive time');
    if (value.selectedSkillIds !== undefined && (!Array.isArray(value.selectedSkillIds) || value.selectedSkillIds.length > 20 || value.selectedSkillIds.some(v => !text(v, 120)))) fail('INVALID_ARGUMENT', 'Invalid skills');
  }
}
function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['theme','language','fontScale','layoutMode'].includes(k))) fail('INVALID_ARGUMENT', 'Invalid settings');
  if(value.layoutMode!==undefined&&!['classic','activity'].includes(value.layoutMode))fail('INVALID_ARGUMENT','Invalid layout mode');
  if (value.theme !== undefined && !['system','light','dark'].includes(value.theme) || value.language !== undefined && !['system','zh-CN','en'].includes(value.language) || value.fontScale !== undefined && ![90,100,110,120,130].includes(value.fontScale)) fail('INVALID_ARGUMENT', 'Invalid settings value');
}
function createWorkspaceResources(db) {
  const revision = (kind, id) => db.prepare('SELECT revision FROM workspace_revisions WHERE kind=? AND id=?').get(kind,id)?.revision ?? 0;
  const bump = (kind,id) => { db.prepare('INSERT INTO workspace_revisions(kind,id,revision) VALUES (?,?,1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1').run(kind,id); return revision(kind,id); };
  const identify = (kind, recordId, projectId) => {
    let row = db.prepare('SELECT * FROM conversation_identities WHERE kind=? AND record_id=?').get(kind,recordId);
    if (!row) { db.prepare('INSERT INTO conversation_identities(id,kind,record_id,project_id) VALUES (?,?,?,?)').run(randomUUID(),kind,recordId,projectId ?? null); row=db.prepare('SELECT * FROM conversation_identities WHERE kind=? AND record_id=?').get(kind,recordId); }
    else db.prepare('UPDATE conversation_identities SET project_id=? WHERE id=?').run(projectId ?? null,row.id);
    return row.id;
  };
  const decorate = (kind, value) => ({...value,revision:revision(kind,value.id),...(kind==='draft'?{conversationId:identify('draft',value.id,value.projectId)}:{})});
  const settings = () => JSON.parse(db.prepare("SELECT data FROM settings WHERE key='workspace'").get()?.data || '{"theme":"system"}');
  const read = () => ({...settings(),revision:revision('workspace','all'),settingsRevision:revision('settings','all'),
    projects:db.prepare('SELECT data FROM projects ORDER BY rowid').all().map(r=>decorate('project',JSON.parse(r.data))),
    tasks:db.prepare('SELECT data FROM drafts ORDER BY rowid').all().map(r=>decorate('draft',JSON.parse(r.data)))});
  const patch = ({changes} = {}) => {
    if (!Array.isArray(changes) || changes.length > 1500) fail('INVALID_ARGUMENT','Invalid mutation batch');
    const seen=new Set();
    for(const change of changes) {
      if(!change || !['project','draft','settings'].includes(change.kind) || !['put','delete','patch'].includes(change.action)) fail('INVALID_ARGUMENT','Invalid mutation');
      const {kind,action,expectedRevision}=change;
      const id=kind==='settings'?'all':change.id;
      if(!text(id,120) || seen.has(kind+':'+id)) fail('INVALID_ARGUMENT','Duplicate or invalid resource');seen.add(kind+':'+id);
      const table=kind==='project'?'projects':'drafts';
      const prior=kind==='settings'?settings():db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id);
      if(expectedRevision===null) { if(kind==='settings'||prior||revision(kind,id)>0) fail('CONFLICT','Resource already exists'); }
      else if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!prior||expectedRevision!==revision(kind,id)) fail('CONFLICT','Resource changed; refresh and retry');
      if(kind==='settings') {
        if(action!=='patch') fail('INVALID_ARGUMENT','Settings require patch');validateSettings(change.value);
        db.prepare("INSERT INTO settings(key,data) VALUES ('workspace',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(JSON.stringify({...prior,...change.value}));
      } else if(action==='put') {
        validateRecord(kind,change.value);if(change.value.id!==id)fail('INVALID_ARGUMENT','Resource identity mismatch');
        const value={...change.value};delete value.revision;delete value.conversationId;
        if(kind==='draft') {
          if(value.projectId!==null&&!db.prepare('SELECT id FROM projects WHERE id=?').get(value.projectId))fail('NOT_FOUND','Project does not exist');
          if(!prior && db.prepare("SELECT id FROM conversation_identities WHERE record_id=? AND kind='deleted-draft'").get(id))fail('CONFLICT','Draft ID was already used');
          identify('draft',id,value.projectId);
        }
        db.prepare(`INSERT INTO ${table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(id,JSON.stringify(value));
      } else if(action==='delete') {
        db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
        if(kind==='draft')db.prepare("UPDATE conversation_identities SET kind='deleted-draft' WHERE kind='draft' AND record_id=?").run(id);
        else {
          for(const row of db.prepare('SELECT id,data FROM drafts').all()) {const draft=JSON.parse(row.data);if(draft.projectId===id){draft.projectId=null;draft.archivedAt ||= new Date().toISOString();db.prepare('UPDATE drafts SET data=? WHERE id=?').run(JSON.stringify(draft),row.id);bump('draft',row.id);}}
          for(const row of db.prepare('SELECT id,data FROM runs WHERE project_id=?').all(id)){const run=JSON.parse(row.data);run.projectId=null;run.archivedAt ||= new Date().toISOString();db.prepare('UPDATE runs SET project_id=NULL,archived_at=?,data=? WHERE id=?').run(run.archivedAt,JSON.stringify(run),row.id);}
          db.prepare('UPDATE conversation_identities SET project_id=NULL WHERE project_id=?').run(id);
        }
      } else fail('INVALID_ARGUMENT','Invalid action');
      bump(kind,id);
    }
    if(db.prepare('SELECT count(*) AS n FROM projects').get().n>500||db.prepare('SELECT count(*) AS n FROM drafts').get().n>1000)fail('INVALID_ARGUMENT','Workspace capacity exceeded');
    if(changes.length)bump('workspace','all');return read();
  };
  return {read,patch,identify,bump,revision};
}
module.exports={createWorkspaceResources,validateRecord,validateSettings};
