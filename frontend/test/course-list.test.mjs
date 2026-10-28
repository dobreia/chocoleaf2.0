import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseList } from '../src/components/admin/courseList.js';
const course = (id, start, end = start, service_id = 'service') => ({ id, start_time: start, end_time: end, service_id });
const ids = items => items.map(item => item.id);
test('today remains visible after a course ends, upcoming sorts earliest first and past sorts latest first', () => {
  const items = [course('future','2026-10-30T08:00:00Z'),course('older','2026-10-20T08:00:00Z'),course('today','2026-10-28T08:00:00Z'),course('yesterday','2026-10-27T08:00:00Z')];
  const now = new Date('2026-10-28T20:00:00Z');
  assert.deepEqual(ids(courseList(items,'upcoming','',now)),['today','future']);
  assert.deepEqual(ids(courseList(items,'past','',now)),['yesterday','older']);
  assert.deepEqual(ids(courseList(items,'all','',now)),['future','today','yesterday','older']);
  assert.deepEqual(ids(items),['future','older','today','yesterday']);
});
test('Budapest day boundaries are respected in winter, summer and on the DST transition', () => {
  for(const [now, today, yesterday] of [
    ['2026-10-28T23:30:00Z','2026-10-29T09:00:00Z','2026-10-28T09:00:00Z'],
    ['2026-07-01T22:30:00Z','2026-07-02T09:00:00Z','2026-07-01T09:00:00Z'],
    ['2026-10-24T22:30:00Z','2026-10-25T09:00:00Z','2026-10-24T09:00:00Z'],
  ]) assert.deepEqual(ids(courseList([course('today',today),course('past',yesterday)],'upcoming','',new Date(now))),['today']);
});
test('all sessions determine completion even if unsorted; an overnight course remains visible through its last day', () => {
  const group = {...course('group','2026-10-20T08:00:00Z'),sessions:[
    {start_time:'2026-10-30T08:00:00Z',end_time:'2026-10-30T10:00:00Z'},
    {start_time:'2026-10-20T08:00:00Z',end_time:'2026-10-20T10:00:00Z'},
  ]};
  const overnight = course('overnight','2026-10-27T22:00:00Z','2026-10-28T01:00:00Z');
  assert.deepEqual(ids(courseList([group,overnight],'upcoming','',new Date('2026-10-28T12:00:00Z'))),['group','overnight']);
  assert.deepEqual(ids(courseList([group],'past','',new Date('2026-10-31T12:00:00Z'))),['group']);
});
test('service selection combines with the period and empty results are supported', () => {
  const items = [course('a','2026-10-30T08:00:00Z'),course('b','2026-10-30T08:00:00Z',undefined,'other')];
  const now = new Date('2026-10-28T12:00:00Z');
  assert.deepEqual(ids(courseList(items,'upcoming','other',now)),['b']);
  assert.deepEqual(courseList(items,'past','other',now),[]);
  assert.deepEqual(courseList([],'upcoming','',now),[]);
});
