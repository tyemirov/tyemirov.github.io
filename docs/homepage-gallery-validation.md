# Homepage And Gallery Validation

## Scope

The requested sequence is I002, I003, I004, F002, and I005.
F002 includes all five phases in `gallery/OPERATING-PLAN.md`.
This record separates local results from internal-browser, provider, and production acceptance.

## I002 And I003

The existing portrait has a square crop.
The image measures 80 pixels at phone and tablet widths.
The image measures 112 pixels at desktop width.
The introduction occupies more space than the portrait.

Browser checks cover initial load, reload, and return navigation at 390, 769, and 1280 pixels.
The five hero links occupy one row at 769 pixels and wider.
Phone checks found no horizontal overflow.
Keyboard checks cover all five links and visible focus.
The Mac WebKit checks use Option-Tab for link navigation.

The initial navigation check found no album cards after the Music link.
The static test host served `/music` without a directory redirect.
Relative script URLs then resolved outside the music directory.
The canonical hero link now uses `/music/`.

## I004

The local server supplies all six albums and sends `Cache-Control: no-store` for the catalog.
The homepage previously loaded its catalog only at document startup.
An open document did not receive changes from `make up`.

A new test changed the served catalog while the homepage remained in the browser history cache.
An actual history return restored the old three cards and omitted Vol. II.
The test failed before the production change.
The homepage now retrieves the catalog after a cached history return.
Catalog requests require HTTP cache validation.
The test now finds Vol. II after return navigation and reload.

`make local-recordings-test` passed all nine supplied recordings through hls.js and native HLS.
Each check verifies track identity, media progression, muted audio, and rejection of anonymous playlist requests.
All 18 anonymous requests returned HTTP 401.
The local catalog durations match the private media index.
The checks use the public HTTPS website and media service.
They do not use the generated test tone.

The initial rapid track sequence reached the configured session request limit on track six.
The final sequence plays more than three seconds of each recording.
The service limits remain unchanged.

The focused command passed 65 browser checks across four browser projects:

```bash
make music-browser-test MUSIC_BROWSER_ARGS='homepage.spec.mjs homepage-refresh.spec.mjs catalog.spec.mjs'
```

Three projects exclude the history-cache case that requires the configured Chromium browser.
The other checks run in all four projects.

## Local Screenshots Before I005

`make up` completed with the existing local certificate authority.
The website is available at `https://localhost:8443/`.
The headless review uses the shared UI candidate from the browser test harness.

| Viewport | Page height | Portrait | Hero link rows |
| --- | --- | --- | --- |
| 390 by 844 | 4918 | 80 by 80 | 2 |
| 769 by 844 | 3022 | 80 by 80 | 1 |
| 1280 by 844 | 2627 | 112 by 112 | 1 |

Measurements for all three visits are in `output/playwright/local-homepage-before-i005.json`.
Screenshots use `output/playwright/local-homepage-WIDTH-VISIT-before-i005.png`.
`WIDTH` is one of the three widths above.
`VISIT` is `initial`, `reload`, or `return`.
These images show the current local implementation before the I005 changes.
They do not reconstruct the earlier large portrait.

## I005 Spacing Evidence

The first new browser tests failed at all three widths.
They found excessive page height, 48-pixel section gaps, and a footer fixed over the page content.
The homepage now uses shared spacing values for the hero, filters, sections, cards, actions, and footer.
The shared footer stays in the document flow through its `sticky="false"` contract.
The essay cards keep their text with less space between labels, titles, descriptions, and actions.
The phone music layout shows two album covers per row.

| Viewport | Before height | After height | Reduction |
| --- | --- | --- | --- |
| 390 by 844 | 4918 | 3618 | 26.4% |
| 769 by 844 | 3022 | 2520 | 16.6% |
| 1280 by 844 | 2627 | 2285 | 13.0% |

