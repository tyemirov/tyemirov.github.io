# Cost-of-living evidence

Retrieved on **2026-10-20**. `dist/cost-data.js` adds 2024 BEA metropolitan-area Regional Price Parities (RPPs) to the existing 100-school snapshot. Coverage: **98 schools**; two schools have explicit null indices. National rank is the join key; existing school records are preserved.

These are regional price comparisons, with U.S. average = 100. An index of 110 means the metro's overall price level is 10% above the national average. It is a metro comparison, not a measured school district or neighborhood budget, home purchase price, household income, or tax estimate. Many communities share a metro and therefore the same index. All-items RPP already includes housing. The separate housing index is displayed as context and is not used as an additional denominator. Housing is the BEA MARPP `Services: Housing` category (line 3), based on quality-adjusted housing rents; all-items is line 1. Source precision is retained.

## Sources preserved here

- `MARPP.zip`: [BEA metropolitan RPP download](https://apps.bea.gov/regional/zip/MARPP.zip), containing `MARPP_MSA_2008_2024.csv`, footnotes and definitions. Its footnotes explicitly identify OMB Bulletin 23-01 (July 21, 2023) as the metro geographic definition and February 19, 2026 as the 2024 release date. [Release](https://www.bea.gov/news/2026/real-personal-consumption-expenditures-state-and-real-personal-income-state-2024), [methodology](https://www.bea.gov/news/technical-notes-regional-price-parities-and-implicit-regional-price-deflators).
- `national_place2020.txt`: [2020 Census exact place GEOID to county list](https://www2.census.gov/geo/docs/reference/codes2020/national_place2020.txt). Multiple county names use `~~~` separators.
- `2025_Gaz_cousubs_national.zip`: [2025 Census Gazetteer county subdivisions](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_cousubs_national.zip), verifying exact subdivision GEOIDs including current Connecticut planning-region codes.
- `list1_2023.xlsx`: [Census July 2023 CBSA delineations](https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx). This matches BEA's geography vintage.
- `ct-*.json`: exact unsimplified Census TIGERweb current CDP polygons and county-within-query responses for Greenwich, Weston and New Canaan. Each whole polygon lies within Western Connecticut Planning Region (09190), which joins to metro 14860. Original query parameters and official source URLs are preserved. This resolves the old Fairfield County code in the 2020 place list without a name-based assumption or representative-point fallback.
- `cost-mapping-evidence.json`: per-school source lineage, county evidence, metro assignment and missing-data reason.
- `source-manifest.json`: snapshot URLs, retrieval date and SHA-256 hashes.

## Deterministic mapping

County records join by exact GEOID. Subdivisions must exist in the 2025 Gazetteer; their first five GEOID digits identify the county. Places join by exact seven-digit GEOID in the Census place list; every listed county must join to the same metropolitan area. Connecticut's three CDPs use whole-polygon containment from the current official TIGERweb service as described above. Every selected metro must exist in the BEA 2024 table. No state or nearby-metro substitution is applied.

Two records remain unavailable:

- Rank 241, Bridgeport High School, Bridgeport WV: Harrison County belongs to Clarksburg micropolitan area, outside the metro-only BEA table. BEA's national nonmetro aggregate is not substituted.
- Rank 317, Green Level High School, Cary NC: Cary's source community spans Chatham and Wake counties. July 2023 assigns those to Durham-Chapel Hill (20500) and Raleigh-Cary (39580), respectively. The source community does not identify a unique metro; a school-location assignment would change the community geography and is not inferred.

## Reproduce and validate

Python 3 standard library only:

```sh
python3 research/build-cost-data.py
```

This rebuilds the browser global and mapping evidence entirely from the preserved snapshots. It asserts 100 distinct source school ranks and verifies plausible numeric bounds. To intentionally refresh live official snapshots first:

```sh
python3 research/fetch-cost-sources.py
python3 research/build-cost-data.py
```

The frozen snapshot retrieval date is 2026-10-20. A future refresh should update that date and the manifest. Byte-for-byte output stability was checked across consecutive builds, and all 98 mapped records have both all-items and housing indices.
