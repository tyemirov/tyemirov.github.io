# Top100 lottery/selection public-school catalog

Run `python research/admission-options/build-public-options.py` from the site checkout.
It reads the existing 100-school resident cohort without modifying it, the complete
admission audit through rank 353, and the preserved ranking-source candidate list.
The complete ledger has253 excluded public schools. Sort them by original national rank and select the first100 before enrichment (national #1–#102, with resident-entry #92/#98 omitted). The next eligible school is national #104. All100 selected rows remain even where a community metric is unavailable. The combined `lottery_or_selective` category
preserves the admission audit decision and does not infer mutually exclusive
lottery versus selection classifications from prose.

`enrich_community(city, state)` is an importable helper returning standard community
fields and an embedded `cost` object. It reuses an existing verified community only
for exact city/state matches with one geographic interpretation, matching actual
community names, no locality override, and no county proxy. Otherwise it
requires exactly one Census 2020 place name after removal of the Census geographic
suffix. It does not expand neighborhoods, abbreviations, townships, or consolidated
cities into guessed places. AARP responses must return the requested GEOID, local
feature type, and exactly one 2025 result. Missing values remain null.

The six-category AARP mean excludes opportunity. New API snapshots expose rounded
category scores, whereas reused original community records retain their original
precision. The matched city is a locality proxy and is not a campus attendance
boundary or an admission guarantee. School restrictions are separately sourced
from the admission audit.

Price indices use the existing official BEA 2024 MARPP snapshot and Census July
2023 metro delineations. Every county in the exact place's Census 2020 record must
map to the same metro. Otherwise price is unavailable. Embedded cost objects do
not change the existing resident-cohort cost builder or data file.

`aarp-snapshots/` caches the public AARP API responses; `source-manifest.json`
records their source URLs and hashes plus the exact shared source inputs.
`build-report.json` records coverage and explicit reasons for missing metrics.
The ranking source is a secondary republication of U.S. News, as recorded in the
main admission audit. This is a School Atlas admission-filtered top 100, not a publisher-certified ranking category. Original national ranks are retained; the separate restricted_cohort_order field records positions1–100 within this group. The complete353-school audit remains available as screening evidence.
