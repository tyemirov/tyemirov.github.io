# Gallery API

This service stores private assets, Studio drafts, publication archives, orders, and entitlements in SQLite.
The browser Studio is available at `/gallery/studio/`.

## Current Resources

| Resource | Operation |
| --- | --- |
| `GET /gallery/readyz` | Read database readiness |
| `GET /gallery/openapi.json` | Read the generated canonical OpenAPI contract |
| `GET /gallery/assets` | Read an asset page with `limit` and `cursor` |
| `POST /gallery/assets` | Upload one PNG, JPEG, or WebP image |
| `GET /gallery/assets/{assetId}` | Read asset metadata |
| `GET /gallery/assets/{assetId}/{representation}` | Read `master`, `card`, or `lightbox` bytes |
| `GET /gallery/draft` | Read the complete draft and its ETag |
| `PUT /gallery/draft` | Save a complete draft with `If-Match` |
| `POST /gallery/publications` | Export the reviewed `draftEtag` and `baseCatalogDigest` |
| `GET /gallery/publications/{publicationId}/archive` | Download a publication archive |
| `POST /gallery/orders` | Create an order from current server prices |
| `GET /gallery/orders` | Read an owner order page with email and status filters |
| `GET /gallery/orders/{orderId}` | Read a private order, entitlements, and receipt status |
| `POST /gallery/orders/{orderId}/access-reissues` | Record buyer verification and return existing order access |
| `GET /gallery/orders/{orderId}/access-reissues/{reissueId}` | Read the access reissue audit record |
| `PATCH /gallery/orders/{orderId}` | Cancel an unpaid order before its first capture attempt |
| `POST /gallery/orders/{orderId}/captures` | Request server capture and report pending verification |
| `POST /gallery/payment-events` | Verify and process PayPal completion, refund, and reversal events |
| `POST /gallery/orders/{orderId}/download-links` | Create a ten-minute grant for a purchased file revision |
| `GET /gallery/downloads/{downloadId}` | Download the purchased file with the grant access secret |

Studio asset, draft, and publication resources require a TAuth session.
Readiness, the API contract, and order creation do not require a session.
Buyer order requests use the order access secret in an `Authorization: Bearer` header.
The owner can also read an order with the configured TAuth session and no `Authorization` header.
An `Authorization` header selects buyer access and must contain the correct order secret.
Order lists and access reissues require the configured owner session.
The service uses the published TAuth session validator with issuer `tauth`.
The tenant and owner email must be the same as the configured values.
Browser requests that change state must supply the configured origin.
PayPal event requests require the provider verification headers.
Responses use `Cache-Control: no-store`.
Errors contain `code`, `message`, and `requestId`.

## Storage and Publication

A gallery asset ID is the SHA-256 checksum of the original bytes.
The service stores the original bytes without changes.
The service returns the existing asset when the checksums are equal.
The upload limit is 25 MiB and 40 million pixels.
Card and lightbox images have maximum long edges of 640 and 1600 pixels.
These PNG images preserve the aspect ratio and do not increase the source image dimensions.
All three representations require owner authorization before publication.

The draft contains the public gallery shape and a private artwork-to-master map.
A draft can contain incomplete presentation references.
Publication rejects incomplete metadata, invalid references, stale revisions, and offers without private masters.
Each archive contains the complete root catalog, all referenced public images, and `publication.json`.
The identity record contains the source catalog checksum, export checksum, and reviewed draft ETag.
The archive excludes the private master map and master representations.
Saving a draft does not change the root catalog or publish the website.

SQLite stores each draft change and publication archive in one transaction.
The database also contains the original images and generated images.
Keep this database outside the Pages artifact.

## Orders and Payment Verification

An order request contains `offerIds` and `email` only.
The server reads current offers from the published root catalog.
It verifies each private file revision before it saves the purchase snapshot.
The snapshot keeps the price, currency, license, and file revision after catalog changes.
An order requires a UUID `Idempotency-Key` header.
A retry with that key returns the same order and access secret.
A different request with that key returns HTTP 409.

The PayPal client uses server credentials and the configured merchant account.
It sends one purchase unit with the local order ID and server total.
It preserves the offer currency and rejects unsupported precision.
JPY, HUF, and TWD prices must represent whole currency units.
Provider amounts are compared as exact integers, without floating-point arithmetic.

