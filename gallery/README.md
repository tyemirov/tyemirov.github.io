# Tyemirov's Gallery

A static virtual gallery for exhibiting and selling digital artwork.

## Architecture

The gallery is intentionally a static site.

- Hosting target: GitHub-hosted static delivery for `/gallery/`
- Runtime: HTML + CSS + vanilla JavaScript ES modules
- Data source: local JSON files in `data/`
- Routing: hash routes such as `#/`, `#/exhibits/:id`, `#/about`, and `#/cart`
- Commerce: client-side PayPal SDK integration
- Persistence: basket state in `localStorage`

There is no backend, database, authentication layer, or signed-download service in the current architecture.

## Local Development

Serve the repository over HTTP. Do not open the gallery via `file://`, because the app fetches JSON at runtime.

From the repository root:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/gallery/
```

## Current Feature Set

- Homepage with exhibits grouped by date-driven status: `Now Showing`, `Upcoming`, `Closed`
- Exhibit detail page with artwork grid, museum-style labels, specs drawer, and lightbox
- Basket with quantity editing, subtotal calculation, and PayPal checkout
- About page
- Per-route metadata updates for exhibit pages, including JSON-LD
- Data-driven catalog from `data/exhibits.json` and site settings from `data/site.json`

## Current Constraints

- The current content schedule determines which status groups appear. If all exhibits are in the past, the homepage will show only `Closed`.
- Purchased asset delivery is not implemented. `images/purchased/` is a placeholder only.
- Analytics events are not wired yet.
- There is no automated test harness in `gallery/` yet.
- Images are lazy-loaded, but there is no responsive image pipeline or protected media flow.

## Project Layout

```text
gallery/
  index.html
  assets/
    css/
    icons/
  data/
    exhibits.json
    site.json
  images/
    previews/
    full/
    purchased/
  js/
    app.js
    constants.js
    types.d.js
    core/
    ui/
    utils/
```

## Deployment Notes

- Keep the gallery static unless a concrete requirement cannot be met without a server.
- Preserve the `/gallery/` path assumption when changing canonical URLs, redirects, or asset paths.
- Treat the PayPal client ID as public client configuration, not a secret.

## Backend Plan If Needed Later

Add a backend only when the static model becomes insufficient. The likely triggers are:

1. Verified post-payment fulfillment is required.
2. Purchased downloads must be protected with expiring links.
3. Edition inventory must be reserved or decremented centrally.
4. Analytics or event collection must be stored server-side.
5. Content publishing requires an admin workflow instead of direct JSON edits.

Recommended rollout if that happens:

1. Keep the frontend static and continue serving the gallery from GitHub-hosted infrastructure.
2. Add a small API layer separately, not inside the static site, using a lightweight platform such as Cloudflare Workers, Fly.io, or Railway.
3. Move purchased assets to private object storage and serve them through short-lived signed URLs.
4. Add PayPal webhook handling for payment verification before fulfillment.
5. Add a minimal order record and fulfillment log before attempting a full CMS or admin panel.

Until those triggers exist, the right architecture is the current static one.
