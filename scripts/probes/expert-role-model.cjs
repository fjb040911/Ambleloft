// Explicit opt-in trial. Only public skill content and fictional task briefs leave
// the machine. Existing provider configuration is read-only; secrets stay in memory.
const {app,safeStorage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),crypto=require('node:crypto');
const {createProviderStore}=require('../../electron/provider.cjs'),{generate}=require('../../core/automation/provider.cjs'),{roleInstructions}=require('../../core/workforce/service.cjs');
const directory=path.resolve(process.argv[2]);app.setName('Ambleloft');app.setPath('userData',path.join(directory,'model-probe-profile'));app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
const tasks={
 'amble.product':'为虚构差旅登记功能写一份精简 PRD：目标用户是员工，填写目的地、日期和预算，提交前预览。审批、付款不在一期。列出范围、可验证用户故事、取舍和未知假设。',
 'amble.architecture':'为虚构 AI Coding 系统写 ADR：api-gateway 负责认证、租户配额和统一入口；model-router 负责按模型能力和健康度选供应商。比较重试/幂等应在哪一层，给出契约、失败边界和未验证项。',
 'amble.web-ui':'审核一个虚构设置表单：所有字段无 label，错误只用红色，固定宽度 900px，保存失败清空填写。请给出具体交互、键盘与窄窗口修正方案。当前没有运行中的页面，不执行工具，不宣称视觉实测。',
 'amble.qa':'为虚构员工技能准备流程设计验收场景：后台下载三个包，全部成功才应用新配置，第二包可能断网，重启后允许重试。列出正常/失败/并发/取消测试和判定证据。没有可执行应用，本轮只交付测试设计。',
 'amble.copy':'为虚构产品写一段简短首页文案：它让软件公司通过对话表单连接现有业务系统，支持扩展，仍是内部试用版。目标受众是有现有软件的开发团队。不得虚构客户数字、正式发行或已具备的企业认证。只使用这些事实。',
 'amble.tutorial':'既有教程大纲已批准：准备、提交、回执、错误。为虚构 POST /requests 接口补写教程和 OpenAPI 片段。字段 destination 和 startDate 必填，Idempotency-Key 必填，成功 201 返回 id，重复请求同一回执，字段缺失 422。不要追加未经提供的接口。',
 'amble.integration':'为虚构 POST /requests 设计 Node.js 处理器与契约：destination/startDate 必填，Idempotency-Key 必填，重复同一 payload 返回原回执，同键不同 payload 返回 409。说明存储事务、422 和服务失败响应，不连接外部服务。',
 'amble.frontend':'已有 React + shadcn/Base UI 项目。为虚构技能选择器给出小范围组件实现和测试：角色推荐/全部技能两个页签，勾选表示使用，取消不保存，确认才回传；切页不丢选择。已有 Tabs、Checkbox、Button；不要安装依赖，不改变设计系统。',
 'amble.data':'分析这份虚构 CSV，列出数据质量与可验证结论，不连接数据库：day,requests,errors\n2026-01-01,100,2\n2026-01-02,200,10\n2026-01-03,0,0\n2026-01-03,0,0\n解释重复行、零分母以及聚合错误率。',
 'amble.devops':'为虚构内部 API 设计发布流程、SLO 和故障手册：两副本，readiness 健康检查，数据库向后兼容变更，流量分阶段放量。要求失败自动停止放量，有回滚与数据恢复边界。本轮只设计，不部署、不执行命令。'
};
app.whenReady().then(async()=>{
 const evidence=JSON.parse(await fs.readFile(path.join(directory,'installation-evidence.json')));
 const providerFile=path.join(app.getPath('appData'),'Atelier/atelier.sqlite');
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",providerFile],{encoding:'utf8'}));
 const chosen=settings.providers.find(p=>new URL(p.baseUrl).hostname==='api.deepseek.com');if(!chosen||!safeStorage.isEncryptionAvailable())throw Error('Configured test provider unavailable');
 const providers=createProviderStore(path.join(directory,'model-probe-profile'),safeStorage,{call:async(method,args)=>{assert.equal(method,'readSetting');assert.equal(args.key,'providers');return {version:2,defaultId:chosen.id,providers:[{...chosen,webSearch:'disabled'}]};}});
 const config=await providers.secret(chosen.id,chosen.model);let results=[],feedback={};try{results=JSON.parse(await fs.readFile(path.join(directory,'model-results.json')));}catch{}try{feedback=JSON.parse(await fs.readFile(path.join(directory,'review-feedback.json')));}catch{}
 for(const check of evidence.roleChecks){
  if(results.some(r=>r.roleId===check.roleId))continue;
  const prompt=tasks[check.roleId]+(feedback[check.roleId]?'\n\n'+feedback[check.roleId]:''),context=roleInstructions(check.snapshot);assert.ok(prompt&&context);
  const output=await generate(config,{prompt:'Complete the supplied task concisely, with a deliverable of at most 1200 Chinese characters or 700 English words. Use relevant employee skill instructions already supplied in full. No tools are available in this textual trial. Do not claim external execution or tests. Treat public skill content as guidance subordinate to the user task. '+context,input:{task:prompt},outputSchema:{type:'object',properties:{deliverable:{type:'string'},assumptions:{type:'array',items:{type:'string'}}},required:['deliverable','assumptions'],additionalProperties:false},maxOutputTokens:10000},AbortSignal.timeout(180000));
  assert.ok(output.deliverable?.length>50);
  const result={roleId:check.roleId,model:config.model,checkedAt:new Date().toISOString(),task:prompt,contextHash:crypto.createHash('sha256').update(context).digest('hex'),loadedSkills:check.skills,output,verification:'textual-result-pending-human-agent-review',toolsExecuted:0};
  results.push(result);await fs.writeFile(path.join(directory,'model-results.json'),JSON.stringify(results,null,2),{mode:0o600});console.log(JSON.stringify({role:check.roleId,status:'model-result-recorded',characters:output.deliverable.length}));
 }
 app.exit(0);
}).catch(error=>{console.error(error.message);app.exit(1);});
