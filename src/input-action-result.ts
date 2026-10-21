export interface InputActionError {
 inputValidationError:{code:string;message:string;fields?:Record<string,string>};
}
// Error custom properties do not survive Electron's contextBridge. Keep the
// failure as plain data across both IPC boundaries; throw only in the renderer.
export function unwrapInputResult<T>(result:T|InputActionError):T {
 if(result&&typeof result==='object'&&'inputValidationError' in result){
  const failure=(result as InputActionError).inputValidationError;
  throw Object.assign(new Error(failure.message),failure);
 }
 return result as T;
}
