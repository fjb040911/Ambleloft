const codes=new Set(['INVALID_ARGUMENT','FORBIDDEN','NOT_FOUND','CONFLICT','QUOTA_EXCEEDED','UNSUPPORTED','HOST_UNAVAILABLE','BUSY','CANCELLED','TIMEOUT','INTERNAL','DISABLED','UNTRUSTED','STORAGE_UNAVAILABLE','INVALID_OUTPUT','OUTCOME_UNKNOWN','GRANT_REQUIRED','INTERACTION_REQUIRED','ACTIVATION_FAILED']);
const failure=(code,message=code)=>Object.assign(new Error(message),{code:codes.has(code)?code:'INTERNAL'});
function publicCode(error){try{const code=error?.code;return typeof code==='string'&&codes.has(code)?code:'INTERNAL';}catch{return 'INTERNAL';}}
module.exports={failure,publicCode};
