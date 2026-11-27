const test = require('node:test');
const assert = require('node:assert/strict');
const {storeTrialPrompt} = require('../src/store-trial-prompt.ts');

const listing = {
  id: 'architecture-review', kind: 'skill',
  title: {zh: '架构评审', en: 'Architecture review'},
  summary: {zh: '比较架构方案。', en: 'Compare architecture options.'},
  description: {zh: '用于评审架构方案。', en: 'Reviews architecture options.'},
  trialPrompt: {zh: '请按架构评审协助当前任务。', en: 'Reviews architecture options.'},
};

test('legacy curated trial placeholders produce a task prompt using public listing metadata', () => {
  assert.equal(storeTrialPrompt(listing, 'curated', 'zh-CN'), '请使用架构评审协助我完成这项任务：比较架构方案。 开始前请先确认必要信息。');
  assert.equal(storeTrialPrompt(listing, 'curated', 'en'), 'Use Architecture review to help me with this task: Compare architecture options. Ask for any necessary details before starting.');
});

test('explicit signed prompts and other catalogs or extension listings remain unchanged', () => {
  const explicit = {...listing, trialPrompt: {zh: '比较方案 A 和 B。', en: 'Compare designs A and B.'}};
  assert.equal(storeTrialPrompt(explicit, 'curated', 'zh-CN'), explicit.trialPrompt.zh);
  assert.equal(storeTrialPrompt(explicit, 'curated', 'en'), explicit.trialPrompt.en);
  assert.equal(storeTrialPrompt(listing, 'other', 'en'), listing.trialPrompt.en);
  assert.equal(storeTrialPrompt({...listing, kind: 'extension'}, 'curated', 'en'), listing.trialPrompt.en);
});
