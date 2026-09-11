# tyemirov.github.io

This repository is the source for `https://tyemirov.net`.

The proposed [website and API redesign](docs/site-redesign.md) defines full local articles, shared API routes, and complete schema gates.
It includes the migration sequence and acceptance criteria before implementation.

## Publishing Model

Published pages live directly in top-level folders so their URLs stay clean:

- `https://tyemirov.net/civilization/` -> `civilization/`
- `https://tyemirov.net/decisioning/` -> `decisioning/`
- `https://tyemirov.net/freedom/` -> `freedom/`
- `https://tyemirov.net/gallery/` -> `gallery/`

The root site lives in `index.html` and `styles.css`.
Homepage content is driven by `data/site.json` and rendered by `site.js`.

The shared footers use the current menu contract through `assets/js/footer.js`.
The shared assets use literal `@latest` URLs.
The [migration record](docs/mpr-ui-migration.md) contains candidate evidence and central I009 publication steps.

## Global Requirements

Every HTML page in this repository MUST include the LoopAware tracking script at the top of the `<head>` tag:

```html
<script defer src="https://loopaware.mprlab.com/pixel.js?site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b&api_origin=https%3A%2F%2Floopaware-api.mprlab.com"></script>
```

## Add A New Page

1. Create a top-level folder named after the URL slug, for example `my-new-page/`.
2. Put the page entrypoint at `my-new-page/index.html`.
3. Include the **Mandatory Global Script** (LoopAware pixel) in the head.
4. Keep page-specific assets in that same folder.
5. Add a project entry to `data/site.json`.
6. Run the local validation described below.
7. Use the operator publication procedure after deployment readiness passes.

## Edit The Homepage

- Update `data/site.json` to change the hero copy, profile text, external buttons, writing links, project cards, order, or note.
- Put project companion essays on `projects[].essay`.
- Keep standalone essays in `essays.items`.
- Keep music in `music.items` and art in `arts.items`.
- Use `status: "live"` to show a project on the homepage.
- Use `status: "draft"` or `status: "hidden"` to keep a project in the data file without showing it on the homepage.
- Use the existing card themes: `copper`, `teal`, `olive`, `slate`, `amber`, `indigo`, `violet`.

## Migrating An Existing Standalone Repo

1. Copy the production files into a top-level folder here.
2. Keep only the assets needed to serve the page unless you intentionally want source or test files in this repo.
3. Verify the page locally from this repo before deleting or archiving the old standalone repo.

## Local Website