The values above use Chromium with the current public catalog and shared UI fixture.
All 24 spacing tests pass across Chromium, Chromium HLS, Firefox, and WebKit.
These tests verify content, filtering, horizontal overflow, action height, and footer contact access.
Firefox reported a fractional section gap of 32.00009 pixels.
The test now compares that measurement at whole-pixel precision.
The production spacing did not change for that correction.

The homepage has no player controls.
Player checks use the real album page with the player hidden and visible at each width.
They verify its bottom position during scrolling and accessible footer placement.
The increase in page height equals the measured player height, within one pixel.
The player measures 93 pixels high on phone and 65 pixels at the larger widths in Chromium.

The existing portrait, navigation, gallery-link, and history-return checks also pass after the production changes.
Only the configured Chromium HLS project runs the actual history-cache test.
The other three projects exclude that case by design.
The logs, screenshots, and measurements use the `i005-` prefix in `output/playwright/homepage-gallery-progress/`.

`make up` rebuilt the local website, and all four HTTPS endpoints passed readiness checks.
The actual local page with live CDN assets has no browser errors or horizontal overflow at the three widths.
Its page heights are 3635, 2538, and 2302 pixels at widths of 390, 769, and 1280 pixels.
The live shared footer has a theme button but no project or contact menu.
The declared menu works with the shared test candidate.
This difference remains under central I009 publication, as documented by I001.
The `i005-live` evidence files record the current CDN result.

The computer-use connection reports `sky requires node_repl; configure NODE_REPL_TRUSTED_SERVICES`.
The required internal-tab review is still open.

## F002 Model Integration Evidence

`make gallery-browser-test GALLERY_BROWSER_ARGS='--project=chromium'` failed before gallery production changes.
The permanent collection link is absent.
The root catalog has no `gallery` record.
The new tests specify independent exhibit order, permanent collection order, artwork routes, and keyboard image navigation.
They also require one root record for each of the four migrated artworks.
The four artworks now occur once in the root catalog.
Collections and named exhibit sections contain ordered artwork references.
The old gallery data files and embedded artwork shape were removed.
Works with no sale offer remain available to view.

All 48 gallery checks pass across the four browser projects.
They cover independent order, date changes, direct links, keyboard navigation, phone layouts, and invalid catalog rejection.
The combined gallery, homepage, and music command passes 113 checks, with three specified history-cache exclusions.
The Pages container and local preparation checks also pass.
The artifact validator rejects unreferenced gallery images and private master references.
`make up` serves the migrated gallery through the existing local HTTPS endpoint.

The actual public PNG images measure 1536 by 1024 pixels.
Only the first PNG declares an sRGB profile.
The existing Display P3 claim for the third image is unverified.
Existing print and edition claims require the owner review specified by F002.

The initial and final command logs are in `output/playwright/homepage-gallery-progress/`.

## F002 Private Service Evidence

The new gallery service stores private images, drafts, and publication archives in SQLite.
Initial HTTP tests failed because the asset, draft, and publication routes were absent.
`make gallery-api-test` now passes with the race detector.
The checks cover owner and tenant authorization, invalid uploads, checksum reuse, image dimensions, and exact original bytes after restart.
Draft checks cover saved changes, stale revisions, invalid references, and a complete publication archive.
The archive includes every referenced public image and excludes master records.

`make gallery-contract-test` starts the compiled service and validates its generated OpenAPI contract.
It also validates the returned gallery with the public JavaScript validator.
`make gallery-check` passes Go static checks.
All three service targets also pass in the Linux CI container with network access disabled.
The container includes the resolved gallery module dependencies before these checks.
These service checks use controlled TAuth claims and do not prove browser login.

