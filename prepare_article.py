from docx import Document
from html import escape
import re,json
from pathlib import Path
src=Path('/mnt/data/Article_The Hidden Physiology of Heartbreak(3).docx')
paras=[p.text.strip() for p in Document(src).paragraphs if p.text.strip()]
parts=[]
for i,p in enumerate(paras[1:]):
    if re.match(r'^\d{1,2}\.\s+',p): tag='h2'
    elif p in ['Cortisol spikes sharply','Dopamine drops','Serotonin becomes unstable','Oxytocin and vasopressin are disrupted','Neuroplasticity','Rebalancing','Identity reconstruction']:tag='h3'
    elif p=='Until next time,':tag='p'
    else:tag='p'
    parts.append(f'<{tag}>{escape(p)}</{tag}>')
obj={'section':'journal','title':paras[0],'summary':'A compassionate look at how attachment loss affects stress, reward, social pain and recovery.','body':'<!-- nf:html -->\n'+'\n'.join(parts),'published':False}
Path('/mnt/data/nf_import_work/NeuroFusion_Heartbreak_Article_Import.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2))
print(len(paras),len(obj['body']))
