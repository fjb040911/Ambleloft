// Real Codex app-server against an isolated localhost Responses fixture. No paid API.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { AgentRuntime } = require('../electron/agent-runtime.cjs');
const { probeProvider } = require('../electron/provider.cjs');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atelier-codex-test-'));
  let mode = 'text'; let requests = []; let toolSent = false;
  const server = http.createServer(async (req, res) => {
    if (!/^\/v[12]\/responses/.test(req.url)) { res.writeHead(404); res.end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    let data; try { data = JSON.parse(body); } catch { res.writeHead(400); res.end(); return; }
    requests.push(data);
    if (mode === 'error') { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Fixture unauthorized', type: 'invalid_request_error' } })); return; }
    if (mode === 'hang') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': waiting\n\n'); return; }
    const itemId = `msg_${requests.length}`;
    let item = { id: itemId, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Ambleloft fixture reply', annotations: [] }] };
    if (mode === 'tool' && !toolSent) {
      const tools = data.tools || [];
      const tool = tools.find(tool => ['shell_command', 'exec_command'].includes(tool.name));
      if (!tool) { console.log('Available fixture tool types:', tools.map(tool => [tool.type, tool.name])); }
      else { toolSent = true; item = { type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: tool.name, arguments: JSON.stringify(tool.name === 'exec_command' ? { cmd: 'pwd', max_output_tokens: 100 } : { command: 'pwd', timeout_ms: 1000 }), status: 'completed' }; }
    }
    if(mode==='plan'&&!toolSent) {
      const planNamespace=(data.tools||[]).find(tool=>tool.type==='namespace'&&tool.tools?.some(t=>t.name==='update_plan'));const planTool=(data.tools||[]).find(tool=>tool.name?.endsWith('update_plan'))||planNamespace?.tools.find(t=>t.name==='update_plan');toolSent=true;
      item={type:'function_call',id:'fc_plan',call_id:'call_plan',name:planTool?.name||'missing_plan_tool',...(planNamespace?{namespace:planNamespace.name}:{}),arguments:JSON.stringify({plan:[{step:'Research',status:'completed'},{step:'Write report',status:'in_progress'}]}),status:'completed'};
    }
    const reasoning = { id: `rs_${requests.length}`, type: 'reasoning', summary: [{ type: 'summary_text', text: 'Fixture summary' }] };
    const outputIndex = mode === 'text' ? 1 : 0;
    const response = { id: `resp_${requests.length}`, object: 'response', model: data.model, status: 'completed', output: mode === 'text' ? [reasoning, item] : [item], usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 } };
    if (!data.stream) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(response)); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    let sequence = 0;
    const event = (type, fields) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...fields })}\n\n`);
    event('response.created', { response: { ...response, status: 'in_progress', output: [] } });
    if (mode === 'slow') await new Promise(resolve=>setTimeout(resolve,95000));
    if (mode === 'text') {
      event('response.output_item.added', { output_index: 0, item: { ...reasoning, summary: [] } });
      event('response.reasoning_summary_part.added', { item_id: reasoning.id, output_index: 0, summary_index: 0, part: { type: 'summary_text', text: '' } });
      event('response.reasoning_summary_text.delta', { item_id: reasoning.id, output_index: 0, summary_index: 0, delta: 'Fixture summary' });
      event('response.output_item.done', { output_index: 0, item: reasoning });
    }
    event('response.output_item.added', { output_index: outputIndex, item: { ...item, status: 'in_progress', ...(item.type === 'message' ? { content: [] } : { arguments: '' }) } });
    if (item.type === 'message') {
      event('response.content_part.added', { output_index: outputIndex, item_id: itemId, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } });
      event('response.output_text.delta', { output_index: outputIndex, item_id: itemId, content_index: 0, delta: 'Ambleloft fixture ' });
      await new Promise(resolve => setTimeout(resolve, 50));
      event('response.output_text.delta', { output_index: outputIndex, item_id: itemId, content_index: 0, delta: 'reply' });
      event('response.output_text.done', { output_index: outputIndex, item_id: itemId, content_index: 0, text: 'Ambleloft fixture reply' });
      event('response.content_part.done', { output_index: outputIndex, item_id: itemId, content_index: 0, part: item.content[0] });
    } else event('response.function_call_arguments.done', { output_index: outputIndex, item_id: item.id, arguments: item.arguments });
    event('response.output_item.done', { output_index: outputIndex, item });
    event('response.completed', { response }); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture-model', executable: '', apiKey: '' };
  const updates = [];
  const runtime = new AgentRuntime({ directory, provider: { secret: async () => config }, workspace: { read: async () => ({ projects: [] }) }, publish: run => updates.push(run) });
  const finished = async id => {
    const until = Date.now() + 45000;
    while (Date.now() < until) {
      const run = runtime.list().find(run => run.id === id);
      if (run && ['completed', 'failed', 'interrupted'].includes(run.status) && !runtime.active) return run;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Fixture timeout: ' + JSON.stringify(runtime.list()));
  };
  try {
    await runtime.init(); await probeProvider(config);
    const first = await runtime.start({ prompt: 'Say hello without tools.' });
    let result = await finished(first.id);
    assert.equal(result.status, 'completed', result.error);
    assert.equal(result.messages.at(-1).text, 'Ambleloft fixture reply');
    assert.ok(result.messages.some(message => message.kind === 'reasoning' && message.text === 'Fixture summary'), 'reasoning delivered through real Codex');
    assert.ok(updates.some(run => run.messages.some(message => message.text === 'Ambleloft fixture ')), 'stream delta observed');
    const firstDuration = result.messages[0].timing.durationMs;
    assert.ok(Number.isFinite(firstDuration) && firstDuration >= 0);
    await runtime.start({ runId: first.id, prompt: 'Continue without tools.' });
    result = await finished(first.id);
    assert.equal(result.status, 'completed', result.error);
    assert.equal(result.messages.filter(message => message.role === 'user').length, 2);
    assert.ok(JSON.stringify(requests.at(-1).input).includes('Say hello'), 'Codex thread history resumed');
    const timings = result.messages.filter(message => message.role === 'user').map(message => message.timing);
    assert.equal(timings[0].durationMs, firstDuration);
    assert.equal(timings[1].outcome, 'completed');
    const saved = JSON.parse(await fs.readFile(path.join(directory, 'conversations.json'), 'utf8'));
    assert.deepEqual(saved.find(run => run.id === first.id).messages.filter(message => message.role === 'user').map(message => message.timing), timings);
    console.log('PASS real Codex: streaming, persisted thread resume and per-turn timing');
    config.model='fixture-model-b';
    await runtime.start({runId:first.id,prompt:'Switch model without tools.',model:config.model});
    result=await finished(first.id);assert.equal(result.status,'completed',result.error);assert.equal(requests.at(-1).model,config.model);assert.ok(JSON.stringify(requests.at(-1).input).includes('Say hello'));
    config.baseUrl=config.baseUrl.replace('/v1','/v2');
    await assert.rejects(runtime.start({runId:first.id,prompt:'Switch service.'}),/确认/);
    await runtime.start({runId:first.id,prompt:'Switch service without tools.',confirmProviderChange:true,permission:'full'});
    result=await finished(first.id);assert.equal(result.status,'completed',result.error);assert.ok(JSON.stringify(requests.at(-1).input).includes('Say hello'));
    console.log('PASS real Codex: model/service switching preserves history; full access policy accepted');
    if(process.env.ATELIER_TEST_SLOW_STREAM==='1'){mode='slow';const slowStart=Date.now();const slow=await runtime.start({prompt:'Delayed stream fixture'});const until=Date.now()+110000;while(runtime.active&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,250));const slowResult=runtime.list().find(run=>run.id===slow.id);assert.equal(slowResult.status,'completed',slowResult.error);assert.ok(Date.now()-slowStart>=95000);console.log('PASS real Codex: first text after 95 seconds remains connected');}
    mode = 'error'; const errorRun = await runtime.start({ prompt: 'Fixture failure' });
    assert.equal((await finished(errorRun.id)).status, 'failed');
    console.log('PASS real Codex: endpoint error propagation');
    mode = 'hang'; const pending = await runtime.start({ prompt: 'Fixture cancellation' });
    const count = requests.length;
    while (requests.length === count) await new Promise(resolve => setTimeout(resolve, 50));
    await runtime.stop(pending.id);
    assert.equal((await finished(pending.id)).status, 'interrupted');
    console.log('PASS real Codex: stop');
    mode = 'tool'; const toolRun = await runtime.start({ prompt: 'Print working directory using a shell tool.' });
    result = await finished(toolRun.id);
    assert.equal(result.status, 'completed', result.error);
    assert.ok(toolSent, 'fixture issued a supported tool');
    assert.ok(result.tools.length > 0, 'actual tool recorded');
    console.log('PASS real Codex: tool execution');
    mode='plan';toolSent=false;const planned=await runtime.start({prompt:'Plan the research and report task.'});result=await finished(planned.id);
    assert.equal(result.status,'completed',result.error);assert.equal(result.plans[0].steps[0].status,'completed');assert.equal(result.plans[0].steps[1].status,'inProgress');
    console.log('PASS real Codex: structured plan event received');
  } finally {
    await runtime.shutdown(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
