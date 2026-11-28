// Activity IDs remain stable as the bounded list rolls. Numeric segments are
// reserved for legacy entries with no unique ID and for ordinary arrays.
function activityKeys(activities) {
  const counts = new Map();
  for (const activity of activities) {
    const id = activity?.id;
    if (typeof id === 'string' && id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return activities.map((activity, index) => counts.get(activity?.id) === 1 ? activity.id : index);
}

function locate(item, field) {
  const path = JSON.parse(field);
  let owner = item;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (i === 1 && path[0] === 'nativeActivity' && Array.isArray(owner) && typeof key === 'string') {
      owner = owner.find(activity => activity?.id === key);
    } else {
      if (!owner || !Object.hasOwn(owner, key)) return null;
      owner = owner[key];
    }
  }
  const key = path.at(-1);
  return owner && Object.hasOwn(owner, key) ? {owner, key} : null;
}

module.exports = {activityKeys, locate};
