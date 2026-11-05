import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serviceFormValues,servicePayload} from '../src/components/admin/serviceForm.js';
const service={title:'Workshop',duration_minutes:90,session_count:2,price:0,capacity:6,active:true};
test('service editing preserves zero and exact typed hour values until a canonical payload is saved',()=>{
  const form=serviceFormValues(service);
  assert.equal(form.price,'0');assert.equal(form.duration_hours,'1.5');
  const payload=servicePayload({...form,price:'23500',capacity:'8',session_count:'3',duration_hours:'2.75'});
  assert.equal(payload.price,23500);assert.equal(payload.capacity,8);assert.equal(payload.session_count,3);assert.equal(payload.duration_minutes,165);
  assert.equal(payload.duration_hours,undefined);assert.equal(form.duration_hours,'1.5');
  assert.equal(servicePayload({...form,price:'0',duration_hours:'0.5'}).price,0);
  assert.equal(servicePayload({...form,duration_hours:'0.5'}).duration_minutes,30);
  assert.equal(servicePayload(service).duration_minutes,90); // Existing reload drafts remain readable.
  assert.equal(servicePayload({...form,duration_hours:String(1/60)}).duration_minutes,1);
  assert.equal(servicePayload({...form,duration_hours:'24'}).duration_minutes,1440);
});
test('empty, fractional integer fields and out-of-range values cannot be silently saved as zero or defaults',()=>{
  const form=serviceFormValues(service);
  for(const field of ['price','capacity','session_count','duration_hours'])for(const value of ['', ' ', null, true, 'NaN','Infinity'])assert.throws(()=>servicePayload({...form,[field]:value}));
  for(const [field,value] of [['price',-1],['price',0.5],['price',10000001],['capacity',0],['capacity',101],['capacity',2.5],['session_count',0],['session_count',101],['session_count',2.5],['duration_hours',0],['duration_hours',25]])assert.throws(()=>servicePayload({...form,[field]:value}));
});
