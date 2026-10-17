import {api,API_URL} from './courses';
export async function uploadImage(file) {
  const r=await api('/admin/media',{method:'POST',headers:{'Content-Type':file.type},body:file});
  return r.path;
}
export async function resolveImage(src) {
  return src?.startsWith('/api/media/') ? API_URL.replace(/\/api$/,'')+src : src;
}
