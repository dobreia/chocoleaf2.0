import {test} from 'node:test';
import assert from 'node:assert/strict';
import {durationSummary,hours,sessionsOf} from '../src/components/courseSessions.js';
test('duration sums actual session lengths and excludes overnight gaps',()=>{
  const group={sessions:[{start_time:'2027-01-01T09:00:00Z',end_time:'2027-01-01T14:00:00Z'},{start_time:'2027-01-03T10:00:00Z',end_time:'2027-01-03T14:00:00Z'}]};
  assert.equal(durationSummary(group),'2 alkalom · összesen 9 óra');
  assert.equal(hours(90),'1,5 óra');
});
test('single-session courses remain usable by earlier consumers',()=>{
  const course={id:'one',start_time:'2027-01-01T09:00:00Z',end_time:'2027-01-01T10:30:00Z'};
  assert.equal(sessionsOf(course).length,1);
  assert.equal(durationSummary(course),'1,5 óra');
  assert.deepEqual(sessionsOf(null),[]);
});
