const express = require('express');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {requireAdmin} = require('../domain/auth');
const {fail} = require('../domain/rules');
const directory = () => path.resolve(process.env.UPLOAD_DIR || path.join(__dirname,'../../uploads'));
const router = express.Router();
router.post('/admin/media', requireAdmin, express.raw({type:()=>true,limit:'5mb'}), async (req,res) => {
  const format={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'}[req.get('Content-Type')?.split(';')[0]];
  if(!format || !Buffer.isBuffer(req.body) || !req.body.length) fail('PNG, JPEG vagy WebP képet válassz, legfeljebb 5 MB méretben.');
  let data;
  try {
    const image=sharp(req.body,{limitInputPixels:16000000,failOn:'warning'});
    const meta=await image.metadata();
    if(meta.format!==format || (meta.pages||1)!==1) throw Error('Unsupported image');
    data=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  } catch { fail('A kép sérült vagy nem támogatott. Legfeljebb 16 megapixeles, nem animált képet válassz.'); }
  await fs.mkdir(directory(),{recursive:true});
  const filename=randomUUID()+'.webp';
  await fs.writeFile(path.join(directory(),filename),data,{flag:'wx'});
  res.status(201).json({path:'/api/media/'+filename});
});
router.get('/media/:file', (req,res,next) => {
  if(!/^[a-f0-9-]{36}\.webp$/.test(req.params.file)) return res.status(404).json({message:'A kép nem található.'});
  res.set({'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
  res.sendFile(path.join(directory(),req.params.file),err=>{if(err)next(err);});
});
module.exports={router,directory};
