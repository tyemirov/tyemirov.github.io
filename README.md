# tyemirov.github.io

This repository is the source for `https://tyemirov.net`.

## Publishing Model

Published pages live directly in top-level folders so their URLs stay clean:

- `https://tyemirov.net/civilization/` -> `civilization/`
- `https://tyemirov.net/decisioning/` -> `decisioning/`
- `https://tyemirov.net/freedom/` -> `freedom/`
- `https://tyemirov.net/gallery/` -> `gallery/`

The root site lives in `index.html` and `styles.css`.

## Add A New Page

1. Create a top-level folder named after the URL slug, for example `my-new-page/`.
2. Put the page entrypoint at `my-new-page/index.html`.
3. Keep page-specific assets in that same folder.
4. Add a link from the root landing page.
5. Push this repo. GitHub Pages will publish it under `https://tyemirov.net/my-new-page/`.

## Migrating An Existing Standalone Repo

1. Copy the production files into a top-level folder here.
2. Keep only the assets needed to serve the page unless you intentionally want source or test files in this repo.
3. Verify the page locally from this repo before deleting or archiving the old standalone repo.

## Notes

- `CNAME` keeps the custom domain bound in-repo.
- `.nojekyll` disables Jekyll processing so folders are served as plain static content.
