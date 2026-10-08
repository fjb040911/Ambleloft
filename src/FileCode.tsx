import {useEffect,useRef} from 'react';
import {Compartment,EditorState} from '@codemirror/state';
import {EditorView,lineNumbers,highlightActiveLineGutter,keymap} from '@codemirror/view';
import {foldGutter,foldKeymap,syntaxHighlighting,defaultHighlightStyle,HighlightStyle} from '@codemirror/language';
import {search,searchKeymap,highlightSelectionMatches,openSearchPanel} from '@codemirror/search';
import {defaultKeymap,history,historyKeymap} from '@codemirror/commands';
import {tags} from '@lezer/highlight';
import {languages} from '@codemirror/language-data';

export default function FileCode({text,path,wrap,position,onScroll,artifactPreview=false,editable=false,onChange,onSave}:{editable?:boolean;onChange?(text:string):void;onSave?():void;artifactPreview?:boolean;text:string;path:string;wrap:boolean;position:number;onScroll:(top:number)=>void}) {
 const host=useRef<HTMLDivElement>(null),view=useRef<EditorView|null>(null),callback=useRef(onScroll),scroll=useRef(position),source=useRef(text);
 const editing=useRef(new Compartment());
 const change=useRef(onChange),save=useRef(onSave),canEdit=useRef(editable);change.current=onChange;save.current=onSave;canEdit.current=editable;
 const editConfig=(enabled:boolean)=>[EditorState.readOnly.of(!enabled),EditorView.editable.of(enabled),EditorView.contentAttributes.of({'aria-label':enabled?'技能指令':'只读文件代码'})];
 callback.current=onScroll;scroll.current=position;source.current=text;
 useEffect(()=>{
  if(!host.current)return;
  const editor=new EditorView({parent:host.current,state:EditorState.create({doc:source.current,extensions:[
   editing.current.of(editConfig(canEdit.current)),history(),EditorView.updateListener.of(update=>{if(update.docChanged&&canEdit.current)change.current?.(update.state.doc.toString());}),
   lineNumbers(),highlightActiveLineGutter(),foldGutter(),syntaxHighlighting(artifactPreview?HighlightStyle.define([{tag:tags.keyword,class:'preview-token-keyword'},{tag:[tags.string,tags.regexp],class:'preview-token-string'},{tag:[tags.number,tags.bool,tags.null],class:'preview-token-number'},{tag:tags.comment,class:'preview-token-comment'},{tag:[tags.function(tags.variableName),tags.tagName, tags.typeName],class:'preview-token-function'}]):defaultHighlightStyle),search({top:true}),highlightSelectionMatches(),keymap.of([{key:'Mod-s',run:()=>{if(!canEdit.current)return false;save.current?.();return true;}},...historyKeymap,...searchKeymap,...foldKeymap,...defaultKeymap]),
   ...(wrap?[EditorView.lineWrapping]:[]),
   EditorView.theme({'&':{height:'100%',backgroundColor:'var(--raised)',color:'var(--text)'},'.cm-scroller':{overflow:'auto',fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',fontSize:'12px'},'.cm-gutters':{backgroundColor:'var(--surface)',color:'var(--muted)',borderColor:'var(--border)'},'.cm-content':{padding:'12px 0'},'.cm-panels':{backgroundColor:'var(--sidebar)',color:'var(--text)'},'.cm-cursor':{borderLeftColor:'var(--text)'},'&.cm-focused':{outline:'none'}}),
   EditorView.domEventHandlers({scroll:()=>{callback.current(editor.scrollDOM.scrollTop);}}),
  ]})});
  view.current=editor;
  const find=()=>openSearchPanel(editor);window.addEventListener('file-code-find',find);
  const language=languages.find(item=>item.filename?.test(path)||item.extensions.includes(path.split('.').pop()?.toLowerCase()||''));
  let disposed=false;
  language?.load().then(extension=>{if(!disposed)editor.dispatch({effects:StateEffect.appendConfig.of(extension)});}).catch(()=>{});
  const frame=requestAnimationFrame(()=>{editor.scrollDOM.scrollTop=scroll.current;});
  return()=>{disposed=true;window.removeEventListener('file-code-find',find);cancelAnimationFrame(frame);editor.destroy();view.current=null;};
 },[path,wrap,artifactPreview]);
 useEffect(()=>{view.current?.dispatch({effects:editing.current.reconfigure(editConfig(editable))});},[editable]);
 useEffect(()=>{const editor=view.current;if(editor&&editor.state.doc.toString()!==text){const top=editor.scrollDOM.scrollTop;editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:text}});editor.scrollDOM.scrollTop=top;}},[text]);
 return <div className="file-code" ref={host}/>;
}
import {StateEffect} from '@codemirror/state';
