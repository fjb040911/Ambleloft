const {createLoginAttempt}=require('./login-attempt.cjs');
const oidc=require('./oidc.cjs');
// Private coordinator. Caller owns user-gesture validation and secure session
// commit. Completion is never accepted after cancellation or config changes.
class LoginService{
 constructor({readConnection,openBrowser,commit,protocol=oidc,attempt=createLoginAttempt}){
  Object.assign(this,{readConnection,openBrowser,commit,protocol,attempt});this.active=new Map();
 }
 async login(connectionId){
  if(this.active.has(connectionId))throw Error('AUTH_LOGIN_BUSY');
  const operation={cancelled:false};this.active.set(connectionId,operation);
  try{
   const connection=await this.readConnection(connectionId);
   if(!connection)throw Error('AUTH_CONNECTION_NOT_FOUND');
   // A free-form tenant string has no cross-provider claim semantics.
   if(connection.tenant)throw Error('AUTH_TENANT_POLICY_UNSUPPORTED');
   const provider=await this.protocol.discover(connection);
   if(operation.cancelled)throw Error('AUTH_CANCELLED');
   const attempt=operation.attempt=await this.attempt();
   if(operation.cancelled){attempt.cancel();throw Error('AUTH_CANCELLED');}
   await this.openBrowser(this.protocol.authorizationURL(provider,attempt).href);
   const callback=await attempt.result;
   if(operation.cancelled)throw Error('AUTH_CANCELLED');
   const verified=await this.protocol.exchange(provider,attempt,callback);
   const current=await this.readConnection(connectionId);
   if(operation.cancelled)throw Error('AUTH_CANCELLED');
   if(JSON.stringify(current)!==JSON.stringify(connection))throw Error('AUTH_CONNECTION_CHANGED');
   // commit must atomically recheck configuration and persist encrypted secrets.
   return await this.commit({connection,verified});
  }finally{operation.attempt?.cancel();if(this.active.get(connectionId)===operation)this.active.delete(connectionId);}
 }
 cancel(connectionId){const op=this.active.get(connectionId);if(op){op.cancelled=true;op.attempt?.cancel();}}
 close(){for(const id of this.active.keys())this.cancel(id);}
}
module.exports={LoginService};
