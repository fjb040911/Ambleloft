// Keep background, non-streaming requests out of the scripted conversation.
export function replyToModelProbe(request, response, body) {
  if (body.stream === true) return false;
  const content = JSON.stringify({status: 'ok', count: 2});
  const payload = request.url.endsWith('/chat/completions')
    ? {choices: [{message: {role: 'assistant', content}, finish_reason: 'stop'}]}
    : {status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: content}]}]};
  response.writeHead(200, {'Content-Type': 'application/json'});
  response.end(JSON.stringify(payload));
  return true;
}

export function fixtureToolCall(body, name, args, round) {
  const tools = (body.tools || []).flatMap(tool => tool.type === 'namespace'
    ? tool.tools.map(member => ({...member, namespace: tool.name}))
    : [tool.function || tool]);
  const tool = tools.find(item => item.name === name || item.name?.endsWith('__' + name));
  if (!tool) throw new Error('Fixture tool unavailable: ' + name + '. Advertised tools: ' + tools.map(item => item.name).join(', '));
  return {
    type: 'function_call',
    id: 'fc' + round,
    call_id: 'call' + round,
    name: tool.name,
    ...(tool.namespace ? {namespace: tool.namespace} : {}),
    arguments: JSON.stringify(args),
    status: 'completed',
  };
}
