import {useEffect,useState} from 'react';
import {EditorContent,useEditor,useEditorState} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {TableKit} from '@tiptap/extension-table';
import {readDocument,writeDocument,safeDocumentHref,documentPlainText} from '../contentDocument';
import '../../styles/RichTextEditor.css';
function Button({label,active,disabled,onClick,children}){
  return <button type="button" title={label} aria-label={label} aria-pressed={active===undefined?undefined:active}
    disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={onClick}>{children||label}</button>;
}
export default function RichTextEditor({value,onChange,onReady,disabled=false}){
  const [linkForm,setLinkForm]=useState(null),[linkError,setLinkError]=useState('');
  const editor=useEditor({
    immediatelyRender:false,
    extensions:[StarterKit.configure({heading:{levels:[2,3]},code:false,codeBlock:false,blockquote:false,horizontalRule:false,strike:false,
      link:{openOnClick:false,autolink:true,isAllowedUri:uri=>Boolean(safeDocumentHref(uri))}}),TableKit.configure({table:{resizable:false}})],
    content:readDocument(value),
    editorProps:{attributes:{role:'textbox','aria-label':'Oldal szövege','aria-multiline':'true',class:'cl-rich-text-content'}},
    onUpdate:({editor})=>onChange(writeDocument(editor.getJSON())),
  });
  const state=useEditorState({editor,selector:({editor})=>editor?{
    bold:editor.isActive('bold'),italic:editor.isActive('italic'),underline:editor.isActive('underline'),
    bullet:editor.isActive('bulletList'),ordered:editor.isActive('orderedList'),link:editor.isActive('link'),table:editor.isActive('table'),
    block:editor.isActive('heading',{level:2})?'2':editor.isActive('heading',{level:3})?'3':'paragraph',
    undo:editor.can().undo(),redo:editor.can().redo(),
  }:null})||{block:'paragraph',undo:false,redo:false};
  useEffect(()=>{
    if(editor&&writeDocument(editor.getJSON())!==writeDocument(readDocument(value)))editor.commands.setContent(readDocument(value),{emitUpdate:false});
  },[editor,value]);
  useEffect(()=>{editor?.setEditable(!disabled,false);},[editor,disabled]);
  useEffect(()=>{onReady(Boolean(editor)&&!linkForm);return()=>onReady(false);},[editor,linkForm,onReady]);
  if(!editor)return <p role="status">Szövegszerkesztő betöltése…</p>;
  const inactive=disabled||Boolean(linkForm);
  function openLink(){
    if(editor.isActive('link'))editor.chain().focus().extendMarkRange('link').run();
    const {from,to}=editor.state.selection;
    const label=editor.state.doc.textBetween(from,to,' ');
    setLinkError('');setLinkForm({from,to,label,original:label,href:editor.getAttributes('link').href||''});
  }
  function applyLink(){
    let href=linkForm.href.trim();
    if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href))href='mailto:'+href;
    else if(/^(?:www\.|[a-z0-9][a-z0-9.-]+\.[a-z]{2,})(?:[/#?]|$)/i.test(href))href='https://'+href;
    if(!safeDocumentHref(href)){setLinkError('Adj meg érvényes webcímet, e-mail-címet vagy / jellel kezdődő belső hivatkozást.');return;}
    const label=linkForm.label.trim();
    if(!label){setLinkError('Add meg a hivatkozás megjelenő szövegét.');return;}
    const {from,to}=linkForm;
    if(label===linkForm.original&&from!==to)editor.chain().focus().setTextSelection({from,to}).setLink({href}).run();
    else {
      const marks=editor.state.doc.resolve(from).marks().filter(mark=>mark.type.name!=='link').map(mark=>mark.toJSON());
      editor.chain().focus().insertContentAt({from,to},{type:'text',text:label,marks:[...marks,{type:'link',attrs:{href}}]}).run();
    }
    setLinkForm(null);setLinkError('');
  }
  return <div className="cl-rich-text">
    <div className="cl-rich-text-toolbar" role="toolbar" aria-label="Szöveg formázása">
      <label>Szövegtípus<select aria-label="Szövegtípus" value={state.block} disabled={inactive} onChange={e=>{
        const chain=editor.chain().focus();if(e.target.value==='paragraph')chain.setParagraph().run();else chain.setHeading({level:Number(e.target.value)}).run();
      }}><option value="paragraph">Normál szöveg</option><option value="2">Alcím</option><option value="3">Kisebb alcím</option></select></label>
      <Button label="Félkövér" active={state.bold} disabled={inactive} onClick={()=>editor.chain().focus().toggleBold().run()}><strong>Félkövér</strong></Button>
      <Button label="Dőlt" active={state.italic} disabled={inactive} onClick={()=>editor.chain().focus().toggleItalic().run()}><em>Dőlt</em></Button>
      <Button label="Aláhúzott" active={state.underline} disabled={inactive} onClick={()=>editor.chain().focus().toggleUnderline().run()}><u>Aláhúzott</u></Button>
      <Button label="Felsorolás" active={state.bullet} disabled={inactive} onClick={()=>editor.chain().focus().toggleBulletList().run()}/>
      <Button label="Számozás" active={state.ordered} disabled={inactive} onClick={()=>editor.chain().focus().toggleOrderedList().run()}/>
      <Button label="Hivatkozás" active={state.link} disabled={inactive} onClick={openLink}/>
      <Button label="Hivatkozás eltávolítása" disabled={inactive||!state.link} onClick={()=>editor.chain().focus().extendMarkRange('link').unsetLink().run()}/>
      <Button label="Táblázat beszúrása" disabled={inactive||state.table} onClick={()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()}/>
      <Button label="Visszavonás" disabled={inactive||!state.undo} onClick={()=>editor.chain().focus().undo().run()}/>
      <Button label="Ismétlés" disabled={inactive||!state.redo} onClick={()=>editor.chain().focus().redo().run()}/>
    </div>
    {state.table&&<div className="cl-rich-text-table-tools" role="toolbar" aria-label="Táblázat szerkesztése">
      <span>Táblázat:</span>
      <Button label="Sor hozzáadása" disabled={inactive} onClick={()=>editor.chain().focus().addRowAfter().run()}/>
      <Button label="Oszlop hozzáadása" disabled={inactive} onClick={()=>editor.chain().focus().addColumnAfter().run()}/>
      <Button label="Sor törlése" disabled={inactive} onClick={()=>editor.chain().focus().deleteRow().run()}/>
      <Button label="Oszlop törlése" disabled={inactive} onClick={()=>editor.chain().focus().deleteColumn().run()}/>
      <Button label="Táblázat törlése" disabled={inactive} onClick={()=>editor.chain().focus().deleteTable().run()}/>
    </div>}
    {linkForm&&<div className="cl-rich-text-link" role="group" aria-label="Hivatkozás beállítása" onKeyDown={e=>{
      if(e.key==='Enter'){e.preventDefault();applyLink();}
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setLinkForm(null);editor.commands.focus();}
    }}>
      <label>Megjelenő szöveg<input autoFocus value={linkForm.label} maxLength={500} onChange={e=>setLinkForm({...linkForm,label:e.target.value})}/></label>
      <label>Hivatkozás címe<input value={linkForm.href} maxLength={2000} placeholder="https://… vagy info@…" onChange={e=>setLinkForm({...linkForm,href:e.target.value})}/></label>
      {linkError&&<p role="alert" className="cl-error">{linkError}</p>}
      <button type="button" onClick={()=>{setLinkForm(null);editor.commands.focus();}}>Mégse</button>
      <button type="button" onClick={applyLink}>Hivatkozás alkalmazása</button>
    </div>}
    <EditorContent editor={editor}/>
    <p className="cl-rich-text-hint">Jelöld ki a szöveget, majd válassz formázást. Táblázat módosításához kattints az egyik cellába.</p>
    <p className="cl-rich-text-count">{documentPlainText(value).length.toLocaleString('hu-HU')} karakter</p>
    {value.length>50000&&<p role="alert" className="cl-error">A dokumentum túl hosszú. A mentéshez rövidítsd a szöveget vagy egyszerűsítsd a formázást.</p>}
  </div>;
}
