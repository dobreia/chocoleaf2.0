import {Fragment} from 'react';
function safeHref(value){
  if([...value].some(char=>char==='\\'||char.charCodeAt(0)<=32))return null;
  if(/^\/(?!\/)/.test(value))return value;
  try{const url=new URL(value);return ['https:','http:','mailto:','tel:'].includes(url.protocol)&&!url.username&&!url.password?value:null;}catch{return null;}
}
function inline(value){
  return value.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean).map((part,i)=>{
    if(part.startsWith('**')&&part.endsWith('**'))return <strong key={i}>{part.slice(2,-2)}</strong>;
    const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if(link){const href=safeHref(link[2]);return href?<a key={i} href={href} {...(/^https?:/.test(href)?{target:'_blank',rel:'noopener noreferrer'}:{})}>{link[1]}</a>:<Fragment key={i}>{link[1]}</Fragment>;}
    return <Fragment key={i}>{part}</Fragment>;
  });
}
const tableCells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());
const separator=line=>/^\|(?:\s*:?-+:?\s*\|)+$/.test(line?.trim()||'');
function special(lines,i){return /^(#{2,3})\s|^-\s/.test(lines[i])||(lines[i].trim().startsWith('|')&&separator(lines[i+1]));}
export default function DocumentText({text=''}){
  const lines=text.replace(/\r\n?/g,'\n').split('\n'),blocks=[];
  for(let i=0;i<lines.length;){
    if(!lines[i].trim()){i++;continue;}
    const key=i,heading=/^(#{2,3})\s+(.+)$/.exec(lines[i]);
    if(heading){const Tag=heading[1].length===2?'h2':'h3';blocks.push(<Tag key={key}>{inline(heading[2])}</Tag>);i++;continue;}
    if(/^-\s/.test(lines[i])){
      const items=[];while(i<lines.length&&/^-\s/.test(lines[i])){items.push(<li key={i}>{inline(lines[i].replace(/^-\s+/,''))}</li>);i++;}
      blocks.push(<ul key={key}>{items}</ul>);continue;
    }
    if(lines[i].trim().startsWith('|')&&separator(lines[i+1])){
      const header=tableCells(lines[i]);i+=2;const rows=[];
      while(i<lines.length&&lines[i].trim().startsWith('|')){const cells=tableCells(lines[i]);rows.push(<tr key={i}>{header.map((_,col)=><td key={col}>{inline(cells[col]||'')}</td>)}</tr>);i++;}
      blocks.push(<div className="legal-document-table" key={key}><table><thead><tr>{header.map((cell,col)=><th key={col} scope="col">{inline(cell)}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>);continue;
    }
    const paragraph=[];
    do{paragraph.push(lines[i]);i++;}while(i<lines.length&&lines[i].trim()&&!special(lines,i));
    blocks.push(<p key={key}>{inline(paragraph.join('\n'))}</p>);
  }
  return <div className="legal-document">{blocks}</div>;
}
