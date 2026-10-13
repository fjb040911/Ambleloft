const L=require('../localization/index.cjs');
function localized(item,value,locale='en'){return L.text(item.dictionaries||{},value,locale);}
module.exports={localized};
