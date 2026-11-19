// Only for an isolated probe-owned Electron application. Restore the dialog hook.
async function exportDiagnostics(app,page,id,file){
 await app.evaluate(({dialog},file)=>{global.__probeSaveDialog=dialog.showSaveDialog;dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
 try{const result=await page.evaluate(id=>window.desktop.exportRunDiagnostics({id,language:'en'}),id);if(!result?.saved)throw Error('Diagnostic export did not save');}
 finally{await app.evaluate(({dialog})=>{dialog.showSaveDialog=global.__probeSaveDialog;delete global.__probeSaveDialog;});}
 return JSON.parse(require('node:fs').readFileSync(file,'utf8'));
}
module.exports={exportDiagnostics};
