# Family rental housing

The comparison uses the **FY2027 HUD Small Area Fair Market Rent for a 3-bedroom rental in each school's campus ZIP**. The workbook is effective October 1, 2026 and was retrieved October 20, 2026 from https://www.huduser.gov/portal/datasets/fmr/fmr2027/FY27_safmrs.xlsx, linked on https://www.huduser.gov/portal/datasets/fmr/smallarea/index.html. The primary workbook was downloaded using the browser after command-line requests received an empty AWS WAF challenge. Its unmodified bytes and SHA256 are pinned here.

All 300 displayed school IDs have a mapped ZIP and a matching HUD 3-bedroom gross-rent benchmark. A ZIP may span more than one HUD area; the build accepts it only when the 3-bedroom figure is identical across all matching rows. Otherwise it leaves the rent missing. There is no metro or statewide rent fallback.

A HUD fair market rent is a modest standard-quality rental benchmark, not the current asking rent of a particular detached house or guaranteed rental availability. It includes tenant-paid utilities except telephone/internet. Campus ZIP is a transparent nearby-family-location proxy; it does not establish that a rental is within a school's attendance boundary. In a locality with multiple ZIPs, the campus ZIP is more specific than city-wide rent but does not represent every neighborhood where a family might live.

## Address evidence

`campus-mappings.json` preserves each source, chosen ZIP, and mapping note. Existing reviewed official school addresses take precedence for private schools. Additional official-school tuition/contact snapshots are parsed only when exactly one state-matching ZIP appears. Public campus street addresses come from the pinned ranking-source snapshot and are matched through the Census address geocoder with a unique returned address and matching state.

Unresolved addresses are joined to the official NCES EDGE current school-location services: public 2024–25 and private 2023–24, exposed at https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Public_School_Locations_Current/FeatureServer/0 and https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Private_School_Locations_Current/FeatureServer/0. Dataset metadata is published at https://catalog.data.gov/dataset/public-school-locations-2024-25 and https://catalog.data.gov/dataset/private-school-locations-current. Exact normalized-name/state matches are automatic. Abbreviations and school-name variants require explicit reviewed records in `reviewed-nces-matches.json`. Five remaining entries use current school contact pages, with addresses and source URLs pinned in `reviewed-official-matches.json`. These five official pages were read through the web browser/search renderer on October 20, 2026; raw HTTP snapshots are preserved where the site permitted retrieval. The reviewed address facts, rather than unrelated page prose, are retained.

## Rebuild

From the primary checkout:

```sh
python research/family-housing/map-campuses.py
python research/family-housing/fill-nces.py
python research/family-housing/build-housing.py
```

The first two commands reuse pinned network snapshots, requesting only absent ones. For a strictly offline release rebuild from the reviewed address mappings, run only `build-housing.py` (Python standard library). It emits `dist/family-housing.js`, the readable `housing-data.json`, `gap-report.json`, and source-file SHA256 manifest. The deployed payload is `window.SCHOOL_ATLAS_FAMILY_HOUSING.schools[school_id]`. No source dataset, school cohort, or ranking is changed by this pipeline.

Regis (10028): $5,640/month gross rent; St. Andrew's Delaware (19709): $2,410/month. These are the same HUD year, bedroom count, and benchmark definition. For a boarding student whose family remains at its current home, the school-campus rent must not be added to the household's cost; the model uses the separate home-spending scenario instead.
