import {defineExtension} from '@ambleloft/extension-sdk';

// Register synchronously. Resource access is bound to this exact invocation.
export const {activate}=defineExtension({
 activate(context){
  context.subscriptions.push(context.operations.register('describeProject',async(input,invocation)=>{
   const project=await invocation.resources.getProject(input.projectId as string);
   return {...project};
  }));
 }
});
