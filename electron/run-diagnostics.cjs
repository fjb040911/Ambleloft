const {safeName} = require('./tool-loop-guard.cjs');

function toolCatalog(tools, fingerprint, namespace) {
  return (tools || []).flatMap(tool => tool.type === 'namespace' ? toolCatalog(tool.tools, fingerprint, tool.name) : [{
    name: safeName(tool.name), ...(namespace ? {namespace: safeName(namespace)} : {}),
    type: safeName(tool.type), schemaType: safeName(tool.parameters?.type),
    schemaFingerprint: fingerprint(tool.parameters || {}),
    parameters: Object.entries(tool.parameters?.properties || {}).slice(0, 80).map(([name, schema]) => ({name: safeName(name), type: safeName(schema?.type), required: tool.parameters?.required?.includes(name) === true})),
  }]).slice(0, 256);
}
function callDiagnostic(name, mappedName, args, fingerprint, attempt = 0) {
  let parsed; try { parsed = JSON.parse(args); } catch {}
  return {returnedName: safeName(name), mappedName: mappedName ? safeName(mappedName) : null, attempt,
    argumentFingerprint: fingerprint(parsed ?? args), argumentBytes: Buffer.byteLength(args || ''),
    argumentKeys: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).slice(0, 80).map(safeName) : []};
}

// Explicit allowlist: never spread a run or a diagnostic into an export. Old
// records may contain error text, URLs, prompts or provider credentials.
function diagnosticReport(run, appVersion) {
  const pick = (value, keys) => Object.fromEntries(keys.filter(k => ['string', 'number', 'boolean'].includes(typeof value?.[k])).map(k => [k, typeof value[k] === 'string' ? value[k].slice(0, 200) : value[k]]));
  return {
    format: 'ambleloft-run-diagnostics', version: 1, exportedAt: new Date().toISOString(), appVersion,
    runId: run.id, threadId: run.threadId, model: run.model, status: run.status,
    coverage: 'Most recent 100 model requests. Tool metadata is available only for requests recorded after this feature was installed. No prompts, reasoning, commands, argument values, output text, URLs or credentials are exported.',
    requests: (run.modelRequests || []).slice(-100).map(d => ({
      ...pick(d, ['requestId', 'threadId', 'parentThreadId', 'turnKey', 'startedAt', 'durationMs', 'protocol', 'stage', 'httpStatus', 'events', 'done', 'finishReason', 'failed', 'cancelled', 'requestBytes', 'messageCount', 'toolCorrectionAttempts', 'diagnosticVersion', 'toolChoice']),
      ...(d.loopGuard ? {loopGuard: pick(d.loopGuard, ['action', 'kind', 'count', 'warningAt', 'pauseAt'])} : {}),
      ...(d.usage ? {usage: pick(d.usage, ['input_tokens', 'output_tokens', 'total_tokens'])} : {}),
      tools: (d.tools || []).slice(0, 256).map(t => ({...pick(t, ['name', 'namespace', 'type', 'schemaType', 'schemaFingerprint']), parameters: (t.parameters || []).slice(0, 80).map(p => pick(p, ['name', 'type', 'required']))})),
      calls: (d.calls || []).slice(0, 64).map(c => ({...pick(c, ['returnedName', 'mappedName', 'argumentFingerprint', 'argumentBytes', 'attempt']), argumentKeys: (c.argumentKeys || []).slice(0, 80).map(safeName)})),
      observations: (d.observations || []).slice(0, 32).map(o => pick(o, ['tool', 'signature', 'resultFingerprint', 'polling', 'noop'])),
    })),
  };
}
// A read-only tap: transport bytes are forwarded unchanged. Malformed or huge
// frames cannot break an otherwise working Responses connection.
function responseObserver(diagnostic, fingerprint) {
  const decoder = new TextDecoder(); let buffer = '', dropping = false;
  const seen = new Set();
  function item(value) {
    if (seen.size >= 64 || !['function_call', 'custom_tool_call'].includes(value?.type) || seen.has(value.call_id || value.id)) return;
    seen.add(value.call_id || value.id);
    diagnostic.calls ||= [];
    if (diagnostic.calls.length < 64) diagnostic.calls.push(callDiagnostic(value.name, value.name, value.arguments || JSON.stringify({input: value.input}), fingerprint));
  }
  return chunk => {
    buffer += decoder.decode(chunk, {stream: true}); buffer = buffer.replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      if (dropping) { dropping = false; continue; }
      try {
        const raw = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
        if (!raw || raw === '[DONE]') continue;
        const event = JSON.parse(raw); diagnostic.events++;
        if (event.type === 'response.output_item.done') item(event.item);
        if (['response.completed', 'response.incomplete', 'response.failed'].includes(event.type)) {
          diagnostic.done = true; diagnostic.finishReason = event.response?.status;
          const usage=event.response?.usage;
          if(usage)diagnostic.usage=Object.fromEntries(['input_tokens','output_tokens','total_tokens'].filter(k=>Number.isFinite(usage[k])).map(k=>[k,usage[k]]));
          for (const value of event.response?.output || []) item(value);
        }
      } catch { /* Metadata is best-effort; never log the raw frame. */ }
    }
    if (buffer.length > 1024 * 1024) { buffer = ''; dropping = true; diagnostic.metadataTruncated = true; }
  };
}
module.exports = {toolCatalog, callDiagnostic, diagnosticReport, responseObserver};
