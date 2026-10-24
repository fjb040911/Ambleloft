exports.activate = context => {
  async function request(path, call, body, key) {
    const config = await context.configuration.get();
    let url;try { url=new URL(String(config.serviceUrl||'')); } catch {throw Object.assign(Error('Configure service URL'),{code:'INVALID_ARGUMENT'});}
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw Object.assign(Error(context.l10n.t('badAddress')), {code:'INVALID_ARGUMENT'});
    const token=path==='/health'?null:await context.secrets.get('serviceToken');
    if(path!=='/health'&&!token)throw Object.assign(Error('Set test credential in extension page'),{code:'INTERACTION_REQUIRED'});
    const signal = AbortSignal.any([call.signal, AbortSignal.timeout(5000)]);
    let response;
    try {
      response = await fetch(new URL(path, url), {signal, redirect:'error',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json','Idempotency-Key':key}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
    } catch {throw Object.assign(Error(context.l10n.t(body?'unknown':'offline')), {code:body?'OUTCOME_UNKNOWN':'HOST_UNAVAILABLE'});}
    if (!response.ok) throw Object.assign(Error('Service request failed'), {code:response.status===400?'INVALID_ARGUMENT':response.status===401||response.status===403?'FORBIDDEN':response.status===404?'NOT_FOUND':response.status===409?'CONFLICT':body?'OUTCOME_UNKNOWN':'HOST_UNAVAILABLE'});
    try{return await response.json();}catch{throw Object.assign(Error('Invalid response'),{code:body?'OUTCOME_UNKNOWN':'HOST_UNAVAILABLE'});}
  }
  context.operations.register('submitTicket', (input,call) => {
    if (!call.form?.submissionId) throw Object.assign(Error(context.l10n.t('confirm')), {code:'UNSUPPORTED'});
    return request('/tickets', call, input,call.form.submissionId);
  });
  context.operations.register('lookupTicket', (input,call) => request('/submissions/'+encodeURIComponent(input.submissionId),call));
  context.operations.register('getTicket', (input,call) => request('/tickets/'+encodeURIComponent(input.ticketId),call));
  context.operations.register('health', (_,call) => request('/health',call));
  context.operations.register('identity', async (_,call) => {const user=await request('/me',call);const config=await context.configuration.get();return {...user,scope:require('node:crypto').createHash('sha256').update(String(config.serviceUrl)+':'+user.id).digest('hex')};});
  context.operations.register('listTickets', (_,call) => request('/tickets',call));
  context.operations.register('actOnTicket', ({ticketId,operationId,...body},call) => request('/tickets/'+encodeURIComponent(ticketId)+'/actions',call,body,operationId));
};