The new Studio browser test fails because the Studio page is absent.
The published `mpr-ui@latest` assets currently resolve to `3.11.11`.
That bundle lacks `mpr-password-auth` and `resolveAuthProfileSnapshot`.
The current sibling source contains both features, but that source is not the published library.
The MPR integration contract requires the shared authentication controller and the nested provider configuration.
The owner workflow does not require password login or the optional auth snapshot helper.
Browser authentication remains pending until the required shared release is available.
The proposed API hostname is `gallery-api.tyemirov.net`, with a new TAuth tenant named `tyemirov-gallery`.
The user selected `vadym@tyemirov.net` as the Studio owner.
The ignored deployment environment contains a fresh signing secret and the manifest contains its private binding.
Tenant provisioning and API deployment remain incomplete.
The deployment manifest now declares both API hostnames.
No application-owned authentication path was added.

## F002 Order and Capture Evidence

Order creation initially failed because the API required owner authentication at the absent order route.
The order API now uses current server offers and rejects client price fields.
Purchase snapshots keep the recorded price and private revision after catalog changes and service restart.
Idempotency checks preserve the order and reject conflicting request bodies.
An uncertain provider creation remains pending and retries with the same provider request ID.

The payment tests use a local HTTPS provider implementation.
They verify one provider capture for simultaneous capture requests.
They also verify a lost capture response, service restart, and subsequent provider reconciliation through a capture retry.
Browser capture callbacks leave the order pending.
Only a verified completion event with the correct order, merchant, amount, and currency creates entitlements.
Duplicate events do not create extra entitlements.

Additional failed tests exposed incorrect whole-unit currency handling, decimal string comparison, and verification-outage status.
The corrected code uses exact integer amounts and distinguishes an outage from rejected verification.
The compiled command rejects incomplete PayPal configuration.
The generated OpenAPI contract includes buyer access, idempotency, capture requests, and provider verification headers.
The payment HTTP tests, executable checks, and Go validation pass in the Linux CI container with network access disabled.

Cancellation and refund tests initially failed because the API did not accept these operations.
Buyer cancellation now persists after restart and prevents subsequent capture requests.
Cancellation cannot hide an active capture or its uncertain result.
The tests hold a real provider request while cancellation returns HTTP 409.

Verified refund processing checks the provider refund record and capture identity before it revokes access.
Partial refunds revoke future access before or after completion event processing.
Unverified events, incorrect amounts, incomplete refunds, and unrelated captures do not revoke that order.
Revocation survives restart and completion events received after the refund, including a provider capture with status `PARTIALLY_REFUNDED`.
The native API race checks, executable contract checks, and Go validation pass after these changes.
The same service targets pass in the Linux container with network access disabled.

Protected download creation initially returned HTTP 403 for a verified purchase.
The download API now returns the purchased original without changes after a catalog revision change and service restart.
The tests verify different order and grant secrets, query rejection, range responses, HEAD responses, and `Content-Disposition` headers.
A controlled clock proves acceptance before expiry and HTTP 410 at ten minutes after creation.
A purchase entitlement permits renewal after one year without a new payment or a file revision change.
Refunds reject existing grants, conditional requests, and renewal requests.

