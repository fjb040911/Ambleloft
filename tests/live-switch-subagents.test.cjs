const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { AgentRuntime } = require('../electron/agent-runtime.cjs');
const { Database } = require('../electron/database.cjs');
const { findCodex } = require('../electron/engine.cjs');
const { createStore } = require('../electron/store.cjs');
const { ChatInputs } = require('../core/forms/chat-inputs.cjs');
const { SpaceService } = require('../core/workforce/spaces.cjs');

const objective = 'Review the project using three independent workers.';
const supplement = 'Include the measurements from sample Q17 in the review.';
const queuedSupplement = 'Also report the units for sample Q18.';

async function until(check, description) {
  const deadline = Date.now() + 12000;
  do {
    if (await check()) return;
    await delay(20);
  } while (Date.now() < deadline);
  assert.fail('Timed out waiting for ' + description);
}

function sendItem(res, item) {
  const response = { id: 'r-' + randomUUID(), object: 'response', status: 'in_progress', output: [] };
  let sequence = 0;
  function send(type, fields) {
    res.write('event: ' + type + '\ndata: ' + JSON.stringify({ type, sequence_number: sequence++, ...fields }) + '\n\n');
  }
  send('response.created', { response });
  send('response.output_item.added', { output_index: 0, item });
  send('response.output_item.done', { output_index: 0, item });
  send('response.completed', { response: { ...response, output: [item], status: 'completed', usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } } });
  res.end();
}

function sendText(res, text) {
  sendItem(res, { type: 'message', id: randomUUID(), role: 'assistant', content: [{ type: 'output_text', text }], status: 'completed' });
}

