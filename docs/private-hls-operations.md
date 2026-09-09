# Private HLS Operations

F001 owns the media service and player.
B001 owns the application lifecycle prerequisite.
The [validation record](private-hls-validation.md) separates local evidence from production acceptance.

## Local Validation

For headless Linux CI, use Docker and a sibling `mprlab-gateway` checkout.
Run these commands from the repository root:

```bash
make music-ci-container
make music-container-test
```

The CI target includes package, HTTP, artifact, catalog, browser, load-command, and Gateway lifecycle checks.
The container builds pin the toolchain and browser images.
The service container test selects the declared `linux/amd64` production architecture.
The lifecycle fixture uses committed Gateway source and synthetic inventory with local Git origins.
Its plans and source checks make no production changes.

For a native toolchain, install the dependencies and run:

```bash
npm ci --ignore-scripts
npx playwright install --with-deps chromium firefox webkit
make ci
```

Set `ANSIBLE_PLAYBOOK` and `ANSIBLE_INVENTORY_BIN` if Gateway tools differ from the sibling checkout defaults.
The package tests require FFmpeg and FFprobe 8.1.2.
The Go tests require Go 1.26.5 and Node 26.5.1.

Automated tests use Playwright-managed browser binaries with headless mode and muted audio.
The container target runs the full CI suite on Linux without desktop browsers or audio output.
The test workflow has no SafariDriver command or desktop browser setting.
Physical mobile testing has no pending acceptance action.

## Local Load Test

Run the complete generated-audio load test in Linux:

```bash
make music-load-container
```

This command runs 100 simulated listeners for 15 minutes in a network-isolated container.
Each pair of listeners shares one browser session and uses two independent playback grants.
Clients request segments at their encoded duration and request two extra segments during each 60-second seek burst.
The fixture uses generated three-minute noise and the actual Go service with its default limits.
Distinct synthetic client addresses reach the service through an explicitly trusted loopback test peer.
The command removes its private files and stops its service after the run.

The JSON report is `output/playwright/load/load-results.json`.
It records request counts, response codes, grant latency, media bytes, and completed listeners.
On Linux, it also records service CPU time, sampled peak memory, and disk byte counters.
The report excludes session cookies and grant URLs.
The command fails if a listener fails, the error fraction reaches 0.1 percent, or p95 grant latency reaches 250 milliseconds.

For a short command check with the native toolchain, run:

```bash
make music-load-test
```

The short check runs through the actual package command, service, playback API, segment requests, and grant removal.
It is part of `make ci`.
The complete load run remains a separate target.

Local load results measure simulated clients over loopback HTTP.
They do not establish browser decoding, production TLS, computercat network capacity, or real-recording behavior.
The browser suite separately checks cold hls.js startup at 10 Mbps and 100 milliseconds of emulated latency.
Its Chromium network events confirm that the rule applies to the actual media requests.

## Isolated Host Check

Use a dedicated Linux SSH host with Docker and an AMD64 execution path.
Run one host test at a time.
The declared media volume and the named test containers and images must be absent before the test.
HTTP ports 80 and 443 must be free on that isolated host.

For the current Lima qualification host, run:

```bash
export MUSIC_QUALIFICATION_SSH_CONFIG="$(limactl list mprlab-semantic-qualification --format '{{.SSHConfigFile}}')"
export MUSIC_QUALIFICATION_HOST=lima-mprlab-semantic-qualification
make music-host-test
```

A headless CI server can supply its isolated host through the same two environment variables.
The current ARM64 qualification VM uses Ubuntu's `qemu-user-binfmt` package to execute the AMD64 service.
The test uses the controller's native preparation image for archive transfer and HTTP checks.
That image must also execute on the selected test host.

The test calls Gateway's actual retained-volume task through Ansible.
It reads the volume and service command from the selected application declaration.
It transfers generated media through SSH into that volume and validates the transferred packages with the actual media CLI.
The service starts with the declared paths and Origins and mounts the media volume read-only.
HTTP checks verify readiness, authorized media, rejected anonymous requests, and grant removal.
The test then replaces the container and repeats validation against the retained media.
It also renders the selected media route with Gateway's actual Caddy template.
Caddy validates that configuration and serves HTTPS with a temporary internal certificate authority.
The HTTP client verifies the certificate and declared hostname through a connection address supplied only to the test.
The service trusts the exact Docker proxy address through the declared environment variable.
The proxy checks cover CORS, cookie attributes, anonymous rejection, byte ranges, grant removal, and address limits.
Caller-supplied forwarding headers cannot bypass the address limit, and distinct client addresses retain separate limits.
The test checks that proxy logs exclude cookies and authorized media URLs.
It removes its test volumes, containers, and remote application image tags after the check.
The pinned Caddy image remains in the test host's image cache.

Evidence is in `output/playwright/host/host-results.json`, the two adjacent Ansible logs, and `proxy.log`.
This test qualifies the isolated volume, service, and rendered proxy data path.
The sealed lifecycle checks below qualify complete Gateway resource reconciliation under B001.

## Sealed Release Check

Use the isolated SSH host selected for the host check.
Use the same CPU architecture for the controller image and test host.
Run one release test at a time:

