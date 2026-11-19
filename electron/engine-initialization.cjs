const path=require('node:path');
const homes=new Map();
// The engine creates/migrates its SQLite state during initialize. Only that
// handshake is exclusive; initialized engines continue executing concurrently.
function initializeInOrder(home,operation){
 const key=process.platform==='win32'?path.resolve(home).toLowerCase():path.resolve(home);
 const previous=homes.get(key)||Promise.resolve();
 const work=previous.catch(()=>{}).then(operation);
 const tail=work.catch(()=>{});homes.set(key,tail);
 void tail.then(()=>{if(homes.get(key)===tail)homes.delete(key);});
 return work;
}
module.exports={initializeInOrder};
