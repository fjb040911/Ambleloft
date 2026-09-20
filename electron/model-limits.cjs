function normalizeLimits(value = {}) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('模型容量设置无效');
 const result = {};
 for (const key of ['contextWindow','autoCompactTokenLimit','maxOutputTokens']) {
  if (value[key] === undefined) continue;
  if (!Number.isSafeInteger(value[key]) || value[key] <= 0) throw new Error('Token 数量必须为正整数');
  result[key] = value[key];
 }
 return result;
}
function resolveLimits(defaults, override) {
 const result = {...normalizeLimits(defaults), ...normalizeLimits(override)};
 if (result.contextWindow && !result.autoCompactTokenLimit) result.autoCompactTokenLimit = Math.max(1, Math.floor(result.contextWindow * .8));
 if (result.contextWindow && result.autoCompactTokenLimit >= result.contextWindow) throw new Error('自动压缩阈值必须小于上下文窗口');
 if (result.contextWindow && result.maxOutputTokens >= result.contextWindow) throw new Error('最大输出长度必须小于上下文窗口');
 return result;
}
module.exports = {normalizeLimits,resolveLimits};
