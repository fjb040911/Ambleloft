import type {StoreListing} from './types';

// Older signed listings shipped a purpose or a role-name template as their starter.
// Keep later editorial updates and other stores' prompts intact, in each locale.
export function storeTrialPrompt(item: StoreListing, sourceId: string | undefined, language: string) {
  const locale = language === 'en' ? 'en' : 'zh';
  const original = item.trialPrompt[locale];
  if (sourceId !== 'curated' || item.kind !== 'skill') return original;
  const placeholder = locale === 'en'
    ? `Use the ${item.title.en} for this task.`
    : `请按${item.title.zh}协助当前任务。`;
  if (original !== item.description[locale] && original !== placeholder) return original;
  // Use the signed listing itself for compatibility with older published skills.
  const purpose = item.summary[locale];
  return locale === 'en'
    ? `Use ${item.title.en} to help me with this task: ${purpose} Ask for any necessary details before starting.`
    : `请使用${item.title.zh}协助我完成这项任务：${purpose} 开始前请先确认必要信息。`;
}