// Hold two child responses open across the switch. The third child returns its
// final answer before the switch. The engine itself creates and owns all threads.
async function localModel() {
  let spawned = 0;
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const messages = body.input.filter(item => item.role === 'user');
    const userText = JSON.stringify(messages);
    const worker = /Worker assignment ([123])/.exec(userText)?.[1] || 'parent';
    requests.push({ worker, model: body.model, userText, res });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(': connected\n\n');
    if (worker === '3') return sendText(res, 'Archived result from worker 3');
    if (worker !== 'parent' || spawned === 3) return;
    const tools = body.tools.flatMap(tool => tool.type === 'namespace'
      ? tool.tools.map(member => ({ ...member, namespace: tool.name })) : [tool]);
    const spawn = tools.find(tool => tool.name === 'spawn_agent');
    const number = ++spawned;
    sendItem(res, {
      type: 'function_call', id: randomUUID(), call_id: randomUUID(), name: spawn.name, namespace: spawn.namespace,
      arguments: JSON.stringify({ message: 'Task: Worker assignment ' + number }), status: 'completed',
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { requests, baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1', async close() {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  } };
}

async function verifySwitch(t, surface, setting) {
  let executable;
  try { executable = await findCodex(); }
  catch (error) {
    if (process.env.CI) throw error;
    return t.skip('Run npm run engine:prepare to run the bundled-engine regression');
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'amble-live-switch-'));
  const projectPath = path.join(directory, 'project');
  await fs.mkdir(projectPath);
  const database = new Database(directory);
  const endpoint = await localModel();
  const workspace = createStore(directory, database);
  const provider = { secret: async (id = 'local', model = 'old') => ({ id, model, baseUrl: endpoint.baseUrl, protocol: 'responses', executable }) };
  const runtime = new AgentRuntime({ directory, database, workspace, provider, publish() {},
    conversationOptions: { infer: async () => ({ action: 'execute', reply: 'Proceed with the review.' }) } });
  const inputs = new ChatInputs({ database, runtime, publish() {} });
  runtime.chatInputs = inputs;
  let spaces;
  t.after(async () => {
    try {
      await spaces?.shutdown();
      await runtime.shutdown();
    } finally {
      await inputs.shutdown();
      await endpoint.close();
      await database.close();
      await fs.rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
    }
  });
  await runtime.init();
  await inputs.initialize();
  const discussion = surface === 'discussion';
  const requestId = randomUUID();
  if (discussion) {
    const expert = { id: 'reviewer', name: 'Reviewer', responsibilities: 'Review the project', skills: [] };
    const workforce = { read: async () => ({ employees: [expert] }), prepare: async () => expert, providers: provider };
    runtime.workforce = workforce;
    spaces = new SpaceService({ directory, database, workspace, workforce, runtime });
    runtime.spaces = spaces;
    await spaces.initialize();
    const space = await spaces.save({ value: { name: 'Review', purpose: objective, projectIds: [], members: [{ employeeId: expert.id, assignment: objective, projectIds: [] }] } });
    spaces.generateDiscussionHost = async () => ({ action: 'delegate', message: 'Ask the reviewer.', brief: { goal: objective, items: [] },
      questions: [], delegates: [{ employeeId: expert.id, instruction: objective, reason: 'Collect independent measurements.' }] });
    spaces.generateDiscussionConversation = async () => ({ action: 'update', message: 'Forward the new requirement.', targets: [expert.id] });
    await spaces.coordinateDiscussion({ spaceId: space.id, clientRequestId: requestId, prompt: objective, providerId: 'local', model: 'old' });
  } else {
    const project = { id: 'project', name: 'Review', path: projectPath, createdAt: new Date().toISOString() };
    await workspace.patch({ changes: [{ kind: 'project', action: 'put', id: project.id, value: project, expectedRevision: null }] });
    await runtime.start({ projectId: 'project', providerId: 'local', model: 'old', prompt: objective }, { userAuthored: true });
  }

  await until(() => runtime.active?.nativeThreads?.size === 3 &&
    [...runtime.active.nativeThreads.values()].filter(child => child.status === 'completed').length === 1 &&
    ['1', '2', 'parent'].every(worker => endpoint.requests.some(req => req.worker === worker && !req.res.destroyed && !req.res.writableEnded)),
  'two active child requests and one completed child');
  const context = runtime.active;
  const run = context.run;
  const parentId = run.threadId;
  const childIds = [...context.nativeThreads.keys()];
  const finished = [...context.nativeThreads.values()].find(child => child.status === 'completed');
  assert.equal(finished.detail, 'Archived result from worker 3');
  const beforeHistory = structuredClone(finished.nativeLifecycle);
  function submit(text) {
    if (discussion) return spaces.followupDiscussion({ requestId, clientRequestId: randomUUID(), prompt: text });
    return inputs.append({ runId: run.id, clientMutationId: randomUUID(), text });
  }
  await submit(supplement);
  await until(() => run.conversation?.updates.some(update => update.state === 'delivered'), 'supplement delivery to the original turn');
  const update = run.conversation.updates.at(-1);
  const firstNewRequest = endpoint.requests.length;

  const changingModel = setting === 'model';
  const selection = changingModel ? { providerId: 'local', model: 'new' } : { permission: 'full', confirmed: true };
  const changeKey = changingModel ? 'modelChange' : 'permissionChange';
  // Pause just one real RPC at the archive boundary so that a second user
  // message arrives during the transition regardless of machine speed.
  const archived = Promise.withResolvers();
  const release = Promise.withResolvers();
  const oldRpc = context.rpc;
  const call = oldRpc.call.bind(oldRpc);
  oldRpc.call = async (method, ...args) => {
    if (method === 'thread/archive') {
      archived.resolve();
      await release.promise;
    }
    return call(method, ...args);
  };
  const switching = discussion
    ? spaces[changingModel ? 'changeDiscussionModel' : 'changeDiscussionPermission']({ requestId, ...selection })
    : runtime[changingModel ? 'switchModel' : 'switchPermission']({ runId: run.id, ...selection });
  let queued;
  try {
    await Promise.race([archived.promise, switching.then(() => assert.fail('Switch ended before pausing child threads'))]);
    assert.equal(run[changeKey].state, 'switching');
    await submit(queuedSupplement);
    await until(async () => {
      queued = (await inputs.snapshot(run.id)).deliveries.find(item => item.text === queuedSupplement);
      return queued?.state === 'queued';
    }, 'supplement queued during switch');
  } finally {
    release.resolve();
    await switching;
    oldRpc.call = call;
  }
  if (discussion) {
    const { requests } = await switching;
    assert.equal(requests.length, 1);
    const [round] = requests;
    assert.equal(round.id, requestId);
    assert.deepEqual(round.participants.map(p => p.runId), [run.id]);
    assert.equal(round[changeKey].state, 'applied', round[changeKey].error);
    assert.deepEqual(round.followups.map(f => f.text), [supplement, queuedSupplement]);
    assert.deepEqual(round.followups.map(f => f.deliveries[0].id), [update.inputId, queued.id]);
  }
  assert.equal(run[changeKey].state, 'applied', run[changeKey].error);
  assert.deepEqual(run[changeKey].effective, changingModel ? selection : 'full');
  assert.equal(run.threadId, parentId);
  assert.deepEqual([...context.nativeThreads.keys()], childIds);
  const expectedModel = changingModel ? 'new' : 'old';
  for (const threadId of [parentId, ...childIds]) {
    const actual = await context.rpc.call('thread/resume', { threadId, excludeTurns: true });
    assert.equal(actual.thread.id, threadId);
    assert.equal(actual.model, expectedModel);
    assert.equal(actual.sandbox.type, changingModel ? 'readOnly' : 'dangerFullAccess');
    assert.equal(actual.approvalPolicy, changingModel ? 'on-request' : 'never');
  }
  const resumed = () => endpoint.requests.slice(firstNewRequest).filter(req => req.userText.includes(supplement));
  await until(() => ['parent', '1', '2'].every(worker => resumed().some(req => req.worker === worker)), 'resumed requests containing the supplement');
  for (const worker of ['1', '2']) {
    const matches = resumed().filter(req => req.worker === worker);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].model, expectedModel);
    sendText(matches[0].res, 'Finished resumed worker ' + worker);
  }
  await until(() => [...context.nativeThreads.values()].every(child => child.status === 'completed'), 'resumed child results');
  assert.deepEqual([...context.nativeThreads.values()].map(child => child.detail).sort(),
    ['Archived result from worker 3', 'Finished resumed worker 1', 'Finished resumed worker 2']);
  assert.deepEqual(finished.nativeLifecycle, beforeHistory);
  assert.equal(endpoint.requests.filter(req => req.worker === '3').length, 1);
  await until(async () => (await inputs.get(queued.id)).state === 'delivered', 'queued supplement delivered after switch');
  const delivery = await inputs.get(queued.id);
  assert.equal(delivery.target.threadId, parentId);
  assert.equal(delivery.target.turnId, run.turnId);
  assert.equal((await inputs.get(update.inputId)).state, 'delivered');
  assert.deepEqual(run.messages.filter(m => m.inputDeliveryState === 'delivered' && [supplement, queuedSupplement].includes(m.text)).map(m => m.text),
    [supplement, queuedSupplement]);
  assert.deepEqual(run.conversation.updates.map(u => [u.inputId, u.version, u.state]),
    [[update.inputId, 1, 'delivered'], [queued.id, 2, 'delivered']]);
}

for (const surface of ['project chat', 'discussion']) {
  for (const setting of ['permission', 'model']) {
    test(surface + ' live ' + setting + ' switch preserves native workers and supplemental input',
      { timeout: 45000 }, t => verifySwitch(t, surface, setting));
  }
}
