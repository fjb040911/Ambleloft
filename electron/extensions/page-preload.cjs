const {contextBridge,ipcRenderer}=require('electron');
if(process.isMainFrame){
 let sequence=0;const invocations=new Map();
 const request=(method,params={})=>ipcRenderer.invoke('extension-page:rpc',{protocolVersion:'1',id:String(++sequence),method,params});
 const invoke=(operationId,input,key)=>{const id=String(++sequence);invocations.set(key,id);return ipcRenderer.invoke('extension-page:rpc',{protocolVersion:'1',id,method:'invoke',params:{operationId,input}}).finally(()=>invocations.delete(key));};
 contextBridge.exposeInMainWorld('__ambleExtensionBridge',{
  initialize:async()=>{const result=await request('initialize');if(!result.ok)throw Error(result.error.code);return result.value;},
  invoke,cancel:key=>{const id=invocations.get(key);if(id)ipcRenderer.send('extension-page:cancel',{id});},
  selectProject:input=>request('selectProject',input),requestGrant:input=>request('requestGrant',input),requestSecretInput:input=>request('requestSecretInput',input),
  onHostContextChanged:listener=>{const handler=(_event,context)=>listener(context);ipcRenderer.on('extension-page:context',handler);return {dispose:()=>ipcRenderer.removeListener('extension-page:context',handler)};}
 });
 // AbortSignal is a main-world EventTarget and cannot cross contextBridge intact.
 // Only the random cancellation key crosses the isolated-world boundary.
 contextBridge.executeInMainWorld({func:()=>{
  const bridge=window.__ambleExtensionBridge;
  const api={initialize:bridge.initialize,selectProject:bridge.selectProject,requestGrant:bridge.requestGrant,requestSecretInput:bridge.requestSecretInput,onHostContextChanged:bridge.onHostContextChanged,
   invoke(operationId,input,options={}){const key=crypto.randomUUID(),signal=options.signal;
    if(signal?.aborted)return Promise.resolve({ok:false,error:{code:'CANCELLED',message:'CANCELLED',requestId:key,effectStatus:'notStarted'}});
    const cancel=()=>bridge.cancel(key);const promise=bridge.invoke(operationId,input,key);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();return promise.finally(()=>signal?.removeEventListener('abort',cancel));
   }};
  Object.defineProperty(window,'ambleExtension',{value:Object.freeze(api),writable:false,configurable:false});
 }});
}
