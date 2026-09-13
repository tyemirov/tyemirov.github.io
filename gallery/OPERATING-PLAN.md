# Gallery Operating Plan

The proposed [website and API redesign](../docs/site-redesign.md) owns the new page paths, API routes, and shared content contracts.
This operating plan retains the gallery product requirements.

## Status

This document proposes the gallery workflow requested on September 9, 2026.
It is a new design, not a recovered historical plan.
The current gallery stores four artworks once in the root catalog.
Permanent collections and dated exhibits refer to these artworks.
Public routes, phone layouts, and keyboard image navigation pass 48 browser checks.
The migrated artworks have no active sale offers.
Owner uploads, protected purchases, and automatic file delivery require the implementation phases below.

## Product Model

| Record | Purpose | Contents |
| --- | --- | --- |
| Artwork | One work with a permanent ID | Title, description, year, medium, dimensions, public images, private master reference, sale offer |
| Collection | A permanent group of related works | Title, introduction, cover, ordered artwork IDs |
| Exhibit | A dated presentation | Title, introduction, cover, start date, end date, ordered sections and artwork IDs |
| Sale offer | The product available for purchase | Artwork ID, price in cents, currency, license text, file revision, availability |
| Order | The record of a purchase | Buyer, offer snapshots, totals, payment IDs, status, download entitlements |

An artwork can appear in multiple collections and exhibits.
These records refer to the same artwork ID.
Changes to exhibit arrangement do not change a collection.
Collections remain available when an exhibit closes.
Exhibit dates control the Upcoming, Now Showing, and Past Exhibits groups.
Sale availability belongs to the offer and is independent of exhibit dates.

## Owner Studio

The owner opens a private Studio with four areas: Library, Collections, Exhibits, and Orders.
The public gallery contains no Studio controls.

### Upload and prepare

1. Drop one image or a group of images into Library.
2. Save each original in private storage with a checksum and a permanent asset ID.
3. Read the actual pixel dimensions and file format from the image.
4. Generate separate card and lightbox images with a maximum long edge of 640 and 1600 pixels.
5. Preserve the original aspect ratio and color profile in the private master.
6. Review the public image crop, title, alt text, medium, year, and description.
7. Save the artwork as a draft.

The Studio shows upload progress and reports each failed file separately.
A checksum match offers the existing asset for reuse.
Replacing a master creates a new asset revision.
Existing orders retain their purchased revision.
Original filenames and private storage paths stay outside public JSON.

### Arrange and publish

1. Create a collection or exhibit and enter its introduction.
2. Select works from Library.
3. Drag works into order, or use keyboard-accessible Move Up and Move Down controls.
4. For an exhibit, arrange works into named sections and set the dates.
5. Select a cover and choose its crop.
6. Preview the complete presentation at desktop and phone widths.
7. Examine image descriptions, dates, references, and sale offers.
8. Export one reviewed publication candidate.
9. Publish the candidate through the repository release process.

Saving a draft does not publish it.
The Studio records draft changes on the server and reports save failures.
Publication uses one complete snapshot, so visitors cannot receive half of an exhibit.
The current owner controls the production release.

## Visitor Experience

The gallery entrance shows current exhibits, upcoming exhibits, collections, and past exhibits.
Each section appears only when it contains work.
A collection opens as a permanent ordered group.
An exhibit opens with its introduction, dates, sections, and artwork sequence.
An artwork opens in a large image view with Previous, Next, Escape, and keyboard controls.
The label shows the actual medium and file dimensions.
A sale offer shows the price, license, included file, and delivery terms before checkout.
Works without an active offer remain available to view.

## Purchase and File Delivery

The proposed first product is a digital download with a personal-use license.
The owner must approve the license and price before an offer becomes active.
Physical prints and limited editions require separate products and inventory rules.
The existing edition numbers and print claims require owner review before reuse in new offers.

