const {test}=require('node:test');const assert=require('node:assert/strict');
const {discover,authorizationURL,exchange}=require('../core/auth/oidc.cjs');
test('OIDC verifies signed identity and rejects tampered token, nonce and audience',async()=>{
 const {generateKeyPair,exportJWK,SignJWT}=await import('jose');
 const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='key';
 const issuer='https://identity.example.test';let mode='valid';
 const metadata={issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256']};
 const provider=await discover({issuer,clientId:'desktop'},{fetchImpl:async(url,options)=>{
  assert.equal(options.redirect,'error');
  if(String(url).endsWith('/jwks'))return Response.json({keys:[jwk]});
  if(String(url).endsWith('/token')){
   assert.equal(new URLSearchParams(options.body).get('code_verifier'),'verifier');
   let token=await new SignJWT({nonce:mode==='nonce'?'other':'nonce',name:'Test User'}).setProtectedHeader({alg:'RS256',kid:'key'}).setIssuer(issuer).setSubject('subject').setAudience(mode==='audience'?'other':'desktop').setIssuedAt().setExpirationTime('5m').sign(privateKey);
   if(mode==='signature'){const parts=token.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);token=parts.join('.');}
   return Response.json({access_token:'private',token_type:'Bearer',id_token:token});
  }
  return Response.json(metadata);
 }});
 const attempt={redirectUri:'http://127.0.0.1:12345/callback',state:'state',nonce:'nonce',verifier:'verifier',challenge:'challenge'};
 assert.equal(authorizationURL(provider,attempt).searchParams.get('code_challenge_method'),'S256');
 assert.equal((await exchange(provider,attempt,{status:'callback',code:'code'})).identity.subject,'subject');
 for(mode of ['nonce','audience','signature'])await assert.rejects(exchange(provider,attempt,{status:'callback',code:'code'}));
});
test('OIDC rejects insecure configured issuer before making requests',async()=>{
 let calls=0;await assert.rejects(discover({issuer:'http://example.test',clientId:'desktop'},{fetchImpl:()=>{calls++;}}),/UNSAFE/);assert.equal(calls,0);
});
