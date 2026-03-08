# AGENTS.md (Gallery)

## Scope

This directory is a static gallery application hosted as part of the GitHub-served site. The correct architecture for now is static hosting, not a backend rewrite.

Work in this directory should align the implementation and docs to that reality:

- HTML + CSS + vanilla JS ES modules
- No build step
- No runtime Node dependency
- No database
- No authentication
- No server-side checkout logic

If a request genuinely requires a backend, prepare a plan first. Do not quietly introduce server assumptions into the current gallery.

## Current Product Contract

The current gallery already supports:

- Sticky navigation with routes for `#/`, `#/about`, `#/cart`, and `#/exhibits/:id`
- Date-driven grouping into `Now Showing`, `Upcoming`, and `Closed`
- Exhibit detail pages with subtitle, blurb, artwork grid, museum labels, specs drawer, and lightbox
- Basket state in `localStorage`
- Client-side PayPal checkout
- Per-exhibit metadata updates and JSON-LD

The current gallery does not yet support:

- Protected purchased-file delivery
- PayPal webhook verification
- Inventory reservation
- Analytics/event ingestion
- Admin publishing workflows
- Automated test coverage in `gallery/tests/`

Keep docs honest about those boundaries.

## Architecture Rules

- Treat `gallery/` as a self-contained static app.
- Preserve the `/gallery/` base-path assumption when touching canonical URLs, redirects, or asset paths.
- Always serve locally over HTTP. `file://` is not supported because the app fetches JSON.
- Keep business logic in `js/core`, DOM rendering in `js/ui`, and wiring in `js/app.js`.
- Reuse existing modules before adding new ones.
- Prefer data-driven changes in `data/exhibits.json` and `data/site.json` over hard-coded branching.

## Actual Project Layout

- `index.html`: composition root and static shell
- `assets/css/styles.css`: visual system and responsive styles
- `assets/icons/`: favicon assets
- `data/exhibits.json`: exhibit and artwork catalog
- `data/site.json`: brand, payment, and site-level settings
- `images/previews/`: card and cart imagery
- `images/full/`: full-size lightbox imagery
- `images/purchased/`: placeholder only, not a real delivery system
- `js/constants.js`: shared strings and constants
- `js/types.d.js`: typedefs
- `js/core/`: routing, catalog transforms, cart state, data fetching
- `js/ui/`: DOM rendering and metadata updates
- `js/utils/`: low-level helpers

Do not document folders that do not exist as if they are part of the shipped project.

## UX and Content Rules

- Show only the status groups that are populated by the current catalog data.
- Do not assume the homepage must always contain `Now Showing` or `Upcoming`; that depends on exhibit dates.
- Preserve the current tone: cultured, restrained, gallery-first.
- Home cards are browse-first. The current experience opens exhibits from the home grid and adds artworks to the basket from exhibit detail pages.
- Preserve the museum-style label pattern and the `For the curious` specs drawer when editing artwork presentation.
- Keep the design premium and minimal. Avoid turning the gallery into a generic storefront.

## Routing and Data Rules

- Routing is hash-based and intentionally simple.
- Exhibit status is derived from `start_date` and `end_date`.
- Sort `Now Showing` by `start_date` descending.
- Sort `Upcoming` by `start_date` ascending.
- Sort `Closed` by `end_date` descending.
- Site-level configuration belongs in `data/site.json`.
- Exhibit and artwork content belongs in `data/exhibits.json`.

When changing content models, update both the typedefs and the rendering code.

## Static Hosting Constraints

Because the gallery is static, the following are current constraints, not bugs:

- Purchased downloads cannot be securely protected from the client alone.
- The PayPal client ID is public client configuration, not a secret.
- Post-payment fulfillment is limited to client-visible success messaging.
- Any true order verification or download protection requires a separate backend service.

Do not promise backend guarantees in docs unless they exist.

## Security and Metadata

Preserve the existing baseline:

- Semantic HTML structure
- Canonical, OG, Twitter, and JSON-LD metadata
- `Referrer-Policy` and `Permissions-Policy` meta tags
- Keyboard-accessible controls
- Visible focus styles

Current implementation notes:

- There is an inline redirect script in `index.html`.
- CDN resources are used without a full SRI policy.
- No CSP enforcement or manifest-based PWA layer is currently in place.

If you improve these areas, document the change accurately. If you do not improve them, do not claim they exist.

## Testing and Tooling

Current reality:

- There is no `gallery/tests/` harness yet.
- `// @ts-check` and `types.d.js` are already part of the codebase.
- Runtime code must stay buildless.

If you add tests later, keep them optional for local runtime and avoid introducing a bundler requirement.

## Documentation Rules

- Prefer alignment over aspiration. Document what ships now.
- If the implementation is intentionally static, say so plainly.
- If a feature is planned but absent, label it as future work.
- If docs drift from code, update docs unless the task explicitly asks to implement the missing feature.

## Acceptance Criteria For Current-State Work

Use these when judging whether a gallery change is aligned with the current product:

1. The site runs as a static app over HTTP with no backend dependency.
2. The homepage renders whichever exhibit status groups are populated by `data/exhibits.json`.
3. Exhibit detail pages show title, optional subtitle, status badge, date range, blurb, and artwork grid.
4. Artwork cards keep the museum label, price, specs drawer, and add-to-basket action.
5. The basket updates quantities, shows subtotal, and renders PayPal buttons when the SDK is available.
6. Metadata updates remain correct for the gallery home and exhibit routes.
7. The experience remains responsive and keyboard-navigable.

## Backend Trigger Plan

If a future task requires a backend, do not implement it ad hoc. Use this phased plan:

1. Define the minimum missing capability: signed downloads, webhook verification, inventory control, analytics ingestion, or admin publishing.
2. Keep the frontend static in `gallery/`.
3. Introduce a small separate API service on a lightweight platform.
4. Move purchased assets to private object storage and serve them through expiring URLs.
5. Add PayPal webhook verification before any fulfillment workflow.
6. Add persistent order logging before building admin tooling.

Until those triggers exist, static GitHub-hosted delivery remains the default and preferred architecture.
