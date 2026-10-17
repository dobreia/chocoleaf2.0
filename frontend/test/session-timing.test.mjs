import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculatedSessionEnd} from '../src/components/admin/sessionTiming.js';
import {localInput} from '../src/components/admin/format.js';

test('the service duration determines the end, including dates across midnight and year boundaries',()=>{
  assert.equal(localInput(calculatedSessionEnd('2030-12-31T23:30',120)),'2031-01-01T01:30');
  assert.equal(localInput(calculatedSessionEnd('2030-01-20T10:00',90)),'2030-01-20T11:30');
  assert.equal(calculatedSessionEnd('',120),'');
});
test('duration measures elapsed time through both Budapest daylight-saving changes',()=>{
  assert.equal(localInput(calculatedSessionEnd('2026-03-29T01:30',60)),'2026-03-29T03:30');
  assert.equal(calculatedSessionEnd('2026-10-25T01:30',120),'2026-10-25T01:30:00.000Z');
  assert.throws(()=>calculatedSessionEnd('2026-03-29T02:30',60),/óraátállítás/);
  assert.throws(()=>calculatedSessionEnd('2030-01-20T10:00',0),/időtartam/);
});
