# Tyemirov's Gallery

The gallery is a static browser frontend at `/gallery/`.
It uses HTML, CSS, and JavaScript modules.

## Current Behavior

The root `data/site.json` file contains the public gallery catalog.
Each artwork has one record with a permanent identifier.
Collections and exhibits refer to those identifiers in their own order.
Collections remain available after an exhibit closes.

The entrance shows the populated Now Showing, Upcoming, Collections, and Past Exhibits groups.
Each exhibit has dated sections with ordered artwork references.
Collections and artworks have direct routes.
The lightbox supports Previous, Next, arrow keys, and Escape.
The artwork label shows its medium, year, and pixel dimensions.

An active offer shows its price, license, included file, and delivery terms.
The four migrated artworks have no active offers.
Their previous print, edition, and color-profile claims require owner review.
The basket stores offer identifiers in `localStorage`.
The basket links to checkout when all selected offers use one currency.
Buyer payment requests use the gallery API.

The `images/full/` files are public display images.
They are not private sale masters.

## Buyer Orders

Checkout sends offer identifiers, the receipt email, and the public catalog digest to the API.
The API supplies the purchase price and terms.
The buyer must review these terms and keep the access code before the page shows the PayPal link.
`Save access details` downloads the order link and its separate access code as a text file.
If the creation response is lost, `Retry order` uses the same request identity and contents.

Order creation removes the selected offers from the basket.
Other open gallery tabs receive the basket change.
If browser storage fails, the created order and its access code remain available.

The buyer opens `/gallery/order/?order=ORDER_ID` and enters the order access secret from checkout or the receipt.
The page reads the API origin from `/config-site.json`.
The generated production origin is `https://api.tyemirov.net`.
This configuration does not deploy the API or activate sales.

The page shows the stored purchase price, license, file specification, and receipt status.
The buyer can return to PayPal, request server payment capture, or cancel an order before capture starts.
Payment callbacks do not authorize downloads.
The page shows downloads only after the server reports verified completion and active entitlements.

Each download requests a new ten-minute grant.
The client verifies the original image checksum against the purchased revision before it saves the file.
Expired grants permit a new attempt through the same download control.
A verified refund prevents subsequent file access.
The page keeps the purchase details when a request fails.

The page sends access secrets in authorization headers, never in URLs.
It does not put secrets in browser storage.
Reload, navigation, and `Close order` remove the secret and private order details from the page.
A route change cancels pending requests and rejects results from the previous order.
The page reports malformed responses without their raw contents.

## Local Use

From the repository root, start the local stack:

```bash
make up
```

Open [the local gallery](https://localhost:8443/gallery/).
The stack uses gHTTP and the existing local certificate authority.
The root README describes the required private music input.
The gallery API is available at `https://localhost:8445`.
The local site reads that origin from its prepared API configuration.
The API keeps private images and drafts in the `gallery-data` volume.
The local signing key stays outside the public site directory.
The local gallery uses `--payments=paypal` and `--receipts=pinguin` with the local provider implementations.
The payment approval page uses `https://localhost:8446` and does not transfer money.
The local mail sink stores receipts without external email delivery.
Use `make local-receipts` to inspect those messages.

Stop the stack with:

```bash
make down
```

## Source Code

| Path | Purpose |
| --- | --- |
| `../data/site.json` | Public artwork, collection, and exhibit records |
| `images/previews/` | Public card images |
| `images/full/` | Public lightbox images |
| `js/core/` | Catalog validation, routes, basket, and HTTP requests |
| `js/ui/` | Gallery views and metadata |
| `js/app.js` | Public gallery setup and event handlers |
| `order/index.html` | Buyer access and purchase page |
| `/config-site.json` | Public gallery API origin |
| `js/order.js` | Buyer page state and event handlers |
| `../tests/gallery/` | Browser integration tests |

## Validation

Run the public gallery checks:

```bash
make gallery-browser-test
```

The tests use the repository website fixture and headless browsers.
They cover independent references, dates, direct routes, image navigation, catalog errors, metadata, and phone layouts.
Buyer tests use the real gallery API with a local PayPal implementation and a supplied test certificate.
The tests verify checkout, exact file bytes, refunds, cancellation, expired grants, invalid responses, and private state removal.
Checkout tests include local payment approval, a lost creation response, changed browser prices, and browser storage failures.
The browser fixture retrieves the current published shared UI assets.
These results do not prove hosted authentication or live-provider acceptance.
The shared homepage checks verify gallery previews and entry links.

## Remaining Work

Studio provides image preparation, drafts, arrangements, publication export, and owner order operations.
F002 still requires internal browser review and provider qualification.
The [Gallery Operating Plan](OPERATING-PLAN.md) defines the complete workflow and its acceptance gates.
Provider and production acceptance remain separate from local tests.

## Reviewed Publication Import

1. Export a publication archive from the gallery API.
2. Run `node scripts/site/import-gallery.mjs ARCHIVE.zip REPOSITORY_ROOT` from the repository root.
3. Review the changed gallery catalog and public images.
4. Run `make site-contract-test pages-build`.

The import preserves local article bodies and all other source content.
A stale base digest stops the import before catalog changes.
Publication retries use the draft ETag and base catalog digest as their identity.
The database keeps that identity for its lifetime.

The [implementation record](../docs/redesign-implementation.md) lists the retained-draft migration and current Studio evidence.