A capture request contains an empty JSON object.
It cannot specify a provider result or grant an entitlement.
Capture attempts use a persistent claim and a stable provider request ID.
An uncertain response keeps the purchase pending.
After restart, a retry reads the provider order before another capture request.

The event handler sends the PayPal verification headers and event to the provider signature-verification endpoint.
An invalid signature returns HTTP 400.
A provider verification outage returns HTTP 503 for retry.
A verified event must identify the recorded provider order and capture.
The merchant, local order ID, currency, and amount must be the same as the stored purchase values.
Verified completion creates one entitlement per purchased offer in the same transaction as the order update.
Duplicate events do not create additional entitlements.

The buyer can send `{"status":"cancelled"}` to `PATCH /gallery/orders/{orderId}` before the first capture attempt.
Cancellation removes the approval URL and prevents subsequent capture requests.
Cancellation and capture attempts use the same database boundary.
A cancellation retry preserves the `cancelled` state after restart.

After a capture attempt starts, cancellation returns HTTP 409.
An uncertain payment result stays pending for provider reconciliation.
The buyer cannot set payment completion or entitlement status.

The service handles `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, and `PAYMENT.CAPTURE.REVERSED` events.
For a refund, the service reads the provider refund record and identifies its capture through the provider response.
The service checks the refund amount, currency, capture, order, and merchant before it revokes access.
A completed partial or full refund revokes all future download access for that order.
The order update and entitlement revocation use one transaction.
Duplicate refunds and completion events received after the refund cannot make access active again after restart.

Reversal events use the same verified refund resource and transaction as merchant refund events.
A partial reversal also revokes all future download access for the order.
The service does not require a capture status named `REVERSED`.
The provider must verify the event signature and return a completed refund associated with the purchased capture.
An outage keeps the verified event in the persistent retry queue.
Subsequent completion events cannot make a revoked purchase active again.

PayPal lists the reversal event under the refund operation in its [event catalog](https://developer.paypal.com/api/rest/webhooks/event-names/).
The v2 refund resource supplies the [related capture](https://developer.paypal.com/api/payments/v2/refunds-get).
The implementation follows that refund contract.
Actual PayPal reversal delivery still requires provider qualification.

The basket checkout uses these order and payment resources.
Production sales remain inactive.

The provider contract uses the official [Orders API](https://developer.paypal.com/api/orders/v2) and [webhook verification API](https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post).
Currency precision follows the official [currency table](https://developer.paypal.com/api/codes/currency).
Refund verification uses the official [refund resource](https://developer.paypal.com/api/payments/v2/refunds-get).

## Owner Order Operations

The order list accepts `limit`, `cursor`, `email`, and `status` query fields.
The default page limit is 50, with a permitted range from 1 to 100.
The list uses ascending order IDs and returns `items` and `nextCursor`.
A null cursor indicates the end of the current result.
New orders can occur before the cursor, so a new query is necessary to include them.
Email filters compare complete addresses without letter-case differences.

Each summary includes the creation time, buyer email, payment status, total, currency, and receipt status.
The owner reads the complete purchase terms and entitlements from the individual order resource.
These read operations do not include the order access secret.
Owner access requires the configured tenant and email.

The owner must verify the buyer before an access reissue.
The request contains `verifiedEmail` and a UUID `Idempotency-Key` header.
The verified email must be the same as the recorded buyer email.
The server records the owner email, verified buyer email, order ID, and creation time in one transaction.
The response contains the existing access secret, the separate order URL, and the audit record.
Receipt delivery uses the separate receipt queue.

A new access reissue returns HTTP 201 with the audit resource in `Location`.
A retry returns HTTP 200 with the same result, including after service restart.
A conflicting request with the same key returns HTTP 409.
The audit resource does not include the access secret.
Access reissue keeps the purchase status, entitlements, and existing access code.
An unpaid or revoked order cannot download files after an access reissue.

## Payment Event Recovery

Only events that pass provider signature verification enter the persistent event store.
The HTTP handler and background worker use the same functions for completion, refunds, and reversals.
The worker examines due events at service startup and every thirty seconds.
Each scan selects at most fifty events in retry order.
A persistent retry schedule prevents another attempt for one minute after a worker attempt starts.
Each attempt has a limit of 45 seconds.

The worker reads stored verified events without another signature-verification request.
An outage keeps the event pending for another attempt.
Recovery does not create provider orders or capture payments.
Service shutdown cancels active worker requests before it closes the database.
HTTP requests remain available while a provider request waits.

A verified completion can identify a purchase after the provider creation response is lost.
The provider's `custom_id` must identify the stored gallery order.
The merchant, currency, and amount must be the same as the stored purchase values before the service records the association.
A refund uses the provider capture details to identify the purchase after a capture response is lost.
Refund processing does not depend on completion event arrival order.
An event stays pending when its local order is absent and receives another scheduled attempt.

Provider capture fields follow the [PayPal Payments schema](https://github.com/paypal/paypal-rest-api-specifications/blob/main/openapi/payments_payment_v2.json).

## Protected File Delivery

The buyer sends `{"offerId":"OFFER_ID"}` to the order's `download-links` resource with the order access secret.
An active entitlement creates a download grant for the purchased revision.
The response contains `download` metadata and an `accessSecret`.
The `download.href` and `Location` header identify the file resource without a secret.
The buyer client sends the grant secret in `Authorization: Bearer SECRET` when it retrieves the file.
The order access secret does not authorize a file request.

A download grant is valid for ten minutes after creation.
Expired grants return HTTP 410.
An active order entitlement permits a new grant without a new purchase.
New grants preserve the purchased revision after catalog changes.
The database stores the grant secret's SHA-256 checksum.
Query fields cannot supply download authorization.

The file response contains the original image bytes without changes, a `Content-Disposition` filename, and `Cache-Control: no-store`.
HTTP range and HEAD requests use the same authorization boundary.
Each file request checks the current order and entitlement status.
A refund revokes existing grants and prevents new grants.
Conditional requests cannot permit file access after revocation.
Invalid ranges and failed preconditions return the API JSON error shape with `Cache-Control: no-store`.
The buyer order page verifies the purchased file checksum before it saves the download.

## Purchase Receipts

Verified payment completion stores one receipt in the receipt queue with the order update and entitlements.
Repeated payment events do not add another receipt.
The queue remains in SQLite when receipt processing is disabled.
Email delivery failures do not cancel the purchase or remove file access.
Orders with revoked access do not start new receipt attempts.

A separate background worker sends receipts through Pinguin and examines their status.
The worker starts at service startup and examines due records every thirty seconds.
Each attempt has a thirty-second limit and a persistent one-minute retry schedule.
After Pinguin accepts a notification, subsequent attempts use its stored ID to read the status.
A `SENT` result ends processing for that receipt.
An `ERRORED` result permits a new notification after the next retry interval.

An unknown or cancelled notification requires review and keeps its ID.
The private order response contains `receipt: null` before verified completion creates a receipt.
After receipt creation, `receipt.status` contains `pending`, `queued`, `sent`, or `attention`.
Service shutdown cancels active Pinguin requests before the database closes.
Provider error logs contain status codes, not provider response text or buyer content.

The receipt contains the purchase snapshot, an order-page link, and a separate access code.
The URL contains no secret.
The buyer must enter the code on the order page.
The buyer order page accepts the order access secret and shows the stored purchase.

The current Pinguin contract has no request idempotency key for notification creation.
If a notification response is lost, another attempt can send the same receipt again.
This limitation cannot create another payment or entitlement.
The integration uses the released generated gRPC client so submission and status requests accept the worker context.
The API key identifies the Pinguin tenant without a separate tenant field.

## Database Backup and Restoration

The gallery executable provides separate backup and restoration commands:

```text
gallery backup --database=SOURCE_DATABASE --output=NEW_BACKUP
gallery restore --backup=BACKUP_FILE --database=NEW_DATABASE
```

Both commands require a new destination path in an existing directory.
The commands reject an existing destination or a SQLite journal at that path.
The source database can remain open during backup.
The backup contains private images, drafts, publication archives, purchases, payment events, receipts, download grants, and access audit records.
It also contains buyer order access codes.
Keep the backup outside the Pages artifact and Git.

The command uses SQLite [VACUUM INTO](https://www.sqlite.org/lang_vacuum.html) to create a database snapshot.
It opens the source for read operations only.
It checks SQLite integrity, foreign keys, and the current gallery schema before it exposes the completed file.
Runtime initialization and snapshot validation use the same schema definition.
An interrupted operation can leave a temporary file, but only a complete validated file can appear at the destination.
The successful command returns a JSON record with the operation, SHA-256 checksum, and byte count.

Restore into a new database path.
Start the service with that path, the required private runtime configuration, and the related published site release.
Verify the draft revision, purchased image bytes, order status, receipt status, and publication archive through the API.
Verify provider changes after the backup before production activation.
The backup does not contain the signing key, provider credentials, or deployed Pages files.
Production recovery and provider reconciliation remain separate qualification gates.

## Run and Validate

### Local Service

`make up` builds the gallery image from the current Go source and starts it through the local gHTTP route.
The image uses Go 1.26.5 and a scratch runtime with the certificate authority bundle.
The API uses `https://localhost:8444/gallery` by default.
The database uses `/data/gallery.db` in the persistent Compose volume.
`make down` keeps that volume and the local signing key.
The root README defines the local origins, tenant, owner, and cookie name.

