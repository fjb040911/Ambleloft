const path=require('node:path');
// Versions refer to the entire bundle, including examples and translations.
const builtins=[{key:'supplemental-input',version:1,capability:'inputTools'}];
const builtinRoot=()=>process.resourcesPath&&require('node:fs').existsSync(path.join(process.resourcesPath,'skills'))?path.join(process.resourcesPath,'skills'):path.join(__dirname,'../resources/skills');
module.exports={builtins,builtinRoot};