```bash
make music-release-test
```

The test uses a Linux controller container with the pinned CI tools and headless browsers.
On Linux, that container uses host networking to reach local SSH forwards.
On macOS, it reaches a local VM through Docker's host address.
The SSH host supplies the Docker CLI, Buildx, and Compose tools.
The test creates temporary application and Gateway repositories with local Git origins.
A local Gateway fixture supplies the release version decision.
The actual application `make release` command runs canonical CI and builds the declared artifacts on the isolated Docker host.
The test verifies artifact sizes and SHA-256 values against the sealed receipt.
It repeats the same release and requires an unchanged receipt.

Evidence is in `output/playwright/release/`.
Each successful source commit has its own archive directory with the source bundles, sealed artifacts, release receipt, and CI receipt.
The controller and Docker builder are removed after the check.
Publication and deployment remain separate B001 checks.

## Sealed Publication Check

First, complete the sealed release check.
Use a dedicated isolated SSH host with no containers or volumes.
Port 443 and `/etc/docker/certs.d/ghcr.io` must be available for the test.
Run one publication test at a time:

```bash
make music-publication-test
```

The test reads the successful release result and its exported source and artifact archive.
The actual application `make publish` command uses those exact inputs.
Docker loads, pushes, verifies, and pulls the image through a real TLS registry on the isolated host.
The test preserves the declared registry identity through temporary DNS and certificate trust within that host and the controller container.
The controller connects to the registry through a local SSH tunnel and verifies its certificate.
GitHub release metadata uses Gateway's local provider fixture, and Git references use local repositories.
The test verifies the published Pages commit and its domain and release marker.
It repeats publication and requires an unchanged publication receipt.

Evidence is in `output/playwright/publication/`, under the selected source commit.
The export contains lifecycle receipts, provider fixture state, the published Git bundle, and registry data.
Cleanup removes the test containers, volumes, application image references, registry DNS entry, and temporary trust directory.
The pinned registry image remains in the test host's image cache.
Pages activation and complete deployment remain separate B001 checks.

## Sealed Deployment Check

First, complete the sealed publication check.
Use the same isolated SSH host and controller architecture.
Ports 443, 18880, 18443, and 8092 must be free on that host.
Run one deployment test at a time:

```bash
make music-deployment-test
```

The test restores the registry data, Git artifacts, and lifecycle receipts from the publication export.
It uses the exported Gateway source commit.
The test runs Gateway `make deploy` twice to verify the Caddy foundation.
It creates the declared media volume through Gateway and transfers generated audio into that volume.
The test then runs application `make deploy` twice with the sealed service image and Pages artifact.
The exact retry must keep the service container and Pages deployment identity.

The local GitHub API fixture checks each Pages request and records its effects.
An HTTPS server reads the actual `gh-pages` branch from the local Git repository.
Certificate checks remain active for Pages, the registry, and the audio route.
The audio checks cover readiness, grants, anonymous rejection, authorized media, byte ranges, and grant removal.
The test runs the actual Gateway cleanup playbook twice with an explicit isolated-host profile.

Evidence is in `output/playwright/deployment/`, under the selected source commit.
The directory contains deployment logs, runtime state, provider requests, HTTP results, and cleanup logs.
One isolated host supplies both the `gateway` and `computercat` groups.
Production uses the operator inventory and requires separate network and provider acceptance.

## Private Audio Preparation

Use an original recording selected by the owner.
Keep the recording and all output outside the repository.
Set these variables to the selected file, permanent track ID, and private storage directory:

```bash
: "${MUSIC_SOURCE_FILE:?Set the original recording path}"
: "${MUSIC_TRACK_ID:?Set the permanent catalog track ID}"
: "${MUSIC_PRIVATE_ROOT:?Set the private storage directory}"
mkdir -p "$MUSIC_PRIVATE_ROOT/receipts"
node scripts/music/prepare.mjs \
  --source "$MUSIC_SOURCE_FILE" \
  --media-root "$MUSIC_PRIVATE_ROOT" \
  --track-id "$MUSIC_TRACK_ID" \
  > "$MUSIC_PRIVATE_ROOT/receipts/$MUSIC_TRACK_ID.json"
```

A successful command creates a content-addressed package and prints a receipt.
The private package report records source identity, audio properties, checksums, and peak bitrate.
The command rejects missing audio, invalid duration, incomplete output, and a damaged existing package.
A failed preparation removes only its own staging directory.

The container uses the same command and schema:

```bash
docker build -t music-prepare:local -f scripts/music/Dockerfile scripts/music
```

Mount the selected source and private output directory when you run this image.
Pass the paths as seen inside the container.
Use `--network none` because preparation requires no network access.

## Candidate Index And Activation

Build the offline command into a private tool directory:

```bash
: "${MUSIC_TOOL_DIR:?Set a private tool directory}"
mkdir -p "$MUSIC_TOOL_DIR"
(cd services/music-stream && go build -o "$MUSIC_TOOL_DIR/music-media" ./cmd/music-media)
make pages-build
```

