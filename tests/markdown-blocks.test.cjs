const {test}=require('node:test'),assert=require('node:assert/strict');
const {createMarkdownSplitter}=require('../src/markdown-blocks.mjs');
test('incremental Markdown blocks preserve source and freeze completed blocks while extending the tail',()=>{
 const split=createMarkdownSplitter(),prefix='# Heading\n\n'+('First paragraph. '.repeat(200))+'\n\n';let text=prefix+'Streaming';
 const first=split(text);assert.equal(first.join(''),text);
 for(const suffix of [' more','\n\n```js\n','const x = 1;\n','```\n\n','Next paragraph']){text+=suffix;const blocks=split(text);assert.equal(blocks.join(''),text);assert.equal(blocks[0],first[0]);assert.equal(blocks[1],first[1]);}
});
test('edits, setext headings, lists and reference definitions retain Markdown semantics',()=>{
 const split=createMarkdownSplitter(),prefix='x'.repeat(2100)+'\n\n';
 assert.equal(split(prefix+'Heading\n').at(-1),'Heading\n');assert.equal(split(prefix+'Heading\n---\n').at(-1),'Heading\n---\n');
 const list=prefix+'- first\n\n  continued\n- second';assert.equal(split(list).at(-1),'- first\n\n  continued\n- second');
 const reference=list+'\n\n[label]: /target';assert.deepEqual(split(reference),[reference]);
 const edited=prefix+'changed text';assert.equal(split(edited).join(''),edited);
 const math=prefix+'$$\na+b\n\n=c\n$$';assert.deepEqual(split(math),[math]);
});
