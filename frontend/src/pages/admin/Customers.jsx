import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../../api/courses';
import {usePageDraftState} from '../../components/usePageDraft';
import {Field,Modal,Notice,SaveForm} from '../../components/admin/UI';
import {dateTime,labels} from '../../components/admin/format';
import SessionList from '../../components/SessionList';
import '../../styles/AdminCustomers.css';

function CustomerHistory({email,revision}){
  const [history,setHistory]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    let live=true;
    api('/admin/customers/history?'+new URLSearchParams({email}))
      .then(data=>{if(live){setHistory(data);setError('');}})
      .catch(error=>{if(live)setError(error.message);});
    return()=>{live=false;};
  },[email,revision]);
  return <section className="cl-customer-history" aria-label={'Foglalási előzmények: '+email}>
    <h3>Foglalási előzmények</h3>
    <Notice error={error}/>
    {!history&&!error?<p role="status">Előzmények betöltése…</p>:history&&<ol className="cl-customer-bookings">
      {history.map(booking=><li key={booking.booking_id}>
        <div className="cl-customer-booking-title"><strong>{booking.course_title}</strong>
          <span className={'cl-badge '+booking.status}>{labels[booking.status]}</span>
        </div>
        <SessionList course={booking}/>
        <p>{booking.seats} fő · {labels[booking.payment_status]} · Foglalás: {dateTime(booking.created_at)}</p>
        {booking.archived_at?<p className="cl-muted">Törölt foglalás · megőrzött kurzuselőzmény</p>
          :<Link to={'/admin/bookings?booking='+booking.booking_id}>Foglalás megnyitása →</Link>}
      </li>)}
    </ol>}
  </section>;
}

export default function Customers(){
  const [items,setItems]=useState([]),[services,setServices]=useState([]),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);
  const [q,setQ]=usePageDraftState('records.search','');
  const [filter,setFilter]=usePageDraftState('customers.filters',{service:'',status:'active'});
  const [edit,setEdit]=usePageDraftState('records.edit',null);
  const [openHistory,setOpenHistory]=usePageDraftState('customers.history',null);
  useEffect(()=>{
    let live=true;
    api('/admin/customers/services').then(data=>{if(live)setServices(data);}).catch(error=>{if(live)setError(error.message);});
    return()=>{live=false;};
  },[]);
  useEffect(()=>{
    let live=true;
    const timer=setTimeout(()=>{
      api('/admin/customers?'+new URLSearchParams({...filter,q}))
        .then(data=>{if(live){setItems(data);setError('');}})
        .catch(error=>{if(live)setError(error.message);})
        .finally(()=>{if(live)setLoading(false);});
    },200);
    return()=>{live=false;clearTimeout(timer);};
  },[q,filter,revision]);
  const changeFilter=(next)=>{setLoading(true);setFilter(next);};
  return <>
    <div className="cl-title"><h1>Ügyfelek</h1></div>
    <Notice error={error} message={message}/>
    <p>Az ügyfeleket e-mail-cím alapján csoportosítjuk. A szűrők a foglalások alapján választják ki az ügyfeleket; a lenyitható előzményekben minden állapot látható.</p>
    <div className="cl-filters">
      <Field label="Keresés" type="search" value={q} onChange={event=>{setLoading(true);setQ(event.target.value);}}/>
      <Field label="Foglalt kurzus"><select value={filter.service} onChange={event=>changeFilter({...filter,service:event.target.value})}>
        <option value="">Összes kurzus</option>
        {services.map(service=><option key={service.id} value={service.id}>{service.title}{service.archived?' (archivált kurzus)':''}</option>)}
      </select></Field>
      <Field label="Figyelembe vett foglalások"><select value={filter.status} onChange={event=>changeFilter({...filter,status:event.target.value})}>
        <option value="active">Nem lemondott</option><option value="cancelled">Csak lemondott</option><option value="all">Összes állapot</option>
      </select></Field>
      <button onClick={()=>{setQ('');changeFilter({service:'',status:'active'});}}>Szűrők törlése</button>
    </div>
    {loading?<p role="status">Betöltés…</p>:<>
      <p className="cl-muted">{items.length} ügyfél felel meg a szűrésnek.</p>
      {!items.length&&<p>Nincs a szűrésnek megfelelő ügyfél.</p>}
      {items.map(customer=><article className="cl-card cl-customer-card" key={customer.email}>
        <h2>{customer.name}</h2>
        <p><a href={'mailto:'+customer.email}>{customer.email}</a> · {customer.phone||'Nincs telefon'}</p>
        <p>{customer.bookings} foglalás összesen · legutóbbi foglalás: {dateTime(customer.last_booking)}</p>
        <ul className="cl-customer-courses" aria-label="Foglalt kurzusok">{customer.courses.map(title=><li key={title}>{title}</li>)}</ul>
        <div className="cl-actions">
          <button aria-expanded={openHistory===customer.email} onClick={()=>setOpenHistory(openHistory===customer.email?null:customer.email)}>
            {openHistory===customer.email?'Előzmények bezárása':'Foglalási előzmények'}
          </button>
          <button onClick={()=>setEdit({...customer,original_email:customer.email})}>Szerkesztés</button>
        </div>
        {openHistory===customer.email&&<CustomerHistory key={customer.email} email={customer.email} revision={revision}/>}
      </article>)}
    </>}
    {edit&&<Modal title="Szerkesztés" onClose={()=>setEdit(null)}>
      <SaveForm onSave={async()=>{
        await api('/admin/customers',{method:'PUT',body:edit});
        setEdit(null);setMessage('Az ügyfél adatai mentve.');setRevision(value=>value+1);
      }}>
        <Field label="Név" required value={edit.name} onChange={event=>setEdit({...edit,name:event.target.value})}/>
        <Field label="Email (foglalásonként módosítható)" readOnly value={edit.email}/>
        <Field label="Telefon" value={edit.phone||''} onChange={event=>setEdit({...edit,phone:event.target.value})}/>
      </SaveForm>
    </Modal>}
  </>;
}
