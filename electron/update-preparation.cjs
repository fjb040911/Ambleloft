async function prepareUpdate({flush,shutdown,backup,saveTimeoutMs=30000}) {
  let timer;
  try {
    await Promise.race([flush(),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Error('等待数据库确认保存超时。当前写入可能仍在进行，请稍后重试更新。')),saveTimeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
  await shutdown();
  await backup();
}

module.exports={prepareUpdate};
