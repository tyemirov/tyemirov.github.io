# tyemirov.github.io

This repository is the source for `https://tyemirov.net`.

## Publishing Model

Published pages live directly in top-level folders so their URLs stay clean:

- `https://tyemirov.net/civilization/` -> `civilization/`
- `https://tyemirov.net/decisioning/` -> `decisioning/`
- `https://tyemirov.net/freedom/` -> `freedom/`
- `https://tyemirov.net/gallery/` -> `gallery/`

The root site lives in `index.html` and `styles.css`.
Homepage content is driven by `data/site.json` and rendered by `site.js`.

All 14 shared footers use the current menu contract through `assets/js/footer.js`.
The shared assets use literal `@latest` URLs.
The [migration record](docs/mpr-ui-migration.md) contains candidate evidence and central I009 publication steps.

## Global Requirements

Every HTML page in this repository MUST include the LoopAware tracking script at the top of the `<head>` tag:

```html
<script defer src="https://loopaware.mprlab.com/pixel.js?site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b&api_origin=https%3A%2F%2Floopaware-api.mprlab.com"></script>
```

## Add A New Page

1. Create a top-level folder named after the URL slug, for example `my-new-page/`.
2. Put the page entrypoint at `my-new-page/index.html`.
3. Include the **Mandatory Global Script** (LoopAware pixel) in the head.
4. Keep page-specific assets in that same folder.
5. Add a project entry to `data/site.json`.
6. Run the local validation described below.
7. Use the operator publication procedure after deployment readiness passes.

## Edit The Homepage

- Update `data/site.json` to change the hero copy, profile text, external buttons, writing links, project cards, order, or note.
- Put project companion essays on `projects[].essay`.
- Keep standalone essays in `essays.items`.
- Keep music in `music.items` and art in `arts.items`.
- Use `status: "live"` to show a project on the homepage.
- Use `status: "draft"` or `status: "hidden"` to keep a project in the data file without showing it on the homepage.
- Use the existing card themes: `copper`, `teal`, `olive`, `slate`, `amber`, `indigo`, `violet`.

## Migrating An Existing Standalone Repo

1. Copy the production files into a top-level folder here.
2. Keep only the assets needed to serve the page unless you intentionally want source or test files in this repo.
3. Verify the page locally from this repo before deleting or archiving the old standalone repo.

## Local Website

Install Docker with Compose.
Start Docker before you start the local services.

The default private media directory is `~/.local/share/tyemirov-site/music`.
This directory contains `selected.json` and the prepared media packages for the current catalog.
The [media preparation procedure](docs/private-hls-operations.md#private-audio-preparation) describes package preparation.

To use another private media directory, set its path in your shell:

```bash
export MUSIC_LOCAL_ROOT="/absolute/path/to/private/media"
```

Start the website and media service:

```bash
make up
```

Open `https://localhost:8444/readyz` and accept the local HTTPS certificate.
Then open `https://localhost:8443` and accept the local HTTPS certificate.
HTTPS is required for the music authorization cookie.
The website and media API use separate local origins, as in production.

`make up` builds the production Pages artifact and the production media service from the current source.
The local Caddy container serves the Pages artifact and the HTTPS media route.
The media initialization container enables local HLS playback from the private index and generates the corresponding allowlist.
It copies the prepared packages into a retained Docker volume.
The local catalog uses the titles and metadata from `data/site.json`.
The service reads `/media/selected.json`, `/media/allowlist.json`, and `/media/packages` from that volume.
The command returns after the website and media service pass their health checks.
After source changes, run `make up` again to rebuild the site and service.
To select other ports, run `make up UP_PORT=8445 MUSIC_PORT=8446`.

Stop the local services:

```bash
make down
```

`make down` removes this Compose project's containers and network.
The private media volume and local certificate remain available.

## Local Validation

Use Docker, Node.js, npm, Git, and FFmpeg for the local lifecycle integration test.
Install the test dependencies and run the test:

```bash
npm ci --ignore-scripts
npx playwright install chromium
make local-test
```

This test uses generated audio in a temporary directory and a separate Compose project.
It checks startup, HTTPS, media authorization, silent browser playback, repeated startup, and shutdown.

Use Docker and a sibling `mprlab-gateway` checkout:

```bash
make music-ci-container
make music-container-test
```

The first command runs `make ci` in Linux with managed headless browsers and muted audio.
It uses committed Gateway source for isolated lifecycle plans and source checks.
The second command builds the actual Pages and media images and verifies their public behavior.
Both commands can run on a headless CI server.
The [operations runbook](docs/private-hls-operations.md) gives native toolchain and media preparation commands.

## Publication

The application declares its resources in `.mprlab/deploy/resources.yml`.
The website uses GitHub Pages on `gh-pages`, with `tyemirov.net` as its domain.
Gateway adds `CNAME`, `.nojekyll`, and `/.mprlab-release.json` to the publication artifact.
`Dockerfile.pages` exports the public site content.
The media backend uses the computercat inventory group and `audio.tyemirov.net`.

After production prerequisites pass, the operator runs:

```bash
make release && make publish && make deploy
```

These commands delegate to the sibling Gateway checkout.
The [validation record](docs/private-hls-validation.md) identifies completed checks and remaining production prerequisites.
