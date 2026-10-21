#!/usr/bin/env python3
"""Rebuild cost-data.js from official source snapshots; Python standard library only."""
import csv
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent.parent
import os
OUTPUT = Path(os.environ.get('SCHOOL_ATLAS_OUTPUT_ROOT', ROOT / 'school-atlas')).resolve()
RESEARCH = ROOT / 'research/school-atlas'
BEA_URL = 'https://apps.bea.gov/regional/zip/MARPP.zip'
PLACE_URL = 'https://www2.census.gov/geo/docs/reference/codes2020/national_place2020.txt'
COUSUB_URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_cousubs_national.zip'
METRO_URL = 'https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx'
METHOD_URL = 'https://www.bea.gov/news/technical-notes-regional-price-parities-and-implicit-regional-price-deflators'

def xlsx_rows(path):
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(path) as z:
        strings = [''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', ns)]
        for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//s:row', ns):
            values = {}
            for cell in row:
                value = cell.find('s:v', ns)
                if value is not None:
                    values[''.join(c for c in cell.attrib['r'] if c.isalpha())] = strings[int(value.text)] if cell.attrib.get('t') == 's' else value.text
            yield values

metro_by_fips, metro_by_county = {}, {}
for row in xlsx_rows(RESEARCH / 'list1_2023.xlsx'):
    if row.get('E') == 'Metropolitan Statistical Area':
        metro = (row['A'], row['D'])
        metro_by_fips[row['J'] + row['K']] = metro
        metro_by_county[(row['J'], row['H'])] = metro

places = {r['STATEFP'] + r['PLACEFP']: r for r in csv.DictReader((RESEARCH / 'national_place2020.txt').open(), delimiter='|')}
with zipfile.ZipFile(RESEARCH / '2025_Gaz_cousubs_national.zip') as z:
    subdivisions = {r['GEOID']: r for r in csv.DictReader(io.StringIO(z.read('2025_Gaz_cousubs_national.txt').decode()), delimiter='|')}
with zipfile.ZipFile(RESEARCH / 'MARPP.zip') as z:
    rows = list(csv.DictReader(io.StringIO(z.read('MARPP_MSA_2008_2024.csv').decode()), skipinitialspace=True))
    prices = {r['GeoFIPS']: float(r['2024']) for r in rows if r['LineCode'] == '1' and r['2024'].strip().replace('.', '', 1).isdigit()}
    housing = {r['GeoFIPS']: float(r['2024']) for r in rows if r['LineCode'] == '3' and r['2024'].strip().replace('.', '', 1).isdigit()}

schools = json.loads((OUTPUT / 'school-data.js').read_text().removeprefix('export default ').strip().removesuffix(';'))['schools']
output, evidence = {}, []
for school in schools:
    geoid = school['community_geoid']
    kind = school['community_geography_type']
    metro, reason, county_names = None, '', []
    mapping_source = METRO_URL
    if kind == 'county':
        metro = metro_by_fips.get(geoid)
        reason = 'County GEOID joined directly to July 2023 CBSA delineation.'
    elif kind == 'subdiv' and geoid in subdivisions:
        metro = metro_by_fips.get(geoid[:5])
        mapping_source = COUSUB_URL
        reason = 'Exact subdivision GEOID verified in 2025 Gazetteer; parent county GEOID joined to July 2023 CBSA delineation.'
    elif kind == 'local' and (RESEARCH / ('ct-' + geoid + '.json')).exists():
        spatial = json.loads((RESEARCH / ('ct-' + geoid + '.json')).read_text())
        features = spatial['county_query']['features']
        mapping_source = spatial['place_source_url']
        if len(features) == 1 and spatial['place_query']['features'][0]['attributes']['GEOID'] == geoid:
            county = features[0]['attributes']
            metro = metro_by_fips.get(county['GEOID'])
            county_names = [county['NAME']]
            reason = 'Exact unsimplified TIGERweb CDP polygon lies within one current county-equivalent planning region, joined to July 2023 CBSA delineation.'
        else:
            reason = 'Current TIGERweb polygon containment did not identify exactly one county.'
    elif kind == 'local' and geoid in places:
        place = places[geoid]
        mapping_source = PLACE_URL
        county_names = [c.strip() for c in place['COUNTIES'].split('~~~')]
        metros = [metro_by_county.get((geoid[:2], county)) for county in county_names]
        if metros and all(m is not None and m == metros[0] for m in metros):
            metro = metros[0]
            reason = 'Exact place GEOID joined to every county listed in 2020 Census place codes; all counties map to the same July 2023 metro.'
        else:
            reason = 'County mapping is unavailable or spans different metros in the official source snapshots.'
    else:
        reason = 'Exact community GEOID unavailable in the relevant official source snapshot.'
    if not metro and kind == 'local' and geoid in places:
        candidates = [metro_by_county.get((geoid[:2], county)) for county in county_names]
        if len(set(candidates)) > 1:
            reason = 'Community spans counties assigned to different metropolitan areas; no single metro RPP assigned.'
        elif county_names:
            reason = 'Community county has no metropolitan statistical area in July 2023 delineations (micropolitan/nonmetropolitan); metro RPP unavailable.'
    code, name = metro if metro else ('', '')
    output[str(school['national_rank'])] = {'price_index': prices.get(code), 'housing_price_index': housing.get(code), 'metro_code': code, 'metro_name': name, 'mapping_source_url': mapping_source, 'mapping_note': reason}
    evidence.append({'national_rank': school['national_rank'], 'community_geoid': geoid, 'community': school['community'], 'county_names': county_names, 'metro_code': code, 'metro_name': name, 'status': 'mapped' if code in prices else 'unavailable', 'mapping_reason': reason, 'community_mapping_source_url': mapping_source, 'county_metro_source_url': METRO_URL})
result = {'year': 2024, 'retrieved_date': '2026-10-20', 'source_url': BEA_URL, 'methodology_url': METHOD_URL, 'schools': output}
assert len(output) == len(schools) == 100
assert all(v['price_index'] is None or 50 < v['price_index'] < 200 for v in output.values())
(OUTPUT / 'cost-data.js').write_text('export default ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n')
(RESEARCH / 'cost-mapping-evidence.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + '\n')
print(f"Mapped {sum(v['price_index'] is not None for v in output.values())}/100 schools")
for item in evidence:
    if item['status'] != 'mapped':
        print(item['national_rank'], item['community'], item['mapping_reason'])
