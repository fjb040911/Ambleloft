import expertTrials from '../store/expert-skill-trials.json';
import workforceSkills from '../store/workforce-skills.json';
import type {StoreListing, StoreText} from './types';

const examples = new Map<string, StoreText>(Object.entries(expertTrials));
for (const skill of workforceSkills.items) examples.set(skill.id, skill.trialPrompt);

// Older signed listings shipped a purpose or a role-name template as their starter.
// Keep later editorial updates and other stores' prompts intact, in each locale.
export function storeTrialPrompt(item: StoreListing, sourceId: string | undefined, language: string) {
  const locale = language === 'en' ? 'en' : 'zh';
  const original = item.trialPrompt[locale];
  const example = sourceId === 'curated' && item.kind === 'skill' && examples.get(item.id);
  if (!example) return original;
  const placeholder = locale === 'en'
    ? `Use the ${item.title.en} for this task.`
    : `请按${item.title.zh}协助当前任务。`;
  return original === item.description[locale] || original === placeholder ? example[locale] : original;
}
