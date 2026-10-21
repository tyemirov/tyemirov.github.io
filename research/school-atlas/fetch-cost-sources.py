#!/usr/bin/env python3
"""Refresh official snapshots (network required); then run build-cost-data.py."""
import json
from pathlib import Path
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
SOURCES = {
    'MARPP.zip': 'https://apps.bea.gov/regional/zip/MARPP.zip',
    'national_place2020.txt': 'https://www2.census.gov/geo/docs/reference/codes2020/national_place2020.txt',
    'list1_2023.xlsx': 'https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx',
    '2025_Gaz_cousubs_national.zip': 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_cousubs_national.zip',
}
for name, url in SOURCES.items():
    with urllib.request.urlopen(url, timeout=60) as response:
        (HERE / name).write_bytes(response.read())
    print(name)

BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/'
for geoid in ['0933690', '0983360', '0950576']:
    place_parameters = {'where': f"GEOID='{geoid}'", 'outFields': 'GEOID,NAME', 'returnGeometry': 'true', 'outSR': '4326', 'f': 'json'}
    place_url = BASE + '30/query?' + urllib.parse.urlencode(place_parameters)
    with urllib.request.urlopen(place_url, timeout=60) as response:
        place = json.load(response)
    assert len(place['features']) == 1
    # ArcGIS Within tests the supplied polygon within county features.
    # Preserve the exact unsimplified place geometry and the complete response.
    parameters = {'where': '1=1', 'geometry': json.dumps(place['features'][0]['geometry'], separators=(',', ':')), 'geometryType': 'esriGeometryPolygon', 'inSR': '4326', 'spatialRel': 'esriSpatialRelWithin', 'outFields': 'GEOID,NAME', 'returnGeometry': 'false', 'f': 'json'}
    request = urllib.request.Request(BASE + '82/query', data=urllib.parse.urlencode(parameters).encode())
    with urllib.request.urlopen(request, timeout=60) as response:
        county = json.load(response)
    assert 'error' not in county
    (HERE / ('ct-' + geoid + '.json')).write_text(json.dumps({'place_query': place, 'county_query': county, 'county_query_parameters': parameters, 'place_source_url': place_url, 'county_source_url': BASE + '82/query'}, indent=2) + '\n')
    print(geoid, county['features'])
