// These pages are an immutable projection of user messages and assistant replies.
// The parent snapshot owns the retention deadline and access checks.
const {isText,storedText}=require('../../electron/stored-json.cjs');
const PAGE_BYTES=32*1024;
const schema=`
CREATE TABLE IF NOT EXISTS automation_turn_pages(
 conversation_id TEXT NOT NULL,turn_id TEXT NOT NULL,version INTEGER NOT NULL,page INTEGER NOT NULL,data TEXT NOT NULL,
 PRIMARY KEY(conversation_id,turn_id,version,page),
 FOREIGN KEY(conversation_id,turn_id,version) REFERENCES automation_turns(conversation_id,turn_id,version) ON DELETE CASCADE);
`;
const visible=m=>!m.kind&&(m.role==='user'||(m.role==='assistant'&&(!m.phase||m.phase==='final_answer')));
function* pieces(value){
 const parts=isText(value)?value.chunks():[value||''];
 let carry='';
 for(const part of parts){
  for(let at=0;at<part.length;){
   const end=Math.min(part.length,at+4096);
   let text=carry+part.slice(at,end);carry='';at=end;
   if(/[\uD800-\uDBFF]/.test(text.at(-1))){carry=text.at(-1);text=text.slice(0,-1);}
   if(text)yield text;
  }
 }
 if(carry)yield carry;
}
// Strip inline reasoning before saving. A tag, its attributes, or its end can
// span source chunks. Only an unfinished tag name is kept between iterations.
function* withoutReasoning(parts){
 const names=['think','thinking','reasoning'];
 let prefix='',inTag=false,depth=0;
 for(const part of parts){
  let output='',text=prefix+part;prefix='';
  while(text){
   if(inTag){const end=text.indexOf('>');if(end<0)break;text=text.slice(end+1);inTag=false;continue;}
   const at=text.indexOf('<');
   if(at!==0){const content=at<0?text:text.slice(0,at);if(!depth)output+=content;if(at<0)break;text=text.slice(at);}
   const tag=/^<(\/?)(think|thinking|reasoning)(?=[\s/>])/i.exec(text);
   if(tag){inTag=true;depth=tag[1]?Math.max(0,depth-1):depth+1;text=text.slice(tag[0].length);continue;}
   const candidate=text.length<=12?text.toLowerCase():null;
   if(candidate&&names.some(name=>('<'+name).startsWith(candidate)||('</'+name).startsWith(candidate))){prefix=text;break;}
   if(!depth)output+='<';text=text.slice(1);
  }
  if(output)yield output;
 }
 if(prefix&&!depth)yield prefix;
}
function writePages(db,header,messages){
 const put=db.prepare('INSERT INTO automation_turn_pages VALUES (?,?,?,?,?)');
 let number=0,page=[],bytes=2;
 function flush(){
  put.run(header.conversationId,header.turnId,header.version,number++,JSON.stringify(page));page=[];bytes=2;
 }
 for(const m of messages){
  if(!visible(m))continue;
  const parts=pieces(m.text);
  for(const text of m.role==='assistant'?withoutReasoning(parts):parts){
   const row={id:m.id,role:m.role,text},size=Buffer.byteLength(JSON.stringify(row))+1;
   if(page.length&&bytes+size>PAGE_BYTES)flush();
   const last=page.at(-1);
   if(last&&last.id===row.id&&last.role===row.role)last.text+=text;else page.push(row);
   bytes+=size;
  }
 }
 if(page.length||!number)flush();
 return number;
}
function freezePages(db,header,messages,now){
 const args=[header.conversationId,header.turnId,header.version];
 db.prepare('INSERT INTO automation_turns VALUES (?,?,?,?,?,?)').run(...args,header.projectId,now,JSON.stringify(header));
 const pageCount=writePages(db,header,messages);
 db.prepare('UPDATE automation_turns SET data=? WHERE conversation_id=? AND turn_id=? AND version=?').run(JSON.stringify({...header,pageCount}),...args);
}
function canRecover(db,runId,turnId){
 return !!db.prepare("SELECT 1 FROM run_items WHERE run_id=? AND collection='messages' AND item_key=? AND turn_key=? AND json_extract(data,'$.role')='user'").get(runId,turnId,turnId);
}
function* retainedMessages(db,runId,turnId){
 const field='["text"]';
 const rows=db.prepare(`SELECT i.item_key,i.data,t.length FROM run_items i LEFT JOIN run_texts t ON
  t.run_id=i.run_id AND t.collection=i.collection AND t.item_key=i.item_key AND t.field=?
  WHERE i.run_id=? AND i.collection='messages' AND i.turn_key=? ORDER BY i.position`);
 for(const row of rows.iterate(field,runId,turnId)){
  const m=JSON.parse(row.data);
  if(!visible(m))continue;
  if(row.length!=null)m.text=storedText(db,[runId,'messages',row.item_key,field]);
  yield m;
 }
}
module.exports={schema,visible,freezePages,canRecover,retainedMessages,PAGE_BYTES};
