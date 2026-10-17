import {test} from 'node:test';
import assert from 'node:assert/strict';
import {courseBookingNotice} from '../src/components/courseNoticeContent.js';

const offer=(...starts)=>({sessions:starts.map(start_time=>({start_time}))});
const twoDays=offer('2030-01-20T10:00:00+01:00','2030-01-25T10:00:00+01:00');
const single=offer('2030-01-22T10:00:00+01:00');

test('a multi-session advertisement uses the fixed title and explains the full package',()=>{
  const notice=courseBookingNotice({session_count:1},[twoDays]);
  assert.equal(notice.title,'Ez egy több alkalmas kurzus.');
  assert.match(notice.description,/A foglalással az összes alkalmat lefoglalod\./);
  assert.match(notice.description,/ár a teljes kurzusra szól/);
});
test('sessions on the same day use the same title without claiming two days',()=>{
  const sameDay=offer('2030-01-20T23:30:00Z','2030-01-21T14:00:00Z');
  const notice=courseBookingNotice({session_count:2},[sameDay]);
  assert.equal(notice.title,'Ez egy több alkalmas kurzus.');
  assert.doesNotMatch(notice.description,/mindkét napra/);
});
test('the notice appears for multi-session offers but not for single-session offers',()=>{
  const notice=courseBookingNotice({session_count:2},[twoDays,single]);
  assert.equal(notice.title,'Ez egy több alkalmas kurzus.');
  assert.match(notice.description,/az összes alkalmat lefoglalod/);
  assert.equal(courseBookingNotice({session_count:2},[single]),null);
});
test('without advertisements the service session count determines whether the notice is shown',()=>{
  assert.equal(courseBookingNotice({session_count:2},[]).title,'Ez egy több alkalmas kurzus.');
  assert.match(courseBookingNotice({session_count:2}).description,/az összes alkalmat lefoglalod/);
  assert.equal(courseBookingNotice({session_count:1},[]),null);
});
test('different session and day counts keep the same notice title',()=>{
  const third=offer(...twoDays.sessions.map(s=>s.start_time),'2030-01-27T10:00:00+01:00');
  assert.equal(courseBookingNotice(null,[third]).title,'Ez egy több alkalmas kurzus.');
  assert.match(courseBookingNotice(null,[third]).description,/az összes alkalmat lefoglalod/);
  const shared=offer(...twoDays.sessions.map(s=>s.start_time),'2030-01-25T14:00:00+01:00');
  assert.equal(courseBookingNotice(null,[shared]).title,'Ez egy több alkalmas kurzus.');
});