Install Docker with Compose, Node.js, and [gHTTP](https://github.com/tyemirov/ghttp).
The payment TLS setup also requires `openssl req` with `-addext` support.
Start Docker before you start the local services.

The default private media directory is `~/.local/share/tyemirov-site/music`.
This directory contains `selected.json` and the prepared media packages for the current catalog.
The [media preparation procedure](docs/private-hls-operations.md#private-audio-preparation) describes package preparation.

To use another private media directory, set its path in your shell:

```bash
export MUSIC_LOCAL_ROOT="/absolute/path/to/private/media"
```

Start the website, APIs, local payment provider, and mail sink:

```bash
make up
```

Open `http://localhost:8080`.
The local frontend uses this origin for Google login.
To use the other frontend origin, run `make up UP_PORT=8081`.
Local gHTTP sets `Referrer-Policy: no-referrer-when-downgrade` for [Google HTTP localhost login](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid?hl=en).
gHTTP `--https --https-persist` installs its development certificate authority once in the host trust store.
Subsequent starts reuse the trusted certificate authority.
Only the local payment approval endpoint uses this certificate.
The local website and APIs use HTTP on `localhost`.
Local music uses the separate `music_development_session` cookie without the `Secure` attribute.
The hosted music cookie retains its `Secure`, `HttpOnly`, and `SameSite=Strict` attributes.
HTTP origins are accepted only for the exact `localhost` hostname.
The website and APIs use different local origins.
Both application APIs use `http://localhost:8082`, under `/music` and `/gallery`.
Local payment approval uses `https://localhost:8446`.

`make up` builds the Pages artifact, media service, and gallery API from the current source.
Three host gHTTP processes serve the Pages artifact, HTTP API routes, and local payment approval.
Each API container exposes HTTP on an assigned loopback port for its gHTTP proxy.
The media initialization container enables local HLS playback from the private index and generates the corresponding allowlist.
It copies the prepared packages into a retained Docker volume.
The local catalog uses the titles and metadata from `data/site.json`.
The service reads `/media/selected.json`, `/media/allowlist.json`, and `/media/packages` from that volume.
Local website files and process logs use `.local/runtime/<LOCAL_PROJECT>`.
Certificates persist in `~/.local/share/tyemirov-site/certs`.
The command returns after all endpoints pass readiness checks and the payment endpoint passes certificate validation.
After source changes, run `make up` again to rebuild the site and service.
To select another API port, run `make up API_PORT=8083`.
All three ports must differ.

The gallery database uses `/data/gallery.db` in the persistent `gallery-data` volume.
It contains private images, drafts, orders, and delivery records.
The gallery reads the prepared public site through an independent mount for read operations only.
The local site configuration selects the local gallery API origin.

The development tenant is `tyemirov-gallery-development`, with owner `vadym@tyemirov.net`.
Its session cookie is `tyemirov_gallery_development_session`.
The first start generates an independent signing key in `.local/runtime/<LOCAL_PROJECT>/gallery.env`.
Subsequent starts keep that file and identity.
The gallery API rejects missing or invalid signing configuration.
The environment file is optional during Compose parsing so `make down` can stop an uninitialized project.

The local gallery uses `--payments=paypal` and `--receipts=pinguin` with the local provider implementations.
The `gallery-mail` service records receipts through the Pinguin gRPC interface without external email delivery.
Studio is available at `/gallery/studio/` through the shared authentication components.
The local TAuth service uses the retained development key and its own database volume.
F002 still requires live provider qualification and internal browser review.
The production gallery identity and deployment are independent of this local configuration.
The production manifest now declares the gallery API image, private database volume, and `api.tyemirov.net` route.
That service has payments and receipts disabled while provider configuration and qualification are incomplete.
`make gallery-container-test` verifies the packaged API and its public catalog through a real AMD64 container.
The [gallery service guide](services/gallery/README.md#production-identity-preparation) records the identity and remaining deployment requirements.

The local payment provider stores orders, approvals, captures, and pending events in the `gallery-payment-data` volume.
It implements the PayPal creation, capture, and signature-verification calls used by gallery checkout.
The approval page does not transfer money.
The provider sends completed payment events to the gallery API through a persistent retry queue.
Refund and reversal tests use the focused gallery API fixtures.

The gallery contacts the provider at `https://gallery-payment:8095` with the generated key from `.local/runtime/<LOCAL_PROJECT>/payment.env`.
The browser approval route exposes no provider API operations.
The private provider certificate and key use `.local/runtime/<LOCAL_PROJECT>/payment-certificate/`.
The gallery trusts that certificate through `SSL_CERT_FILE`.
The four browser origins use the existing gHTTP certificate authority.
Shutdown keeps both TLS identities and all local service keys.

The checked-in public catalog keeps its four artworks without sale offers.
The local purchase test supplies an offer in its temporary checkout only.

The mail sink stores its messages in `/data/mail.db` in the persistent `gallery-mail-data` volume.
The first start generates its API key in `.local/runtime/<LOCAL_PROJECT>/mail.env`.
The gallery and mail sink use that key for gRPC authentication.
Subsequent starts keep the key and stored receipts.

Inspect local receipts with:

```bash
make local-receipts
```

The command returns the stored receipts as JSON through the published `ListNotifications` RPC.
The output includes the buyer order access codes.
Keep the output outside Git and Pages artifacts.
In this local service, `SENT` means the mail sink stored the receipt.
It does not establish SMTP delivery.

Stop the local services:

```bash
make down
```

`make down` stops all four gHTTP processes and removes this Compose project's containers and network.
The development certificate authority and credentials remain available for the next start.
The command keeps the private media, gallery, mail, and payment volumes.

## Local Validation

Use Docker, gHTTP, Node.js, npm, Git, and FFmpeg for the local lifecycle integration test.
Install the test dependencies and run the test:

```bash
npm ci --ignore-scripts
npx playwright install chromium
make local-test
```

This test uses generated audio in a temporary directory and a separate Compose project.
It checks startup, trusted HTTPS, media authorization, silent browser playback, repeated startup, and shutdown.
Gallery checks verify owner and origin restrictions, original private image bytes, draft revisions, and data after restart.
The gallery checks use controlled TAuth claims and do not prove browser login.
The mail checks verify the same stored message through gRPC and the inspection command after shutdown and restart.
The purchase test verifies browser approval, signed payment events, receipt storage, and download of the purchased image.
It also verifies capture of an approved payment after stack restart.

Use Docker and a sibling `mprlab-gateway` checkout:

```bash
make music-ci-container
make music-container-test
```

The first command runs `make ci` in Linux with managed headless browsers and muted audio.
It uses committed Gateway source for isolated lifecycle plans and source checks.
The second command builds the actual Pages and media images and verifies their public behavior.
Both commands can run on a headless CI server.
The [operations runbook](docs/private-hls-operations.md) gives native toolchain and media preparation commands.

## Publication

The application declares its resources in `.mprlab/deploy/resources.yml`.
The website uses GitHub Pages on `gh-pages`, with `tyemirov.net` as its domain.
Gateway adds `CNAME`, `.nojekyll`, and `/.mprlab-release.json` to the publication artifact.
`Dockerfile.pages` exports the public site content.
The media backend uses the computercat inventory group and `api.tyemirov.net/music`.

After production prerequisites pass, the operator runs:

```bash
make release && make publish && make deploy
```

These commands delegate to the sibling Gateway checkout.
The [validation record](docs/private-hls-validation.md) identifies completed checks and remaining production prerequisites.

## Site Redesign

The current content contract uses `contracts/site.schema.json`.
The public catalog excludes draft records and article bodies.
Article pages contain the complete local text and a source link.
Music and gallery use one generated `/config-site.json` file.
The production API origin is `https://api.tyemirov.net`.

Run `make contracts-generate` after canonical contract changes.
Run `make site-contract-test` to validate generation, pages, and gallery imports.
Use the [implementation record](docs/redesign-implementation.md) for current evidence and remaining dependencies.
The [redesign contract](docs/site-redesign.md) controls the selected architecture.
