// Only classify failures from the model response path. A caller decides whether
// any output or action has already been committed to its consumer.
const socketCodes = new Set(['UND_ERR_SOCKET','UND_ERR_BODY_TIMEOUT','ECONNRESET','EPIPE','ERR_STREAM_PREMATURE_CLOSE']);
function streamInterruption(error, signal, {model, requestId} = {}) {
  if (signal?.aborted) return null;
  const cause = error?.cause?.code || error?.code;
  if (!socketCodes.has(cause) && !['terminated','INCOMPLETE_STREAM'].includes(error?.message) && cause !== 'INCOMPLETE_STREAM') return null;
  return {
    at:new Date().toISOString(), model,
    causeCode:socketCodes.has(cause) ? cause : 'INCOMPLETE_STREAM',
    ...(typeof requestId==='string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(requestId) ? {requestId} : {}),
  };
}
function streamRecovery() {
  let used = false;
  return {claim(interruption, safe, signal) {
    if (!interruption || !safe || used || signal?.aborted) return false;
    used = true;
    return true;
  }};
}
module.exports = {streamInterruption,streamRecovery};
