# School Atlas migration

## Source and route

School Atlas serves `/school-atlas/` from the existing GitHub Pages artifact.
The application source is `school-atlas/`.
The reviewed research source is `research/school-atlas/`.
The import source commit is `fd603dc68d1e6799e4f74013e64c67dd063e6416`.

The import preserves the school records, ranking editions, admission evidence, cost assumptions, and calculation results.
The three school groups each contain 100 unique schools.
The private group contains 96 day alternatives and 32 boarding alternatives under 100 school IDs.

The Pages artifact contains the application and its two evidence pages.
Research snapshots and the former Sites configuration are excluded from the artifact.
The destination repository is public, so committed evidence remains publicly readable through GitHub.

## Interface changes

The application uses ES modules.
The calculation module exports `calculate` for browser use and calculation checks.
Generated data modules export their payloads directly.

Valid cost preferences persist automatically in browser storage.
Invalid input remains visible until the reader corrects it.
Storage errors remain visible and do not erase the last saved preferences.

The new origin starts with default cost preferences.
Preferences from the previous Sites origin do not transfer automatically.
Refresh clears the selected school while the URL retains the school group and attendance mode.

## Validation

Use these checks during development:

```sh
make school-atlas-check
make site-contract-test
make school-atlas-browser-test
make pages-build
```

Run `make ci` after the final code change.
The browser suite checks the actual `/school-atlas/` route.
It covers school groups, selection, refresh, sorting, methodology links, cost persistence, validation errors, and storage failure.

Build the Pages container to verify its separate source allowlist.
Inspect the container output for the application, data modules, and evidence pages.
Verify that research snapshots are absent from that output.

## Companion article

The repository draft is `docs/school-atlas-substack-draft.md`.
The confirmed article permalink is <https://vadymtyemirov1.substack.com/p/what-the-school-ranking-leaves-out>.
Substack draft `221580779` supplies this URL.
The article can remain unpublished while the site uses its confirmed permalink.
Article publication remains a separate operator action.

The catalog entry in `data/site.json` stores this permalink as `sourceUrl`.
The shared page builder supplies the application companion link from that entry.
Both audit generators read the same entry and preserve the companion links during regeneration.
Original source hashes and the seven frozen data payloads remain unchanged.
The import manifest records the updated hashes for the two maintained generators.

The model uses the `Modeling` category, `teal` theme, and `vadym-tyemirov` owner.
Its title is `School Atlas`, and its canonical route is `/school-atlas/`.
The catalog entry supplies the homepage card, article collection, route manifest, and sitemap entry.
The application uses the shared Home and Articles hierarchy.

## Operator cutover

The current PR prepares source and validation only.
Production activation remains an operator action after merge.
Publish the companion article as part of the coordinated launch.

Use the existing lifecycle:

```sh
make release && make publish && make deploy
```

After deployment, verify `/school-atlas/` and `/.mprlab-release.json` on `https://tyemirov.net`.
Verify all three school groups, a CSV download, and the two evidence pages.
Verify that selecting a school works and refresh clears its selection.
Then update shared links to the new canonical URL and retire the previous Sites copy.
