const {MemorySaver}=require('@langchain/langgraph-checkpoint');
const {StateGraph,Annotation,START,END}=require('@langchain/langgraph');
const v8=require('node:v8');
// The pinned LangGraph saver retains typed checkpoints/pending writes. Persist
// every mutation before a node may continue, using the existing SQLite store.
class HostCheckpointSaver extends MemorySaver {
 constructor(database){super();this.database=database;this.queue=Promise.resolve();}
 async initialize(){const value=await this.database.call('readSetting',{key:'workforce.graph.v1'});if(value){if(value.format!==1)throw Error('协作检查点版本不支持');const state=v8.deserialize(Buffer.from(value.data,'base64'));this.storage=state.storage;this.writes=state.writes;}}
 serial(operation){const result=this.queue.then(async()=>{const value=await operation();await this.database.call('writeSetting',{key:'workforce.graph.v1',value:{format:1,data:v8.serialize({storage:this.storage,writes:this.writes}).toString('base64')}});return value;});this.queue=result.catch(()=>{});return result;}
 put(...args){return this.serial(()=>super.put(...args));}
 putWrites(...args){return this.serial(()=>super.putWrites(...args));}
 deleteThread(...args){return this.serial(()=>super.deleteThread(...args));}
}
async function buildGraph(service){
 const checkpointer=new HostCheckpointSaver(service.spaces.database);await checkpointer.initialize();
 const State=Annotation.Root({planId:Annotation(),eligible:Annotation({reducer:(_,next)=>next,default:()=>[]})});
 const graph=new StateGraph(State)
  .addNode('reconcile',async state=>{await service.reconcile(state.planId);return {eligible:await service.eligible(state.planId)};})
  .addNode('dispatch',async state=>{await Promise.all(state.eligible.map(id=>service.dispatch(state.planId,id)));return {eligible:[]};})
  .addEdge(START,'reconcile').addConditionalEdges('reconcile',state=>state.eligible.length?'dispatch':END)
  .addEdge('dispatch',END).compile({checkpointer});
 return {graph,checkpointer};
}
module.exports={buildGraph,HostCheckpointSaver};
