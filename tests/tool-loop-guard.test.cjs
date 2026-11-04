const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ToolLoopGuard}=require('../electron/tool-loop-guard.cjs');
function fixture() {
  const guard=new ToolLoopGuard(),data={input:[{role:'user',content:'Test task'}]};guard.inspect(data);
  let sequence=0;
  return {guard,data,step(name='exec_command',args={cmd:'true'},output='Process exited with code 0\nOutput:\n') {
    const call_id='c'+sequence++;
    data.input.push({type:'function_call',name,call_id,arguments:JSON.stringify(args)},{type:'function_call_output',call_id,output});
    return guard.inspect(data);
  }};
}
test('varying no-op commands warn at six and pause at twelve; replay is not double counted',()=>{
  const f=fixture();let result;
  for(let i=1;i<=12;i++){
    result=f.step('exec_command',{cmd:i%2?'echo probe-'+i:'true'},'Chunk ID: '+i+'\nWall time: 0.01 seconds\nProcess exited with code 0\nOutput:\nprobe-'+i);
    assert.equal(result.loopGuard?.action,i<6?undefined:i<12?'warn':'pause');
    assert.deepEqual(f.guard.inspect(f.data).loopGuard,result.loopGuard);
  }
  assert.equal(result.loopGuard.kind,'no_op_commands');
  assert.ok(!JSON.stringify(result).includes('probe-'));
});
test('unchanged results detect identical calls and short cycles; changing results reset',()=>{
  for(const period of [1,2,3]) {
    const f=fixture();let result;
    for(let i=0;i<12;i++)result=f.step('read_file',{path:'file'+i%period},'same result '+i%period);
    assert.equal(result.loopGuard.action,'pause');assert.equal(result.loopGuard.kind,'repeated_result');
    assert.equal(f.step('read_file',{path:'file0'},'new content').loopGuard,undefined);
  }
  const f=fixture();for(let i=0;i<30;i++)assert.equal(f.step('read_file',{path:'file'},'changing content '+i).loopGuard,undefined);
});
test('running stdin and native agent waits are exempt, but a missing session is not',()=>{
  const f=fixture();
  for(let i=0;i<30;i++)assert.equal(f.step('write_stdin',{session_id:8945,chars:''},'Process running with session ID 8945\nOutput:\n').loopGuard,undefined);
  for(let i=0;i<30;i++)assert.equal(f.step('wait',{ids:['child']},'{"status":{},"timed_out":true}').loopGuard,undefined);
  let result;for(let i=0;i<12;i++)result=f.step('write_stdin',{session_id:8945,chars:''},'Unknown process id 8945');
  assert.equal(result.loopGuard.action,'pause');
});
test('shell writes/substitutions/compound commands and active process launches are not no-ops',()=>{
  for(const cmd of ['echo hi > file','echo "$(date)"','echo `date`','echo hi; touch file','printf hi | tee file','echo hi\necho bye','node -e "console.log(1)"']) {
    const f=fixture();const result=f.step('exec_command',{cmd});assert.equal(result.observations[0].noop,false,cmd);
  }
  const f=fixture();for(let i=0;i<15;i++)assert.equal(f.step('exec_command',{cmd:'test'},'Process running with session ID '+i).loopGuard,undefined);
});
test('prior turns, fresh turns, new user steering and sibling agents do not share a streak',()=>{
  const f=fixture();for(let i=0;i<8;i++)f.step();
  assert.equal(new ToolLoopGuard().inspect(f.data).loopGuard,undefined);
  assert.equal(f.guard.inspect(f.data,'child').loopGuard,undefined);
  f.data.input.push({role:'user',content:'Use a different approach'});
  assert.equal(f.guard.inspect(f.data).loopGuard,undefined);
  assert.equal(f.step().loopGuard,undefined);
});
test('compaction preserves the streak without counting replays, fingerprints are ephemeral',()=>{
  const f=fixture();for(let i=0;i<6;i++)f.step();
  f.data.input=f.data.input.slice(-2);
  assert.equal(f.guard.inspect(f.data).loopGuard.count,6);
  assert.equal(f.step().loopGuard.count,7);
  assert.notEqual(new ToolLoopGuard().fingerprint('secret'),new ToolLoopGuard().fingerprint('secret'));
});

test('a parallel batch gets a warning before pause, and changing images count as new results',()=>{
  const f=fixture();
  for(let i=0;i<12;i++)f.data.input.push({type:'function_call',name:'exec_command',call_id:'b'+i,arguments:'{"cmd":"true"}'},{type:'function_call_output',call_id:'b'+i,output:'Process exited with code 0\nOutput:\n'});
  assert.equal(f.guard.inspect(f.data).loopGuard.action,'warn');
  assert.equal(f.guard.inspect(f.data).loopGuard.action,'warn');
  assert.equal(f.step().loopGuard.action,'pause');
  const images=fixture();for(let i=0;i<20;i++)assert.equal(images.step('view_image',{path:'frame.png'},[{type:'input_image',image_url:'data:image/png;base64,frame'+i}]).loopGuard,undefined);
});
