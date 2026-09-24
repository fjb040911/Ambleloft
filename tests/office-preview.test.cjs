const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const XLSX=require('xlsx');const {zipSync,strToU8}=require('fflate');
const {createOfficePreview}=require('../electron/office-preview.cjs');
const {createProjectFiles}=require('../electron/project-files.cjs');
function pptx(note='Hello &amp; goodbye'){
 const entries={
  'ppt/presentation.xml':'<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId7" id="256"/></p:sldIdLst></p:presentation>',
  'ppt/_rels/presentation.xml.rels':'<Relationships><Relationship Id="rId7" Target="slides/slide9.xml"/></Relationships>',
  'ppt/slides/_rels/slide9.xml.rels':'<Relationships><Relationship Id="n" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide4.xml"/></Relationships>',
  'ppt/notesSlides/notesSlide4.xml':`<p:notes xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>99</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${note}</a:t></a:r><a:br/><a:r><a:t>next line</a:t></a:r></a:p><a:p><a:r><a:t>paragraph two</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`
 };return Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,strToU8(v)]))));
}
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'office-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('spreadsheet parsing preserves sheets, formatted values and bounded rows',async t=>{
 const root=await fixture(t),book=XLSX.utils.book_new();const sheet=XLSX.utils.aoa_to_sheet([['Label','Amount'],['test',1234.56]]);sheet.B2.z='#,##0.00';XLSX.utils.book_append_sheet(book,sheet,'Overview');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([]),'Empty');
 const file=path.join(root,'book.xlsx');XLSX.writeFile(book,file);const api=createOfficePreview({directory:path.join(root,'cache')});const result=await api.preview(file);
 assert.equal(result.sheets.length,2);assert.equal(result.sheets[0].rows[1][1],'1,234.56');assert.equal(result.sheets[1].rows.length,0);
 const tall=XLSX.utils.book_new();XLSX.utils.book_append_sheet(tall,XLSX.utils.aoa_to_sheet(Array.from({length:10002},(_,i)=>[i])),'Tall');XLSX.writeFile(tall,path.join(root,'tall.xlsx'));const bounded=await api.preview(path.join(root,'tall.xlsx'));assert.equal(bounded.sheets[0].rows.length,10000);assert.equal(bounded.truncated,true);
 const binary=XLSX.write(book,{type:'buffer',bookType:'biff8'});await fs.writeFile(path.join(root,'old.xls'),binary);assert.equal((await api.preview(path.join(root,'old.xls'))).sheets[0].name,'Overview');
});
test('PPT notes follow relationships, preserve paragraphs and ignore slide numbers; conversions deduplicate and cache across restart',async t=>{
 const root=await fixture(t),file=path.join(root,'deck.pptx');await fs.writeFile(file,pptx());let calls=0;
 const convert=async(input,out)=>{calls++;await fs.writeFile(path.join(out,'source.pdf'),'%PDF-fixture');};const directory=path.join(root,'cache');
 const api=createOfficePreview({directory,convert});const [a,b]=await Promise.all([api.preview(file),api.preview(file)]);assert.equal(calls,1);assert.equal(a.asset,b.asset);
 assert.equal(a.slides[0].notes,'Hello & goodbye\nnext line\nparagraph two');assert.match((await api.resource(file,a.asset)).toString(),/^%PDF/);
 await assert.rejects(api.resource(path.join(root,'other.pptx'),a.asset));
 const restarted=createOfficePreview({directory,convert});await restarted.preview(file);assert.equal(calls,1);
 const entries=await fs.readdir(path.join(directory,a.asset));assert.deepEqual(entries.sort(),['preview.json','source.pdf']);
 await fs.writeFile(file,pptx('Updated'));const c=await api.preview(file);assert.notEqual(c.asset,a.asset);assert.equal(calls,2);
});
test('conversion failures retry and stale results never replace the authorized preview',async t=>{
 const root=await fixture(t),file=path.join(root,'deck.pptx');await fs.writeFile(file,pptx());let mode='fail';
 const api=createOfficePreview({directory:path.join(root,'cache'),convert:async(input,out)=>{if(mode==='fail')throw new Error('converter missing');await fs.writeFile(path.join(out,'source.pdf'),'%PDF-fixture');if(mode==='change')await fs.writeFile(file,pptx('newer'));}});
 await assert.rejects(api.preview(file),/converter missing/);mode='ok';const good=await api.preview(file);
 mode='change';await fs.writeFile(file,pptx('intermediate'));await assert.rejects(api.preview(file),/文件正在变化/);
 assert.match((await api.resource(file,good.asset)).toString(),/^%PDF/);
 assert.ok(!(await fs.readdir(path.join(root,'cache'))).some(name=>name.startsWith('.convert-')));
});
test('Office endpoints retain project/run boundaries and reject ungranted generated resources',async t=>{
 const root=await fixture(t);await fs.writeFile(path.join(root,'deck.pptx'),pptx());
 const api=createProjectFiles({cacheDirectory:path.join(root,'cache'),getWorkspace:async()=>({projects:[{id:'p',path:root}]}),getRuns:()=>[{id:'r',cwd:root,projectId:null,artifacts:[{id:'a',path:path.join(root,'deck.pptx')}]}]});
 assert.equal((await api.read({runId:'r',artifactId:'a',path:'deck.pptx'})).kind,'presentation');
 await assert.rejects(api.office({projectId:'p',path:'../outside.xlsx'}));await assert.rejects(api.office({projectId:'p',runId:'r',path:'deck.pptx'}));
 const context=await api.context({runId:'r',artifactId:'a'});const response=await api.resource({url:context.baseUrl+'deck.pptx?office='+'a'.repeat(64)});assert.equal(response.status,404);
});
