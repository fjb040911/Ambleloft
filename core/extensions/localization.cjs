function localized(item,value,locale='en'){
 const match=/^%(.+)%$/.exec(value||'');if(!match)return value;
 const dictionaries=item.dictionaries||{},key=locale.toLowerCase().replaceAll('_','-');
 return dictionaries[key]?.[match[1]]||dictionaries[key.split('-')[0]]?.[match[1]]||dictionaries.default?.[match[1]]||match[1];
}
module.exports={localized};