The API validates the development TAuth session for private resource requests.
The local topology includes the released TAuth service under the shared `/auth` prefix.
The browser uses the generated local `/config-ui.yaml`.
Live Google acceptance requires the exact local website origin in the provider configuration.
The local gallery uses `--payments=paypal` and `--receipts=pinguin` with the local provider implementations.
The gallery image is not published or deployed to production.

### Local Payment Provider

The `gallery-payment` container implements the PayPal operations used by local checkout.
It stores orders, approvals, captures, and completed payment events in SQLite.
The provider requires the generated client secret for its HTTPS API.
The gallery verifies the private provider certificate through `SSL_CERT_FILE`.
The browser approval page uses the existing gHTTP certificate authority.

Order creation requires the configured merchant, gallery return URL, and a UUID request identity.
A repeated creation request returns the stored provider order.
A conflicting body returns HTTP 409.
Capture requires prior approval and keeps one capture identity.
The capture and its event enter the database in one transaction.

The event worker stores its next attempt before delivery and retries after two seconds.
The local signature protocol uses HMAC-SHA256 over the event and transmission identifiers.
The gallery still calls the provider verification endpoint before it processes an event.
The provider keeps the event until the gallery returns HTTP 202 or HTTP 204.
Shutdown keeps provider records, the API key, and the private TLS certificate.

