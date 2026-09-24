const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs');
const path=require('node:path').posix;
const XLSX=require('xlsx');
const {unzipSync,strFromU8}=require('fflate');
const {XMLParser}=require('fast-xml-parser');
const array=value=>value==null?[]:Array.isArray(value)?value:[value];
function spreadsheet(data){
 const workbook=XLSX.read(data,{type:'buffer',cellFormula:false,cellHTML:false,sheetRows:10001,bookVBA:false});
 let remaining=200000,characters=0,truncated=false;
 const sheets=workbook.SheetNames.slice(0,100).map(name=>{
  const sheet=workbook.Sheets[name],rows=[];let limited=false;
  const ref=sheet['!ref'];if(!ref)return {name,rows,columns:0,truncated:false};
  const range=XLSX.utils.decode_range(ref),columns=Math.min(range.e.c+1,200);
  const full=XLSX.utils.decode_range(sheet['!fullref']||ref);
  limited=full.e.r>=10000||full.e.c>=200;
  for(let r=0;r<=Math.min(range.e.r,9999);r++){
   if(remaining<columns||characters>=8*1024*1024){limited=true;break;}
   const row=[];
   for(let c=0;c<columns;c++){
    const cell=sheet[XLSX.utils.encode_cell({r,c})];
    const raw=cell?XLSX.utils.format_cell(cell):'';const text=String(raw).slice(0,10000);
    if(text.length!==String(raw).length)limited=true;
    row.push(text);characters+=text.length;
   }
   remaining-=columns;rows.push(row);
  }
  truncated ||= limited;return {name,rows,columns,truncated:limited};
 });
 return {kind:'spreadsheet',sheets,truncated:truncated||workbook.SheetNames.length>100};
}
function presentation(data){
 let total=0;
 const zip=unzipSync(data,{filter:file=>{
  if(!/^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/_rels\/[^/]+\.rels|notesSlides\/[^/]+\.xml)$/.test(file.name))return false;
  total+=file.originalSize;if(file.originalSize>4*1024*1024||total>32*1024*1024)throw new Error('PPT 备注内容过大');return true;
 }});
 const parser=new XMLParser({ignoreAttributes:false,transformTagName:name=>name.split(':').pop(),processEntities:true,parseTagValue:false,trimValues:false});
 const xml=name=>{if(!zip[name])return null;const text=strFromU8(zip[name]);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('不支持包含实体定义的文档');return parser.parse(text);};
 const relations=name=>array(xml(name)?.Relationships?.Relationship);
 const resolve=(base,rel)=>{
  if(!rel||rel['@_TargetMode']==='External')return null;
  const target=String(rel['@_Target']||'');if(target.startsWith('/')||target.includes('\\'))return null;
  const result=path.normalize(path.join(path.dirname(base),target));return result.startsWith('ppt/')?result:null;
 };
 const rels=relations('ppt/_rels/presentation.xml.rels');
 const ids=array(xml('ppt/presentation.xml')?.presentation?.sldIdLst?.sldId);
 if(!ids.length||ids.length>500)throw new Error('仅支持 1–500 页的 PPTX');
 const slides=ids.map((slide,index)=>{
  const slidePath=resolve('ppt/presentation.xml',rels.find(r=>r['@_Id']===Object.entries(slide).find(([key])=>key.startsWith('@_')&&key.endsWith(':id'))?.[1]));
  let notes='';
  if(slidePath){
   const refs=relations(path.join(path.dirname(slidePath),'_rels',path.basename(slidePath)+'.rels'));
   const notePath=resolve(slidePath,refs.find(r=>String(r['@_Type']).endsWith('/notesSlide')));
   if(notePath&&zip[notePath]){
    xml(notePath); // Validate before allowing built-in entity decoding.
    const ordered=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,preserveOrder:true,processEntities:true,parseTagValue:false,trimValues:false}).parse(strFromU8(zip[notePath]));
    const find=(nodes,tag)=>nodes.flatMap(node=>Object.entries(node).flatMap(([key,value])=>key===tag?[node]:Array.isArray(value)?find(value,tag):[]));
    const shapes=find(ordered,'sp');
    const body=shapes.find(shape=>find(shape.sp,'ph').some(ph=>ph[':@']?.['@_type']==='body'));
    const text=nodes=>nodes.map(node=>Object.entries(node).map(([key,value])=>key==='#text'?String(value):key==='br'?'\n':Array.isArray(value)?text(value):'').join('')).join('');
    if(body)notes=find(body.sp,'p').map(p=>text(p.p)).join('\n');
   }
  }
  return {number:index+1,notes};
 });
 return {kind:'presentation',slides};
}
try{const data=fs.readFileSync(workerData.file);parentPort.postMessage({value:workerData.kind==='spreadsheet'?spreadsheet(data):presentation(data)});}catch(error){parentPort.postMessage({error:error.message});}
