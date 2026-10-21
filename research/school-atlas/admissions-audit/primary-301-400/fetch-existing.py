import json,urllib.request,concurrent.futures,re
from pathlib import Path
from html.parser import HTMLParser
root=Path(__file__).resolve().parents[4]
rows=json.loads((root/'school-atlas/school-data.js').read_text().removeprefix('export default ').strip().removesuffix(';'))['schools']
out=Path(__file__).resolve().parent
class Text(HTMLParser):
 def __init__(self):super().__init__();self.text=[];self.skip=0
 def handle_starttag(self,t,a):
  if t in ['script','style']:self.skip+=1
 def handle_endtag(self,t):
  if t in ['script','style']:self.skip=max(0,self.skip-1)
 def handle_data(self,d):
  if not self.skip and d.strip():self.text.append(d.strip())
def fetch(r):
 n=r['national_rank'];u=r['admissions_source_url']
 try:
  with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=20) as res:s=res.read().decode('utf8','replace');url=res.url
  p=Text();p.feed(s);text='\n'.join(p.text);(out/f'{n}.txt').write_text(text)
  return {'rank':n,'url':u,'resolved_url':url,'length':len(text),'status':'retrieved'}
 except Exception as e:return {'rank':n,'url':u,'status':'failed','error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:results=list(ex.map(fetch,[r for r in rows if 301<=r['national_rank']<=400]))
(out/'retrieval.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
