import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { draftKey, readDraft, writeDraft, clearPageDrafts } from '../src/components/pageDraftStore.js';

let dom;
function browser(type, entries = {}) {
  dom?.window.close();
  dom = new JSDOM('', { url:'https://chocoleaf.test/contact' });
  globalThis.window = dom.window;
  Object.defineProperty(window.performance, 'getEntriesByType', { value:() => [{ type }] });
  for (const [key, value] of Object.entries(entries)) window.sessionStorage.setItem(key, value);
}
afterEach(() => { dom?.window.close(); delete globalThis.window; });

test('a fresh document visit discards drafts without touching unrelated session data', () => {
  const key = draftKey('/contact', 'form');
  browser('navigate', { [key]:JSON.stringify({ value:{ name:'Old' } }), unrelated:'keep' });
  assert.deepEqual(readDraft(key, () => ({ name:'' })), { name:'' });
  assert.equal(window.sessionStorage.getItem(key), null);
  assert.equal(window.sessionStorage.getItem('unrelated'), 'keep');
});

test('reload restores text, empty values, choices and a new open booking modal', () => {
  const key = draftKey('/giftcard', 'form');
  const value = { name:'Teszt', buyerType:'company', quantity:'', active:false, names:['A', 'B'] };
  browser('reload', { [key]:JSON.stringify({ value }) });
  assert.deepEqual(readDraft(key, () => ({})), value);
  const modal = draftKey('/admin/bookings', 'edit');
  writeDraft(modal, null);
  assert.equal(readDraft(modal, () => undefined), null);
  writeDraft(modal, undefined);
  assert.equal(window.sessionStorage.getItem(modal), null);
});

test('leaving a page clears all its fields and request identifiers, with isolated scopes', () => {
  browser('reload');
  const first = draftKey('/courses/one/book', 'billing');
  const request = draftKey('/courses/one/book', 'requestKey');
  const other = draftKey('/courses/two/book', 'billing');
  writeDraft(first, { privateName:'One' });
  writeDraft(request, 'request-id');
  writeDraft(other, { privateName:'Two' });
  clearPageDrafts('/courses/one/book');
  assert.equal(readDraft(first, () => null), null);
  assert.equal(readDraft(request, () => null), null);
  assert.deepEqual(readDraft(other, () => null), { privateName:'Two' });
});

test('malformed draft data falls back without breaking the form', () => {
  const key = draftKey('/contact', 'form');
  for (const raw of ['broken json', '{}', 'null']) {
    browser('reload', { [key]:raw });
    assert.equal(readDraft(key, () => 'default'), 'default');
  }
});

test('storage restrictions do not prevent entering or submitting forms', () => {
  browser('reload');
  Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('disabled'); } });
  const key = draftKey('/contact', 'form');
  assert.equal(readDraft(key, () => ''), '');
  assert.doesNotThrow(() => writeDraft(key, 'Test'));
  assert.doesNotThrow(() => clearPageDrafts('/contact'));
});

test('drafts do not leak into another browser tab or a browser history entry', () => {
  const key = draftKey('/contact', 'form');
  browser('reload');
  writeDraft(key, 'First tab');
  browser('navigate');
  assert.equal(readDraft(key, () => ''), '');
  browser('back_forward', { [key]:JSON.stringify({ value:'Old history entry' }) });
  assert.equal(readDraft(key, () => ''), '');
});
