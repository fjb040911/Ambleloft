const spool=require('./text-spool.cjs');
const {StreamRedactor,fields,secrets}=require('./stream-redactor.cjs');
function* parts(owner,key){const ref=spool.reference(owner,key);if(ref)yield* spool.chunks(ref);else yield String(owner?.[key]??'');}
function length(owner,key){return spool.reference(owner,key)?.length??String(owner?.[key]??'').length;}
function isText(owner,key){return !!spool.reference(owner,key)||typeof owner?.[key]==='string';}
function preview(context,owner,key,limit){let value='';for(const part of redacted(context,parts(owner,key))){value+=part.slice(0,limit-value.length);if(value.length>=limit)break;}return value;}
function* completedParts(item,reasoning){
 if(!reasoning){yield* parts(item,'text');return;}
 const list=item.summary?.length?item.summary:item.content||[];
 for(let i=0;i<list.length;i++){if(i)yield '\n\n';yield* parts(list,String(i));}
}
function* redacted(context,source,cancelled=false){const redactor=new StreamRedactor(secrets(context));for(const part of source)yield redactor.write(part);yield redactor.end(cancelled);}
function replace(context,owner,key,source){
 fields(context).reset(owner,key);owner[key]='';
 for(const part of source)spool.append(owner,key,part,context.textSpool);
}
function copy(context,owner,key,source,sourceKey){replace(context,owner,key,redacted(context,parts(source,sourceKey)));}
function array(context,source){const result=[];for(let i=0;i<source.length;i++)copy(context,result,String(i),source,String(i));return result;}
function* json(context,value){yield* require('./stream-json.cjs').jsonChunks(value,new Set(),source=>redacted(context,source));}
module.exports={parts,length,isText,preview,completedParts,redacted,replace,copy,array,json};
