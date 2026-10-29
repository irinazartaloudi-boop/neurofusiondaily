"""Build the editable NeuroFusion site. Run: python build.py"""
from pathlib import Path
from bs4 import BeautifulSoup
import json, shutil, html, re
ROOT=Path(__file__).resolve().parent; OUT=ROOT/'dist'; DATA=ROOT/'content'; T=ROOT/'templates'
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir()
for name in ('style.css','site.js','favicon.svg','robots.txt'):
 if (ROOT/name).exists(): shutil.copy2(ROOT/name,OUT/name)
if (ROOT/'images').exists(): shutil.copytree(ROOT/'images',OUT/'images')
def load(p):return json.loads(p.read_text())
def txt(tag,value):
 if tag: tag.clear();tag.append(str(value))
def markup(tag,html_value):
 if tag:
  tag.clear()
  for x in BeautifulSoup(html_value,'html.parser').contents[:]:tag.append(x)
def set_paras(tags,values):
 for tag,value in zip(tags,values):txt(tag,value)
def card_article(doc):
 el=BeautifulSoup('<article class="article-card"><div class="article-image"></div><div class="inner"><div class="meta"></div><h3></h3><p></p><a class="read">Read the article →</a></div></article>','html.parser').article
 txt(el.select_one('.article-image'),doc.get('symbol','✳'));txt(el.select_one('.meta'),doc.get('category','Insights'));txt(el.h3,doc['title']);txt(el.p,doc.get('summary',''));el.a['href']='articles/'+doc['slug']+'.html';return el
def card_product(doc):
 el=BeautifulSoup('<article class="product"><a aria-label="Explore protocol"></a><div class="product-body"><div class="meta"></div><h3></h3><p></p><a class="read">Explore this protocol →</a></div></article>','html.parser').article
 txt(el.select_one('.meta'),doc.get('meta','Guide')+' · '+doc.get('price',''));txt(el.h3,doc['title']);txt(el.p,doc.get('card_description',''));el.select_one('.read')['href']='protocols/'+doc['slug']+'.html';el.select_one('a')['href']=el.select_one('.read')['href'];el.select_one('a')['aria-label']='Explore '+doc['title'];
 if doc.get('checkout_url','').startswith('https://'):
  buy=BeautifulSoup('<a></a>','html.parser').a;buy['href']=doc['checkout_url'];buy['class']='btn product-buy';buy['target']='_blank';buy['rel']='noopener noreferrer';buy.string='Buy now · '+doc.get('price','')+' →';el.select_one('.product-body').append(buy)
 return el
site=load(DATA/'site.json'); articles=[load(x) for x in sorted((DATA/'articles').glob('*.json'))];articles=[a for a in articles if a.get('published',True)];products=[load(x) for x in sorted((DATA/'protocols').glob('*.json'))];products=[p for p in products if p.get('published',True)]
def shared(s):
 for x in s.select('.announcement'):txt(x,site['announcement'])
 for x in s.select('.brand'):
  if x.find('span'):txt(x.find('span'),site.get('brand_byline','by Dr Irina'))
  # brand main label is a text node before span; keep markup unchanged
 for x in s.select('.footer p'):
  if x.get_text(' ',strip=True).startswith('Evidence-informed'):txt(x,site['footer_tagline'])
def write(path,s):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(str(s),encoding='utf-8')
s=BeautifulSoup((T/'index.html').read_text(),'html.parser');shared(s)
for selector,key in [('.hero .eyebrow','hero_eyebrow'),('.hero-grid p','hero_description'),('#protocols .section-top .eyebrow','protocols_eyebrow'),('#protocols .section-top p','protocols_description'),('.feature .eyebrow','philosophy_eyebrow'),('.feature h2','philosophy_heading'),('#insights .eyebrow','journal_eyebrow'),('#insights .section-top p','journal_description'),('#newsletter .eyebrow','newsletter_eyebrow'),('#newsletter h2','newsletter_heading'),('#newsletter p','newsletter_description'),('#about .eyebrow','about_eyebrow'),('#about h2','about_heading')]:txt(s.select_one(selector),site[key])
markup(s.select_one('.hero h1'),html.escape(site['hero_heading'])+'<br/><i>'+html.escape(site['hero_emphasis'])+'</i> '+html.escape(site['hero_heading_end']))
markup(s.select_one('#protocols h2'),html.escape(site['protocols_heading'])+'<br/><i>'+html.escape(site['protocols_emphasis'])+'</i>')
markup(s.select_one('#insights h2'),html.escape(site['journal_heading'])+'<br/><i>'+html.escape(site['journal_emphasis'])+'</i>')
set_paras(s.select('.feature-grid p'),[site['philosophy_paragraph_1'],site['philosophy_paragraph_2']]);set_paras(s.select('#about p'),[site['about_paragraph_1'],site['about_paragraph_2']])
buttons=s.select('.hero .actions a');txt(buttons[0],site['hero_button']);txt(buttons[1],site['hero_secondary_button'])
for selector,items,fn in [('#protocols .products',products,card_product),('#insights .articles',articles[:3],card_article)]:
 box=s.select_one(selector);box.clear()
 for item in items:box.append(fn(item))
