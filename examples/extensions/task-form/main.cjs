exports.activate=context=>{
 context.operations.register('render',async input=>input);
 context.operations.register('save',async input=>{
  const previous=await context.storage.get('last-travel');
  await context.storage.set('last-travel',input,previous?.revision??0);
  return input;
 });
};
