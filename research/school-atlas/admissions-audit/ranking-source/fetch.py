#!/usr/bin/env python3
"""Fetch public state tables and the API that their shipped client invokes."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parent
STATES='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split()
API='https://unified-api-production-691b.up.railway.app'
URLS={}
for state in STATES:
    URLS[f'{state}.html']=f'https://highschooltrends.org/schools/by-state/{state}'
    URLS[f'{state}.json']=f'{API}/api/schools/by-state/{state}?limit=200'
URLS.update({
    'rankings.html':'https://highschooltrends.org/rankings',
    'atlas.html':'https://highschooltrends.org/atlas',
    'usnews-national.html':'https://www.usnews.com/education/best-high-schools/national-rankings',
    'StateSchoolsPage.tsx-BsgUe-Ny.js':'https://highschooltrends.org/assets/StateSchoolsPage.tsx-BsgUe-Ny.js',
})
def fetch(item):
    name,url=item
    path=ROOT/'snapshots'/name
    result=subprocess.run(['curl','-L','-s','--max-time','60','-A','Mozilla/5.0',url,'-o',str(path),'-w','%{http_code}'],text=True,capture_output=True)
    status=result.stdout.strip()
    if not path.exists(): path.write_bytes(b'')
    return {'file':'snapshots/'+name,'url':url,'http_status':int(status or 0),'curl_exit_code':result.returncode,'transport_error':result.stderr.strip(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
with ThreadPoolExecutor(max_workers=6) as pool:
    evidence=list(pool.map(fetch,URLS.items()))
(ROOT/'source-manifest.json').write_text(json.dumps({'retrieved_date':'2026-10-20','sources':evidence},indent=2)+'\n')
print('Fetched',len(evidence),'snapshots')
for item in evidence:
    if item['http_status']!=200:print(item)