This provider supports local checkout and does not contact PayPal or transfer money.
The focused API tests provide refund and reversal records through their local provider fixtures.
Actual PayPal behavior requires sandbox qualification.
The root README defines the local ports, commands, and private storage paths.

### Local Mail Sink

The `gallery-mail` container implements the published Pinguin gRPC interface for local receipt tests.
It accepts immediate email receipts and stores them in SQLite before it returns `SENT`.
It does not send external email.
It rejects SMS, scheduled messages, attachments, and incomplete receipt fields.
The gRPC request limit is 1 MiB.

The service supports `SendNotification`, `GetNotificationStatus`, and `ListNotifications`.
The other notification operations return `Unimplemented`.
Requests require the generated `GALLERY_PINGUIN_API_KEY` from the local mail environment.
The standard gRPC health check requires the same authentication.
Compose waits for that check before it starts the gallery API.

The `mail-sink` image target contains the `gallery-mail-sink` executable.
Its `serve` command requires `--database` and accepts `--listen`.
Its `list` and `ready` commands accept `--address` and use the API key from the process environment.
The `ready` command returns no receipt contents.
The `list` command returns the published protobuf JSON representation.
The root `make local-receipts` command runs that inspection inside the selected Compose project.

`make down` keeps the mail database volume and API key.
The public website does not expose those files.
The inspection output contains private receipt contents and order access codes.
Keep that output outside Git and Pages artifacts.
Local `SENT` status proves storage in this sink, not SMTP delivery.

### Production Identity Preparation

A new TAuth tenant and a new signing key are necessary for Studio.
The proposed tenant ID is `tyemirov-gallery`.
The manifest declares `api.tyemirov.net`, with the gallery under `/gallery`.
The owner email is `vadym@tyemirov.net`.
The tenant and API route are not deployed.

The declared image repository is `ghcr.io/tyemirov/personal-site-gallery`.
The image uses the repository root as its build context and `services/gallery/Dockerfile` as its build file.
The Node.js build stage validates the canonical gallery and copies its referenced public images with the root catalog.
The final image contains those files under `/site`, the Go executable, and the TLS certificate authority bundle.
The Docker build context excludes the private deployment environment and local runtime files.

