# Private HLS Implementation Validation

The owner supplied the source recordings. F001 requires operator production execution for its remaining production gates.
The [implementation plan](private-hls-implementation.md) defines the scope.
This record describes local evidence from September 8, 2026.
The [operations runbook](private-hls-operations.md) gives the current commands.
The tested source is the primary checkout on `feature/F001-private-hls`, including uncommitted implementation changes over `dbc89a1220abd3bd54a214f891c1238807be0078`.
The final CI image identifies its source snapshot as `sha256:18d5fbe4584c026e70ef710f8558f2b335a5cdb89132fc0212564c311d396353`.
The isolated-host target runs separately from `make ci` and passed against the current host test files.
The documentation records the results after that run.

## Implemented Components

- The preparation CLI creates immutable AAC-LC fMP4 packages from local audio.
- The private report records source format, source checksum, tool versions, and encoded peak bitrate.
- The offline media CLI creates, validates, and atomically selects media indexes.
- The Go service validates every indexed package before it accepts requests.
- A browser session cookie authorizes each playlist, initialization file, and segment.
- The service creates, reads, renews, and deletes playback grants.
- Configurable limits bound requests, sessions, grants, addresses, and concurrent media responses.
- The service validates forwarded client addresses against explicit trusted proxy ranges.
- The player uses one controller, one audio element, and one selected browser engine.
- The player supports queue controls, keyboard seeking, renewal, bounded recovery, and available media actions.
- The canonical catalog retains five albums, 41 track titles, and the existing streaming links.
- The Pages build validates its public allowlist and excludes private audio and service files.

All current public tracks retain external playback.
The test catalog enables two generated-tone aliases through the real player and service.
The private candidate enables all 41 website tracks from the supplied recordings. Production activation remains an operator action.

## Supplied Recordings

The owner supplied a private Music share on September 8, 2026.
SoundOn lists six releases with 50 tracks.
The share contained WAV candidates for all 41 website tracks and five Volume II tracks.
Four missing Volume II WAV files were exported from the published Suno versions.
Their copied files passed SHA-256 comparison and full decode.
The private comparison records the SoundOn UPCs, ISRCs, source paths, and Suno links.
Title and album metadata establish the mappings. A SoundOn audio fingerprint comparison was not performed.

All 41 website tracks have private preparation receipts for 40 immutable packages.
Two track IDs share one recording with identical decoded audio.
The packages contain approximately 119 minutes of catalog audio and occupy approximately 174 MB with private metadata.
The offline command validates the complete candidate index against its candidate allowlist.
Managed Chromium 153.0.8010.12 passed 82 silent headless checks with the actual recordings.
All 41 tracks passed native HLS and hls.js playback, duration, pause, and mid-track seek checks.
The batch fixture uses higher request limits for rapid track selection. Production limit behavior retains its separate integration evidence.
Source files, packages, receipts, and candidate files remain outside the repository.
Volume II has nine source WAV files. The current website catalog contains the other five albums.

A31 uses automated checks under the owner's test requirement.
No manual listening action remains in the acceptance criteria.
These checks establish decoding, duration, and playback behavior. They do not establish a subjective audio-quality judgment.

## Test-Driven Evidence

