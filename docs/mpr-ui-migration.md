# Shared UI Migration

I001 prepares the personal website for central mpr-ui I009 publication.

## Candidate

The browser tests use B069 revision `768f25936497c5aabd426197d21c2100b6e5d9a1`.
The helper verifies all three shared candidate files before browser use.
The public pages load the CSS and JavaScript bundle with literal `@latest` URLs.

| File | SHA-256 |
| --- | --- |
| `mpr-ui-config.js` | `3f56fbd212a516d2bd8b0b95f73ae7ad82952c10d8d5f4e6f8b44d3233f01304` |
| `mpr-ui.js` | `3e725dbe911470ca934cb46456369479b6ac232eee5ccba2582bf8d939259ae8` |
| `mpr-ui.css` | `351bbf6c15054528a651571d8c8bd85536eea76c3e574f9335e6cd413878923f` |

## Current Contract

All 14 page entry points use one footer initializer.
The initializer obtains project links from `MPRUI.getFooterSiteCatalog()`.
It converts the catalog URLs to the current menu `href` field.
The homepage and music pages retain the contact link from `data/site.json`.
The supporting pages retain their static footer placement and article links.

The shared stylesheet hides the separate attribution prefix.
The menu button retains that attribution.
Consistent box sizing keeps footer padding within the page width.
The homepage and music pages use shared theme configuration for the `data-theme` attribute.
The shared component owns the theme state and color changes.

The content catalog, gallery application, music player, and media service retain their existing contracts.
The tracking pixel remains the first script in every affected page head.
Automated music tests remain silent and headless.

## Local Evidence

The initial browser checks failed because the current menu attribute was absent.
The theme check failed because the current theme control was absent.
Phone-width checks then found footer padding overflow on two supporting pages.
The shared stylesheet correction passed the same checks.
All 36 focused Chromium checks passed, including catalog behavior and delayed library initialization.
Final Linux `make ci` passed with 234 browser checks and 18 engine-specific skips.
All 116 new footer and theme checks passed across the four browser projects.
The lifecycle, artifact, Go race, and media checks also passed.
The complete local log is `/tmp/personal-i001-ci-final.log`.
Both actual Pages and media image checks passed through `make music-container-test`.

Run the focused checks through the existing target:

```bash
make music-browser-test MUSIC_BROWSER_ARGS='--project=chromium shared-ui.spec.mjs catalog.spec.mjs'
```

The full Linux lane runs `make ci` with managed headless browsers and muted audio:

```bash
make music-ci-container
```

## Public Observations And Central Activation

The [public observations](mpr-ui-public-assets-2026-09-09.json) record seven HTTP 200 responses from one network location.
The observation date is September 9, 2026.
Website responses declare a 600-second cache lifetime.
Shared CDN responses declare `max-age=604800, s-maxage=43200`.
The published CSS and JavaScript digests differ from the candidate digests.
These observations establish public responses and asset identities.

Central I009 retains these activation steps:

1. Qualify every consumer against one final shared candidate.
2. Record the final consumer commit and native CI result.
3. Obey the central maintenance and cache plan for coordinated publication.
4. Have the operator publish the shared assets and website Pages artifact.
5. Verify the release marker and asset identities from each required network location.
6. Verify menus, contact links, theme changes, gallery navigation, and music behavior on the published website.

F001 retains its existing music production acceptance gates.
