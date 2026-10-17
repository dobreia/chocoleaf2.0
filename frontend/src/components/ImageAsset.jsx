import {useEffect,useState} from 'react';
import {resolveImage} from '../api/media';
export default function ImageAsset({src,alt='',...props}) {
  const [image,setImage]=useState(null);
  useEffect(()=>{let live=true;resolveImage(src).then(url=>{if(live)setImage({src,url});}).catch(()=>{if(live)setImage({src,url:null});});return()=>{live=false;};},[src]);
  const url=image?.src===src?image.url:undefined;
  return url?<img {...props} src={url} alt={alt}/>:<span className="cl-image-empty" role="img" aria-label={alt||'Kép betöltése'} />;
}