write(OUT/'index.html',s)
s=BeautifulSoup((T/'living.html').read_text(encoding='utf-8'),'html.parser');shared(s)
write(OUT/'living.html',s)
s=BeautifulSoup((T/'living-dashboard.html').read_text(encoding='utf-8'),'html.parser')
write(OUT/'members'/'index.html',s)
s=BeautifulSoup((T/'insights.html').read_text(),'html.parser');shared(s);box=s.select_one('.articles');box.clear()
for a in articles:box.append(card_article(a))
write(OUT/'insights.html',s)
s=BeautifulSoup((T/'about.html').read_text(),'html.parser');shared(s)
txt(s.select_one('.page-hero .eyebrow'),site['about_page_eyebrow']);markup(s.select_one('.page-hero h1'),html.escape(site['about_page_heading'])+' <i>'+html.escape(site['about_page_emphasis'])+'</i>');txt(s.select_one('.page-hero p'),site['about_page_description']);set_paras(s.select('.about p'),[site['about_page_paragraph_1'],site['about_page_paragraph_2']]);write(OUT/'about.html',s)
article_template=BeautifulSoup((T/'articles'/'small-habits.html').read_text(),'html.parser')
for a in articles:
 s=BeautifulSoup(str(article_template),'html.parser');shared(s);txt(s.select_one('.page-hero h1'),a['title']);txt(s.title,a['title']+' | NeuroFusion Daily');main=s.select_one('main.reading')
 main.clear()
 # Body HTML is trusted author-edited content; author controls GitHub repository.
 for x in list(BeautifulSoup(a.get('body_html',''),'html.parser').contents):main.append(x)
 write(OUT/'articles'/(a['slug']+'.html'),s)
product_template=BeautifulSoup((T/'protocols'/'sleep-sanctuary.html').read_text(),'html.parser')
for p in products:
 s=BeautifulSoup(str(product_template),'html.parser');shared(s)
 for selector,value in [('.product-detail h1',p['title']),('.product-detail .lead',p.get('tagline','')),('.product-detail p:not(.lead)',p.get('description','')),('.product-detail .meta',p.get('meta','Guide')+' · '+p.get('price','')),('.product-detail-cover strong',p['title'])]:txt(s.select_one(selector),value)
 txt(s.title,p['title']+' | NeuroFusion Daily');ul=s.select_one('.detail-list');ul.clear()
 for bullet in p.get('bullets',[]):li=s.new_tag('li');li.string=bullet;ul.append(li)
 if p.get('checkout_url','').startswith('https://'):
  notice=s.select_one('.product-detail .notice');notice.clear();notice.append('Secure checkout and digital delivery are handled by Payhip.');buy=s.new_tag('a',href=p['checkout_url']);buy['class']='btn';buy['target']='_blank';buy['rel']='noopener noreferrer';buy.string='Buy now · '+p.get('price','')+' →';notice.insert_after(buy)
 write(OUT/'protocols'/(p['slug']+'.html'),s)
# sitemap derived from published content
urls=['','insights.html','about.html']+[f'articles/{a["slug"]}.html' for a in articles]+[f'protocols/{p["slug"]}.html' for p in products]
(OUT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join('  <url><loc>https://www.neurofusiondaily.com/'+html.escape(x)+'</loc></url>\n' for x in urls)+'</urlset>\n')
print('Built',len(urls),'pages into',OUT)
