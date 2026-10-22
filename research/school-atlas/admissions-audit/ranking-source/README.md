# National ranking source reconstruction

Retrieval date: 2026-10-20. The machine-readable candidates reconstruct **secondary transcriptions** of U.S. News's **2026-2027** national rankings. They do not constitute independent verification against the publisher.

`candidates-1-400.json` is the ordered audit universe. `candidates-1-500.json` extends it through rank 500. `coverage.json` records exact-rank gaps, duplicates and state coverage. Candidate files preserve city/state/profile URL and the exact source endpoint used for each rank.

All 50 state lists plus DC are represented. The public HighSchoolTrends state HTML generally shows only its first 50 schools. Its shipped `StateSchoolsPage.tsx-BsgUe-Ny.js` invokes `/api/schools/by-state/{state}?limit=200` on the public API origin `https://unified-api-production-691b.up.railway.app`. The stored API snapshots provide up to 200 records per state and national ranks, exposing the rest of the top 500. No authentication was used. The national and atlas HTML identify this edition as 2026-27. API `rank_year` equals 2026 for all extracted candidates. `source_year` is preserved separately because it can identify the preceding school-data year rather than the rank edition.

The primary U.S. News national-ranking URL was attempted; its failure status and response are preserved. The public secondary page explicitly attributes its ranks to U.S. News. A secondary data provider's attribution is not primary verification.

`source-manifest.json` preserves source URL, HTTP status, retrieval date and SHA-256 hash. `snapshots/` contains unmodified response bodies. The parser uses only frozen successful state JSON responses; it selects exact integer ranks, orders them numerically, rejects conflicting duplicate ranks and fails if any rank from 1 through 400 is missing. Profile URLs use the API's explicit school slug; publisher school IDs are not inferred from those slugs.

To reproduce from snapshots:

```sh
python3 research/admissions-audit/ranking-source/parse.py
```

To intentionally refresh public responses first:

```sh
python3 research/admissions-audit/ranking-source/fetch.py
python3 research/admissions-audit/ranking-source/parse.py
```

This source reconstruction establishes the ranking universe only. Admission eligibility requires separate official evidence.
