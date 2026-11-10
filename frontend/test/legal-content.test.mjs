import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {readDocument,writeDocument,documentPlainText} from '../src/components/contentDocument.js';
const vite=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
after(()=>vite.close());
const {default:DocumentText}=await vite.ssrLoadModule('/src/components/DocumentText.jsx');
const render=text=>new JSDOM(renderToStaticMarkup(React.createElement(DocumentText,{text}))).window.document;
test('legal documents preserve headings, emphasis, lists, links and accessible cookie tables',()=>{
 const d=render('Bevezető\nMásodik sor\n\n## Adatok\n\n- **Név:** ChocoLeaf\n- [Tájékoztató](/legal/privacy)\n\n### Sütik\n\n| Szolgáltató | Cél |\n| --- | --- |\n| [Google](https://google.com) | Tájékoztatás |');
 assert.equal(d.querySelector('h2').textContent,'Adatok');assert.equal(d.querySelector('h3').textContent,'Sütik');assert.equal(d.querySelectorAll('li').length,2);assert.equal(d.querySelector('strong').textContent,'Név:');
 assert.equal(d.querySelector('a').getAttribute('href'),'/legal/privacy');assert.equal(d.querySelectorAll('th[scope="col"]').length,2);assert.equal(d.querySelector('tbody td').textContent,'Google');assert.equal(d.querySelector('p').querySelectorAll('br').length,1);assert.equal(documentPlainText('Bevezető\nMásodik sor'),'Bevezető\nMásodik sor');
});
test('visual documents round-trip all existing legal text, links and table cells',async()=>{
 const sql=await(await import('node:fs/promises')).readFile(new URL('../../backend/migrations/021-legacy-legal-content.sql',import.meta.url),'utf8');
 for(const slug of ['imprint','privacy','terms','cookies']){
  const marker='$legacy_'+slug+'$',legacy=sql.split(marker)[1];assert.ok(legacy);
  const original=render(legacy),saved=writeDocument(readDocument(legacy)),restored=render(saved);
  assert.equal(restored.body.textContent,original.body.textContent,slug);
  assert.equal(restored.querySelectorAll('table').length,original.querySelectorAll('table').length);
  assert.deepEqual([...restored.querySelectorAll('a')].map(a=>a.getAttribute('href')),[...original.querySelectorAll('a')].map(a=>a.getAttribute('href')));
 }
});
test('visual format supports Word-style marks, numbered lists and safe links without executable HTML',()=>{
 const saved=writeDocument({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Formatted',marks:[{type:'bold'},{type:'italic'},{type:'underline'},{type:'link',attrs:{href:'/legal/privacy',onclick:'bad'}}]}]},
  {type:'orderedList',attrs:{start:3},content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Third'}]}]}]},
  {type:'script',content:[{type:'text',text:'bad'}]}, {type:'image',attrs:{src:'https://tracker.example'}},
  {type:'paragraph',content:[{type:'text',text:'Unsafe link',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}]});
 const d=render(saved);for(const tag of ['strong','em','u'])assert.equal(d.querySelectorAll(tag).length,1);assert.equal(d.querySelector('ol').getAttribute('start'),'3');assert.equal(d.querySelectorAll('script,img').length,0);assert.equal(d.querySelectorAll('a').length,1);assert.ok(!saved.includes('onclick'));assert.equal(documentPlainText(saved).includes('Unsafe link'),true);
 const invalid=JSON.stringify({format:'chocoleaf-document',version:1,document:{type:'doc',content:[{type:'toString'}]}});assert.doesNotThrow(()=>render(invalid));
});
test('admin text cannot introduce executable HTML, tracking images or unsafe links',()=>{
 const d=render('<script>alert(1)</script>\n\n<img src="https://tracker.example/pixel">\n\n[x](javascript:alert(1))\n\n[y](//evil.example)\n\n[z](/\\evil.example)\n\n[Email](mailto:info@chocoleaf.hu)');
 assert.equal(d.querySelectorAll('script,img,iframe').length,0);assert.equal(d.querySelectorAll('a').length,1);assert.equal(d.querySelector('a').getAttribute('href'),'mailto:info@chocoleaf.hu');assert.ok(d.body.textContent.includes('<script>'));
});
