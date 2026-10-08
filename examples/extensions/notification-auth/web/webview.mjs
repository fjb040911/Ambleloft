const failure=(code,effectStatus='notStarted')=>({code,message:code,requestId:globalThis.crypto?.randomUUID?.()||'sdk-local',effectStatus});
export class ExtensionError extends Error {
 constructor(value){super(value.message);this.name='ExtensionError';this.failure=value;this.code=value.code;this.effectStatus=value.effectStatus;}
}
export function unwrap(result){if(!result.ok)throw new ExtensionError(result.error);return result.value;}
export function createClient(){
 const bridge=globalThis.ambleExtension;
 if(!bridge||typeof bridge.initialize!=='function')throw new ExtensionError(failure('HOST_UNAVAILABLE'));
 let ready=false,methods=new Set(),initializing;
 const call=async(method,args,{cancelValue,signal}={})=>{
  if(!ready)return {ok:false,error:failure('HOST_UNAVAILABLE')};
  if(!methods.has(method)||typeof bridge[method]!=='function')return {ok:false,error:failure('UNSUPPORTED')};
  if(signal?.aborted)return {ok:false,error:failure('CANCELLED')};
  try{const result=await bridge[method](...args);if(!result||typeof result.ok!=='boolean')throw Error('Malformed host reply');
   if(!result.ok&&result.error.code==='CANCELLED'&&cancelValue!==undefined)return {ok:true,value:cancelValue};return result;
  }catch{return {ok:false,error:failure('HOST_UNAVAILABLE',method==='invoke'||method==='requestSecretInput'?'unknown':'notStarted')};}
 };
 return Object.freeze({
  initialize(){if(!initializing)initializing=Promise.resolve().then(()=>bridge.initialize()).then(context=>{if(context?.protocolVersion!=='1'||!Array.isArray(context.supportedMethods))throw new ExtensionError(failure('UNSUPPORTED'));methods=new Set(context.supportedMethods);ready=true;return context;}).catch(error=>{initializing=undefined;throw error instanceof ExtensionError?error:new ExtensionError(failure('HOST_UNAVAILABLE'));});return initializing;},
  invoke:(id,input,options={})=>call('invoke',[id,input,options],options),
  selectProject:input=>call('selectProject',[input],{cancelValue:null}),
  requestGrant:input=>call('requestGrant',[input],{cancelValue:false}),
  requestSecretInput:input=>call('requestSecretInput',[input]),
  onHostContextChanged(listener){if(typeof listener!=='function')throw new TypeError('Listener required');const subscription=bridge.onHostContextChanged(context=>{if(context.protocolVersion==='1'){methods=new Set(context.supportedMethods);listener(context);}});let disposed=false;return {dispose(){if(!disposed){disposed=true;subscription.dispose();}}};}
 });
}
