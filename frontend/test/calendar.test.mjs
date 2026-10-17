import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
after(()=>server.close());
const {default:Views}=await server.ssrLoadModule('/src/components/admin/CalendarViews.jsx');
const {default:Details}=await server.ssrLoadModule('/src/components/admin/CourseEventDetails.jsx');
const {calendarRange,groupBookings,courseEvents}=await server.ssrLoadModule('/src/components/admin/calendarModel.js');
const {default:SeatCount}=await server.ssrLoadModule('/src/components/SeatCount.jsx');
const {validSeatCount}=await server.ssrLoadModule('/src/components/seatRules.js');
const slots=[{id:'a',title:'Csokoládé workshop',start_time:'2026-10-25T09:00:00Z',end_time:'2026-10-25T10:30:00Z',capacity:12,active:true},{id:'b',title:'Másik időpont',start_time:'2026-10-25T12:00:00Z',end_time:'2026-10-25T13:00:00Z',capacity:8,active:true},{id:'c',title:'Esti workshop',start_time:'2026-10-25T16:00:00Z',end_time:'2026-10-25T17:00:00Z',capacity:8,active:true}];
const items=[2,1,4,3].map((seats,i)=>({id:String(i),course_id:'a',customer_name:'Vendég '+i,customer_email:'private@example.test',customer_phone:'+361234',course_title:'Csokoládé workshop',start_time:slots[0].start_time,end_time:slots[0].end_time,seats,status:i===3?'cancelled':'confirmed',payment_status:'paid',total_price:1000,note:'Ügyfél megjegyzés',admin_note:'Belső megjegyzés'}));
const props=view=>({view,date:'2026-10-25',days:calendarRange('2026-10-25',view).days,items,slots,onOpen:()=>{},onCourse:()=>{},onDay:()=>{}});
const html=view=>renderToStaticMarkup(React.createElement(Views,props(view)));
function elements(el,out=[]){if(!el||typeof el!=='object')return out;if(Array.isArray(el)){el.forEach(x=>elements(x,out));return out;}if(typeof el.type==='function'&&el.type.name!=='Modal')return elements(el.type(el.props),out);out.push(el);elements(el.props?.children,out);return out;}
test('ranges include Monday week and leap-year month',()=>{assert.equal(calendarRange('2026-10-25','day').days.length,1);assert.equal(calendarRange('2026-10-25','week').from,'2026-10-19');assert.equal(calendarRange('2028-02-29','month').days.length,42);assert(calendarRange('2028-02-29','month').days.includes('2028-02-29'));});
test('Budapest midnight boundary assigns correct date',()=>{assert(groupBookings([{...items[0],start_time:'2026-07-01T22:30:00Z'}])['2026-07-02']);});
test('aggregation sums seats, excludes cancellation and preserves unbooked slots',()=>{const events=courseEvents(slots,items);assert.equal(events.length,3);assert.equal(events[0].booked_seats,7);assert.equal(events[0].bookings.length,4);assert.equal(events[1].booked_seats,0);});
test('day retains full booking details and course occupancy',()=>{const h=html('day');for(const text of ['10:00','11:30','1,5 óra','private@example.test','Ügyfél megjegyzés','Belső megjegyzés','Vendég 3','7 / 12 fő'])assert(h.includes(text),text);});
test('week has one card per course time and no customer names',()=>{const h=html('week');assert(h.includes('Csokoládé workshop'));assert(h.includes('7 / 12 fő'));assert(h.includes('0 / 8 fő'));assert(!h.includes('Vendég'));assert(!h.includes('private@example.test'));assert.equal(elements(Views(props('week'))).filter(e=>e.props?.className==='cl-event cl-course-event').length,3);});
test('month includes title and occupancy; overflow counts course events',()=>{const h=html('month');assert(h.includes('3 alkalom'));assert(h.includes('+1 további'));assert(h.includes('Csokoládé workshop'));assert(h.includes('7 / 12 fő'));assert(!h.includes('Vendég'));let day;const tree=elements(Views({...props('month'),onDay:x=>day=x}));tree.find(e=>e.props?.className==='cl-more-events').props.onClick();assert.equal(day,'2026-10-25');});
test('week/month open course details; day opens individual booking',()=>{for(const view of ['week','month']){let selected;elements(Views({...props(view),onCourse:e=>selected=e})).find(e=>e.props?.className==='cl-event cl-course-event').props.onClick();assert.equal(selected.id,'a');assert.equal(selected.booked_seats,7);}let selected;elements(Views({...props('day'),onOpen:b=>selected=b})).find(e=>e.props?.className?.startsWith('cl-event cl-day-event')).props.onClick();assert.equal(selected.id,'0');});
test('course detail lists all participants and opens booking editor',()=>{let booking;const tree=elements(React.createElement(Details,{event:courseEvents(slots,items)[0],onClose:()=>{},onBooking:b=>booking=b}));tree.find(e=>e.type==='button'&&e.props.children==='Foglalás megnyitása és kezelése').props.onClick();assert.equal(booking.id,'0');const text=renderToStaticMarkup(React.createElement(Details,{event:courseEvents(slots,items)[0],onClose:()=>{},onBooking:()=>{}}));assert(text.includes('5 szabad hely'));assert(text.includes('Vendég 3'));assert(text.includes('Nem foglal férőhelyet'));});
test('empty day has an empty state',()=>{assert(renderToStaticMarkup(React.createElement(Views,{...props('day'),items:[],slots:[]})).includes('nincs foglalás'));});

test('seat field preserves empty input before accepting a replacement',()=>{let value='1';let tree=SeatCount({value,available:12,onChange:v=>value=v});elements(tree).find(e=>e.type==='input').props.onChange({target:{value:''}});assert.equal(value,'');tree=SeatCount({value,available:12,onChange:v=>value=v});assert.equal(elements(tree).find(e=>e.type==='input').props.value,'');elements(tree).find(e=>e.type==='input').props.onChange({target:{value:'7'}});assert.equal(value,'7');assert(validSeatCount(value,12));});
test('seat validation rejects blank, zero, negative, fractions and excess',()=>{for(const value of ['', '0','-1','1.5','13'])assert(!validSeatCount(value,12),value);assert(validSeatCount('12',12));});

test('a shared booking appears on every session date with one capacity per package',()=>{
  const sessions=[{id:'first',start_time:'2026-10-25T09:00:00Z',end_time:'2026-10-25T14:00:00Z'},{id:'second',start_time:'2026-10-27T09:00:00Z',end_time:'2026-10-27T13:00:00Z'}];
  const group={...slots[0],end_time:sessions[1].end_time,sessions};
  const bookings=items.map(b=>({...b,sessions}));
  const events=courseEvents([group],bookings);
  assert.equal(events.length,2);
  assert.deepEqual(events.map(e=>e.booked_seats),[7,7]);
  assert.deepEqual(events.map(e=>e.session_index),[1,2]);
  assert(events.every(e=>e.course_id==='a' && e.bookings.length===4));
  const grouped=groupBookings(bookings);
  assert.equal(grouped['2026-10-25'].length,4);
  assert.equal(grouped['2026-10-27'].length,4);
  const h=renderToStaticMarkup(React.createElement(Views,{...props('day'),date:'2026-10-27',slots:[group],items:bookings}));
  assert(h.includes('2/2. alkalom'));
  assert(h.includes('4 óra'));
  assert(h.includes('7 résztvevő'));
});
