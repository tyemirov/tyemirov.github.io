# Tyemirov's Gallery

The gallery is a static application at `/gallery/` on the personal website.
It uses HTML, CSS, and JavaScript modules.

## Current Behavior

- The homepage shows artwork previews from the gallery catalog.
- Exhibit dates determine the Now Showing, Upcoming, and Closed groups.
- Exhibit pages show artwork labels, image specifications, and a lightbox.
- Direct exhibit links and browser reloads preserve the selected view.
- The basket stores selections in `localStorage`.
- The existing PayPal integration runs in the browser.

The gallery has no order service or protected download service.
The `images/full/` files are public lightbox assets.
The `images/purchased/` directory contains a placeholder.

## Local Use

From the repository root, start the local stack:

```bash
make up
```

Open [the local gallery](https://localhost:8443/gallery/).
The stack uses gHTTP and the local certificate authority.
The root README describes the required private music input.

Stop the stack with:

```bash
make down
```

## Content and Source Code

| Path | Purpose |
| --- | --- |
| `data/exhibits.json` | Current exhibit and artwork records |
| `data/site.json` | Gallery settings |
| `images/previews/` | Card images |
| `images/full/` | Public lightbox images |
| `js/core/` | Catalog, routes, basket, and data requests |
| `js/ui/` | Page and component rendering |
| `js/app.js` | Application setup and event handlers |
| `tests/` | Catalog and component tests |

## Validation

Run gallery component tests:

```bash
npm --prefix gallery test
```

Run the homepage and gallery browser tests from the repository root:

```bash
make music-browser-test MUSIC_BROWSER_ARGS='tests/music/homepage.spec.mjs'
```

These browser tests use the shared website test server.
They cover responsive layout, gallery entry, direct routes, and the artwork lightbox.

## Proposed Operating Model

Read [the Gallery Operating Plan](OPERATING-PLAN.md) for owner uploads, collections, exhibits, purchases, and private file delivery.
The plan separates current behavior from the proposed Studio and commerce services.
Those services require implementation and provider qualification before sales acceptance.