An additional HTTP test failed because the [standard file handler](https://pkg.go.dev/net/http@go1.26.5#ServeContent) removed `Cache-Control` and returned a plain-text error.
The response adapter now preserves `Cache-Control: no-store` and the API JSON error shape for invalid ranges and failed preconditions.
The native API race checks, executable contract checks, and Go validation pass after the correction.
The same service targets pass in the Linux container with network access disabled.

The user selected `vadym@tyemirov.net` as the Studio owner email.
Actual PayPal sandbox acceptance still requires qualification.

## F002 Payment Event Recovery Evidence

The first recovery test left a verified payment pending after a provider outage and service restart.
The service now processes stored verified events at startup and through a persistent retry schedule.
The tests disable signature verification after initial acceptance to prove that recovery uses the stored verified event.
A controlled clock proves that a provider outage preserves the one-minute retry interval.
Refund recovery proceeds without webhook redelivery and removes download authorization.
Service shutdown cancels a blocked provider request while the HTTP order resource remains available.

Additional failed tests exposed missing provider associations after lost creation and capture responses.
A verified completion now checks the provider's local order ID and purchase details before it records the provider association.
A verified refund reads the provider capture details and can precede completion after a lost capture response.
These operations preserve capture identity and do not repeat provider order creation or payment capture.
The native API race checks, executable contract checks, and Go validation pass after these changes.
The same service targets pass in the Linux container with network access disabled.

## F002 Receipt Evidence

The first receipt integration test failed because the local mail sink received no request after verified payment completion.
The service now stores receipts with verified purchases and sends them through a separate background worker.
HTTP and local gRPC tests verify persistent retry deadlines, restart, payment verification, and duplicate event rejection.
A mail service outage does not prevent order access or protected download creation.
If a status request fails, the service keeps the notification ID and does not send another receipt.
The worker creates a new notification after Pinguin reports a terminal email delivery failure.

The buyer order API reports receipt status after the database update.
An additional failed test exposed an incorrect status for an unknown notification.
The corrected response reports `attention` and keeps that notification ID.
Shutdown cancels a blocked mail request while the HTTP order resource remains available.
Receipt contents keep the purchased terms and the access code outside the order URL.

The tests use a local implementation of the published Pinguin gRPC contract.
The released contract identifies the tenant through its API key and does not accept a separate tenant field.
The contract does not provide notification creation idempotency.
A lost notification response can cause another email, but cannot create another payment or entitlement.
The native API race checks, three CLI contract tests, and Go validation pass.
The same service targets pass in the Linux container with network access disabled.
Live SMTP acceptance remains open.

## F002 Buyer Order Evidence

The first buyer test reached a real order but failed because the page was absent.
The new page uses the gallery API for order access, payment status, capture requests, cancellation, and protected downloads.
A local PayPal implementation supplies provider records and verified events.
The fixture supplies its certificate through the existing HTTP client boundary and keeps certificate verification enabled.
The tests do not change the service authorization or payment logic.

The browser receives the purchased original bytes only after verified payment completion.
Additional tests verify expired grant renewal, refunds, keyboard access, and layouts at 390 and 1280 pixels.
Reload and order changes remove private details and the order access secret.
Delayed responses from a previous order cannot replace the current page.
The page rejects foreign download destinations and changed original bytes.

A failed malformed-response test exposed raw parser errors in the page.
The corrected error boundary shows controlled messages and excludes raw response contents.
The combined gallery and buyer tests pass 76 cases across the four browser projects.
The 28 buyer cases also pass in the Linux container.
The gallery Go check includes the browser fixture server.
These tests use the existing shared UI fixture and do not prove the current hosted UI library or Studio login.
Studio acceptance remains separate and open.

The Pages container test failed because its copy list omitted the buyer page.
The container now exports the page and API configuration.
The artifact validator rejects an invalid API origin and requires the buyer page files.
The native artifact and Pages container checks pass.
The browser API configuration uses the proposed production hostname without production deployment.

## F002 Checkout Evidence

The first checkout test failed because the basket had no checkout link.
The basket now opens a page that creates orders through the gallery API.
The request contains offer identifiers and a receipt email.
The page shows the server purchase price and terms before payment approval.
The buyer must keep the separate access code and accept the order before the page shows the PayPal link.

The local payment page records buyer approval before the service accepts capture.
Verified completion then permits the browser to retrieve the exact purchased original.
Additional tests preserve one order after a lost creation response and reject changed browser prices.
A browser storage failure keeps the created order and its access code available.
An unavailable offer prevents order creation and shows a link to the basket.

A second open gallery tab initially kept the purchased offer in its basket.
The browser test failed before the basket refresh change.
The basket now reads changes from browser storage and updates the open gallery tab.
Gallery, checkout, and buyer order checks pass 100 cases across four browser projects.
The command explicitly excludes the pending Studio test.
The artifact and Pages container checks pass with the checkout files included.
The 24 checkout cases also pass in the Linux container.
The Linux browser run permits network access for the existing shared UI fixture.

These results use the existing shared UI fixture and local payment records.
They do not prove Studio login, PayPal sandbox acceptance, or production deployment.
The initial and final logs are in `output/playwright/homepage-gallery-progress/`.

## F002 Owner Order Evidence

The first owner tests returned HTTP 405 for the order list and HTTP 404 for access reissues.
The owner can now list purchases with cursor pages and email or status filters.
Individual order reads accept the configured owner session or the buyer access secret.
An invalid buyer authorization header cannot select owner access.
Order lists and audit records do not include access secrets.

An access reissue requires the owner session, verified buyer email, configured origin, and a UUID request identity.
The response contains the existing order access code and a separate order URL.
The API records the verified email and owner in a persistent audit resource.
Concurrent retries keep one audit record, including after service restart.
The owner remains responsible for buyer verification before the request.

HTTP tests verify that access reissue keeps unpaid and revoked purchase status.
A verified refund rejects new download grants and existing grants after an access reissue.
Receipt status remains available to the owner without another payment capture.
The native API race checks, executable OpenAPI checks, and Go validation pass.
The 52 buyer and checkout browser cases also pass across four browser projects.
The API race checks, executable OpenAPI checks, and Go validation also pass in the Linux container with network access disabled.
The Studio interface for these owner operations remains incomplete.

## F002 Backup Restoration Evidence

The first recovery test failed because the executable had no backup command.
The new commands create SQLite snapshots and restore them into new paths.
The commands require the current gallery schema, valid SQLite integrity, and valid foreign keys.
An existing destination or a SQLite journal at that path prevents the operation.
The source database opens for read operations only.

The test takes a backup while the gallery HTTP service remains open.
It changes the draft after the backup and then restores the earlier database into a new path.
The restored API returns the earlier draft revision, completed purchase, receipt state, and exact purchased image bytes.
Publication archives and access audit records remain the same.
An access reissue retry returns its original result after restoration.
A repeated capture request does not cause another provider capture.

Additional CLI tests reject missing sources, invalid database files, schema changes, broken foreign keys, and existing destination journals.
Rejected inputs leave no new destination or temporary file.
The native API race checks, executable contract checks, and Go validation pass.
The same checks pass in the Linux container with network access disabled.
Production recovery still requires the related runtime configuration, published site release, and provider reconciliation after the backup.

The published shared UI dependency was checked again during this work.
The CDN still resolves `mpr-ui@latest` to `3.11.11` without the nested provider configuration contract.
Studio authentication remains pending that shared release.

## F002 Local Gallery Service Evidence

The first `make local-test` run failed because the Compose configuration had no gallery service.
The gallery HTTPS endpoint also failed to accept connections after local startup.
The updated command builds and starts the gallery API with its own database volume and gHTTP route.
The prepared website selects that API through its local gallery configuration.
The website, music API, and gallery API use different HTTPS origins and the existing certificate authority.

The local integration test saves a draft revision and uploads a private image through the owner API.
Repeated startup keeps the revision and certificate authority.
After shutdown and restart, the API returns the saved revision and original private image bytes.
The test verifies that shutdown keeps the database volume and local signing key.
The API rejects anonymous access and an unauthorized origin.
The website rejects requests for private files.
When another process uses the gallery port, startup fails and leaves no running project containers.

`make local-test` passed the Compose contract and complete local lifecycle tests.
The subsequent focused check passed the new duplicate-port test.
The running default stack also passed HTTPS checks with certificate validation enabled.
The gallery API returns HTTP 200 for readiness and HTTP 401 for anonymous asset requests.
The prepared website configuration selects `https://localhost:8445`.

The logs and endpoint observations use the `f002-local-` prefix in `output/playwright/homepage-gallery-progress/`.
These tests use controlled TAuth claims and do not prove Studio login.
The local gallery now uses the payment provider and mail sink described below.

## F002 Reversal Evidence

The first reversal tests failed because the API rejected `PAYMENT.CAPTURE.REVERSED`.
The executable contract test also failed because OpenAPI did not include that event type.
The request validator and OpenAPI now use one list of supported event types.
The HTTP handler and background worker process reversals through the existing verified refund resource contract.

PayPal identifies the reversal event under the refund operation in its [event catalog](https://developer.paypal.com/api/rest/webhooks/event-names/).
The implementation uses the completed refund and its related capture to verify the affected purchase.
It does not introduce a capture status named `REVERSED`.

The tests verify full and partial reversals after a completed purchase.
Invalid signatures, pending refunds, and incorrect provider amounts, merchants, currencies, or order references cannot revoke the purchase.
A verified reversal rejects existing download links, conditional requests, HEAD requests, and new download grants.
Duplicate events and delayed completion cannot restore access after restart.
Another test verifies reversal before completion after a lost capture response.
That purchase receives no entitlement or receipt from the delayed completion event.

A stored reversal resumes after a provider outage and service restart without webhook delivery again.
The test makes signature verification unavailable during recovery to verify use of the stored verified event.
These tests use local provider records.
Actual PayPal reversal delivery still requires provider qualification.

The complete native gallery API suite passes with the race detector.
The executable contract and Go checks also pass.
The focused reversal tests and the same contract checks pass in the Linux container with network access disabled.
`make up` rebuilt the local gallery service.
HTTPS checks verify its readiness and current OpenAPI event list with certificate validation enabled.
Evidence files use the `f002-reversals-` prefix in `output/playwright/homepage-gallery-progress/`.

## F002 Persistent Local Mail Evidence

The first mail integration test failed because the mail executable was absent.
The first local lifecycle test failed because startup did not create the mail environment.
The Compose contract test also failed because receipt processing was not enabled.

The new executable stores local receipts through the published Pinguin gRPC interface.
The API key protects submission, inspection, individual reads, and the standard health check.
The service reports `SENT` after SQLite stores the message.
That status describes local storage and does not prove external email delivery.
The executable has no SMTP transport.

The executable integration test uses the real gallery HTTP service and its receipt worker.
It verifies the purchase terms, buyer address, and access code in the stored receipt without output of private contents.
After restart, the RPC and inspection command return the same notification.
Additional checks reject anonymous reads and invalid receipt fields.
The focused native integration test and Go checks pass.

`make local-test` passes all three tests, including the complete local lifecycle through Linux containers.
The test sends one fixed message through gRPC and reads it with `make local-receipts`.
Shutdown keeps the mail volume and generated API key.
After startup, the inspection command returns the same message and notification ID.
The website rejects requests for the mail database and private environment file.
The default `make up` command also completed with the mail service healthy and all three HTTPS endpoints ready.
`make local-receipts` successfully inspected that running stack without output of receipt contents in this evidence record.

The logs use the `f002-mail-` prefix in `output/playwright/homepage-gallery-progress/`.
Live Pinguin and SMTP delivery require provider qualification.

## F002 Persistent Local Payment Evidence

The first local tests failed because the payment service and its HTTPS approval route were absent.
The first browser approval failed because the page policy caused the form request to omit its origin.
The approval page now uses `Referrer-Policy: same-origin`, and the provider requires the configured approval origin.
The phone check then found horizontal overflow from component width and padding.
The page now includes padding within element widths and limits layout rules to its own containers.

The local provider stores orders, approvals, captures, and completed payment events in SQLite.
The gallery uses its private HTTPS API for payment creation, capture, and event verification.
The event worker keeps a persistent retry schedule until the gallery accepts the event.
The browser route provides payment approval without external money transfers.
The provider uses a generated API key and private TLS certificate.

`make local-test` passes all three tests through the real local commands and Linux containers.
The browser creates an order, approves it with the keyboard at phone width, and requests capture.
The gallery verifies the completed event, stores the receipt through the mail sink, and supplies the purchased image bytes.
Another approved order completes after shutdown and restart.
The tests verify stored records, service keys, and the private provider certificate after restart.
They also reject forged events, an unauthorized approval origin, and public requests for private files or provider API operations.

The default `make up` command also completed with the payment and mail services healthy.
The website, music API, gallery API, and payment approval route pass HTTPS readiness checks with certificate validation enabled.

The test offer exists only in the temporary checkout.
The four public artworks have no active sale offers.
The focused API fixtures continue to supply refund and reversal records.
Actual PayPal behavior and external email delivery still require provider qualification.

The logs use the `f002-payment-` prefix in `output/playwright/homepage-gallery-progress/`.
The `local-payment-approval-before.png` and `local-payment-approval.png` screenshots show the phone layout before and after correction.

## F002 Production Resource Preparation

The first image test failed because the Dockerfile did not accept the repository root as its build context.
The first lifecycle test failed because the selected manifest had no gallery resources.
The gallery image now includes the canonical root catalog and its referenced public images.
Its public packaging stage uses the shared gallery validator.
The final scratch image keeps source code and private deployment files outside its runtime files.

The AMD64 container test passes through the real API entry point without a host catalog mount.
It verifies readiness, anonymous rejection, owner authorization, and the initial draft against the public catalog.
Publication export supplies the original public image bytes from the image.
Container replacement keeps the saved draft revision and publication archive in the named volume.

The manifest declares the gallery image, retained database volume, HTTP capability, HTTPS route, and public readiness check.
The selected service uses `tyemirov-gallery`, `vadym@tyemirov.net`, and the planned `tyemirov_gallery_session` cookie.
The gallery API hostname is `gallery-api.tyemirov.net`.
Payments and receipts are explicitly disabled until provider configuration and qualification are completed.
The tenant and route are not deployed.

Gateway initially rejected the Docker context because its ignore file lacked the explicit private environment path.
Gateway also rejected the negated patterns in the initial input allowlist.
The ignore file now uses explicit exclusions without negated patterns.
The image test also corrected a readiness assertion that expected a different log format.
The service itself emitted its readiness event and stayed active.

Gateway release, publication, and deployment plans now accept the selected declaration in an isolated repository fixture.
The public lifecycle commands also reject non-default source before external effects.
`make local-test` passes all three tests after the image build-context change.
This includes the complete local purchase workflow and private data after restart.
The Governor check reports no findings.

The qualification scripts now include the gallery artifact and its HTTP routes.
The complete release, publication, and deployment checks still require a new sealed release before F002 closure.

The production environment has the generated gallery signing key but no gallery PayPal or Pinguin credentials.
The current process also has no values for those three gallery variables.
These observations record presence only and include no private values.
The user supplied the Google OAuth web client ID, and the manifest now declares the tenant.

The evidence files use the `f002-production-` prefix in `output/playwright/homepage-gallery-progress/`.
These local checks do not prove hosted TAuth, Caddy, DNS, PayPal, SMTP, or deployment acceptance.

## F002 Qualification Preparation

The CI image did not contain `local/prepare.mjs`.
The existing `make local-prepare-test` failed inside that image with `MODULE_NOT_FOUND`.
The image now includes the local orchestration source.
The same test passes after the image rebuild with network access disabled.
`make pages-build music-artifact-test` also passes inside that image with network access disabled.

The release contract now requires the gallery image, music image, and Pages artifact.
Publication verifies both image digests through the isolated registry.
Deployment selects each service independently and includes the gallery data volume and HTTPS route.
The new gallery assertions verify owner authorization, the published catalog, saved drafts, and publication archives after restart.
The test uses controlled TAuth claims and does not qualify login.

The JavaScript syntax checks pass for all changed qualification scripts.
Both publication and deployment preflight checks reject the existing sealed release because its gallery image is absent.
These checks stop before host changes or evidence replacement.
The existing sealed release and its qualification records stay unchanged.
The complete updated qualification has not run.
It requires Studio completion, the final CI checkpoint, and a new sealed release.

The evidence files use the `f002-qualification-` prefix in `output/playwright/homepage-gallery-progress/`.

## F002 Shared Authentication Contract Review

The pending Studio test previously required `mpr-password-auth` although the owner workflow does not require password login.
The test now requires the shared header, hidden private workspace, and no private requests before authentication.
The focused Chromium test still fails because the Studio page is absent.

The published `MPRUI.loadYamlConfig` rejects the current nested provider configuration with password authentication disabled.
Its diagnostic is `config-ui.yaml missing auth.googleClientId`.
This result uses the real published bootstrap and YAML parser in an isolated JavaScript runtime.
It makes no authentication request.
The published bootstrap requires the obsolete flat configuration even for Google login.
Studio integration still requires the shared configuration release.

Computer-use requests also fail with `sky requires node_repl; configure NODE_REPL_TRUSTED_SERVICES`.
The successful package import does not prove that the computer-use service is available.
The user supplied the Google OAuth web client ID from project `temirov`.
The selected production input has the gallery signing key but no gallery PayPal or Pinguin credentials.
Only variable presence was inspected.

The evidence files use the `f002-studio-` prefix in `output/playwright/homepage-gallery-progress/`.

## F002 Google Client Selection

The supplied JSON export identifies a Web application client in Google Cloud project `temirov` (`927328730595`).
The public client ID is `927328730595-fvjdq04oglsqm13ge2mmm3o0vf9mk4n0.apps.googleusercontent.com`.
Only public client metadata was inspected.
The exported client secret was not copied into the repository or deployment input.

The selected private input now supplies `GALLERY_GOOGLE_WEB_CLIENT_ID`.
The manifest declares `gallery-auth` through the shared `tauth.tenants` capability.
The tenant and gallery service refer to the same fresh signing key.
The tenant accepts the production website origin and uses separate gallery session and refresh cookie names.

The first lifecycle check failed because the manifest did not declare `gallery-auth`.
The updated lifecycle check passes through the real Gateway entry points in isolated repository fixtures.
Gateway accepts the deployment, release, and publication plans with the tenant declaration.
The public lifecycle commands also reject non-default source before external effects.
The tenant declaration still needs hosted provisioning and browser-facing TAuth routing.
The isolated deployment qualification also needs the shared TAuth provider before it can reconcile this tenant.
The supplied export includes the production website origin but excludes `https://localhost:8443`.
Local Google login needs that authorized JavaScript origin.
An exported origin list does not prove a completed Google sign-in.
The evidence files use the `f002-google-tenant-` prefix in `output/playwright/homepage-gallery-progress/`.

## Remaining Acceptance

The internal browser connection reports "Browser use requires a trusted Node REPL browser service".
The existing internal tab cannot be inspected through that connection.
I002, I003, and I004 remain open for the required internal-tab review.
The exact historical tab state remains unverified.

F002 still requires Studio, live email delivery, and complete workflow acceptance.
F002 also requires production recovery qualification, PayPal sandbox qualification, and release verification.
The current CDN bootstrap rejects the required nested authentication configuration.
Production sales require the specified owner decisions.
I005 passes its local spacing and player placement checks but still requires the internal-tab review.
The live footer menu also requires the shared publication under central I009.
Run `make ci` after the final stack change.

## Website Redesign And Studio Follow-up

The [redesign implementation record](redesign-implementation.md) contains the current contracts, local topology, and qualification results.
The earlier shared authentication and footer blockers are resolved by the published `mpr-ui` release `4.0.0`.
The browser harness now retrieves the literal `@latest` assets and records their resolved versions and digests.

Studio passes 36 focused browser checks across Chromium, Firefox, and WebKit.
Those checks include owner isolation, uploads, saved drafts, independent arrangements, publication export, access reissue, and logout.
Session recovery preserves unsaved edits, and the editor requires an explicit discard choice for unapplied changes.

All three local stack checks pass with the released TAuth service and persistent volumes.
Internal browser review, live provider acceptance, and production cutover remain separate requirements.
The final redesign `make ci` checkpoint passed with 491 browser passes and 21 configuration-specific skips.
It reported no failures or flaky results.
