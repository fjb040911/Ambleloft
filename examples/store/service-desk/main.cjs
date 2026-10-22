exports.activate = context => {
  async function request(path, call, body) {
    const config = await context.configuration.get();
    const url = new URL(String(config.serviceUrl || ''));
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw Object.assign(Error(context.l10n.t('badAddress')), {code:'INVALID_ARGUMENT'});
    const signal = AbortSignal.any([call.signal, AbortSignal.timeout(5000)]);
    let response;
    try {
      response = await fetch(new URL(path, url), {signal, redirect:'error', ...(body ? {
        method:'POST', headers:{'content-type':'application/json','Idempotency-Key':call.form.submissionId}, body:JSON.stringify(body)
      } : {})});
    } catch {
      throw Object.assign(Error(body ? context.l10n.t('unknown') : context.l10n.t('offline')), {code:body?'OUTCOME_UNKNOWN':'HOST_UNAVAILABLE'});
    }
    if (!response.ok) throw Object.assign(Error(context.l10n.t('serverError',{status:response.status})), {code:response.status===400?'INVALID_ARGUMENT':body?'OUTCOME_UNKNOWN':'HOST_UNAVAILABLE'});
    return response.json();
  }
  context.operations.register('submitTicket', (input,call) => {
    if (!call.form?.submissionId) throw Object.assign(Error(context.l10n.t('confirm')), {code:'UNSUPPORTED'});
    return request('/tickets', call, input);
  });
  context.operations.register('lookupTicket', (input,call) => request('/submissions/'+encodeURIComponent(input.submissionId),call));
  context.operations.register('getTicket', (input,call) => request('/tickets/'+encodeURIComponent(input.ticketId),call));
  context.operations.register('health', (_,call) => request('/health',call));
};
