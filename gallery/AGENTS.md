# Gallery Agent Guide

## Scope

Keep the public frontend static under `/gallery/`.
Use HTML, CSS, and JavaScript modules without a browser build requirement.
The root agent guide and policy control this directory.

F002 authorizes the separate gallery API and Studio workflow in `OPERATING-PLAN.md`.
Keep private assets, authentication validation, orders, and payment verification in that API.
Keep browser authentication under the shared MPR UI and TAuth contract.
Do not add an application-owned login flow.

## Content Authority

Use the root `data/site.json` gallery record for public content.
Validate the record with `js/core/catalog.js` at its input boundary.
Keep one record for each artwork.
Use ordered artwork references in permanent collections and dated exhibit sections.
Reject unknown fields, private image paths, invalid dates, and broken references.
Keep only the current catalog shape.

A non-null offer describes an active digital product.
The offer contains its price in cents, currency, license, file revision, included file, and delivery terms.
The four migrated artworks have no active offers.
Do not restore unverified print, edition, or color-profile claims.
The owner must approve sale masters, prices, and terms before production sales.

## Frontend Structure

- Keep catalog validation, routes, basket persistence, and HTTP requests in `js/core/`.
- Keep DOM rendering and metadata in `js/ui/`.
- Keep application setup and event handlers in `js/app.js`.
- Keep the shared header, footer, tracking script, and face favicons.
- Render catalog text with DOM text properties.
- Preserve the museum labels and the image specifications.
- Preserve direct artwork, collection, and exhibit routes.
- Preserve keyboard image navigation and focus after lightbox closure.

## Private Data

The files in `images/full/` are public display images.
They do not provide protected delivery.
Keep purchased masters outside the Pages artifact.
Export only the reviewed public catalog and its referenced images.
Never use a browser payment callback to grant file access.

## Validation

Use `make gallery-browser-test` for the public gallery contract.
Use the shared homepage browser checks for gallery previews and entry links.
Use `make music-artifact-test` for Pages artifact boundaries.
Keep the phase acceptance records in `../docs/homepage-gallery-validation.md`.
Run the full repository CI at the final stack checkpoint defined by the root policy.
Keep local, provider, internal-browser, and production evidence separate.
