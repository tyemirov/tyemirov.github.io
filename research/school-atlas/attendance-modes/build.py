#!/usr/bin/env python3
"""Build separate, source-backed attendance rates under the existing 100 school IDs."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
import os
OUTPUT = Path(os.environ.get('SCHOOL_ATLAS_OUTPUT_ROOT', ROOT / 'school-atlas')).resolve()
HERE = Path(__file__).resolve().parent

def read_js(path):
    raw = path.read_text()
    return json.loads(raw[raw.index('{'):].rstrip(';\n'))

def existing_rate(s):
    # Preserve existing cost/provenance fields using the catalog tuition_* contract.
    rate = {k:v for k,v in s.items() if any(t in k for t in ('tuition', 'fees', 'fee_', 'grade_basis'))}
    rate.update(required_fee_total_unresolved=s.get('required_fee_total_unresolved', s.get('fees_complete') is not True),
                boarding_schedule=None, cost_basis='day')
    return rate

catalog = read_js(OUTPUT / 'private-school-data.js')['schools']
sources = json.loads((HERE / 'boarding-sources.json').read_text())
assert len(catalog) == len({s['school_id'] for s in catalog}) == 100
by_id = {s['school_id']:s for s in catalog}
assert len(sources['schools']) == len({s['school_id'] for s in sources['schools']})
assert all(s['school_id'] in by_id for s in sources['schools'])
schools = {}
for s in catalog:
    boarding_only = s.get('boarding_tuition_usd') is not None and any(t in s.get('tuition_basis','').lower() for t in ('no day', 'all-boarding', 'no comparable day'))
    schools[s['school_id']] = {'day': None if boarding_only else existing_rate(s), 'boarding': existing_rate(s) if boarding_only else None}
for source in sources['schools']:
    entry = schools[source['school_id']]
    assert entry['day'] is not None and entry['boarding'] is None
    rate = {k:v for k,v in source.items() if k not in ('school_id','year','source_url','note','verified_on')}
    rate.update(tuition_status='verified', tuition_year=source['year'],
                tuition_source_url=source['source_url'], tuition_verified_on=source['verified_on'],
                tuition_source_title='Published boarding tuition', tuition_supporting_source_urls=[],
                mandatory_annual_fees_usd=source.get('mandatory_annual_fees_usd', 0),
                mandatory_household_annual_fees_usd=0, fees_complete=False,
                required_fee_total_unresolved=True)
    rate.setdefault('boarding_schedule', None)
    rate['tuition_note'] = source.get('note', 'Published boarding tuition; mandatory boarding charges not fully priced; travel not included; schedule not stated.')
    rate['fees_note'] = rate['tuition_note']
    rate['nonrecurring_fees_note'] = None
    entry['boarding'] = rate
# Explicitly override fields inherited when a boarding rate overlays its day-school record.
for entry in schools.values():
    rate = entry['boarding']
    if rate is not None:
        rate.update(cost_basis='boarding', cost_estimate=True,
                    cost_status='published_boarding_package',
                    cost_estimate_note=rate['tuition_note'] + ' Package-based estimate; additional charges may apply. Travel beyond any source-listed package inclusions is not priced.',
                    cost_range_basis=None,
                    grade_basis='Published high-school boarding package; consult source for grade applicability',
                    tuition_basis='Published boarding package; family stays at current home',
                    boarding_tuition_usd=rate['tuition_usd'])
        if rate.get('tuition_year') is None:
            rate['tuition_basis'] += '; published year unspecified'
        rate.setdefault('annual_school_cost_low_usd', None)
        rate.setdefault('annual_school_cost_high_usd', None)
summary = {'school_count':len(schools), 'day_rate_count':sum(v['day'] is not None for v in schools.values()),
           'boarding_rate_count':sum(v['boarding'] is not None for v in schools.values()),
           'both_modes_count':sum(v['day'] is not None and v['boarding'] is not None for v in schools.values()),
           'boarding_only_count':sum(v['day'] is None for v in schools.values()),
           'boarding_not_verified_count':sum(v['boarding'] is None for v in schools.values()),
           'checked_on':'2026-10-20',
           'limitations':['Null boarding rate means no verified priced boarding option in this audit, not a finding that the school has no boarding offering.',
                          'Attendance alternatives share one school ID and publisher rank; they are not additional schools.',
                          'New boarding rates retain unresolved mandatory-fee totals; unpriced charges and travel can increase spending.',
                          'Five-day boarding leaves weekend and holiday accommodation at the family home; no family-home savings are assumed.']}
assert summary['day_rate_count'] == 96 and summary['boarding_only_count'] == 4
out = {'schools':schools, 'summary':summary}
(OUTPUT / 'attendance-modes.js').write_text('export default ' + json.dumps(out, separators=(',',':'),ensure_ascii=False) + ';\n')
(HERE / 'gap-report.json').write_text(json.dumps({'summary':summary,'boarding_not_verified_school_ids':[k for k,v in schools.items() if v['boarding'] is None]}, indent=2)+'\n')
print(json.dumps(summary, indent=2))
