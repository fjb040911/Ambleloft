const {createHmac, randomBytes} = require('node:crypto');

const WARNING_AT = 6;
const PAUSE_AT = 12;
const PAUSE_MESSAGE = '检测到重复调用且没有有效进展，任务已暂停。请核实已执行的操作后再继续，或导出诊断数据。';
const REMINDER = 'The host detected repeated tool calls with unchanged results or consecutive no-op shell commands. Stop repeating them. Use the actual advertised polling tool for an existing running session; echo/true does not poll a session. Change strategy based on the results. If you cannot proceed, explain the limitation and end this turn. Do not invent tool names.';
const safeName = value => typeof value === 'string' && /^[\w.-]{1,160}$/.test(value) ? value : '[unavailable]';
const stable = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
function outputText(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return output.map(p => p.text ?? stable(p)).join('\n');
  return stable(output) || '';
}
function normalizedOutput(output) {
  const text = outputText(output), boundary = text.indexOf('Output:\n');
  if (boundary < 0) return text.trim();
  return (text.slice(0, boundary).replace(/^(?:Chunk ID:.*|Wall time:.*|Original token count:.*)\r?\n/gm, '') + text.slice(boundary)).trim();
}
function literalNoop(name, args, output) {
  if (name !== 'exec_command' || !/Process exited with code 0\b/.test(output)) return false;
  const cmd = typeof args.cmd === 'string' ? args.cmd.trim() : '';
  // Deliberately narrow: never classify substitutions, redirects, compound
  // commands, newlines or scripts as no-ops merely because they contain echo.
  return /^(?:true|:)$/.test(cmd) || /^(?:echo|printf)\s+[\p{L}\p{N}\s_'".,:!?=+%/()\-]+$/u.test(cmd) && !/[\r\n]/.test(cmd);
}
function runningPoll(name, args, output) {
  if (name === 'write_stdin') return !args.chars && /Process running with session ID\s+\S+/.test(output);
  if (name === 'wait') return /"timed_out"\s*:\s*true|"status"\s*:\s*\{\s*\}/.test(output);
  return false;
}

// One instance per runtime turn. Thread-scoped state also separates native
// subagents. Fingerprints use an ephemeral key that is never persisted/exported.
class ToolLoopGuard {
  constructor() { this.key = randomBytes(32); this.threads = new Map(); }
  fingerprint(value) { return createHmac('sha256', this.key).update(typeof value === 'string' ? value : stable(value) || '').digest('hex'); }
  inspect(data, thread = 'root') {
    const input = Array.isArray(data.input) ? data.input : [];
    const user = input.findLast(item => item.role === 'user');
    const userKey = user ? this.fingerprint(user) : null;
    let state = this.threads.get(thread);
    if (!state) {
      state = {seen: new Set(input.filter(i => /^(function_call|custom_tool_call)_output$/.test(i.type)).map(i => i.call_id)), recent: [], userKey, observed: 0};
      this.threads.set(thread, state);
      // Guard memory stays bounded even when many short-lived agents are used.
      if (this.threads.size > 128) this.threads.delete(this.threads.keys().next().value);
      return {observations: []};
    }
    if (userKey && userKey !== state.userKey) {
      state.recent = []; state.userKey = userKey; delete state.warningObserved;
      // A steered user instruction starts a new attempt, including when the
      // preceding tool result and instruction arrive in the same request.
      for (const item of input.slice(0, input.lastIndexOf(user))) if (/^(function_call|custom_tool_call)_output$/.test(item.type)) state.seen.add(item.call_id);
    }
    const calls = new Map(input.filter(i => ['function_call', 'custom_tool_call'].includes(i.type)).map(i => [i.call_id, i]));
    const observations = [];
    for (const item of input) {
      if (!['function_call_output', 'custom_tool_call_output'].includes(item.type) || state.seen.has(item.call_id)) continue;
      state.seen.add(item.call_id);
      state.observed++;
      const call = calls.get(item.call_id);
      if (!call) { state.recent = []; continue; }
      let args; try { args = JSON.parse(call.arguments || '{}'); } catch { args = {}; }
      if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
      const output = normalizedOutput(item.output);
      const native = !call.namespace || call.namespace === 'functions';
      const polling = native && runningPoll(call.name, args, output);
      const noop = native && literalNoop(call.name, args, output);
      const signature = this.fingerprint([call.namespace, call.name, call.input ?? args, output]);
      observations.push({tool: safeName(call.name), signature, resultFingerprint: this.fingerprint(output), polling, noop});
      const runningCommand = native && ['exec_command', 'write_stdin'].includes(call.name) && /^Process running with session ID\s+\S+/m.test(output);
      if (polling || runningCommand) state.recent = [];
      else { state.recent.push({signature, noop}); state.recent = state.recent.slice(-PAUSE_AT); }
    }
    // Retain only ids still in the engine's current history (compaction safe).
    state.seen = new Set(input.filter(i => /^(function_call|custom_tool_call)_output$/.test(i.type)).map(i => i.call_id));
    const recent = state.recent;
    let count = 0, kind = 'repeated_result';
    for (let i = recent.length - 1; i >= 0 && recent[i].noop; i--) count++;
    if (count) kind = 'no_op_commands';
    for (let period = 1; period <= 3; period++) {
      let n = period;
      while (n < recent.length && recent[recent.length - 1 - n].signature === recent[recent.length - 1 - (n % period)].signature) n++;
      if (n >= period * 3 && n > count) { count = n; kind = 'repeated_result'; }
    }
    let action;
    if (count >= WARNING_AT) {
      // Even a large parallel batch gets a correction opportunity before pause.
      action = count >= PAUSE_AT && state.warningObserved !== undefined && state.observed > state.warningObserved ? 'pause' : 'warn';
      state.warningObserved ??= state.observed;
    } else delete state.warningObserved;
    return {observations: observations.slice(-32), ...(action ? {loopGuard: {action, kind, count, warningAt: WARNING_AT, pauseAt: PAUSE_AT}} : {})};
  }
}
module.exports = {ToolLoopGuard, safeName, PAUSE_MESSAGE, REMINDER, WARNING_AT, PAUSE_AT};
