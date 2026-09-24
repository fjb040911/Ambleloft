const {imageInputInstructions}=require('./model-capabilities.cjs');
const { developerInstructions } = require('./agent-instructions.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { CodexRPC, findCodex } = require('./codex-rpc.cjs');
const { writeJSON, fingerprint, redact } = require('./provider.cjs');
const { prepareEngineHome, engineRuntime } = require('./engine.cjs');
const {validPlan} = require(engineRuntime().packaged ? path.join(process.resourcesPath, 'tools/plan-server.cjs') : './plan-server.cjs');
const {snapshot,compare}=require('./file-changes.cjs');
const {collectArtifacts} = require('./artifacts.cjs');
const {startChatBridge,usesChat} = require('./chat-bridge.cjs');
const BUSY = ['preparing', 'running', 'waiting', 'stopping'];

class AgentRuntime {
  constructor({ directory, provider, workspace, publish, database, skills, rpcFactory = options => new CodexRPC(options) }) {
    this.skills = skills; this.database = database; this.directory = directory; this.provider = provider; this.workspace = workspace; this.publish = publish;
    this.rpcFactory = rpcFactory; this.runs = []; this.contexts = new Map(); this.pendingStarts = []; this.maxConcurrent = 2; this.writes = Promise.resolve(); this.saveTimer = null;
    this.file = path.join(directory, 'conversations.json');
  }
  get active() { return this.contexts.values().next().value || null; }
  drain() {
    if(this.closing)return;
    for(const context of [...this.pendingStarts]){
      const running=[...this.contexts.values()].filter(c=>c.launched&&!c.done);
      if(running.length>=this.maxConcurrent)break;
      if(running.some(c=>c.run?.cwd===context.run?.cwd))continue;
      this.pendingStarts.splice(this.pendingStarts.indexOf(context),1);
      context.launched=true;context.run.queued=false;
      this.changed(context.run);
      void context.launch().catch(error=>this.finish(context,'failed',redact(error.message,context.config.apiKey)));
    }
  }
  async init() {
    try {
      this.runs = this.database ? await this.database.call('readRuns') : JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!Array.isArray(this.runs)) throw new Error('invalid conversations');
      for (const run of this.runs) if (BUSY.includes(run.status)) {
        run.queued=false; run.status = 'interrupted'; run.error = '上次应用退出时任务未完成。请核实工具结果后再继续，不会自动重试。'; run.approvals = []; run.questions=[]; run.retrying=false;
        const timing = run.messages?.findLast(message => message.role === 'user')?.timing;
        if (timing && !timing.outcome) timing.outcome = 'interrupted';
      }
      await this.persist();
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('对话记录无法读取，未覆盖原始数据'); }
    this.initialized = true;
  }
  list() { return structuredClone(this.runs); }
  async edit(input) {
    if (!input || typeof input.id !== 'string') throw new Error('任务无效');
    const run = this.runs.find(item => item.id === input.id);
    if (!run) throw new Error('任务不存在');
    if (this.active || this.editing) throw new Error('请等待当前任务或操作结束');
    this.editing = true;
    const before = structuredClone(this.runs);
    try {
      if (input.remove === true) { if (!run.archivedAt) throw new Error('请先归档会话，再永久删除'); this.runs = this.runs.filter(item => item.id !== input.id); }
      else {
        if (input.archived !== undefined) {
          if (typeof input.archived !== 'boolean') throw new Error('归档状态无效');
          run.archivedAt = input.archived ? new Date().toISOString() : null;
          if (!input.archived && run.projectId) { const state=await this.workspace.read(); if(!state.projects.some(p=>p.id===run.projectId))run.projectId=null; }
        }
        if (input.title !== undefined) {
          if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120) throw new Error('名称需为 1–120 字');
          run.title = input.title.trim();
        }
        if (input.projectId !== undefined) {
          const state = await this.workspace.read();
          if (input.projectId !== null && !state.projects.some(project => project.id === input.projectId)) throw new Error('项目不存在');
          run.projectId = input.projectId;
        }
      }
      await this.persist();
      if (!input.remove) this.publish(structuredClone(run));
      return this.list();
    } catch (error) { this.runs = before; throw error; }
    finally { this.editing = false; }
  }
  persist() {
    const snapshot = structuredClone(this.runs);
    const operation = this.writes.then(() => this.database ? this.database.call('saveRuns', snapshot) : writeJSON(this.file, snapshot));
    this.writes = operation.catch(() => {});
    return operation;
  }
  changed(run) {
    run.updatedAt = new Date().toISOString(); this.publish(structuredClone(run));
    if (!this.saveTimer) this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persist().catch(() => { run.error = '对话保存失败，请检查磁盘空间。'; this.publish(structuredClone(run)); for(const context of this.contexts.values())if(context.run===run)void this.finish(context,'failed',run.error); });
    }, 250);
  }
  async start(input) {
    if (this.closing || this.editing) throw new Error('请等待当前操作结束');
    if(input.runId&&[...this.contexts.values()].some(c=>c.requestRunId===input.runId))throw new Error('该任务正在执行或排队');
    if (!input || typeof input.prompt !== 'string' || (!input.prompt.trim() && !input.selectedSkillIds?.length) || input.prompt.length > 20000) throw new Error('请输入 1–20000 字的任务内容');
    // Reserve before any await so two windows/rapid clicks cannot start two processes.
    const context = { run: null, rpc: null, cancelled: false, done: false, startedAt: new Date().toISOString(), startedTick: performance.now() }; context.key=randomUUID();context.requestRunId=input.runId;this.contexts.set(context.key,context);
    try {
      context.skills = this.skills ? await this.skills.prepare(input.selectedSkillIds) : {instructions:'',snapshots:[],explicit:''};
      if(!this.skills && input.selectedSkillIds?.length)throw new Error('技能服务不可用');
      const prompt = input.prompt.trim() || '请执行所选技能的工作流程。';
      const previous = input.runId ? this.runs.find(run => run.id === input.runId) : null;
      if(previous?.archivedAt)throw new Error('请先还原会话再继续');
      let providerId=input.providerId || previous?.providerId;
      if(previous&&!providerId&&this.provider.list){
        const catalog=await this.provider.list();
        providerId=catalog.providers.find(p=>p.baseUrl===previous.baseUrl&&(p.models||[p.model]).includes(previous.model))?.id;
        if(!providerId)throw new Error('原模型服务不可用，请在设置中恢复对应服务');
      }
      const config = await this.provider.secret(providerId, input.model || previous?.model);
      const executable = await findCodex(config.executable);
      if (input.runId && !previous) throw new Error('对话不存在');
      if (previous && (previous.baseUrl !== config.baseUrl || (previous.providerId && previous.providerId !== config.id)) && input.confirmProviderChange !== true) throw new Error('切换服务需要确认将会话历史发送到新的端点');
      if (input.permission && !['default','full'].includes(input.permission)) throw new Error('权限模式无效');
      const attachments=input.attachments||[];
      if(!Array.isArray(attachments)||attachments.length>50)throw new Error('最多添加 50 个文件或文件夹');
      for(const file of attachments){if(!file||typeof file.path!=='string'||!path.isAbsolute(file.path)||file.path.length>4096)throw new Error('附件路径无效');await fs.stat(file.path);}
      if (previous && BUSY.includes(previous.status)) throw new Error('该任务尚未停止');
      const state = await this.workspace.read();
      const selectedProjectId = previous ? previous.projectId : input.projectId;
      const project = selectedProjectId ? state.projects.find(item => item.id === selectedProjectId) : null;
      if (selectedProjectId && !project) throw new Error('项目不存在，请重新选择');
      const cwd = project ? await fs.realpath(project.path) : (previous?.cwd || path.join(this.directory, 'scratch', context.key));
      if (!project) await fs.mkdir(cwd, { recursive: true });
      else if (!(await fs.stat(cwd)).isDirectory()) throw new Error('项目路径不是文件夹');
      const home = await prepareEngineHome(this.directory);
      if (context.cancelled) throw new Error('执行已取消');
      const run = previous || { id: randomUUID(), title: prompt.slice(0, 50), messages: [], tools: [], approvals: [],
        projectId: project?.id || null, cwd, model: config.model, baseUrl: config.baseUrl, providerFingerprint: fingerprint(config),
        createdAt: new Date().toISOString(), threadId: null, turnId: null };
      const modelChange=previous&&(run.model!==config.model||run.baseUrl!==config.baseUrl)?config.model:null;
      run.modelSessionId ||= randomUUID();
      run.providerId = config.id || run.providerId;
      run.model=config.model;run.baseUrl=config.baseUrl;run.providerFingerprint=fingerprint(config);
      run.permission=input.permission||run.permission||'default';
      context.attachments=attachments.map(file=>file.path);
      run.cwd = cwd; context.projectDescription = project?.description || '';
      run.lastEventAt=context.startedAt;
      run.status = 'preparing'; run.error = ''; run.retrying=false; run.questions=[]; run.approvals = []; run.turnId = null;
      context.timing = { startedAt: context.startedAt };
      context.turnKey = randomUUID();
      run.messages.push({ id: context.turnKey, role: 'user', model: config.model, modelChange, skills: context.skills.snapshots, text: prompt+(attachments.length?'\n\n附件：\n'+attachments.map(file=>file.path).join('\n'):''), timing: context.timing });
      if (!previous) this.runs.unshift(run);
      context.run = run; context.config = config;
      await this.persist(); this.changed(run);
      if (context.cancelled) { await this.finish(context, 'interrupted'); return structuredClone(run); }
      context.launch=async()=>{
      try { context.fileBaseline=await snapshot(run.cwd); } catch { context.fileBaseline=null; }
      if(context.cancelled||context.done)return;
      context.bridge=await startChatBridge(config, run.modelSessionId, !usesChat(config), diagnostic => {
        run.modelRequests=[...(run.modelRequests||[]),diagnostic].slice(-100);
        context.lastModelDiagnostic=diagnostic;
        this.changed(run);
      });
      if(context.cancelled||context.done){context.bridge?.close();return structuredClone(run);}
      context.rpc = this.rpcFactory({ executable, config:context.bridge?.config||config, home, cwd,
        notification: message => this.notification(context, message), request: message => this.request(context, message),
        exit: error => { if (!context.done) void this.finish(context, 'failed', redact(error.message, config.apiKey)); } });
      void this.execute(context).catch(error => { if (!context.done) void this.finish(context, context.cancelled ? 'interrupted' : 'failed', redact(error.message, config.apiKey)); });
      };
      run.queued=true;this.pendingStarts.push(context);this.drain();this.changed(run);
      return structuredClone(run);
    } catch (error) { if (context.run) await this.finish(context, 'failed', error.message); else this.contexts.delete(context.key); throw error; }
  }
  async execute(context) {
    const { rpc, run, config } = context;
    await rpc.call('initialize', { clientInfo: { name: 'atelier', title: 'Ambleloft', version: require('../package.json').version } });
    rpc.send({ method: 'initialized', params: {} });
    const params = { model: config.model, modelProvider: 'atelier', cwd: run.cwd, sandbox: run.permission==='full'?'danger-full-access':'read-only', approvalPolicy: run.permission==='full'?'never':'on-request',
      developerInstructions: developerInstructions + imageInputInstructions(config) + (context.skills?.instructions || '') + (context.projectDescription ? '\nProject context supplied by the user:\n' + context.projectDescription : '') };
    const thread = await rpc.call(run.threadId ? 'thread/resume' : 'thread/start', { ...params, ...(run.threadId ? { threadId: run.threadId } : {}) });
    if (context.done || context.cancelled) return;
    run.threadId = thread.thread.id; run.status = 'running'; this.changed(run);
    const turn = await rpc.call('turn/start', { threadId: run.threadId, input: [{ type: 'text', text: run.messages.at(-1).text + (context.skills?.explicit ? '\n\nThe user explicitly selected these workflows for this request:\n' + context.skills.explicit : '') }] });
    if (context.done) return;
    run.turnId = turn.turn.id; this.changed(run);
    if (context.cancelled) await this.stop(run.id);
  }
  notification(context, { method, params = {} }) {
    if (context.done || !context.run || (params.threadId && context.run.threadId && params.threadId !== context.run.threadId)) return;
    const run = context.run;
    if(params.turnId&&run.turnId&&params.turnId!==run.turnId)return;
    if(run.retrying&&['item/started','item/agentMessage/delta','item/reasoning/textDelta','item/reasoning/summaryTextDelta'].includes(method)){run.retrying=false;run.error='';}
    const clean = value => redact(value || '', context.config.apiKey);
    run.lastEventAt=new Date().toISOString();
    const stamp = () => ({ turnKey: context.turnKey, order: run.nextEventOrder = (run.nextEventOrder || 0) + 1 });
    if (method === 'turn/started') { run.turnId = params.turn.id; if (!context.cancelled) run.status = 'running'; }
    else if (method === 'turn/plan/updated') {
      const plan={turnKey:context.turnKey,explanation:clean(params.explanation),steps:(params.plan||[]).filter(step=>typeof step.step==='string'&&['pending','inProgress','completed'].includes(step.status)).map(step=>({step:clean(step.step),status:step.status}))};
      run.plans=[...(run.plans||[]).filter(p=>p.turnKey!==context.turnKey),plan];
    }
    else if (method === 'item/agentMessage/delta') {
      let item = run.messages.find(item => item.id === params.itemId);
      if (!item) { item = { id: params.itemId, role: 'assistant', text: '', ...stamp() }; run.messages.push(item); }
      item.text = clean(item.text + params.delta);
    } else if (['item/reasoning/summaryTextDelta', 'item/reasoning/textDelta', 'item/reasoning/summaryPartAdded'].includes(method)) {
      let item = run.messages.find(item => item.id === params.itemId);
      if (!item) { item = { id: params.itemId, role: 'assistant', kind: 'reasoning', text: '', summary: [], content: [], status: 'running', ...stamp() }; run.messages.push(item); }
      const field = method === 'item/reasoning/textDelta' ? 'content' : 'summary';
      const index = field === 'content' ? params.contentIndex : params.summaryIndex;
      if (Number.isInteger(index) && index >= 0 && index < 1000) {
        item[field] ||= []; item[field][index] = clean((item[field][index] || '') + (params.delta || ''));
        item.text = (item.summary?.some(Boolean) ? item.summary : item.content || []).join('\n\n');
        item.reasoningFormat=item.summary?.some(Boolean)?'summary':'text';
      }
    } else if (method === 'item/started' || method === 'item/completed') {
      const item = params.item;
      if (item.type === 'reasoning') {
        let existing = run.messages.find(message => message.id === item.id);
        if (!existing) { existing = { id: item.id, role: 'assistant', kind: 'reasoning', text: '', summary: [], content: [], ...stamp() }; run.messages.push(existing); }
        if (item.summary?.length) existing.summary = item.summary.map(clean);
        if (item.content?.length) existing.content = item.content.map(clean);
        existing.text = (existing.summary?.some(Boolean) ? existing.summary : existing.content || []).join('\n\n');
        existing.reasoningFormat=existing.summary?.some(Boolean)?'summary':'text';
        existing.status = method === 'item/completed' ? 'completed' : 'running';
      } else if (item.type === 'agentMessage') {
        let existing = run.messages.find(message => message.id === item.id);
        if (!existing) { existing = { id: item.id, role: 'assistant', text: '', ...stamp() }; run.messages.push(existing); }
        existing.text = clean(item.text);
        if (['commentary', 'final_answer'].includes(item.phase)) existing.phase = item.phase;
        existing.status = method === 'item/completed' ? 'completed' : 'running';
      } else if (['commandExecution', 'fileChange', 'mcpToolCall', 'webSearch', 'plan'].includes(item.type)) {
        if(item.type==='mcpToolCall'&&item.server==='atelier_progress'&&item.tool==='update_plan') {
          if(method==='item/completed'&&item.status==='completed'&&validPlan(item.arguments)) {
            run.plans=[...(run.plans||[]).filter(plan=>plan.turnKey!==context.turnKey),{turnKey:context.turnKey,explanation:clean(item.arguments.explanation),steps:item.arguments.plan.map(step=>({step:clean(step.step),status:step.status==='in_progress'?'inProgress':step.status}))}];
          }
          this.changed(run);return;
        }
        const previous = run.tools.find(tool => tool.id === item.id);
        const tool = { ...(previous || stamp()), id: item.id, type: item.type, label: clean(item.command || item.tool || (item.type==='webSearch'?'搜索资料':item.type==='plan'?'任务规划':'文件变更')), status: item.status || (method==='item/completed'?'completed':'inProgress'),
          detail: clean(item.aggregatedOutput || item.text || (item.type==='webSearch'?JSON.stringify({query:item.query,action:item.action}):'') || (item.type==='mcpToolCall'?JSON.stringify({arguments:item.arguments,result:item.result,error:item.error}):'') || (item.changes ? JSON.stringify(item.changes, null, 2) : previous?.detail || '')) };
        const index = run.tools.findIndex(tool => tool.id === item.id); if (index < 0) run.tools.push(tool); else run.tools[index] = tool;
      }
    } else if(method==='item/mcpToolCall/progress'){
      const tool=run.tools.find(tool=>tool.id===params.itemId);if(tool)tool.progress=clean(params.message);
    } else if (method === 'item/commandExecution/outputDelta') {
      const tool = run.tools.find(tool => tool.id === params.itemId);
      if (tool) tool.detail = clean(tool.detail + (params.delta || ''));
    } else if (method === 'turn/completed') {
      void this.finish(context, params.turn.status === 'completed' ? 'completed' : params.turn.status === 'interrupted' ? 'interrupted' : 'failed', clean(params.turn.error?.message)); return;
    } else if (method === 'error') { run.error = clean(params.error?.message || params.message); run.retrying=params.willRetry===true; }
    else return;
    this.changed(run);
  }
  request(context, message) {
    if (context.done||context.cancelled) return;
    const run = context.run;
    if(message.params?.threadId&&run.threadId&&message.params.threadId!==run.threadId){context.rpc.send({id:message.id,error:{code:-32602,message:'Stale thread'}});return;}
    if(message.params?.turnId&&run.turnId&&message.params.turnId!==run.turnId){context.rpc.send({id:message.id,error:{code:-32602,message:'Stale turn'}});return;}
    if(message.method==='item/tool/requestUserInput'){
      const params=message.params||{};const questions=params.questions;
      if(!Array.isArray(questions)||!questions.length||questions.length>10||new Set(questions.map(q=>q?.id)).size!==questions.length||questions.some(q=>!q||typeof q.id!=='string'||typeof q.question!=='string'||q.question.length>20000||(q.options!=null&&(!Array.isArray(q.options)||q.options.length>50||q.options.some(o=>typeof o.label!=='string'||typeof o.description!=='string'))))){
        context.rpc.send({id:message.id,error:{code:-32602,message:'Invalid questions'}});return;
      }
      run.questions||=[];run.questions.push({id:String(message.id),rpcId:message.id,blocking:params.isBlocking!==false,questions:JSON.parse(redact(JSON.stringify(questions),context.config.apiKey))});
      if(params.isBlocking!==false)run.status='waiting';this.changed(run);
    } else if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(message.method)) {
      run.approvals.push({ id: String(message.id), rpcId: message.id, method: message.method,
        detail: redact(JSON.stringify(message.params, null, 2), context.config.apiKey) });
      run.status = 'waiting'; this.changed(run);
    } else {
      context.rpc.send({ id: message.id, error: { code: -32601, message: 'This interaction is not supported by Ambleloft. Ask the user in a normal message instead.' } });
    }
  }
  approve({ runId, approvalId, decision }) {
    const context = [...this.contexts.values()].find(c=>c.run?.id===runId);
    if (!context?.rpc || context.run?.id !== runId || !['accept', 'decline'].includes(decision)) throw new Error('审批已失效');
    const approval = context.run.approvals.find(item => item.id === approvalId);
    if (!approval) throw new Error('审批已失效');
    context.rpc.send({ id: approval.rpcId, result: { decision } });
    context.run.approvals = context.run.approvals.filter(item => item !== approval);
    context.run.status = context.run.approvals.length || context.run.questions?.some(q=>q.blocking) ? 'waiting' : 'running'; this.changed(context.run);
  }
  answer({runId,requestId,answers}) {
    const context=[...this.contexts.values()].find(c=>c.run?.id===runId);
    if(!context?.rpc||context.done||context.cancelled||context.run?.id!==runId)throw new Error('问题已失效');
    const request=context.run.questions?.find(q=>q.id===requestId);
    if(!request||!answers||typeof answers!=='object'||Array.isArray(answers))throw new Error('问题已失效');
    const result=Object.create(null);
    for(const question of request.questions){
      const value=answers[question.id];
      if(typeof value!=='string'||!value.trim()||value.length>20000)throw new Error('请回答每个问题');
      result[question.id]={answers:[value.trim()]};
    }
    context.rpc.send({id:request.rpcId,result:{answers:result}});
    context.run.questions=context.run.questions.filter(q=>q!==request);
    context.run.messages.push({id:randomUUID(),role:'assistant',phase:'commentary',text:request.questions.map(q=>q.question+'\n\n'+(q.isSecret?'[私密回答已提交]':answers[q.id].trim())).join('\n\n'),turnKey:context.turnKey,order:context.run.nextEventOrder=(context.run.nextEventOrder||0)+1});
    context.run.status=context.run.approvals.length||context.run.questions.some(q=>q.blocking)?'waiting':'running';this.changed(context.run);
  }
  async stop(id) {
    const context = [...this.contexts.values()].find(c=>c.run?.id===id);
    if (!context || context.run?.id !== id) return;
    context.cancelled = true; context.run.status = 'stopping'; this.changed(context.run);
    try { if (context.run.turnId && context.rpc && !context.rpc.closed) await context.rpc.call('turn/interrupt', { threadId: context.run.threadId, turnId: context.run.turnId }, 5000); } catch {}
    if (!context.done) await this.finish(context, 'interrupted', '已停止。若工具已执行，请核实结果后继续。');
  }
  async finish(context, status, error = '') {
    if (context.done) return;
    context.done = true;
    context.rpc?.close(); context.bridge?.close();
    const diagnostic=context.lastModelDiagnostic;
    if(status==='failed'&&/stream disconnected/.test(error)&&diagnostic?.failed&&!diagnostic.cancelled){
      error = (diagnostic.stage==='translate_tools'?'模型响应已接收，但工具调用解析失败。':error)+'\n模型请求诊断：'+diagnostic.reason+'；阶段：'+diagnostic.stage+
        (diagnostic.causeCode?'；原因代码：'+diagnostic.causeCode:'')+
        '；Request ID：'+diagnostic.requestId;
    }
    if(status==='failed'&&diagnostic?.failed&&!diagnostic.cancelled&&diagnostic.httpStatus>=400){
      error=diagnostic.reason+'\nRequest ID：'+diagnostic.requestId;
    }
    if (/idle timeout waiting for SSE/i.test(error)) error='模型服务连续 5 分钟没有返回可消费的流式事件，连接已超时。服务端生成日志不一定代表响应已发送；请检查推理服务的流式输出或代理缓冲。';
    if (context.timing) {
      context.timing.finishedAt = new Date().toISOString();
      context.timing.durationMs = Math.max(0, Math.round(performance.now() - context.startedTick));
      context.timing.outcome = status;
    }
    if (context.run && context.turnKey) {
      try {
        const changes=context.fileBaseline?await compare(context.run.cwd,context.fileBaseline,context.turnKey):{turnKey:context.turnKey,files:[],notice:'本轮未能记录文件变更基准。'};
        context.run.fileChanges=[...(context.run.fileChanges||[]),changes];
      } catch { context.run.fileChanges=[...(context.run.fileChanges||[]),{turnKey:context.turnKey,files:[],notice:'文件变更记录失败。'}]; }
      context.fileBaseline=null;
      try { context.run.artifacts=[...(context.run.artifacts||[]),...await collectArtifacts(context.run,context.turnKey)]; } catch { /* Artifact inspection must not prevent turn completion. */ }
    }
    if (context.run) { context.run.queued=false; context.run.status = status; context.run.error = error; context.run.retrying=false; context.run.questions=[]; context.run.approvals = []; this.changed(context.run); }
    try { await this.persist(); } catch { if (context.run) { context.run.error = '执行已结束，但记录保存失败。'; this.publish(structuredClone(context.run)); } }
    this.contexts.delete(context.key);this.pendingStarts=this.pendingStarts.filter(c=>c!==context);this.drain();
  }
  async shutdown() { if (!this.initialized) return; this.closing=true;for(const context of this.contexts.values())context.cancelled=true;await Promise.all([...this.contexts.values()].filter(c=>c.run).map(c=>this.stop(c.run.id)));if(this.saveTimer)clearTimeout(this.saveTimer);await this.persist(); }
}
module.exports = { AgentRuntime };
