import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {api,getCourseAvailability} from '../api/courses';
import ImageAsset from '../components/ImageAsset';
import {money,dayKey} from '../components/admin/format';
import '../styles/ExperiencePages.css';
import SessionList from '../components/SessionList';
import {hours,durationSummary} from '../components/courseSessions';
export default function CourseDetailsPage(){
 const {id}=useParams();const [data,setData]=useState(null),[slots,setSlots]=useState([]),[error,setError]=useState(''),[slotError,setSlotError]=useState(''),[slotsLoading,setSlotsLoading]=useState(true);
 useEffect(()=>{let live=true;api('/courses/'+id).then(d=>{if(live){setData(d);setError('');}}).catch(e=>{if(live)setError(e.message);});getCourseAvailability({courseId:id}).then(s=>{if(live){setSlots(s.filter(x=>x.is_available));setSlotError('');}}).catch(e=>{if(live)setSlotError(e.message);}).finally(()=>{if(live)setSlotsLoading(false);});return()=>{live=false;};},[id]);
 const d=data?.id===id||data?.slug===id?data:null;
 if(!d)return <section className="experience-page"><div className="experience-shell"><Link to="/courses">← Képzések</Link><p role={error?'alert':'status'}>{error||'Kurzus betöltése…'}</p></div></section>;
 const paragraphs=(d.long_description||d.description||'').split(/<br\s*\/?\s*>|\n/i).map(p=>p.replace(/<[^>]*>/g,'').trim()).filter(Boolean);
 return <section className="experience-page"><div className="experience-shell">
  <Link className="experience-back" to="/courses">← Összes képzés</Link>
  <div className="experience-hero"><div className="experience-heading"><p className="experience-eyebrow">ChocoLeaf műhely · {d.category||'Csokoládéélmény'}</p><h1>{d.title}</h1><p className="experience-intro">{d.description}</p><div className="experience-facts">{d.duration_minutes>0&&<div><strong>{hours(d.duration_minutes)}</strong><span>alap időtartam / alkalom</span></div>}{d.price!=null&&<div><strong>{money(d.price)}</strong><span>alapár / fő</span></div>}</div><a className="experience-cta" href="#course-dates">Időpontot választok</a></div>
  {(d.image_detail||d.image)&&<ImageAsset className="experience-photo" src={d.image_detail||d.image} alt={d.title}/>}
  </div>
  <div className="experience-body"><article className="experience-story"><p className="experience-eyebrow">Az élményről</p><h2>Így telik a workshop</h2>{paragraphs.map((p,i)=><p key={i}>{p}</p>)}</article>
   <aside className="experience-dates" id="course-dates"><p className="experience-eyebrow">Találkozzunk a műhelyben</p><h2>Következő időpontok</h2><p>Budapesti idő szerint. Egy jelentkezés a kiválasztott kurzus összes alkalmára szól.</p>{slotsLoading?<p role="status">Szabad időpontok betöltése…</p>:slotError?<p role="alert">{slotError}</p>:slots.length?slots.slice(0,5).map(s=><Link className="experience-date" key={s.id} to={'/courses/'+d.id+'/book?date='+dayKey(s.start_time)+'&slot='+s.id}><strong>{durationSummary(s)}</strong><SessionList course={s}/><span>{money(s.price)} / fő · teljes kurzus</span><span>{s.available_spots} szabad hely{s.capacity!=null?` / ${s.capacity} fő`:''} <b>Foglalás →</b></span></Link>):<p>Jelenleg nincs meghirdetett szabad időpont.</p>}
   <Link className="experience-all-dates" to={'/courses/'+d.id+'/book'}>Teljes naptár megnyitása →</Link>
   </aside></div>
 </div></section>;
}
