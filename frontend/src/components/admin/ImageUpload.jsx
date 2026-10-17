import {useRef,useState} from 'react';
import {uploadImage} from '../../api/media';
import ImageAsset from '../ImageAsset';
export default function ImageUpload({label,value,onChange,onBusyChange=()=>{}}) {
  const input=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function choose(e) {
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    setError('');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('PNG, JPEG vagy WebP képet válassz, legfeljebb 5 MB méretben.');return;}
    setBusy(true);onBusyChange(1);
    try{onChange(await uploadImage(file));}catch(e){setError(e.message);}finally{setBusy(false);onBusyChange(-1);}
  }
  return <fieldset className="cl-image-upload" disabled={busy}><legend>{label}</legend>
    {value?<ImageAsset src={value} alt={label}/>:<p>Még nincs kiválasztott kép.</p>}
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} hidden aria-label={label}/>
    <button type="button" onClick={()=>input.current.click()}>{busy?'Kép feltöltése…':value?'Kép cseréje':'Kép kiválasztása a gépről'}</button>
    {value&&<button type="button" onClick={()=>onChange('')}>Kép eltávolítása</button>}
    <small>PNG, JPEG, WebP · maximum 5 MB / 16 megapixel. A képcsere véglegesítéséhez mentsd a szolgáltatást.</small>
    {error&&<p role="alert" className="cl-error">{error}</p>}
  </fieldset>;
}
