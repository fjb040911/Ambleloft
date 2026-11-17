/** Profile-local host API. Deliberately not exposed through renderer IPC in P1.
 * Domain/sharing mutations are user-authorized host commands, never model tools.
 */
class ContinuityService {
 constructor({database}){this.database=database;}
 call(action,input={}){return this.database.call('continuity',{...input,action});}
 initialize(){return this.call('status');}
 putObject(input){return this.call('putObject',input);}
 listDomains(){return this.call('listDomains');}
 resolveDomains(query){return this.call('resolveDomains',{query});}
 search(context,query='',options={}){return this.call('search',{context,query,currentOnly:options.currentOnly!==false,ranked:options.ranked===true});}
 growth(operation,input={}){return this.call('growth',{...input,operation});}
 searchUnderstandings(context,query='',options={}){return this.call('searchUnderstandings',{context,query,ranked:options.ranked===true});}
 searchKnowledge(context,query='',options={}){return this.call('searchKnowledge',{context,query,ranked:options.ranked===true});}
 readSource(context,ref,slice){return this.call('readSource',{context,ref,slice});}
 publishKnowledge(input){return this.call('publishKnowledge',input);}
 readKnowledge(context,ref){return this.call('readKnowledge',{context,ref});}
 snapshot(context,sourceRefs,knowledgeRefs=[]){return this.call('snapshot',{context,sourceRefs,knowledgeRefs});}
 validateSnapshot(id){return this.call('validateSnapshot',{id});}
 claimEvents(input){return this.call('claimEvents',input);}
 ackEvents(input){return this.call('ackEvents',input);}
}
module.exports={ContinuityService};
