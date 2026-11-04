const fs=require('node:fs'),path=require('node:path');
const packaged=process.resourcesPath&&path.join(process.resourcesPath,'tools/input-definition.cjs');
module.exports=require(packaged&&fs.existsSync(packaged)?packaged:'./definition.cjs');
