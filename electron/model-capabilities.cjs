const IMAGE_INPUT_VALUES=['unknown','supported','unsupported'];
function normalizeModelImageInputs(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>100)throw new Error('模型图片能力设置无效');
  const result={};
  for(const [model,capability] of Object.entries(value)){
    if(!model.trim()||model.length>200||/[\r\n\x00]/.test(model)||!IMAGE_INPUT_VALUES.includes(capability))throw new Error('模型图片能力设置无效');
    Object.defineProperty(result,model,{value:capability,enumerable:true});
  }
  return result;
}
function imageInputCapability(config){return config.modelImageInputs?.[config.model]||'unknown';}
function imageInputNotice(config){return imageInputCapability(config)==='unsupported'
  ?'当前模型不支持图片，无法查看此图片。可提取文字或使用已配置的视觉模型；尚未完成视觉检查。'
  :'当前模型的图片输入能力未配置，未发送此图片。请在模型设置中配置图片输入能力；尚未完成视觉检查。';}
function imageInputInstructions(config){return imageInputCapability(config)==='supported'?'':
  '\nImage input is '+(imageInputCapability(config)==='unsupported'?'unsupported':'not configured')+' for the current model. Do not call view_image or request image inputs. You may generate image or presentation files and inspect their source or extract text with tools, but do not claim to have seen images or verified visual layout. Clearly report visual checks as incomplete. If visual inspection is essential, ask the user to configure a vision-capable model. OCR does not verify visual layout.\n';}
function applyImageInputPolicy(data,config){
  if(imageInputCapability(config)==='supported')return data;
  const notice=imageInputNotice(config);
  const content=parts=>Array.isArray(parts)?parts.map(part=>part.type==='input_image'?{type:'input_text',text:notice}:part):parts;
  const tools=list=>(list||[]).flatMap(tool=>{
    if(tool.type==='namespace'){const children=tools(tool.tools);return children.length?[{...tool,tools:children}]:[];}
    return tool.name==='view_image'?[]:[tool];
  });
  return {...data,...(data.tools?{tools:tools(data.tools)}:{}),input:Array.isArray(data.input)?data.input.map(item=>{
    if(['function_call_output','custom_tool_call_output'].includes(item.type))return {...item,output:content(item.output)};
    return {...item,...(Array.isArray(item.content)?{content:content(item.content)}:{})};
  }):data.input};
}
module.exports={normalizeModelImageInputs,imageInputCapability,imageInputNotice,imageInputInstructions,applyImageInputPolicy};
