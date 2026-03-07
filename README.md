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

## Add A New Page

1. Create a top-level folder named after the URL slug, for example `my-new-page/`.
2. Put the page entrypoint at `my-new-page/index.html`.
3. Keep page-specific assets in that same folder.
4. Add a project entry to `data/site.json`.
5. Push this repo. GitHub Pages will publish it under `https://tyemirov.net/my-new-page/`.

## Edit The Homepage

- Update `data/site.json` to change the hero copy, profile text, external buttons, project cards, order, or note.
- Use `status: "live"` to show a project on the homepage.
- Use `status: "draft"` or `status: "hidden"` to keep a project in the data file without showing it on the homepage.
- Use the existing card themes: `copper`, `teal`, `olive`, `slate`.

## Migrating An Existing Standalone Repo

1. Copy the production files into a top-level folder here.
2. Keep only the assets needed to serve the page unless you intentionally want source or test files in this repo.
3. Verify the page locally from this repo before deleting or archiving the old standalone repo.

## Notes

- `CNAME` keeps the custom domain bound in-repo.
- `.nojekyll` disables Jekyll processing so folders are served as plain static content.
