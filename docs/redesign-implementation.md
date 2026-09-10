# Redesign Implementation Record

## Scope

This record describes the working copy on September 10, 2026.
The selected design is [Website And API Redesign](site-redesign.md).
No release, publication, or production deployment occurred during this implementation.
F002 still requires internal browser review, live provider qualification, and production acceptance.

## Implemented Boundaries

- Complete source and public catalog schemas use JSON Schema 2020-12.
- Explicit OpenAPI 3.1 contracts own application paths and transport records.
- `make contracts-generate` produces browser validators, transport types, API schemas, and Go route constants.
- Full local article pages retain source links, known publication times, and local images.
- The public catalog excludes article bodies and draft editorial records.
- Generated article, album, and gallery pages have physical files and canonical URLs.
- The route manifest and sitemap derive from the same selected catalog.
- `/config-site.json` selects one API origin from the deployment manifest.
- Native music and gallery API paths retain their prefixes through the shared proxy.
- The music cookie uses `__Secure-music-session`, with `Path=/music` and no domain attribute.
- Gallery checkout rejects stale catalog digests and requires another buyer review.
- Publication retries retain their original archive after later draft changes.
- Publication import changes only gallery source content and referenced public images.
- Local payment approval, receipts, private media, and gallery data survive service restarts.
- Studio provides Library, Collections, Exhibits, Orders, and a reviewed publication export.
- Shared session recovery preserves unsaved drafts.
- Local TAuth uses the same retained development key as the gallery API.

The article migration record is [article-import.json](article-import.json).
The four articles contain full source text, with subscription controls removed.
A comparison of source and local text found no word or punctuation differences.
The [catalog migration record](catalog-migration.json) lists each selected content identifier.
Source records do not establish series membership.
No series membership was invented.
The existing artwork IDs and track IDs remain unchanged.
All four public artworks retain null offers.

## Retained Draft Migration

The runtime accepts only the current gallery shape.
The one-off command changes an obsolete stored draft into that shape.
It removes `siteUrl`, adds the selected gallery label and title, and increments the draft revision.
It preserves private master mappings and other database tables.
A second invocation rejects the already migrated draft.

1. Stop the selected gallery service before migration.
2. Create and verify its database backup through the gallery backup command.
3. Run `node scripts/site/migrate-gallery-draft.mjs DATABASE_PATH data/site.json`.
4. Start the gallery service with the current public catalog.
5. Verify owner draft access and the new ETag.
6. Remove the migration command after all selected retained databases use the current shape.

This implementation did not migrate a production database.
The migration command remains available for the separately authorized cutover.

## Shared Dependencies

The [published config loader](https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/mpr-ui-config.js) now supplies the nested authentication contract.
The final retrieval resolved all three shared assets to release `4.0.0`.
Studio uses `/config-ui.yaml`, the shared header, documented authentication events, and `MPRUI.authenticatedFetch()`.
The browser makes no protected workspace request before the shared authenticated event.
The API denies authenticated non-owners.
The public Google client ID matches the selected tenant input.

The browser harness retrieves the literal `@latest` assets for each test process.
It rejects mixed release metadata and records the resolved version and file digests.
Those records are evidence, not dependency pins.
The record is `output/playwright/shared-ui-published/metadata.json`.

The TAuth source manifest identifies HTTP capability `tauth.http`.
The selected application manifest routes `/auth` to that capability.
The Google browser routes stay under `/auth`.
Local Google acceptance still requires the exact HTTPS website origin in the provider configuration.

Internal browser review and live Google, PayPal, and Pinguin acceptance remain separate requirements.
The current internal review tool returns `sky requires node_repl; configure NODE_REPL_TRUSTED_SERVICES`.
The producing agent cannot complete that review through the available internal controls.
The browser tests use the published shared components and local provider protocols.
Production sales remain disabled until the owner selects masters, prices, license, and delivery terms.

## Validation

The implementation first failed the new contract, static-page, native-path, stale-catalog, publication-retry, import, and migration checks.
Focused checks now cover those public boundaries.
The local stack test completed music playback, checkout, verified payment, exact original download, receipts, and retained state after restart.
The article review covered all four articles at widths of 390, 769, and 1280 pixels.
The browser checks confirmed complete images, visible source links, and no horizontal overflow.
The review corrected the shared header colors on article pages.
These checks do not replace the required internal browser review.

| Command or boundary | Result |
| --- | --- |
| `make site-contract-test` | Seven checks passed, including source projection, publication import, retained draft migration, generated pages, and article image inclusion. |
| `make music-api-test` | The music service suite passed with the Go race detector. |
| `make gallery-api-test` | The gallery service suite passed with the Go race detector. |
| `make gallery-contract-test`, `make gallery-check`, `make music-check` | Passed. |
| `make lifecycle-contract-test` | The isolated gateway plan passed for the selected manifest. |
| `make local-test` | Three checks passed through the persistent local stack. |
| `make music-load-test` | The local load check passed through the native music paths. |
| `make gallery-container-test` | The gallery container check passed. |
| `make music-container-test` | Both checks passed, including the complete Pages export with Studio. |
| Focused browser checks | All 236 catalog, layout, navigation, and footer checks passed across four browser configurations. |
| Studio browser checks | All 36 checks passed across four browser configurations, with the current published shared UI. |

The final `make ci` command passed after the last implementation change.
Its browser suite reported 491 passes, 21 configuration-specific skips, no failures, and no flaky results.
The same command passed the gallery service suite, executable contract checks, and static checks.
The browser result is `output/playwright/music-results.json`.
The skipped cases do not establish acceptance for their excluded browser configurations.

The Governor check and `git diff --check` passed.
The technical prose checker reported no findings in the selected documents.
The changed prose received the required language review.
These results do not certify unchanged historical prose.

Production deployment, live Google and payment acceptance, and the required internal browser review did not occur.
The internal review tool still reports `sky requires node_repl; configure NODE_REPL_TRUSTED_SERVICES`.
