// Existing skill category IDs describe role bindings. Group them by the work a reader wants to do.
const roleCategories = require('./role-categories.json');
const categories = new Map([
  ['business', {zh: '业务办理', en: 'Business workflows'}],
  ['equipment', {zh: '设备与工具', en: 'Devices & tools'}],
  ...roleCategories.map(({id, title}) => [id, {zh: title['zh-CN'], en: title.en}]),
  ['workflow', {zh: '工作协作', en: 'Collaboration'}],
  ['other', {zh: '其他工具', en: 'Other tools'}],
]);
const aliases = new Map(Object.entries({
  architecture: 'engineering', integration: 'engineering', frontend: 'engineering',
  'web-ui': 'design', qa: 'quality', devops: 'operations', copy: 'content',
  tutorial: 'content', data: 'analysis', forms: 'business', travel: 'business',
}));

function listingCategories(item) {
  function resolve(values) {
    return [...new Set(values.map(value => aliases.get(value) || value).filter(id => categories.has(id)))];
  }
  const declared = resolve(item.categoryIds || []);
  const ids = declared.length ? declared : resolve(item.tags);
  return (ids.length ? ids : ['other']).map(id => ({id, title: categories.get(id)}));
}
module.exports = {categories, listingCategories};
