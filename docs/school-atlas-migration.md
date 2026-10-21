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

## Companion article dependency

The companion article draft is `docs/school-atlas-substack-draft.md`.
The user has not supplied a publication or an assigned Substack article URL.
The draft has not been published.

The current model catalog requires `sourceUrl`.
Root `AGENTS.md` also requires a Substack companion link on each supporting page.
The migration does not invent a URL or change that contract.
Catalog registration and companion links remain pre-merge requirements.

Before merge:

1. Review the article draft with the user.
2. Create the Substack draft in the selected publication.
3. Record the actual article permalink assigned by Substack.
4. Add the model entry to `data/site.json` with that `sourceUrl`.
5. Add the companion link to the application and both evidence pages.
6. Update the evidence generators to preserve that link.
7. Verify catalog filters, page navigation, and sitemap registration.
8. Repeat the affected checks and final repository CI.

Use the `Modeling` category, `teal` theme, and `vadym-tyemirov` owner for the model entry.
The model title is `School Atlas`, and its canonical route is `/school-atlas/`.

## Operator cutover

The current PR prepares source and validation only.
Production activation remains an operator action after merge and the companion requirements above.

Use the existing lifecycle:

```sh
make release && make publish && make deploy
```

After deployment, verify `/school-atlas/` and `/.mprlab-release.json` on `https://tyemirov.net`.
Verify all three school groups, a CSV download, and the two evidence pages.
Verify that selecting a school works and refresh clears its selection.
Then update shared links to the new canonical URL and retire the previous Sites copy.
