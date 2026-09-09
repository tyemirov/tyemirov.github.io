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

## Local Validation

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