Use the receipt duration when you prepare the corresponding `data/site.json` playback change.
Build the allowlist from that reviewed catalog.
Keep the public track external until the service package is ready.

Create the first candidate:

```bash
"$MUSIC_TOOL_DIR/music-media" candidate \
  --media-root "$MUSIC_PRIVATE_ROOT" \
  --allowlist .pages-dist/music/playback-allowlist.json \
  --receipt "$MUSIC_PRIVATE_ROOT/receipts/$MUSIC_TRACK_ID.json"
```

The command returns `indexPath` for the immutable candidate.
For a later import, add `--base-index` with the currently selected index.
Repeat `--receipt` for each recording in the same change.
Without a base index, the candidate contains only the supplied receipts.

Set `MUSIC_CANDIDATE_INDEX` to the returned path.
Validate and select it:

```bash
: "${MUSIC_CANDIDATE_INDEX:?Set the candidate indexPath}"
"$MUSIC_TOOL_DIR/music-media" validate \
  --media-root "$MUSIC_PRIVATE_ROOT" \
  --allowlist .pages-dist/music/playback-allowlist.json \
  --index "$MUSIC_CANDIDATE_INDEX"
"$MUSIC_TOOL_DIR/music-media" activate \
  --media-root "$MUSIC_PRIVATE_ROOT" \
  --allowlist .pages-dist/music/playback-allowlist.json \
  --candidate "$MUSIC_CANDIDATE_INDEX" \
  --index "$MUSIC_PRIVATE_ROOT/selected.json"
```

Activation validates a private snapshot before the atomic replacement.
A rejected candidate leaves the selected index unchanged.
Reload the service only after activation succeeds.
The running service uses `SIGHUP` to validate and replace its in-memory catalog.
A rejected reload preserves the previous in-memory catalog.
The selected index and allowlist must be read through their mounted parent directories so atomic file replacement remains visible.

Retain superseded packages for at least 24 hours and until their grants expire.
Preserve originals in an independent backup.
Package removal requires proof that the active index and active grants cannot reference those bytes.
The current tools have no automatic package removal.

## Service Runtime

Build the local service image:

```bash
docker build -t music-stream:local services/music-stream
```

The image contains `/music-stream` and `/music-media`.
The service requires explicit media root, index, allowlist, public HTTPS origin, and allowed website origins.
Use `--help` to inspect all rate and capacity flags:

```bash
docker run --rm music-stream:local --help
```

The native service listens on loopback by default.
A container proxy needs an explicit container interface, such as `--listen 0.0.0.0:8092`.
Expose that port only through the selected private proxy boundary.
Set `MUSIC_TRUSTED_PROXIES` to comma-separated CIDRs for verified proxy peers.
An empty value trusts no proxy peers.
An invalid CIDR stops service startup.
The service rejects an invalid forwarded address chain from a trusted peer.

The service supports local TLS certificate arguments for the test fixture.
Production TLS and routing belong to the application declaration and Gateway.
`/healthz` checks process availability.
`/readyz` checks the active media files.
Authorization failures return typed JSON without filesystem paths.
The service emits bounded route names and omits cookie values and grant URLs from request logs.
Known grant and media requests include the public `trackId` from validated catalog or grant state.
Requests without known track context omit that field.
Every 30 seconds, the private process log reports aggregate requests, rejected requests, bytes, active sessions, and active grants.
These counters have no public HTTP route.

## Production Handoff

B001 has a selected application declaration and canonical Gateway lifecycle commands.
Real Gateway plans and source checks pass in local fixtures.
The isolated-host volume, service, and rendered proxy checks pass.
The actual release and exact retry also pass with the isolated Docker host.
Publication and its exact retry pass with the isolated registry and local Git provider fixtures.
Pages activation, complete isolated deployment, exact retries, and Gateway cleanup also pass.
The owner selected computercat, and Gateway inventory resolves group `computercat` to `computercat-host`.
Read-only SSH checks confirmed the host and Docker runtime.
Encoding runs during offline preparation.
The backend authorizes requests and serves prepared media segments.
The declaration retains volume `tyemirov-site-music-media` and mounts its parent at `/media` for read-only service access.
The service reads `/media/selected.json` and `/media/allowlist.json` from that volume.
Prepare both files and their referenced packages before service startup.
The production volume, transfer route, proxy addresses, and outbound capacity require host qualification.
The media hostname returned `NXDOMAIN` during the September 8, 2026 read-only check.
Configure and verify its public DNS before production HTTPS acceptance.

Gateway reads `MUSIC_TRUSTED_PROXIES` from the ignored application file `.mprlab/deploy/.env`.
Its private-value binding supplies the same variable to the service.
Use the observed proxy peer CIDRs when the production route is qualified.
Synthetic proxy addresses in tests are fixture data.

The provisional audience is 100 concurrent listeners.
The plan requires representative load and network qualification on the selected host.
The local eight-request container smoke test does not satisfy that capacity requirement.

After host qualification passes, use the canonical application lifecycle from its validated declaration.
Only the operator executes production release, publication, and deployment.
After rollout, verify the website, media origin, readiness, real song playback, and copied-URL rejection together.
Record the website release, service image, media index identity, and headless browser evidence.