| Boundary | Initial failure | Current result |
| --- | --- | --- |
| Preparation | The command was absent | The package passes full decode and repeated preparation |
| Grant HTTP API | Creation and Origin checks returned `404` | Authorization, expiration, renewal, range, and revocation checks pass |
| Request limits | Excess requests returned `201` | Typed `429` responses include the required retry delay |
| Capacity limits | Session and response limits were absent | Configured limits preserve existing access and recover after expiration |
| Index activation | The command was absent | Invalid candidates preserve the selected index |
| Inactive package | A damaged external track package passed validation | Every indexed package receives checksum validation |
| Footer | A delayed library left the footer without links | Custom-element readiness initializes the footer |
| Player startup | A player error removed the album | The error preserves titles and platform links |
| API adapter | A `202` response passed as grant creation | Incorrect success status codes fail before media requests |
| Media actions | Metadata and action handlers were absent | Supported actions use the existing controller |
| Volume | An ineffective volume control remained visible | The control follows actual browser capability |
| Pages artifact | The validation command was absent | The real build passes and an inserted original file fails validation |
| Linux images | The Dockerfiles were absent | Pinned images prepare audio and serve authorized media |
| Global filter | Category controls were absent and the filter action left all content visible | Section and source categories select content before the card limit |
| Narrow homepage | Hero links and fixed grid widths exceeded the 390-pixel viewport | Links wrap and grid columns fit the available width |
| Filter focus | Clearing a filter could remove the focused card | Focus returns to the All control when the card is removed |
| Resume startup | Repeated WebKit checks reported `Failed to push buffer` during the initial seek | hls.js owns `startPosition`, and ten repeated resume checks pass |
| Application lifecycle | The selected declaration was absent | Real Gateway plans accept release, publication, and deployment with synthetic inventory |
| Pages metadata | The artifact contained source-owned `CNAME` | The Pages container exports content and leaves metadata to Gateway |
| Proxy configuration | The service ignored the declared environment variable | Invalid `MUSIC_TRUSTED_PROXIES` stops the actual service container |
| Load command | The command was absent | The short integration check verifies paced media requests, shared sessions, seek bursts, and grant removal |
| Service architecture | The default local build produced ARM64 | The container test builds and verifies the declared AMD64 image |
| Container startup | The AMD64 test sent HTTP before initialization completed | The test waits for the actual service readiness event before HTTP checks |

## Browser Evidence

The latest full `make ci` suite passed through `make music-ci-container` after the acceptance audit corrections.
The actual application release also passed its own canonical CI gate.
Playwright 1.63.0 supplies isolated browser binaries with headless mode and muted audio.
Tests retain real media requests, decoding, seeking, and playback time progression.
The container uses no desktop browser or host audio device.

| Browser | Version | Engine | Result |
| --- | --- | --- | --- |
| Chromium | 153.0.8010.12 | Native HLS | Catalog, player, recovery, and authorization checks pass |
| Chromium | 153.0.8010.12 | hls.js 1.7.2 | The same checks pass with native capability disabled in the test |
| Firefox | 155.0 | hls.js 1.7.2 | Catalog, player, recovery, and authorization checks pass |
| Automated WebKit | 26.6 | hls.js 1.7.2 | Catalog, player, recovery, and authorization checks pass |

The browser suite passed 106 checks in 159 seconds, with zero failures and zero flaky results.
It skipped three duplicate HTTP schema cases because one browser configuration already runs that engine-independent case.
Three other skips keep the Chromium network-emulation case outside the other browser configurations.
The latest report is `output/playwright/linux/music-results.json`.
The release-specific CI report remains in `output/playwright/release/ci/music-results.json`.
The schema case validates actual HTTP responses against OpenAPI 3.0.4.
The suite covers a real service restart, paused media errors, concurrent first-session creation, and independent track changes in two tabs.
Injected cases cover malformed API responses, unavailable configuration, authorization errors, and rate-limit delays.
The media-action case injects the operating-system action boundary while the controller and audio remain real.
The network startup case applies a Chromium network rule to real hls.js media requests.
The rule sets 10 Mbps throughput and 100 milliseconds of latency.
Browser network events confirm the applied rule, and the test requires playback within three seconds of the track click.
The final Linux run measured 459 milliseconds from the track click to the first playback event.
This case measures browser network emulation with generated audio.

The narrow-screen case uses a 390-pixel viewport and reduced motion.
It verifies keyboard activation, arrow-key seeking, visible focus, and automatic track advance.
The footer uses its supported non-sticky setting to keep the player controls clear.
Global filter cases verify section selection, category clearing, source tags, keyboard focus, and narrow-screen geometry.

The HTTPS fixture uses two localhost origins with generated audio.
Each browser accepts the generated certificate within its test session.
This topology proves same-site requests across different origins.
It does not establish production DNS, TLS, proxy behavior, or outbound capacity.

The SafariDriver runner was removed.
Remote automation is off after the earlier desktop test.
The current test workflow requires no desktop browser or browser setting.
Physical mobile and lock-screen tests are infeasible and have no pending acceptance action.
A14 is excluded from completion gates by the owner.

## Local Service And Artifact Evidence

