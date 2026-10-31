from pathlib import Path
p=Path('/mnt/data/nf_import_work/templates/living-dashboard.html')
s=p.read_text()
s=s.replace('#member-content-list p{white-space:pre-wrap}', '#member-content-list p{white-space:pre-wrap}#member-content-list .nf-article p{white-space:normal;line-height:1.8;margin:0 0 1.2em}#member-content-list .nf-article h2{font:500 25px/1.35 "Playfair Display",serif;margin:1.6em 0 .65em;color:#183e3d}#member-content-list .nf-article h3{font:600 17px/1.4 "DM Sans",sans-serif;margin:1.4em 0 .5em;color:#235d52}')
s=s.replace('<form id="content-form">','<p><label for="nf-import-file">Import a prepared NeuroFusion article package (.json)</label><input id="nf-import-file" type="file" accept=".json,application/json"></p><form id="content-form">')
s=s.replace('Content (plain text)<textarea','Article content (prepared formatting supported)<textarea')
s=s.replace("function make(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}","""function make(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function safeArticle(body){
 const root=document.createElement('div');root.className='nf-article';
 if(!body.startsWith('<!-- nf:html -->')){root.append(make('p',body));return root;}
 const parsed=new DOMParser().parseFromString(body.replace(/^<!-- nf:html -->\\s*/,''),'text/html');
 const tags=new Set(['P','H2','H3','STRONG','EM','UL','OL','LI','BLOCKQUOTE','BR']);
 function copy(node){if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);if(node.nodeType!==Node.ELEMENT_NODE)return document.createTextNode('');const ok=tags.has(node.tagName);const target=document.createElement(ok?node.tagName.toLowerCase():'span');for(const child of node.childNodes)target.append(copy(child));return target;}
 for(const child of parsed.body.childNodes)root.append(copy(child));return root;
}
""")
s=s.replace("details.append(make('summary','Read content'),make('p',item.body));","details.append(make('summary','Read content'),safeArticle(item.body));")
s=s.replace("const form=container.querySelector('form');const feedback=", """const form=container.querySelector('form');
document.getElementById('nf-import-file').addEventListener('change',async e=>{
 const f=e.target.files?.[0];if(!f)return;
 const feedback=document.getElementById('content-feedback');
 if(f.size>100000){feedback.textContent='Package is too large.';return;}
 try{const data=JSON.parse(await f.text());if(!allowed.includes(data.section)||typeof data.title!=='string'||typeof data.body!=='string'||typeof data.summary!=='string'||data.body.length>50000)throw Error('Invalid article package');
 form.reset();for(const key of ['section','title','summary','body'])form.elements[key].value=data[key];form.elements.id.value='';form.elements.published.checked=false;
 feedback.textContent='Article imported as an unpublished draft. Review it, then select Save content.';
 container.scrollIntoView({behavior:'smooth'});
 }catch(err){feedback.textContent='Unable to import package: '+err.message;}
});
const feedback=""")
p.write_text(s)
