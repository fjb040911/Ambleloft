// Host-only OIDC adapter. Token sets must never cross renderer/extension IPC.
const httpsURL=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('AUTH_UNSAFE_ENDPOINT');return u;};
async function discover(connection,{fetchImpl=fetch}={}){
 const client=await import('openid-client');
 httpsURL(connection.issuer);
 const transport=async(url,options)=>{httpsURL(url);const response=await fetchImpl(url,{...options,redirect:'error'});if(response.status>=300&&response.status<400)throw Error('AUTH_REDIRECT_REJECTED');return response;};
 const config=await client.discovery(new URL(connection.issuer),connection.clientId,undefined,client.None(),{[client.customFetch]:transport,timeout:15});
 const metadata=config.serverMetadata();
 if(metadata.issuer!==connection.issuer)throw Error('AUTH_ISSUER_MISMATCH');
 for(const field of ['authorization_endpoint','token_endpoint','jwks_uri'])httpsURL(metadata[field]);
 if(!metadata.response_types_supported?.includes('code'))throw Error('AUTH_CODE_FLOW_UNSUPPORTED');
 client.enableNonRepudiationChecks(config);
 return {client,config,authorization:connection.authorization};
}
function authorizationURL(provider,attempt){
 return provider.client.buildAuthorizationUrl(provider.config,{
  scope:[...new Set(['openid','profile',...(provider.authorization?.scopes||[])])].join(' '),...(provider.authorization?.resource?{resource:provider.authorization.resource}:{}),response_type:'code',redirect_uri:attempt.redirectUri,
  state:attempt.state,nonce:attempt.nonce,code_challenge:attempt.challenge,code_challenge_method:'S256'
 });
}
async function exchange(provider,attempt,callback){
 if(callback.status!=='callback')throw Error('AUTH_LOGIN_INCOMPLETE');
 // Preserve the actual response parameters, including optional issuer, so the
 // protocol library can validate authorization-server identification.
 const url=new URL(attempt.redirectUri);
 url.search=callback.parameters||new URLSearchParams({code:callback.code,state:attempt.state}).toString();
 const tokens=await provider.client.authorizationCodeGrant(provider.config,url,{
  pkceCodeVerifier:attempt.verifier,expectedState:attempt.state,expectedNonce:attempt.nonce,idTokenExpected:true
 },provider.authorization?.resource?{resource:provider.authorization.resource}:undefined);
 const claims=tokens.claims();
 if(!claims||typeof claims.sub!=='string'||!claims.sub)throw Error('AUTH_INVALID_SUBJECT');
 return {identity:{issuer:claims.iss,subject:claims.sub,name:typeof claims.name==='string'?claims.name:claims.sub},tokens};
}
module.exports={discover,authorizationURL,exchange};
