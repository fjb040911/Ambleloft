// Native trust prompts use the persisted workspace language, never renderer input.
function confirmationLocale(language, systemLocale) {
  const selected = language === 'system' ? systemLocale : language;
  return typeof selected === 'string' && selected.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
function packageConfirmation(revision, language, systemLocale, previous) {
  const zh = confirmationLocale(language, systemLocale) === 'zh';
  const permissions = (revision.manifest.permissions || []).map(permission => `${permission.capability} (${permission.scope})`).join(', ');
  const retained = previous?.trusted && previous.grants?.length
    ? (zh ? '\n继续将允许此代码沿用仍适用的资源授权。' : '\nContinuing lets this code use existing grants that still apply.') : '';
  return {
    type: 'warning',
    title: zh ? '信任扩展代码' : 'Trust extension code',
    message: zh ? `信任 ${revision.id} v${revision.manifest.version}？` : `Trust ${revision.id} v${revision.manifest.version}?`,
    detail: zh
      ? `摘要：${revision.digest}\n此扩展包含开发者提供的代码。Node 扩展可使用当前用户的系统权限，资源授权只限制宿主核心 API，不是系统沙箱。\n声明权限：${permissions || '无'}\n启用后可按声明启动独立 Node 后台、打开扩展页面；向 Agent 开放的操作仍须遵守宿主权限与确认规则。${retained}`
      : `Digest: ${revision.digest}\nThis extension contains developer-provided code. Node extensions run with your system user’s permissions. Resource grants restrict host APIs; they are not an operating-system sandbox.\nDeclared permissions: ${permissions || 'None'}\nWhen enabled, the extension can start its declared Node backend and open its pages. Operations exposed to the Agent remain subject to host permissions and confirmation rules.${retained}`,
    buttons: zh ? ['取消', '信任并安装'] : ['Cancel', 'Trust and install'],
    defaultId: 0,
    cancelId: 0
  };
}
async function approveStoreUpgrade(revision,previous,language,systemLocale,show){
  const added=require('../core/extensions/grant-selection.cjs').addedPermissions(previous.manifest.permissions,revision.manifest.permissions);
  if(!added.length)return true;
  const zh=confirmationLocale(language,systemLocale)==='zh';
  const self=added.filter(p=>p.scope==='self').map(p=>p.capability);
  const project=added.filter(p=>p.scope==='project').map(p=>p.capability);
  const lines=[];
  if(self.length)lines.push((zh?'新增扩展私有权限':'New extension permissions')+'\n'+self.join(' · '));
  if(project.length)lines.push((zh?'新增项目权限':'New project permissions')+'\n'+project.join(' · ')+'\n'+(zh?'升级后在权限设置中选择要授权的项目。':'After updating, select a project in permission settings to grant access.'));
  const buttons=zh?['取消','仅更新']:['Cancel','Update only'];
  if(self.length)buttons.push(zh?'更新并授权新增私有权限':'Update and grant new extension permissions');
  const {response}=await show({type:'question',title:zh?'扩展申请新增权限':'New extension permissions',
    message:revision.id+' · '+previous.manifest.version+' → '+revision.manifest.version,detail:lines.join('\n\n'),buttons,defaultId:1,cancelId:0});
  if(response===2 && self.length)return {accepted:true,approvedSelf:self};
  return response===1;
}
function skillConfirmation(item, language, systemLocale) {
  const locale = confirmationLocale(language, systemLocale), zh = locale === 'zh';
  return {
    type: 'question',
    title: zh ? '安装技能' : 'Install skill',
    message: zh ? '安装并启用技能？' : 'Install and enable this skill?',
    detail: zh
      ? `${item.title.zh}\n${item.summary.zh}\n来源：${item.publisher}\n版本：${item.release.version}\n安装后，AI 可以读取它的方法、表单和资源；安装不会自动执行脚本。`
      : `${item.title.en}\n${item.summary.en}\nPublisher: ${item.publisher}\nVersion: ${item.release.version}\nAfter installation, the AI can read the skill’s methods, forms, and resources. Installation does not automatically execute scripts.`,
    buttons: zh ? ['取消', '安装并启用'] : ['Cancel', 'Install and enable'],
    defaultId: 0,
    cancelId: 0
  };
}
module.exports = {confirmationLocale, packageConfirmation, approveStoreUpgrade, skillConfirmation};
