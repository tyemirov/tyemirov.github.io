#!/usr/bin/env python3
"""Reconstruct exact ranks from frozen public state API snapshots."""
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parent
manifest=json.loads((ROOT/'source-manifest.json').read_text())
urls={Path(x['file']).name:x['url'] for x in manifest['sources']}
all_records=[]
for path in sorted((ROOT/'snapshots').glob('??.json')):
    payload=json.loads(path.read_text())
    state=path.stem
    assert payload['state']==state
    assert len(payload['schools'])==payload['count']
    for school in payload['schools']:
        rank=school.get('national_rank')
        if isinstance(rank,int) and 1<=rank<=500:
            assert school['rank_year']==2026, (state,school)
            assert school['address_state']==state
            all_records.append({'national_rank':rank,'school':school['school_name'],'state':state,'city':school['address_city'],'profile_url':'https://highschooltrends.org/school/'+school['school_slug'],'ranking_source_url':urls[path.name],'ranking_display_source_url':urls[state+'.html'],'ranking_publisher_url':'https://www.usnews.com/education/best-high-schools/national-rankings','ranking_provenance':'Secondary transcription of U.S. News 2026-2027; primary publisher access unavailable.','rank_year':school['rank_year'],'source_year':school.get('source_year'),'address_street':school.get('address_street'),'latitude':school.get('latitude'),'longitude':school.get('longitude')})
by_rank=defaultdict(list)
for school in all_records:by_rank[school['national_rank']].append(school)
duplicates={rank:schools for rank,schools in by_rank.items() if len(schools)>1}
gaps400=[n for n in range(1,401) if n not in by_rank]
gaps500=[n for n in range(1,501) if n not in by_rank]
assert not duplicates,duplicates
all_records.sort(key=lambda s:s['national_rank'])
report={'retrieved_date':'2026-10-20','edition':'2026-2027','state_api_snapshots':len(list((ROOT/'snapshots').glob('??.json'))),'exact_ranks_through_400':sum(r<=400 for r in by_rank),'gaps_through_400':gaps400,'gaps_through_500':gaps500,'duplicate_ranks':duplicates,'primary_publisher_status':'Unavailable; HTTP status preserved in source-manifest.json. Secondary rank transcription only.'}
(ROOT/'coverage.json').write_text(json.dumps(report,indent=2)+'\n')
(ROOT/'candidates-1-500.json').write_text(json.dumps(all_records,ensure_ascii=False,indent=2)+'\n')
(ROOT/'candidates-1-400.json').write_text(json.dumps([s for s in all_records if s['national_rank']<=400],ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,indent=2))
assert report['state_api_snapshots']==51
assert not gaps400
