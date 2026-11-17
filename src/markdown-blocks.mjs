import {fromMarkdown} from 'mdast-util-from-markdown';
// Only the final top-level block can be extended by ordinary appended Markdown.
// Document-wide reference definitions and display math deliberately use one block.
export function createMarkdownSplitter(){
 let previous='',prefix=[],length=0;
 return text=>{
  if(text.length<2000||/\$\$|^\s*\[[^\]]+\]:/m.test(text)){previous=text;prefix=[];length=0;return [text];}
  if(!text.startsWith(previous)){prefix=[];length=0;}
  previous=text;
  try{
   const tail=text.slice(length),tree=fromMarkdown(tail);
   if(tree.children.some(node=>node.type==='definition')){prefix=[];length=0;return [text];}
   const offsets=tree.children.map(node=>node.position?.start.offset).filter(offset=>offset!==undefined);
   const chunks=offsets.length?offsets.map((offset,index)=>tail.slice(index===0?0:offset,offsets[index+1]??tail.length)):[tail];
   const completed=chunks.slice(0,-1);prefix=[...prefix,...completed];length+=completed.reduce((sum,chunk)=>sum+chunk.length,0);
   return [...prefix,chunks.at(-1)||''];
  }catch{prefix=[];length=0;return [text];}
 };
}
