import {unwrapInputResult} from './input-action-result';
import type {PersistentInputRequest} from './types';
import type {FormValues} from './FormFields';

type Command=Parameters<NonNullable<NonNullable<Window['desktop']>['inputs']>['action']>[0];
type State={request:PersistentInputRequest;values:FormValues;dirty:boolean;busy:boolean;submitting:boolean;error:string;fields:Record<string,string>;conflict:boolean};
// Window-local editing buffer survives dock hide/remount. The durable authority
// remains the host; no answers are written to browser storage.
const controllers=new Map<string,InputRequestController>();
export function inputRequestController(request:PersistentInputRequest){
 let controller=controllers.get(request.id);
 if(!controller){controller=new InputRequestController(request);controllers.set(request.id,controller);}
 return controller;
}
export class InputRequestController{
 private state:State;
 private listeners=new Set<()=>void>();
 private timer:ReturnType<typeof setTimeout>|undefined;
 private work:Promise<void>|undefined;
 private pending:Command|undefined;
 private incoming:PersistentInputRequest|undefined;
 constructor(request:PersistentInputRequest){this.state={request,values:{...request.draft},dirty:false,busy:false,submitting:false,error:'',fields:{},conflict:false};}
 snapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private patch(value:Partial<State>){this.state={...this.state,...value};for(const listener of this.listeners)listener();}
 update(request:PersistentInputRequest){
  if(request.revision<=this.state.request.revision)return;
  if(this.state.busy||this.pending){this.incoming=request;return;} // Reconcile after own RPC.
  if(this.state.dirty||this.pending){this.patch({conflict:true,error:'内容已更新，你的填写仍保留。请查看最新版本后再决定。'});return;}
  this.patch({request,values:{...request.draft},fields:{}});
 }
 change(name:string,value:string|boolean){
  this.patch({values:{...this.state.values,[name]:value},dirty:true,fields:{...this.state.fields,[name]:''}});
  clearTimeout(this.timer);if(!this.state.request.draftTouched)void this.save();else this.timer=setTimeout(()=>void this.save(),350);
 }
 private async command(action:'beginEdit'|'saveDraft'|'submit'|'cancel'|'acceptProposal'|'rejectProposal',values?:FormValues,resume?:{expectedPolicyGeneration:number},proposalId?:string,expectedRevision?:number){
  const r=this.state.request;
  this.pending ||= {action,runId:r.runId,requestId:r.id,expectedRevision:expectedRevision??r.revision,clientMutationId:crypto.randomUUID(),...(values?{values}:{}),...(resume?{resume}: {}),...(proposalId?{proposalId}:{})} as Command;
  const sent=this.pending;
  const result=unwrapInputResult(await window.desktop!.inputs!.action(sent));
  this.pending=undefined;
  this.patch({request:result,...(sent.action==='saveDraft'&&JSON.stringify(this.state.values)===JSON.stringify(sent.values)?{dirty:false}:{}),...(result.state!=='pending'?{dirty:false}:{}),error:'',fields:{},conflict:false});
 }
 private async flush(){
  if(this.pending)await this.command('saveDraft'); // retry exact command/id first
  if(this.state.request.state!=='pending')return;
  if(this.state.dirty&&!this.state.request.draftTouched)await this.command('beginEdit');
  while(this.state.dirty){await this.command('saveDraft',{...this.state.values});}
 }
 private run(task:()=>Promise<void>){
  if(this.work)return this.work;
  this.patch({busy:true,error:'',fields:{}});
  this.work=task().catch((e:Error&{code?:string;fields?:Record<string,string>})=>{
   // Validation errors have definitely not committed; allow corrected answers.
   if(e.fields||e.code==='INVALID_ARGUMENT'||e.code==='INTERACTION_REQUIRED')this.pending=undefined;
   this.patch({error:e.code==='CONFLICT'?'内容已更新，你的填写仍保留。请查看最新版本后再决定。':e.code==='INTERACTION_REQUIRED'?'任务已暂停，请使用“提交并继续”。':e.fields?'请检查填写内容':this.pending?.action==='submit'?'提交结果暂未确认。请核实结果，避免重复发送。':'暂时未能保存，你的填写仍保留，请重试。',fields:e.fields||{},conflict:e.code==='CONFLICT'});
  }).finally(()=>{this.work=undefined;this.patch({busy:false,submitting:this.pending?.action==='submit'});if(this.incoming){const incoming=this.incoming;this.incoming=undefined;this.update(incoming);}});return this.work;
 }
 save=()=>{clearTimeout(this.timer);if(this.state.conflict)return Promise.resolve();return this.run(()=>this.flush());};
 async submit(resume?:{expectedPolicyGeneration:number}){
  clearTimeout(this.timer);if(this.work)await this.work;
  if(this.state.conflict)return;
  this.patch({submitting:true});
  return this.run(async()=>{await this.flush();if(this.state.request.state==='pending')await this.command('submit',{...this.state.values},resume);});
 }
 async decide(action:'cancel'|'acceptProposal'|'rejectProposal',revision:number,proposalId?:string,resume?:{expectedPolicyGeneration:number}){
  clearTimeout(this.timer);if(this.work)await this.work;
  if(this.state.conflict)return;
  // The revision is the exact preview the user approved; never rebase it after a save.
  this.patch({submitting:true});
  return this.run(async()=>{if(this.pending){const same=this.pending.action===action;await this.command('saveDraft');if(same)return;}await this.command(action,undefined,resume,proposalId,revision);});
 }
 async loadLatest(){
  try{const latest=await window.desktop!.inputs!.list({runId:this.state.request.runId});const request=latest.requests.find(r=>r.id===this.state.request.id);if(!request)throw Error('NOT_FOUND');this.reload(request);}catch{this.patch({error:'暂时无法读取补充消息，请重试'});}
 }
 // Called only after an explicit discard confirmation. Never silently rebase.
 reload(request:PersistentInputRequest){clearTimeout(this.timer);if(this.state.busy)return;this.pending=undefined;this.patch({request,values:{...request.draft},dirty:false,submitting:false,conflict:false,error:'',fields:{}});}
}
