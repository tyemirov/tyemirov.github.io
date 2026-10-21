# Private-campus community gap evidence

Rebuild offline from the repository root:

```sh
python3 research/private-schools/coverage/sources-community/build-overrides.py
```

`mappings.json` records reviewed campus addresses, locality selections, county-equivalent codes and official supporting URLs. `community-overrides.json` contains school-ID keyed rows and a SHA-256 source manifest. Raw AARP 2025 scores, current Census address-geography replies, official school pages, the Madison County planning packet and BEA state RPP archive are pinned here; shared Census and metro BEA inputs remain under `research/`.

All 33 reviewed schools have six-category AARP means and 2024 BEA price inputs. Twenty-eight use the campus county's metropolitan area. Five use an explicit broad state fallback because the county-equivalent has no metropolitan-area assignment in the July 2023 delineation: Hotchkiss (Connecticut), St. Paul's (New Hampshire), Deerfield (Massachusetts), UWC-USA (New Mexico), and Woodberry Forest (Virginia). State RPP is not a local or nonmetropolitan-only estimate.

County and municipality scores are locality proxies; they do not describe campus blocks or family residential locations. Bronx and Brooklyn use their county/borough geographies. Montezuma and Woodberry Forest use broad county proxies. West Roxbury uses Boston. The official school website supplies the campus mailing location; Census determines the geographic entity where a current address match exists. For Woodberry Forest and West Roxbury, Census returned no street-address match and county/city government evidence establishes the proxy. Mercersburg's current Academy Drive address also returned no match: the named borough proxy uses its official school/borough locality and a government-published legacy East Seminary campus address, with no claim that every campus parcel is within borough limits. Its county/metro assignment is Franklin County / Chambersburg-Waynesboro.

`official-location-readback.json` records concise factual readbacks of official pages whose raw fetch was unavailable. It includes the exact primary URLs and is hashed alongside other snapshots. Source snapshots record what was returned; a successful HTTP fetch alone does not establish address evidence.
