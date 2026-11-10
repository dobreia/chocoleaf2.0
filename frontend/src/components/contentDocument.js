const FORMAT='chocoleaf-document';
export function safeDocumentHref(value){
  if(typeof value!=='string'||[...value].some(char=>char==='\\'||char.charCodeAt(0)<=32))return null;
  if(/^\/(?!\/)/.test(value))return value;
  try{const url=new URL(value);return ['https:','http:','mailto:','tel:'].includes(url.protocol)&&!url.username&&!url.password?value:null;}catch{return null;}
}
function textNodes(value){
  return value.split('\n').flatMap((line,index)=>[...(index?[{type:'hardBreak'}]:[]),...(line?[{type:'text',text:line}]:[])]);
}
function inline(value){
  return value.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean).flatMap(part=>{
    if(part.startsWith('**')&&part.endsWith('**'))return textNodes(part.slice(2,-2)).map(node=>node.type==='text'?{...node,marks:[{type:'bold'}]}:node);
    const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if(link){const href=safeDocumentHref(link[2]);return textNodes(link[1]).map(node=>href&&node.type==='text'?{...node,marks:[{type:'link',attrs:{href}}]}:node);}
    return textNodes(part);
  });
}
const paragraph=content=>({type:'paragraph',...(content.length?{content}:{})});
const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());
const separator=line=>/^\|(?:\s*:?-+:?\s*\|)+$/.test(line?.trim()||'');
const special=(lines,i)=>/^(#{2,3})\s|^-\s/.test(lines[i])||(lines[i].trim().startsWith('|')&&separator(lines[i+1]));
function legacyDocument(value){
  const lines=value.replace(/\r\n?/g,'\n').split('\n'),content=[];
  for(let i=0;i<lines.length;){
    if(!lines[i].trim()){i++;continue;}
    const heading=/^(#{2,3})\s+(.+)$/.exec(lines[i]);
    if(heading){content.push({type:'heading',attrs:{level:heading[1].length},content:inline(heading[2])});i++;continue;}
    if(/^-\s/.test(lines[i])){
      const items=[];while(i<lines.length&&/^-\s/.test(lines[i])){items.push({type:'listItem',content:[paragraph(inline(lines[i].replace(/^-\s+/,'')))]});i++;}
      content.push({type:'bulletList',content:items});continue;
    }
    if(lines[i].trim().startsWith('|')&&separator(lines[i+1])){
      const header=cells(lines[i]);i+=2;
      const row=(items,type)=>({type:'tableRow',content:header.map((_,col)=>({type,attrs:{colspan:1,rowspan:1},content:[paragraph(inline(items[col]||''))]}))});
      const rows=[row(header,'tableHeader')];
      while(i<lines.length&&lines[i].trim().startsWith('|')){rows.push(row(cells(lines[i]),'tableCell'));i++;}
      content.push({type:'table',content:rows});continue;
    }
    const linesInParagraph=[];do{linesInParagraph.push(lines[i]);i++;}while(i<lines.length&&lines[i].trim()&&!special(lines,i));
    content.push(paragraph(inline(linesInParagraph.join('\n'))));
  }
  return {type:'doc',content:content.length?content:[paragraph([])]};
}
const blocks=['paragraph','heading','bulletList','orderedList','table'];
const children={doc:blocks,paragraph:['text','hardBreak'],heading:['text','hardBreak'],bulletList:['listItem'],orderedList:['listItem'],listItem:blocks,table:['tableRow'],tableRow:['tableCell','tableHeader'],tableCell:blocks,tableHeader:blocks};
export function cleanDocument(document){
  let budget=10000;
  function clean(node,depth=0){
    if(!node||typeof node!=='object'||depth>40||--budget<0)return null;
    if(node.type==='text'){
      if(typeof node.text!=='string'||!node.text)return null;
      const marks=(Array.isArray(node.marks)?node.marks:[]).flatMap(mark=>{
        if(['bold','italic','underline'].includes(mark?.type))return [{type:mark.type}];
        const href=mark?.type==='link'?safeDocumentHref(mark.attrs?.href):null;return href?[{type:'link',attrs:{href}}]:[];
      });
      return {type:'text',text:node.text,...(marks.length?{marks}:{})};
    }
    if(node.type==='hardBreak')return {type:'hardBreak'};
    if(!Object.hasOwn(children,node.type))return null;
    const content=(Array.isArray(node.content)?node.content:[]).filter(child=>children[node.type].includes(child?.type)).map(child=>clean(child,depth+1)).filter(Boolean);
    if(['table','tableRow','bulletList','orderedList'].includes(node.type)&&!content.length)return null;
    if(['doc','listItem','tableCell','tableHeader'].includes(node.type)&&!content.length)content.push(paragraph([]));
    let attrs;
    if(node.type==='heading')attrs={level:node.attrs?.level===3?3:2};
    if(node.type==='orderedList')attrs={start:Number.isInteger(node.attrs?.start)&&node.attrs.start>0?Math.min(node.attrs.start,100000):1};
    if(['tableCell','tableHeader'].includes(node.type)){
      const span=key=>Number.isInteger(node.attrs?.[key])&&node.attrs[key]>0?Math.min(node.attrs[key],100):1;
      attrs={colspan:span('colspan'),rowspan:span('rowspan')};
    }
    return {type:node.type,...(attrs?{attrs}:{}),...(content.length?{content}:{})};
  }
  return clean(document?.type==='doc'?document:{type:'doc'})||{type:'doc',content:[paragraph([])]};
}
export function readDocument(value=''){
  try{const saved=JSON.parse(value);if(saved?.format===FORMAT&&saved.version===1)return cleanDocument(saved.document);}catch{ /* Existing plain text and Markdown remain supported. */ }
  return legacyDocument(String(value));
}
export function writeDocument(document){return JSON.stringify({format:FORMAT,version:1,document:cleanDocument(document)});}
export function documentPlainText(value){
  function text(node){if(node.type==='text')return node.text;if(node.type==='hardBreak')return '\n';return (node.content||[]).map(text).join(['paragraph','heading'].includes(node.type)?'':'\n');}
  return text(readDocument(value));
}
