import {Fragment} from 'react';
import {readDocument,safeDocumentHref} from './contentDocument';
function renderNode(node,key){
  if(node.type==='text'){
    let value=node.text;
    for(const [i,mark] of (node.marks||[]).entries()){
      if(mark.type==='bold')value=<strong key={i}>{value}</strong>;
      if(mark.type==='italic')value=<em key={i}>{value}</em>;
      if(mark.type==='underline')value=<u key={i}>{value}</u>;
      const href=mark.type==='link'?safeDocumentHref(mark.attrs?.href):null;
      if(href)value=<a key={i} href={href} {...(/^https?:/i.test(href)?{target:'_blank',rel:'noopener noreferrer'}:{})}>{value}</a>;
    }
    return <Fragment key={key}>{value}</Fragment>;
  }
  const content=(node.content||[]).map(renderNode);
  if(node.type==='hardBreak')return <br key={key}/>;
  if(node.type==='table')return <div className="legal-document-table" key={key}><table><tbody>{content}</tbody></table></div>;
  const Tag={paragraph:'p',heading:node.attrs?.level===3?'h3':'h2',bulletList:'ul',orderedList:'ol',listItem:'li',tableRow:'tr',tableCell:'td',tableHeader:'th'}[node.type];
  if(!Tag)return null;
  const props={};
  if(node.type==='orderedList')props.start=node.attrs?.start||1;
  if(node.type==='tableHeader')props.scope='col';
  if(['tableCell','tableHeader'].includes(node.type)){props.colSpan=node.attrs?.colspan;props.rowSpan=node.attrs?.rowspan;}
  return <Tag key={key} {...props}>{content}</Tag>;
}
export default function DocumentText({text=''}){return <div className="legal-document">{readDocument(text).content.map(renderNode)}</div>;}