- Four Node integration tests passed for package preparation and index activation.
- Fourteen Go integration tests passed with the race detector.
- Aggregate operational counters pass checks through actual HTTP traffic.
- `go vet` passed.
- The actual Pages artifact passed validation and the private-audio rejection test.
- The real Gateway lifecycle test passed with local Git origins and synthetic inventory.
- All three public lifecycle commands rejected non-default source before provider effects.
- The Pages container exported valid public content without Gateway metadata or private service files.
- The OpenAPI document passed Swagger Parser validation.
- The dependency audit reported no known vulnerabilities in the installed dependency tree.
- The Linux container test passed preparation, readiness, grant creation, and media authorization.

The latest container smoke test transferred 1,164,192 bytes across eight concurrent requests in 28 milliseconds on the local Docker engine.
This result proves the container path and concurrent responses only.
It does not qualify the proposed production audience or network.

The preparation image pins FFmpeg 8.1.2 and Node 26.5.1 by image digest.
The service image pins Go 1.26.5 and contains the service and offline media binaries.
The service container check selects `linux/amd64`, verifies the built image architecture, and runs the actual binaries.
This local run uses architecture emulation on the ARM64 Docker host.
Native execution on computercat remains part of host acceptance.
The [upstream image project](https://github.com/wader/static-ffmpeg) documents the FFmpeg binary source.
The Dockerfiles contain the resolved image digests.

The latest CI lifecycle fixture uses committed Gateway source at `737bbfaa0af753629933f55272c934d4f142de43`.
The release and publication tests use the Gateway bundle captured with their source archive, as recorded below.
It calls actual Gateway Make targets for deployment, release, and publication plans.
The declaration selects computercat and private port 8092 for the media service.
Its retained volume supplies `/media/selected.json`, `/media/allowlist.json`, and prepared packages.
The fixture verifies the private-value binding with a synthetic proxy CIDR.
The latest Gateway plan logs are in `output/playwright/linux/lifecycle/`.
Earlier native and standalone container runs retain their own output directories.
These plans validate the selected source contract without production mutations.

The final Linux `make ci` result includes the request log contract and browser acceptance assertions.
The separate `make music-container-test` passed both actual image checks.
The Governor check reported no entries or warnings, and `git diff --check` passed.
The language checker reported no findings in the changed README, implementation plan, runbook, validation record, issue tracker, and execution plan.
The producing agent reviewed changed prose against the verified Issue 9 reference.
This language review covers changed prose only.

A separate network-isolated container completed a generated-audio backup and restore check.
It archived the source, receipt, allowlist, selected index, and packages, then removed the original test directory.
After extraction into a new directory, source and index SHA-256 values matched.
The actual media CLI validated the restored package checksums, and FFmpeg completed a full HLS decode with `-xerror`.
This check proves the local restore procedure with generated audio.
Production backup storage and real recordings still require operator qualification.

## Local Load Evidence

`make music-load-container` passed the complete 900-second run with 100 simulated listeners and 50 shared sessions.
Every listener completed the run, including two-segment seek bursts every 60 seconds.
The fixture used generated 180-second noise and the real service with default limits.
The report is `output/playwright/load/load-results.json`.
The test image was `sha256:823591de5fa6b4909abce482eaae5410257a7dabb89e83f40bcfe4453ddb8ef1`.

| Measurement | Result |
| --- | --- |
| Unexpected HTTP responses and network errors | Zero |
| Media bytes | 2,576,973,165 bytes |
| Mean media throughput | 22.91 Mbps, including seek traffic |
| Grant p95 latency | 33.73 milliseconds |
| Segment p95 latency | 34.01 milliseconds |
| Seek-request p95 latency | 63.60 milliseconds |
| Service CPU time during load | 6.05 seconds, or 0.67 percent of one core on average |
| Sampled peak service memory | 35,491,840 bytes |
| Service disk counters during load | 376,832 bytes read, zero bytes written |

The report identifies Linux ARM64 container `87e35e0a32e5` and loopback HTTP as the test environment.
Service initialization and offline encoding occur before these resource measurements.
The small prepared package mainly uses the filesystem cache during playback.
Other local CI checks ran during part of the load test.
These results establish the local generated-audio workload, including shared sessions and seek bursts.
They do not establish computercat capacity, production routing, TLS overhead, or real-recording behavior.

## Isolated Host Evidence

`make music-host-test` passed on `lima-mprlab-semantic-qualification` with the AMD64 service image.
The host runs Linux 7.0.0-28-generic on ARM64.
The first binary probe failed with `exec format error` because the host had no AMD64 emulation.
Ubuntu's QEMU user-emulation package resolved that host prerequisite.
The installed package is `qemu-user-binfmt` version `1:10.2.1+ds-1ubuntu3.2`.
The real service binary then executed and served protected media.

The test called the actual Gateway retained-volume task through Ansible.
Gateway created `tyemirov-site-music-media` with the selected owner and retention labels.
The test transferred generated media through SSH and validated the package bytes with the AMD64 media CLI.
The service used the declared command, media paths, public origin, and allowed website origins.
It mounted the volume read-only.
Readiness, authorized media, anonymous rejection, and grant removal passed before and after container replacement.

The test removed its containers, volume, and remote image tags.
The extended host check completed in 13 seconds.
An SSH check then confirmed that the test containers, volumes, and listeners were absent.
The report is `output/playwright/host/host-results.json`.
The adjacent Ansible logs record initial volume creation and the later retained-volume check.

The extended test rendered the declared media route with Gateway's actual Caddy template.
The pinned Caddy image validated the configuration and served HTTPS with an internal certificate authority.
The client verified the certificate and `audio.tyemirov.net` hostname through a test-local connection address.
The test changed no public DNS or desktop certificate trust.
CORS, cookie attributes, anonymous rejection, and authorized media passed through the proxy.
The proxy preserved `Range` requests and returned the expected 16-byte `206` response.
Grant removal caused the expected `410` response on the next media request.
The service consumed the exact proxy address through `MUSIC_TRUSTED_PROXIES`.
Thirty concurrent requests with distinct forged forwarding headers reached the real client's address limit.
A request from a different real client address then succeeded.
Proxy logs contained no session cookie or authorized media URL.
The adjacent `proxy.log` records the Caddy startup and certificate result.
The pinned Caddy image remains in the isolated host's image cache.

This evidence covers the isolated volume, service, and rendered proxy data path.
Gateway's complete sealed lifecycle and resource reconciliation remain separate checks.
Native computercat execution, production certificates, and the physical network route also remain unverified.

## Sealed Release Evidence

`make music-release-test` passed the actual application release and its exact retry with the isolated Docker host.
The target completed in 463 seconds.
The application and Gateway Make entry points ran unchanged inside the Linux controller container.
The Gix version decision came from Gateway's local provider fixture.
All Git origins resolved to local test repositories.
The release command passed canonical CI, built both declared artifacts, and sealed their receipt.
Docker Buildx used the real Docker engine over SSH on the isolated Lima VM.

| Identity | Value |
| --- | --- |
| Application commit (fixture) | `60505450c57eef87c0499ab5aed46182f7705e23` |
| Captured Gateway commit | `db0305184ea443d9d821ec6028fcef5bc33e0e96` |
| Release version (fixture) | `v1.0.0` |
| Service OCI archive | 9,188,864 bytes |
| Pages archive | 34,549,789 bytes |

The application commit belongs to a temporary qualification repository.
The primary checkout remains uncommitted.
The test verified each artifact's size and SHA-256 value against the sealed receipt.
The exact retry preserved the receipt and skipped CI and release assembly.
The exported archive passed a second check of its payload hashes, source identities, release tag, and CI receipt.
The test removed the controller and remote builder, and SSH inspection confirmed that no test containers or volumes remained.

The result is `output/playwright/release/release-results.json`.
Native release and retry logs are adjacent to that file.
The archive is `output/playwright/release/60505450c57eef87c0499ab5aed46182f7705e23/`.
It contains both source bundles, the sealed release artifacts and receipt, and the exact CI receipt.
The publication check used these captured inputs.

## Sealed Publication Evidence

`make music-publication-test` passed the actual application publication command and its exact retry in 155 seconds.
The command used the exported source bundles and sealed release for application commit `60505450c57eef87c0499ab5aed46182f7705e23`.
It retained Gateway commit `db0305184ea443d9d821ec6028fcef5bc33e0e96` and release version `v1.0.0`.
Docker pushed the actual OCI image to the isolated TLS registry and verified its manifest digest.
An immutable image pull then passed through the same registry.
GitHub release metadata used the local Gateway provider fixture.
Git pushed the immutable Pages artifact reference to a local bare repository.

| Published identity | Value |
| --- | --- |
| Service image | `ghcr.io/tyemirov/personal-site-music@sha256:9bd399ae65abdd312424eb4972737a19cbf68bd15fad67f0311c698e381146ac` |
| Pages commit | `b921449f09426a9be19921f900af65a2bbc3b88f` |
| Publication receipt | `sha256:f1aba8e77e4745837ed35baa0b639104fba388e8dfe587734f23f169ce41abf6` |

The Pages commit contained the expected source commit, version, and `tyemirov.net` domain.
The exact retry preserved the publication receipt and skipped artifact publication.
The release receipt remained unchanged.
The exported registry manifest passed an independent SHA-256 check.
The exported publication receipt still identified the original release receipt and both published artifacts.

The test removed its containers, volumes, application image references, temporary DNS entry, and registry trust directory.
Read-only SSH checks confirmed cleanup and normal public resolution for `ghcr.io`.
The registry image remains in the isolated host's image cache.
The result and exports are in `output/playwright/publication/60505450c57eef87c0499ab5aed46182f7705e23/`.
The directory contains native publication logs, the published Git bundle, lifecycle receipts, provider fixture state, and registry data.
This evidence covers isolated publication with real artifact bytes.
Live GitHub and GHCR publication remain separate operator actions.
The subsequent deployment check verified Pages activation and complete Gateway resource reconciliation.

## Sealed Deployment

`make music-deployment-test` passed in 474 seconds on the isolated Linux host.
The test restored the exact publication export described above.
It used Gateway commit `db0305184ea443d9d821ec6028fcef5bc33e0e96` and application commit `60505450c57eef87c0499ab5aed46182f7705e23`.
A separate comparison at deployment qualification found no changes in 53 service, player, catalog, package, and deployment files against that release.
The later request log change adds public track identity and has separate HTTP integration evidence.
The sealed lifecycle artifacts predate that log field.

The actual Gateway `make deploy` command and its exact retry verified the Caddy foundation.
The actual application `make deploy` command and its exact retry completed resource reconciliation.
Gateway recorded seven verified observations: the six declared resources and the Caddy handler.
The retry kept the service container, desired resource generation, and Pages deployment identity.
The provider log contained one Pages build request across both deployments.
An independent comparison of the exported runtime state confirmed those retry results.

The local Pages API fixture supplied provider responses from its explicit state and the actual Git branch.
The HTTPS server read the activated `gh-pages` artifact, including its exact release marker.
The service ran the published image digest with generated audio in the declared media volume.
Its `/media` mount was read-only.

| HTTPS check | Result |
| --- | --- |
| Certificate and hostname | Verified with the internal CA |
| Readiness | `200` |
| Grant creation | `201` |
| Anonymous media request | `401` |
| Authorized playlist, initialization file, and segment | `200` |
| Byte range | `206`, with the requested 16 bytes |
| Removed grant | `410` |

The actual Gateway cleanup playbook and its retry passed with an explicit isolated-host profile.
The test removed application and Caddy containers, media volumes, and runtime state.
The outer fixture removed its registry, temporary DNS entry, and certificate trust directory.
Evidence is in `output/playwright/deployment/60505450c57eef87c0499ab5aed46182f7705e23/`.
It includes deployment logs, both runtime states, Pages provider requests, HTTP results, and cleanup logs.

One isolated host supplied both inventory groups.
This result establishes local lifecycle behavior with real artifact bytes and controlled providers.
Production requires separate GitHub, GHCR, computercat, DNS, TLS, and real-recording acceptance.

## Acceptance Boundaries

The table maps every acceptance ID to its observable test boundary.
Browser cases run against the generated Pages artifact and real media service.
Go cases use actual HTTP requests and generated packages.
All media in local tests is generated audio.

| ID | Evidence or remaining work |
| --- | --- |
| A01 | Catalog browser case follows all five album detail links |
| A02 | Catalog browser case verifies all 41 track titles and their order |
| A03 | Playback browser case receives HLS responses and verifies audio time progression |
| A04 | Queue and delayed-grant browser cases verify ownership by the final selection |
| A05 | Queue browser cases verify automatic advance and the final paused state |
| A06 | Playback and narrow-player cases seek across the six-second segment boundary |
| A07 | Copied-playlist browser case rejects anonymous GET and HEAD for every media file |
| A08 | A separate request context cannot use the original playlist URL |
| A09 | Another valid browser session receives `404` for the original session's files |
| A10 | `TestReplacementPinsExistingGrantToOriginalPackage` rejects asset substitution |
| A11 | `TestGrantRenewalExpirationAndOrigin` verifies `410` at the exact expiration time |
| A12 | Browser renewal preserves the source and audio progression |
| A13 | Resume browser case replaces a lost grant and restores the paused position |
| A14 | Excluded: physical mobile devices are unavailable |
| A15 | Browser case restarts the real service and restores playback once |
| A16 | Catalog HTTP case rejects existing and new grants after track disablement |
| A17 | Grant HTTP cases reject forbidden, absent, and null Origins and verify preflight behavior |
| A18 | Authorized HTTP media requests without Origin succeed |
| A19 | HTTP and browser cases cover authorized ranges, HEAD, and anonymous rejection |
| A20 | HTTP rejects encoded traversal paths. Activation CLI rejects symbolic links |
| A21 | HTTP verifies `429` and refill. Browser Retry honors the server delay |
| A22 | Capacity HTTP cases verify session, grant, address, and concurrent-response limits |
| A23 | Delayed-grant browser case keeps the later track selection |
| A24 | Cross-tab browser case preserves the other tab's grant during a track change |
| A25 | Browser cases reject invalid catalog, config, API body, and success status values |
| A26 | Actual Pages artifact validation rejects an inserted private audio file |
| A27 | Service and isolated proxy log checks exclude cookies and grant URLs. Production logs remain under A36 |
| A28 | Narrow-player case verifies keyboard seeking, focus, polite status, and silent time updates |
| A29 | Catalog cases verify sections, filters, footer contact, and narrow layout. B002 is closed |
| A30 | Managed Chromium, Firefox, and WebKit pass applicable silent headless playback cases |
| A31 | All 50 source WAV files pass full decode. All 41 website tracks pass HLS decode and 82 silent browser checks |
| A32 | Rejected CLI activation preserves the index. Rejected service reload preserves playback |
| A33 | Package replacement HTTP case keeps both old and new grants valid |
| A34 | Concurrent first-cookie browser case recovers without repeated replacement loops |
| A35 | Missing-media HTTP case returns readiness `503` and a safe typed error |
| A36 | B001 is closed. Public DNS, TLS, playback, and rejection still require operator deployment |

The request log audit initially failed because the public track ID was absent.
`TestRequestLogsIdentifyKnownTracksWithoutPrivateValues` then passed through grant creation, reads, renewal, removal, and media access.
Known requests now include `trackId` from validated catalog or grant state.
Requests without known track context omit that field.
The same test rejects cookie, grant, asset, and private-path values in the log.

## Remaining Work

- Repeat the workload on computercat with representative recordings and the final network route.
- Complete production qualification under F001. B001 is closed.
- Confirm the private storage mapping, transfer route, and outbound capacity on the owner-selected computercat host.
- Transfer the validated private candidate and packages for operator production activation.
- Verify production playback and proxy logs after the operator rollout.

On September 8, 2026, a read-only DNS query for `audio.tyemirov.net` returned `NXDOMAIN`.
The readiness request could not resolve that hostname.
Public DNS and TLS qualification remain production prerequisites.

The application declaration and canonical lifecycle commands pass local contract checks.
The actual release seals its artifacts and reuses the receipt on an exact retry.
Isolated publication preserves the sealed image and Pages identities and reuses its publication receipt.
The isolated-host volume, service, and rendered proxy data path pass.
Complete sealed deployment and its exact retry pass on the isolated host.
Production media provisioning and public acceptance remain unverified.
Local fixture results do not establish live-provider publication or production deployment.