The `gallery` project declares one API service on `computercat`, with private port 8093 and the `tyemirov-site-gallery-data` volume.
The `gallery-http` capability supplies the HTTPS route through Caddy.
The API validates the planned `tyemirov_gallery_session` cookie for the selected owner and tenant.
The declared production service disables payments and receipts until provider configuration and qualification are completed.
The four public artworks have no active sale offers.

`make gallery-container-test` builds the AMD64 image and starts it without a host catalog mount.
The test verifies owner authorization, the packaged catalog, publication image bytes, and draft persistence after container replacement.
It also verifies that the image excludes private deployment files and source code.
These checks do not prove TAuth login, Caddy routing, DNS, or production deployment.

The private environment file is `.mprlab/deploy/.env`.
The manifest binds `gallery-tauth-signing-key` to `GALLERY_TAUTH_SIGNING_KEY`.
The key was generated locally and is not in Git.
The `gallery-auth` resource declares the `tyemirov-gallery` tenant through the shared `tauth.tenants` capability.
Its Google client reference uses `GALLERY_GOOGLE_WEB_CLIENT_ID` from the same private input file.
The selected Web application client belongs to Google Cloud project `temirov` (`927328730595`).
Its public client ID is `927328730595-fvjdq04oglsqm13ge2mmm3o0vf9mk4n0.apps.googleusercontent.com`.
The supplied client export includes the production website origin.
The Google client secret is not necessary for this sign-in configuration and was not copied.

The tenant accepts `https://tyemirov.net` and uses `api.tyemirov.net` as its cookie domain.
Its session and refresh cookie names are `tyemirov_gallery_session` and `tyemirov_gallery_refresh`.
The tenant and gallery API refer to the same fresh signing key.
Browser-facing routing to TAuth and hosted login still require qualification.
The supplied export does not include the local Studio origin, `https://localhost:8443`.
Add that authorized JavaScript origin before local Google login qualification.

### Runtime Configuration

Supply `GALLERY_TAUTH_SIGNING_KEY` through the private process environment.
Use at least 32 bytes for the signing key.
Set the explicit application and environment values in these flags:

```text
gallery --database=PATH --public-root=PATH --allowed-origin=HTTPS_ORIGIN \
  --cookie-name=COOKIE --tenant-id=TENANT --owner-email=EMAIL --listen=ADDRESS
```

Payment mode defaults to `disabled`.
A configured payment runtime uses these additional flags:

```text
--payments=paypal --paypal-api-origin=HTTPS_ORIGIN \
--paypal-checkout-origin=HTTPS_ORIGIN --paypal-client-id=CLIENT_ID \
--paypal-merchant-id=MERCHANT_ID --paypal-webhook-id=WEBHOOK_ID
```

Supply `GALLERY_PAYPAL_CLIENT_SECRET` through the private process environment.
The executable rejects an incomplete PayPal configuration.
The production identifiers and owner sale decisions remain explicit acceptance requirements under F002.

Receipt mode defaults to `disabled`.
To enable receipt processing, supply these flags:

```text
--receipts=pinguin --pinguin-grpc-address=PRIVATE_HOST:PORT
```

Supply `GALLERY_PINGUIN_API_KEY` through the private process environment.
The executable rejects an enabled receipt configuration without the address or API key.
The gRPC connection uses the private network without transport encryption, as in the released Pinguin client.
Pinguin owns the SMTP credentials, sender identity, and email delivery.
The gallery does not accept SMTP configuration.
The tests use a local gRPC mail sink and do not send external email.
Production Pinguin configuration and SMTP acceptance remain open.

The public directory must contain the current `data/site.json` and referenced gallery images.
The service uses that catalog to initialize a new draft.
An existing database keeps its saved draft after restart.

Run `make gallery-api-test` for HTTP behavior and race checks.
Run `make gallery-contract-test` for the executable, OpenAPI validation, and the shared public catalog contract.
The HTTP authorization tests use controlled TAuth claims.
They do not prove the browser login flow or hosted TAuth connectivity.

Payment integration tests use a local HTTPS implementation of the PayPal protocol.
They do not qualify an actual PayPal account or sandbox purchase.
