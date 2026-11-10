import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
const vite=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
after(()=>vite.close());
const {default:DocumentText}=await vite.ssrLoadModule('/src/components/DocumentText.jsx');
const render=text=>new JSDOM(renderToStaticMarkup(React.createElement(DocumentText,{text}))).window.document;
test('legal documents preserve headings, emphasis, lists, links and accessible cookie tables',()=>{
 const d=render('Bevezető\nMásodik sor\n\n## Adatok\n\n- **Név:** ChocoLeaf\n- [Tájékoztató](/legal/privacy)\n\n### Sütik\n\n| Szolgáltató | Cél |\n| --- | --- |\n| [Google](https://google.com) | Tájékoztatás |');
 assert.equal(d.querySelector('h2').textContent,'Adatok');assert.equal(d.querySelector('h3').textContent,'Sütik');assert.equal(d.querySelectorAll('li').length,2);assert.equal(d.querySelector('strong').textContent,'Név:');
 assert.equal(d.querySelector('a').getAttribute('href'),'/legal/privacy');assert.equal(d.querySelectorAll('th[scope="col"]').length,2);assert.equal(d.querySelector('tbody td').textContent,'Google');assert.equal(d.querySelector('p').textContent,'Bevezető\nMásodik sor');
});
test('admin text cannot introduce executable HTML, tracking images or unsafe links',()=>{
 const d=render('<script>alert(1)</script>\n\n<img src="https://tracker.example/pixel">\n\n[x](javascript:alert(1))\n\n[y](//evil.example)\n\n[z](/\\evil.example)\n\n[Email](mailto:info@chocoleaf.hu)');
 assert.equal(d.querySelectorAll('script,img,iframe').length,0);assert.equal(d.querySelectorAll('a').length,1);assert.equal(d.querySelector('a').getAttribute('href'),'mailto:info@chocoleaf.hu');assert.ok(d.body.textContent.includes('<script>'));
});
