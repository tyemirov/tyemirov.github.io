# School Atlas evidence

This directory contains the public source files from commit `fd603dc68d1e6799e4f74013e64c67dd063e6416`.
The import contains 973 tracked files and excludes three Python cache files.
`import-manifest.json` records each original path and SHA-256 digest.
`frozen-payloads.json` preserves the seven original data payloads.

The canonical research root is `research/school-atlas/`.
The canonical output root is `school-atlas/`.
Each generated data module has one default ES module export.
The calculator has the named export `calculate`.

## Generate

Run this command from the repository root:

```sh
python3 research/school-atlas/regenerate.py
```

The command uses the preserved source files.
It preserves all 300 school IDs, ranks, model values, and source retrieval times.
Evidence paths use the canonical research root.
A source file digest changes when its embedded evidence paths change.
The command generates both audit pages with the site assets.
Both generators read the companion article URL from `data/site.json`.

To use a separate output directory, set `SCHOOL_ATLAS_OUTPUT_ROOT`.
The output directory must be within this checkout for the Node ES module checks.
The generators also update their research reports and source manifests.

## Check

Run these commands from the repository root:

```sh
node research/school-atlas/check-frozen.mjs
node research/school-atlas/value-model/check-calculation.mjs
node research/school-atlas/value-model/check-catalog.mjs
python3 research/school-atlas/family-budget/check-source.py
```

The frozen-source check compares all seven generated payloads with the imported payloads.
It permits canonical evidence paths and the digest of the relocated campus map.
It also checks both generated audit pages for the required site assets.
The catalog check verifies three distinct cohorts of 100 schools and all 300 rent inputs.
The model checks verify day costs, boarding costs, and known cost limits.

## Source review

The import review found no environment files or private keys.
GitHub push protection identified Mapbox access tokens in two archived HTML files.
The archive now replaces both token strings with `[REDACTED_MAPBOX_ACCESS_TOKEN]`.
Some public HTML files contain website translation, CMS, or monitoring client configuration.
The import retains original digests and records each token replacement in `import-manifest.json`.
The original source checkout remains unchanged.
The other Markdown files are imported source notes.
Their commands describe the original layout.
Use the commands in this README for the current layout.
`cost-evidence-source.md` preserves the original cost evidence notes.
