// Isolated local model fixture. Never loads application profiles or real endpoints.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { CodexRPC, findCodex } = require('../../electron/codex-rpc.cjs');
const { probeVersion } = require('../../electron/engine.cjs');
const { startChatBridge } = require('../../electron/chat-bridge.cjs');
const {createAgentChannel}=require('../../core/extensions/agent-channel.cjs');
const mcpMode=process.argv.includes('--mcp');let channel;
const tools = ['extension_list_operations', 'extension_invoke_operation'].map(name => ({
  type: 'function', name, description: 'Local probe only', inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}));
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amble-extension-engine-'));
  const executable = await findCodex();
  const report = { engine: await probeVersion(executable), platform: process.platform, arch: process.arch, cases: [] };
  let rpc, bridge, stage, round = 0, requests = [], calls = [], completed;
  const server = http.createServer(async (req, res) => {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw); requests.push(body);
      const names = (body.tools || []).flatMap(t => t.type==='namespace'?t.tools.map(f=>f.name):[t.function?.name || t.name]);
      const name = mcpMode?names.find(n=>n.startsWith(tools[round]?.name||'__none__')):tools[round]?.name;
      const call = name && names.includes(name);
      round++;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (stage === 'chat') {
        const delta = call ? { tool_calls: [{ index: 0, id: `call_${round}`, type: 'function', function: { name, arguments: mcpMode&&name?.startsWith('extension_invoke_operation')?JSON.stringify({operationId:'fixture.operation',input:{}}):'{}' } }] } : { content: 'probe complete' };
        res.write('data: ' + JSON.stringify({ choices: [{ index: 0, delta, finish_reason: call ? 'tool_calls' : 'stop' }] }) + '\n\n');
        res.end('data: [DONE]\n\n');
      } else {
        const item = call ? { type: 'function_call', ...(mcpMode?{namespace:'mcp__amble_extensions'}:{}), id: `fc_${round}`, call_id: `call_${round}`, name, arguments: mcpMode&&name?.startsWith('extension_invoke_operation')?JSON.stringify({operationId:'fixture.operation',input:{}}):'{}', status: 'completed' }
          : { type: 'message', id: `msg_${round}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'probe complete', annotations: [] }] };
        const response = { id: `resp_${Date.now()}`, object: 'response', status: 'in_progress', output: [] };
        let sequence_number = 0;
        const emit = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence_number++, ...data })}\n\n`);
        emit('response.created', { response });
        emit('response.output_item.added', { output_index: 0, item });
        emit('response.output_item.done', { output_index: 0, item });
        emit('response.completed', { response: { ...response, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } } }); res.end();
      }
    } catch (error) { res.destroy(error); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  async function verifyNoCredential(directory,credential){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isDirectory())await verifyNoCredential(target,credential);else if(entry.isFile())assert.equal((await fs.readFile(target)).includes(Buffer.from(credential)),false,'MCP credential persisted: '+path.relative(root,target));}}
  async function connect(home, experimentalApi = true, withMcp=mcpMode) {
    if(channel){channel.close();await verifyNoCredential(root,channel.config.http_headers.Authorization.slice(7));}channel=withMcp?await createAgentChannel({list:async()=>{calls.push({mcp:'list'});return 'probe-tool-result';},invoke:async()=>{calls.push({mcp:'invoke'});return 'probe-tool-result';}}):null;
    rpc = new CodexRPC({ executable, config: bridge.config, home, cwd: root, extensionMcp:channel?.config,
      notification: m => { if (m.method === 'turn/completed') completed = m.params.turn; },
      request: m => {
        calls.push({ method: m.method, ...m.params });
        rpc.send({ id: m.id, result: m.method === 'item/tool/call' ? { success: true, contentItems: [{ type: 'inputText', text: 'probe-tool-result' }] } : { decision: 'decline' } });
      }, exit: () => {},
    });
    await rpc.call('initialize', { clientInfo: { name: 'extension_probe', version: '1' }, capabilities: { experimentalApi } });
    rpc.send({ method: 'initialized', params: {} });
  }
  async function turn(threadId, expected) {
    round = 0; requests = []; calls = []; completed = null;
    await rpc.call('turn/start', { threadId, input: [{ type: 'text', text: 'Run the local extension probe.' }] });
    const deadline = Date.now() + 30000;
    while (!completed && Date.now() < deadline) await new Promise(r => setTimeout(r, 25));
    assert.equal(completed?.status, 'completed', JSON.stringify(completed));
    assert.equal(calls.filter(c => mcpMode?c.mcp:c.method === 'item/tool/call').length, expected ? 2 : 0);
    if (expected) {
      if(!mcpMode)assert.deepEqual(calls.map(c => c.tool), tools.map(t => t.name));
      if(!mcpMode)assert.ok(calls.every(c => c.threadId === threadId && c.turnId && c.callId));
      assert.ok(JSON.stringify(requests.at(-1)).includes('probe-tool-result'));
    }
    return { toolNames: (requests[0].tools || []).flatMap(t=>t.type==='namespace'?t.tools.map(f=>f.name):[t.function?.name||t.name]).filter(n => n?.startsWith('extension_')), calls: calls.length, status: completed.status };
  }
  try {
    for (stage of ['responses', 'chat']) {
      const home = path.join(root, stage); await fs.mkdir(home);
      bridge = await startChatBridge({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture', protocol: stage, apiKey: '' }, `probe_${stage}`, stage === 'responses');
      const params = { model: 'fixture', modelProvider: 'atelier', cwd: root, sandbox: 'read-only', approvalPolicy: 'never' };
      if(mcpMode){
        await connect(home,true,false);const old=await rpc.call('thread/start',params);await turn(old.thread.id,false);rpc.close();
        await connect(home);await rpc.call('thread/resume',{...params,threadId:old.thread.id});report.cases.push({protocol:stage,path:'old-thread-mcp',...await turn(old.thread.id,true)});rpc.close();
        await connect(home);const fresh=await rpc.call('thread/start',params);report.cases.push({protocol:stage,path:'new-mcp',...await turn(fresh.thread.id,true)});rpc.close();
        await connect(home);await rpc.call('thread/resume',{...params,threadId:fresh.thread.id});report.cases.push({protocol:stage,path:'resume-mcp',...await turn(fresh.thread.id,true)});rpc.close();channel.close();await verifyNoCredential(root,channel.config.http_headers.Authorization.slice(7));bridge.close();continue;
      }
      await connect(home, false);
      await assert.rejects(rpc.call('thread/start', { ...params, dynamicTools: tools }), /experimental/i);
      report.cases.push({ protocol: stage, path: 'experimental-disabled', rejected: true }); rpc.close();
      await connect(home);
      const fresh = await rpc.call('thread/start', { ...params, dynamicTools: tools });
      report.cases.push({ protocol: stage, path: 'new', ...await turn(fresh.thread.id, true) }); rpc.close();
      await connect(home);
      await rpc.call('thread/resume', { ...params, threadId: fresh.thread.id });
      report.cases.push({ protocol: stage, path: 'resume-after-process-restart', ...await turn(fresh.thread.id, true) });
      const old = await rpc.call('thread/start', params); await turn(old.thread.id, false); rpc.close();
      await connect(home);
      // Deliberately try the undocumented field; report actual behavior rather than assuming it is rejected.
      await rpc.call('thread/resume', { ...params, threadId: old.thread.id, dynamicTools: tools });
      report.cases.push({ protocol: stage, path: 'old-thread-resume-with-extra-field', ...await turn(old.thread.id, false) });
      rpc.close(); bridge.close();
    }
    report.route = mcpMode?'Unified per-execution MCP verified for new, resumed and old threads.':'New threads and persisted dynamic tools work; old threads require reviewed internal MCP adapter.';
    console.log(JSON.stringify(report, null, 2));
  } finally { rpc?.close(); channel?.close(); bridge?.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