1. The visitor selects an offer and adds it to the basket.
2. The API creates an order from current server prices and offer revisions.
3. The visitor approves payment through PayPal.
4. The API captures the payment and records its provider IDs.
5. The API verifies the PayPal webhook and matches the order, payee, amount, and currency.
6. After verified payment completion, the API creates download entitlements once.
7. The order page shows the purchased files and their license.
8. The API sends a receipt with a private order-access link.
9. The buyer requests a fresh download link from the order page.
10. The API checks the entitlement and issues a link that expires after ten minutes.

The proposed entitlement duration is indefinite for completed purchases.
A download link can expire without canceling the entitlement.
A failed receipt email remains in a retry queue and does not cancel the purchase.
The owner can reissue order access from Orders after buyer verification.
Order access uses an opaque secret, not the public order number.
Refunds and reversals revoke future download access.
A file already received by the buyer cannot be recalled.

PayPal documents webhook signature verification in its [webhook integration guide](https://developer.paypal.com/api/rest/webhooks/rest/).
Its [checkout webhook guide](https://developer.paypal.com/payment-methods/webhooks/) identifies `PAYMENT.CAPTURE.COMPLETED` as a fulfillment event.
Browser payment callbacks alone cannot grant download access.
Duplicate events must not create duplicate entitlements.
An unknown payment result remains pending until provider reconciliation completes.

## Architecture and Content Authority

Keep the public frontend on GitHub Pages at `/gallery/`.
Add a separate gallery API for Studio drafts, uploads, orders, payment events, and downloads.
Use authenticated owner access for Studio operations.
Use the existing MPR authentication contract after its integration requirements are verified.
Keep draft records and order records in persistent storage with backups.
Keep masters in private storage outside the Pages artifact.

The publication candidate must supply the gallery content under the root `data/site.json` contract.
Generate public gallery data from that reviewed candidate.
Migrate the current embedded exhibit artworks into artwork records once.
Remove the old embedded shape after migration.
Published JSON must contain public image references only.
The private order record preserves the purchased master revision and license text.

The existing `images/full/` files are public lightbox assets.
Their current public URLs provide no purchase protection.
New deliverable masters must use private storage and a separate delivery contract.

## Local Orchestration

Extend `make up` to start the gallery API with its database and private asset storage.
Keep gHTTP as the local HTTPS endpoint and reuse the installed local certificate authority.
Serve the gallery API on a separate origin, as with the music service.
Use a local payment provider implementation for deterministic integration tests.
Use a local mail sink to inspect receipts.
Store originals, order records, and drafts in persistent local volumes.
Make `make down` stop the services and retain that data.
Qualify PayPal sandbox payments separately from the local provider tests.
Production payment acceptance remains a separate gate.

## Implementation Phases and Acceptance

| Phase | Deliverable | Acceptance through a public entry point |
| --- | --- | --- |
| 1 | Canonical artwork, collection, and exhibit model | Reuse one artwork in two exhibits, change their order independently, and retain the collection after closure |
| 2 | Owner Studio and image preparation | Upload images, reorder them with mouse and keyboard, reload saved drafts, and export a valid publication candidate |
| 3 | Orders and verified payment | Reject changed client prices, duplicate events, wrong payees, and unpaid download requests |
| 4 | Protected delivery and receipts | Download the exact purchased revision, reject expired links, renew authorized links, and retry receipt delivery |
| 5 | Provider and release qualification | Complete a sandbox purchase, restore a backup, and verify the published catalog against its release |

For each phase, start with a failing integration test through the browser or HTTP API.
Test interrupted uploads, invalid files, draft save failures, and stale publication revisions.
Test payment cancellation, delayed events, duplicate capture requests, refunds, and service restarts.
Test direct links, phone layouts, and keyboard navigation through the public gallery.
Exclude private masters, credentials, and buyer records from every Pages artifact.

## Open Decisions Before Sales

- Confirm the digital license, price, refund terms, and buyer support address.
- Confirm which files are the sale masters and which files are public display images.
- Confirm whether any works need physical prints or limited editions.
- Confirm the production payment account and receipt sender through existing configuration.
