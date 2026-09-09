# Private HLS music player: implementation handoff

Date: 2026-09-08.
Status: Implementation in progress under F001. B001 is closed. Production qualification remains.

Current evidence: [Implementation validation](private-hls-validation.md).
Repository: `/Users/tyemirov/Development/tyemirov.github.io`.
Website: `https://tyemirov.net`.
Proposed media origin: `https://audio.tyemirov.net`.

## 1. Outcome and authority

Visitors will play complete songs on the existing music pages.
The owner will operate the audio service and store the media on their infrastructure.
Every media request needs temporary server authorization.
A copied playlist URL alone will not authorize playback in another browser.

This document specifies the application work for F001.
The owner authorized implementation after review of this plan.
Production execution remains with the operator.
Use the existing primary checkout.
Obey `AGENTS.md` and its applicable references before each type of work.
Keep unrelated changes if the checkout changes after this inspection.

### Confirmed requirements

- Put a music player on the personal website.
- Use HLS with private access to discourage casual audio downloads.
- Operate the media service on infrastructure controlled by the owner.
- Provide a detailed contract that another agent can implement.

### Proposed defaults

These choices permit implementation without a separate product design phase.
They remain assumptions until the owner accepts this handoff for implementation.

| Area | Proposed choice |
| --- | --- |
| Audience | Anonymous visitors, with complete songs and no account requirement |
| Frontend | Existing static website and music URLs |
| Service | One Go HTTP service in this repository |
| Runtime | One service instance behind the existing gateway Caddy boundary |
| Storage | Private local media volume on the selected server |
| Preparation | Offline FFmpeg conversion before media activation |
| Audio | One AAC-LC rendition, 192 kbps, stereo, 48 kHz |
| Packaging | fMP4 segments, nominal six-second duration, completed VOD playlist |
| Authorization | Opaque browser cookie plus one temporary playback grant per selected track |
| Session storage | Bounded server memory, with expiration and explicit restart recovery |
| Player | Native HLS where supported, otherwise the current supported hls.js engine |
| Navigation | One player per document, with album queue support |
| Production | Operator-controlled rollout after separate deployment readiness checks |

The protection boundary is server authorization, rather than segment secrecy.
An authorized listener can still collect the segments or record the sound.
Anonymous access also lets a script request its own playback grants.
Rate limits constrain abuse but do not establish listener identity.
The first release uses HTTPS transport protection without HLS encryption keys or DRM.

## 2. Verified repository context

The primary checkout was clean on `master` at inspection.
The inspected site revision was `fc1449e6a81f4cb304725749ab1fab08f41bdd0f`.
These observations describe local source, rather than a verified production deployment.

| Source | Behavior at initial inspection | Required implementation consequence |
| --- | --- | --- |
| `data/site.json` | Owns homepage content and the Music link | Add the canonical `music` content here |
| `data/music.json` | Contains five albums and 41 track names | Migrate the existing entries in one bounded change |
| `music/music.js` | Reads both catalogs and sends Listen to Spotify | Render local album playback through the shared music renderer |
| `music/album.js` | Reads track names and displays external links | Add playable track controls and the shared player |
| `music/*/index.html` | Static entry documents load `album.js` | Keep public URLs and initialize ES modules |
| `music/soliloquies-vol-ii/` and `music/pump-it/` | Entry documents exist without matching catalog entries | Keep current routes and record the missing content separately |
| `site.js` | Owns homepage hydration | Make this module the shared content-rendering entry point |
| `scripts/build-pages-artifact.sh` | Copies tracked files from an explicit path list | Include generated player assets and exclude private media |
| `Makefile` | Runs Pages build and two shell contract suites | Add media, catalog, and browser acceptance targets |
| `.mprlab/deploy/resources.yml` | Absent | Resolve the application deployment prerequisite before production work |
| `scripts/release/*` | Provides local release and Pages publication helpers | Treat current lifecycle drift as a separate owning task |
| `README.md` | Says Pages still serves `master` pending a cutover | Verify the actual Pages source before any publication |

Root guidance requires `data/site.json` to govern all site content.
It also requires rendering logic in `site.js`.
The implementation must remove the separate music source after the migration.
Keep only the new catalog shape in the affected readers.

The new music UI must use `mpr-header` and the existing `mpr-footer` component.
Initialize the footer menu with `globalThis.MPRUI.getFooterSiteCatalog()`.
Keep the exact LoopAware script first in every modified HTML head.
Keep the standard face favicon links and American English labels.
Connect new clickable category labels to `window.toggleProjectFilter(tag)`.
Keep original titles, notes, credits, album order, and external platform links.
If a new supporting tool page needs a companion article, obtain its actual Substack URL before publication.

## 3. Architecture and ownership

```text
Browser
  |
  | GET /music/ or /music/{album}/
  v
GitHub Pages: tyemirov.net
  - static HTML, CSS, JavaScript
  - public music catalog
  - artwork and pinned player bundle

Browser
  |
  | HTTPS API and HLS requests, with browser cookie
  v
Caddy: audio.tyemirov.net
  |
  | proxy all application requests
  v
Go media service: private runtime network
  - anonymous session creation
  - temporary playback grants
  - CORS, request validation, rate limits
  - authorization before every media response
  - bounded sessions and grants in memory
  |
  | exact package lookup after authorization
  v
Private media volume
  - immutable packages
  - validated media index

Offline operator preparation
  source recordings -> FFmpeg -> package validation -> private media volume
```

Keep the backend source in `services/music-stream/` within this repository.
The website and service form one application boundary for this feature.
The gateway owns generic routing, TLS, inventory, and deployment machinery.
The application owns music policy, asset preparation, API behavior, and acceptance tests.

Use Go to serve authorized files directly through `net/http`.
An additional Nginx server, object store, or Redis service is unnecessary for this initial topology.
Use one instance because its authorization state resides in memory.
Record multi-instance service operation as a separate future requirement.

Keep original recordings outside the public repository and Pages output.
Mount only validated media packages into the playback service.
Keep originals outside the playback service filesystem.
Route every public media request through the service authorization handler.
Expose the service only through the selected reverse proxy boundary.

## 4. Canonical catalog and private media index

### Public content

Move the existing music object into `data/site.json.music`.
Keep its album fields unless this section specifies a replacement.
Replace `trackList: string[]` with `tracks: Track[]`.
Remove `trackCount` and derive the count from `tracks.length`.
Keep each track ID stable when its title or position changes.

Use this track shape:

```json
{
  "id": "soliloquies-vol-i-01",
  "title": "Existing title copied without changes",
  "playback": {
    "kind": "hls",
    "durationMs": 241360
  }
}
```

Use this shape when no validated recording is ready:

```json
{
  "id": "soliloquies-vol-i-02",
  "title": "Existing title copied without changes",
  "playback": {
    "kind": "external"
  }
}
```

These are two current content states, rather than alternative schema readers.
An external-only track has no local Play control.
Its album keeps explicit platform links.
A failed HLS request shows an error and Retry control.
External platform navigation remains a deliberate visitor action.

Use array position for track order.
Permit only lowercase ASCII letters, digits, and hyphens in IDs.
Set an 80-character ID limit.
Reject duplicate IDs across the whole catalog.
Validate album slugs, required fields, URLs, discriminants, and positive durations at the catalog boundary.
Accept existing Unicode display text without normalization or translation.
Use text nodes for titles and labels.
Keep existing authored note markup within an explicit trusted-content boundary.

Add one public config document at `music/player-config.json`:

```json
{
  "apiOrigin": "https://audio.tyemirov.net"
}
```

This file contains runtime location data only.
It contains no cookie value, filesystem path, secret, or media source URL.
Generate local config with the local media origin for browser tests.

### Private operational data

The media index maps public track IDs to validated media packages.
It contains encoding facts and package identities, rather than a second editorial catalog.
Generate this index through the package activation tool.

```json
{
  "tracks": {
    "soliloquies-vol-i-01": {
      "assetId": "<64-lowercase-hex-SHA-256>",
      "durationMs": 241360,
      "playlist": "index.m3u8",
      "codec": "mp4a.40.2",
      "sampleRateHz": 48000,
      "channels": 2
    }
  }
}
```

Generate a public playback allowlist from `data/site.json` during the application build.
Include each track ID and its playback kind.
At startup, join that allowlist to the private media index.
Fail readiness if an HLS track lacks a valid package.
Keep the public duration within 250 milliseconds of the package duration.
Produce proposed catalog duration edits from the package report for review.

Treat the allowlist as current publication authority.
Treat the media index as the authority for bytes and package identity.
Reject new grants for a track outside the current HLS allowlist.
Pin an existing grant to the package selected when the grant was created.
Apply track disablement to existing grants on every request.

## 5. Audio preparation contract

Use original WAV or FLAC recordings when available.
Accept a supplied compressed recording only when the owner selects it as the source.
Record the source checksum and input format in the private preparation report.
Keep original audio and private reports outside Git and public artifacts.
Use generated tones as integration fixtures.

Pin FFmpeg and the build container by an exact version and image digest during implementation.
Record the chosen versions in the preparation report.
Use the current maintained release available at that time.
Keep conversion outside the public request path.

Proposed preparation command:

```bash
ffmpeg -nostdin -hide_banner -loglevel error \
  -i "$MUSIC_SOURCE_FILE" \
  -map 0:a:0 -vn -sn -dn \
  -map_metadata -1 -map_chapters -1 \
  -c:a aac -profile:a aac_low -b:a 192k -ar 48000 -ac 2 \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_list_size 0 \
  -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
  -hls_segment_filename "$MUSIC_STAGE_DIR/seg-%05d.m4s" \
  "$MUSIC_STAGE_DIR/index.m3u8"
```

The wrapper must create a new empty staging directory before this command.
Use an argument array when a program invokes FFmpeg.
Keep the recording gain in the first release.
Do not add loudness normalization or trimming without an explicit audio requirement.

FFmpeg supports HLS VOD output and fMP4 segment creation.
Use its current [HLS muxer documentation](https://ffmpeg.org/ffmpeg-formats.html#hls-2) for the selected release.

Package layout:

```text
<private-media-root>/
  packages/
    <asset-id>/
      index.m3u8
      init.mp4
      seg-00000.m4s
      seg-00001.m4s
      ...
      package.json
  indexes/
    <index-sha256>.json
```

The private `package.json` records filenames, byte counts, checksums, duration, codec, and preparation identity.
Calculate the asset ID from a canonical ordered list of output filenames and byte checksums.
Exclude `package.json` from this calculation to prevent a circular digest.
Serve only the playlist, initialization file, and listed segments.
Keep package reports and indexes outside all public routes.

Validate these conditions before activation:

1. Confirm that the selected input has an audio stream.
2. Reject a duration outside the proposed interval from one second through two hours.
3. Confirm AAC-LC audio, stereo channels, and the selected sample rate.
4. Decode the complete generated playlist with the pinned FFmpeg build.
5. Confirm a final `EXT-X-ENDLIST` and a valid `EXT-X-MAP` reference.
6. Confirm that each playlist reference is a permitted relative filename.
7. Reject absolute URLs, parent paths, query strings, symlinks, and references outside the package.
8. Confirm that every referenced file exists and matches its recorded checksum.
9. Confirm that each segment duration, rounded to the nearest integer, stays within the declared target duration.
10. Confirm correct playback duration and the absence of truncation.
11. Measure encoded peak bitrate for capacity evidence.
12. Create the immutable package only after all checks pass.

Use one media playlist for the single rendition.
Test each engine supported by the managed CI browsers with this exact fixture.
Native playback remains available when the browser reports native HLS support.
The initialization file and relative segment references follow the [HLS format contract](https://www.rfc-editor.org/rfc/rfc8216).
If a browser requires different packaging, resolve that result in the format contract before implementation continues.

Activate media in this sequence:

1. Transfer the validated package through the existing private operator transport.
2. Verify every package checksum at the destination.
3. Make the package visible through an atomic directory rename on the same filesystem.
4. Generate the candidate index and validate its catalog references.
5. Select the validated index through the application-owned activation command.
6. Replace the service index in one atomic operation.
7. Keep the previous valid index if candidate validation fails.

Validation failure must leave current media active and report the precise failure.
This is transaction behavior within one schema.
Keep superseded packages for at least 24 hours and until all referencing grants expire.
Remove only packages proven unreachable from the active index and active grants.
Keep originals in an independent backup so every rendition can be rebuilt.

## 6. Browser sessions and playback grants

Use a cryptographically random 32-byte browser credential from Go `crypto/rand`.
Encode it with unpadded base64url for the cookie value.
Store its SHA-256 digest as the session lookup key.
Keep the raw value out of server logs, JavaScript, URLs, and API response bodies.

Set this cookie from the media origin:

```http
Set-Cookie: __Host-music-session=<opaque-value>; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400
```

Omit the `Domain` attribute.
The browser stores this credential only for the media hostname.
Use HTTPS on both website and media origins.
Those origins are different origins within the same site when they use `tyemirov.net` subdomains.
Use [cookie scope rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) as the browser contract.

Create a browser session during the first authorized-origin grant request.
Reuse an existing valid session for later requests from that browser.
Set session expiration to 24 hours after each successful grant creation or renewal.
Update the cookie lifetime on those responses.
Let a valid grant continue through ordinary media requests without changing its expiration.

A playback grant contains these server-owned fields:

```text
grant ID: random 16-byte base64url identifier
session digest
track ID
asset ID
created timestamp
expires timestamp
revoked state
```

The grant ID is a locator, rather than an independent credential.
Reject media access without the session cookie, even when the caller knows the full grant URL.
Associate each grant with exactly one track and package.
Keep up to eight active grants per browser session for queue changes and multiple tabs.
If that limit is reached, reject creation with a typed error.
Delete the previous document grant after a successful track change.
Do not revoke another tab's grants during ordinary track selection.

Set the grant lifetime with this formula:

```text
grant TTL = max(30 minutes, track duration + 15 minutes)
grant expiration = server time + grant TTL
```

This lifetime permits complete playback when a phone suspends JavaScript timers.
For the proposed duration limit, the maximum grant lifetime is two hours and 15 minutes.
Renew a playing track when fewer than ten minutes remain.
Evaluate renewal every minute while the document is active.
Stop periodic renewal while playback is paused or ended.
Before a later resume, obtain valid authorization and keep the playback position.

Use server time as authorization authority.
Return server time and expiration so client clock differences do not control access.
Use an injectable clock in expiration integration tests.
At `now >= expiresAt`, reject the next media request.
Bytes already received remain playable in the browser buffer.

Session memory must have explicit maximum counts and periodic expiration cleanup.
Use proposed limits of 10,000 browser sessions and 80,000 playback grants.
Reject new grants with `503` when global capacity is exhausted.
Keep current valid grants during capacity pressure.
Keep map and limiter state bounded under arbitrary client input.

A service restart removes sessions and grants.
The player may obtain one replacement grant after this documented session-loss error.
Keep the current track and time during that attempt.
If replacement fails, show Retry and stop automatic recovery.
Seamless service replacement requires persistent authorization state and is outside the first-release defaults.

## 7. Public HTTP contract

Use one API namespace and one media namespace on the media origin.
Publish an OpenAPI document for JSON endpoints during implementation.
Reject unknown JSON fields, malformed identifiers, and bodies above 1 KiB.
Set `Cache-Control: no-store` on API responses and errors.

| Method and path | Input | Success | Main failures |
| --- | --- | --- | --- |
| `POST /api/playback-grants` | JSON `trackId`, permitted Origin, optional existing cookie | `201`, grant body, Location, session cookie | `400`, `403`, `404`, `409`, `429`, `503` |
| `GET /api/playback-grants/{grantId}` | Cookie belonging to the grant | `200`, current grant state | `401`, `404`, `410` |
| `PUT /api/playback-grants/{grantId}/expiration` | JSON `expiresAt`, cookie, permitted Origin | `200`, renewed grant body | `400`, `401`, `403`, `404`, `410`, `429` |
| `DELETE /api/playback-grants/{grantId}` | Cookie, permitted Origin | `204` | `401`, `403`, `404` |
| `GET` or `HEAD /hls/{grantId}/{assetId}/{file}` | Valid cookie and active matching grant | `200` or valid range response | `401`, `404`, `410`, `416`, `429` |
| `GET /healthz` | None | `200`, process liveness | `503` |
| `GET /readyz` | None | `200`, validated catalog and media state | `503` |

Creation request:

```json
{
  "trackId": "soliloquies-vol-i-01"
}
```

Creation and renewal response:

```json
{
  "grantId": "<grant-id>",
  "trackId": "soliloquies-vol-i-01",
  "playlistUrl": "https://audio.tyemirov.net/hls/<grant-id>/<asset-id>/index.m3u8",
  "durationMs": 241360,
  "serverTime": "2026-09-08T20:00:00Z",
  "expiresAt": "2026-09-08T20:30:00Z"
}
```

Error response:

```json
{
  "error": {
    "code": "grant_expired",
    "message": "Playback access expired.",
    "requestId": "<request-id>"
  }
}
```

Use `401 session_required` for absent or unknown browser credentials.
Use `403 origin_denied` for a forbidden API Origin.
Use `404 not_found` for an unknown track, grant, package, or file.
Use the same `404` when a grant belongs to another session.
Use `410 grant_expired` for an expired grant belonging to the supplied session.
Use `410 track_unavailable` when the track is disabled after grant creation.
Use `409 grant_limit` when the session has eight active grants.
Use `429 rate_limited` with `Retry-After` for a request rate limit.
Use `503 media_unavailable` for missing active package bytes or service capacity failure.
Make deletion idempotent for a known session's already deleted grant until its original expiry.
Expire the deletion record with the same bounded cleanup process.

For renewal, accept only a current grant and current browser session.
Send the requested expiration as an RFC 3339 UTC timestamp in `expiresAt`.
Calculate it from the last server time, elapsed monotonic time, and the same TTL formula.
Reject an expiration beyond the current server time plus that TTL.
Reject an expiration before the current grant expiration or at or before the current server time.
Replace the expiration with the accepted value.
If a retry supplies the current expiration, return the same state without another rate-limit token.
Return the same grant ID and playlist URL.
This permits renewal without playlist replacement.
An expired grant requires a new creation request.

For each media request, use this order:

1. Validate the HTTP method, URL shape, and allowed filename syntax.
2. Authenticate the cookie against a current browser session.
3. Resolve the grant and verify its ownership, expiration, and current track availability.
4. Match the requested asset ID to the grant's pinned asset ID.
5. Resolve the filename through the package's validated file list.
6. Apply request and concurrent-response limits.
7. Open the exact media file through the trusted package root.
8. Send bytes or the applicable authorized range response.

Apply authorization before `HEAD`, `Range`, conditional requests, and any file metadata response.
Reject traversal, encoded separators, duplicate decoding, and symlink escape at the HTTP/filesystem boundary.
Use root-confined filesystem access supported by the selected Go release.
Keep files immutable after validation.
Return `405` and an `Allow` header for unsupported methods.

Use `application/vnd.apple.mpegurl` for playlists.
Use `audio/mp4` for initialization files and fMP4 segments.
Send `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store` on media responses.
Keep those headers on errors.
Use Go's [HTTP content-serving behavior](https://pkg.go.dev/net/http#ServeContent) only after authorization.
Cover header retention and range behavior through integration tests.

## 8. CORS, proxy behavior, and rate limits

Accept exactly `https://tyemirov.net` as the production website Origin.
Add a `www` origin only after verification that it serves the actual website.
Use a separate exact allowlist for local HTTPS tests.
Keep local origins outside production config.

Reject grant creation, renewal, and deletion without an allowed Origin.
Accept only JSON on creation so normal cross-site forms cannot create grants.
Use credentialed API requests from the browser.
Handle preflight without a cookie, but validate its Origin, method, and requested headers.
Permit `Content-Type` and `Range` where required by the tested browser requests.

Return these headers for an allowed Origin:

```http
Access-Control-Allow-Origin: https://tyemirov.net
Access-Control-Allow-Credentials: true
Vary: Origin
Access-Control-Expose-Headers: Retry-After, Content-Range, Accept-Ranges, X-Request-ID
```

Set explicit allowed methods on preflight responses.
Never combine credentialed responses with a wildcard allowed origin.
Return CORS headers on errors for permitted origins so the player can read typed failures.
Use the [CORS response contract](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) for browser enforcement.

Some media requests can omit Origin.
Authorize these requests through the cookie and grant, without requiring a Referer header.
If a media request supplies a forbidden Origin, reject it.
Treat CORS and Origin validation as browser restrictions, rather than proof of listener identity.
A non-browser client can supply its own Origin header.

Caddy must keep cookies, `Range`, and relevant response headers.
Configure the media origin with application proxy routes only.
Keep package directories outside Caddy static-file routes.
Keep shared HTTP caching disabled for protected media in this release.
An OS file cache can still accelerate authorized reads.

Trust client address headers only from the configured gateway proxy boundary.
Derive the address from the connection when the peer is outside that boundary.
Never trust an arbitrary public `X-Forwarded-For` value.

Use these initial limits as configuration defaults:

| Boundary | Limit | Behavior |
| --- | --- | --- |
| Grant creation per client address | 60 per minute, burst 20 | `429` with `Retry-After` |
| Grant creation per browser session | 20 per minute, burst 5 | `429` with `Retry-After` |
| Renewal per grant | 2 per minute, burst 1 | `429` with `Retry-After` |
| Media requests per browser session | 600 per minute, burst 60 | `429` with `Retry-After` |
| Concurrent media responses per session | 8 | `429` until capacity is available |
| JSON body | 1 KiB | `413` |
| Request headers | 16 KiB | HTTP parser rejection |

Implement rate limits as token buckets with bounded key retention.
Measure seek behavior and shared-address households before changing these defaults.
These limits permit browser prefetch and do not enforce real-time listening speed.
Bound total simultaneous responses for the host separately from individual session limits.
Set explicit read-header, idle, and per-file response timeouts.
Derive file response limits from the largest accepted segment and the slow-network acceptance profile.
Cancel work when the client disconnects.

## 9. Player behavior and browser engines

Keep one shared player controller and one `<audio>` element per document.
The controller owns track selection, queue position, playback grants, and recovery.
The view renders controller state and sends explicit user actions.
The API adapter validates transport data before the controller receives it.

Use these states:

```text
idle -> authorizing -> loading -> playing
playing <-> paused
playing -> buffering -> playing
playing -> ended
any active state -> error
error + Retry -> authorizing
```

Keep renewal as grant state alongside the audio state.
Use typed error codes and explicit transitions.
Allow one active grant creation or renewal per document.
Cancel obsolete requests when the visitor selects another track.
Use a selection sequence ID to prevent stale responses from replacing a newer track.

### Engine selection

Select the engine once for a document:

1. If the browser supports native HLS for the selected audio type, use the native engine.
2. Otherwise, if the supported hls.js build reports MSE support, use the hls.js engine.
3. Otherwise, show an unsupported-browser message and keep explicit platform links.

These engines implement the same current HLS contract on different browser capabilities.
Keep one codec and package format for both engines.
Keep an engine fixed after selection, including when playback fails.

Set `audio.crossOrigin = "use-credentials"` before assigning its source.
Set `preload="none"` until the visitor selects a track.
Use `credentials: "include"` for all API requests.
Configure the selected hls.js loader to include credentials for playlist, initialization, and segment requests.
Verify both XHR and Fetch loader behavior if the shipped build uses both paths.
The relevant contracts are [media credentials](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/crossOrigin) and [hls.js loader configuration](https://hlsjs.video-dev.org/api-docs/hls.js.hlsconfig).

Pin hls.js through the package lockfile.
Generate a same-origin ESM player bundle through a pinned build tool.
Include its worker assets if the chosen build needs separate workers.
Keep the dependency license with the generated distribution.
Use the [hls.js project documentation](https://github.com/video-dev/hls.js) to verify the selected build capabilities.

### Visible controls

- Show artwork, album title, and current track title.
- Provide Play/Pause, elapsed time, duration, a seek control, Previous, and Next.
- Provide a volume control where the browser supports programmatic volume.
- Show one Play button for each locally available track.
- Mark the current track without changing its accessible name unexpectedly.
- Advance to the next locally playable track when the current track ends.
- Stop at the album end unless the visitor explicitly selects repeat in a future feature.
- Keep platform links visible as separately labeled actions.
- Keep player controls clear of the footer and mobile safe area.

Use semantic buttons and a labeled range input for seeking.
Support keyboard activation, arrow-key seeking, visible focus, and reduced motion.
Use a polite status region for meaningful state changes.
Keep elapsed-time updates outside the live announcement region.
Verify artwork sizing, long titles, Unicode text, and narrow screens.

Update Media Session metadata when the browser supports that API.
Connect available media actions to the same controller actions.
Physical lock-screen testing is not feasible because mobile devices are unavailable.
Exclude this test from completion gates, with no pending acceptance action.
Playback can stop during full-page navigation in this first release.
Continuous playback across all site routes requires a separate navigation architecture decision.

### Playback sequence and recovery

1. On a Play action, request a grant for the selected track.
2. Validate the response track ID, URL origin, URL path, duration, and timestamps.
3. Attach the playlist through the selected engine.
4. Call `audio.play()` and handle its promise.
5. If browser policy requires another gesture, show an enabled Play control.
6. On successful playback, start progress and expiration observation.
7. Before grant expiry, renew the existing grant without changing the audio source.
8. On a track change, stop and dispose of the previous engine state.
9. After the new track is ready, delete the previous grant through the API.

For hls.js media failures, inspect the HTTP status and typed API state.
For a native media error, query the grant state once because the media element can hide HTTP details.
For an expired or lost session, create one replacement grant and restore the saved playback position.
For a disabled track, show its unavailable state immediately.
For `429`, honor `Retry-After` and show a retry countdown when useful.
For an unavailable server or malformed media, show a clear Retry action.

Set a total recovery budget of one grant replacement per playback incident.
Configure bounded network retries in the pinned hls.js version.
Keep retry accounting in one place so engine retries and controller retries do not multiply.
Reset the incident budget only after stable playback resumes or the visitor presses Retry.
On document disposal, abort requests and remove timers, event listeners, and engine resources.
Let server expiration remove grants if page shutdown prevents explicit deletion.

## 10. Proposed file changes

Paths below describe planned work. They are not implementation evidence.

| Path | Purpose |
| --- | --- |
| `data/site.json` | Canonical album and track content |
| `data/music.json` | Remove after the bounded content migration |
| `site.js` | Shared content validation and music rendering dispatch |
| `music/music.js` | Small index-page initializer for the shared renderer |
| `music/album.js` | Small album-page initializer for the shared renderer |
| `music/player/controller.js` | Player state, queue, grant lifetime, recovery |
| `music/player/api.js` | API requests and boundary validation |
| `music/player/native-engine.js` | Native HLS adapter |
| `music/player/hls-engine.js` | hls.js adapter |
| `music/player/view.js` | Semantic controls and accessible status |
| `music/player-config.json` | Public media origin |
| `music/player.css` | Shared player layout |
| `music/dist/` | Generated player assets in the Pages artifact |
| `music/index.html` and album entry documents | Module bootstrap, header, footer, player container |
| `package.json`, lockfile, browser config | Pinned bundle and browser-test toolchain |
| `services/music-stream/go.mod` and `go.sum` | Backend dependencies |
| `services/music-stream/cmd/music-stream/` | Service entry point |
| `services/music-stream/cmd/music-media/` | Package validation and media index operations |
| `services/music-stream/internal/` | Config, catalog, sessions, grants, HTTP, file access, metrics |
| `services/music-stream/Dockerfile` | Runtime image with the service binary |
| `scripts/music/` | Offline packaging and report helpers |
| `tests/music/` | Generated fixtures and real HTTP/browser acceptance |
| `scripts/build-pages-artifact.sh` | Player bundle inclusion and private-content boundary |
| `Makefile` | Focused implementation checks and final CI composition |
| `docs/music-operations.md` | Source preparation, activation, recovery, and operator acceptance |

Define domain types for track IDs, asset IDs, sessions, grants, and validated packages.
Keep config validation in startup adapters and HTTP validation in handlers.
Keep file lookup separate from grant policy.
Use explicit dependency injection for clocks, randomness, and storage failure scenarios.
Keep the real service and filesystem interactions in the primary integration suite.

The Pages builder currently copies only tracked input files.
Generate the player bundle explicitly into the artifact after source copying.
Keep generated files out of the source-file discovery contract.
Run browser acceptance against the built artifact, rather than only the source directory.

## 11. Ordered implementation milestones

Use integration-first development for each behavior change.
Run the new integration test before production code changes.
Keep the expected failure result and the later passing result.

### Milestone 0: Prove the browser and media contract

1. Read current repository guidance and record the source revision.
2. Add a generated tone fixture through the proposed packaging entry point.
3. Add an HTTPS fixture site and real minimal media service.
4. Prove credentialed API access and cookie delivery through the managed browser engines.
5. Prove the same package through hls.js in Chromium and Firefox.
6. Prove that a copied URL without its cookie fails for every referenced file.
7. Prove that renewal extends access without a source reload.
8. Record the actual browser and operating-system versions.

Use two local HTTPS origins under one test site.
For a generated localhost certificate, scope certificate acceptance to each test browser session.
Keep global certificate trust unchanged.
Keep production cookie flags in that environment.
Use only Playwright-managed browsers in headless mode.
Mute test audio before playback.
Run the suite in the pinned Linux CI container.
Keep installed desktop browsers outside the automated test workflow.
The owner confirmed that physical mobile devices are unavailable.
Physical mobile acceptance is not feasible and is excluded from the completion gates.
Record that limitation explicitly.
Playwright WebKit provides automated engine coverage.
If a supported engine fails credentialed playback, resolve that boundary before catalog or player expansion.

### Milestone 1: Package and validate audio

1. Implement the offline command, immutable package layout, and checksums.
2. Add malformed input and incomplete-package integration cases.
3. Verify duration and full decode of generated output.
4. Add atomic index activation with previous-state preservation on failure.
5. Produce a preparation report from the synthetic fixture.

### Milestone 2: Implement the service contract

1. Implement config, readiness, browser sessions, and playback grants.
2. Implement all JSON endpoints and error codes in section 7.
3. Implement authorized file responses and range handling.
4. Implement CORS, proxy address validation, and bounded rate limits.
5. Implement expiration, track disablement, and session cleanup.
6. Verify real HTTP behavior with controlled clocks and a real package directory.

### Milestone 3: Migrate content and build the player

1. Add characterization coverage for the five current albums and 41 track titles.
2. Migrate music content to `data/site.json` in one change.
3. Remove the old music reader and obsolete catalog file.
4. Implement shared rendering through `site.js`.
5. Add the controller, engine adapters, and accessible controls.
6. Add the required header and footer behavior on modified music pages.
7. Verify all existing homepage sections after the `site.js` change.
8. Verify browser behavior against the generated Pages artifact.

### Milestone 4: Verify the complete local product

1. Run the actual player against the actual service and packaged audio.
2. Exercise grant renewal, expiry, pause/resume, rapid track changes, and multiple tabs.
3. Exercise service restart, rejected cookies, slow responses, and rate limits.
4. Verify artifact exclusion and request-log redaction.
5. Complete keyboard, narrow-screen, and headless browser acceptance.
6. Run the final repository `make ci` once after the last stack change.

### Milestone 5: Prepare production handoff

1. Resolve the deployment prerequisite described in section 14 under its owning task.
2. Record the selected host, media origin, storage root, and capacity evidence.
3. Prepare the operator runbook and validated application declaration.
4. Complete the selected lifecycle checks on an isolated test host.
5. Import only the recordings and metadata supplied by the owner.
6. Give the operator the exact canonical application lifecycle command after readiness passes.
7. Record live acceptance separately after the operator rollout.

## 12. Acceptance matrix

Each row requires observable evidence through the stated public boundary.

| ID | Scenario | Required result |
| --- | --- | --- |
| A01 | Public music index | Five existing catalog albums keep content and working detail navigation |
| A02 | Album detail | Track titles and ordering match the migrated catalog |
| A03 | Track Play | Actual media bytes arrive and the audio time advances |
| A04 | Second selection | Only the new selected track plays |
| A05 | Queue completion | Next local track plays, then playback stops at album end |
| A06 | Seek | Playback resumes near the requested time across segment boundaries |
| A07 | Missing cookie | Playlist, initialization file, and segment requests all fail |
| A08 | Copied URL in another browser | Valid URL fails without the original session cookie |
| A09 | Different valid session | Another listener's grant remains inaccessible |
| A10 | Package substitution | A grant cannot authorize a different asset ID |
| A11 | Expiration boundary | New requests fail at the configured server expiration |
| A12 | Renewal | Same grant URL continues without playback reset |
| A13 | Long pause | Resume obtains valid access and restores position |
| A14 | Background phone playback | Not feasible: the owner has no physical mobile devices. Excluded from completion gates |
| A15 | Service restart | At most one replacement attempt keeps track and position |
| A16 | Track disablement | Existing and new grants stop authorizing new media requests |
| A17 | Forbidden Origin | API mutation fails, including preflight and null Origin cases |
| A18 | Native media without Origin | Valid cookie and grant authorize the media request |
| A19 | Range and HEAD | Authorization precedes range bytes, size information, and conditional responses |
| A20 | Traversal and symlinks | Requests cannot escape the validated package |
| A21 | Rate limits | Typed `429` and correct retry behavior without uncontrolled loops |
| A22 | Resource exhaustion | Session, grant, and limiter memory stay bounded |
| A23 | Rapid track clicks | Stale responses cannot replace the final selection |
| A24 | Multiple tabs | One tab's track change does not revoke another tab's grant |
| A25 | Catalog or API schema error | Visible error and no guessed content or silent success |
| A26 | Private artifact boundary | Pages artifact contains no originals, HLS packages, private indexes, or session values |
| A27 | Log inspection | Service and proxy output contain no Cookie or Set-Cookie values |
| A28 | Accessibility | Keyboard controls, seek labels, focus, and announcements work |
| A29 | Global site regression | Homepage sections, filters, contact, and footer remain usable |
| A30 | Browser engines | Playwright-managed Chromium, Firefox, and WebKit pass applicable playback cases in silent headless CI |
| A31 | Audio validation | Automated source and HLS decode, duration checks, and silent browser playback pass for owner-supplied recordings |
| A32 | Index activation failure | Current index and playback remain valid after a rejected candidate |
| A33 | Package replacement | Current grants keep their pinned package until expiration or track disablement |
| A34 | Cookie race on first use | Parallel tabs recover from any overwritten initial session without repeated recovery loops |
| A35 | Media file removed | Readiness fails and the request returns a typed service error without filesystem details |
| A36 | Public production boundary | DNS, TLS, cookies, playback, and unauthenticated rejection pass after operator deployment |

Proposed focused Make targets:

```text
make music-package-test
make music-api-test
make music-browser-test
make music-artifact-test
make music-container-test
make music-load-test
make music-load-container
make music-ci-container
make ci
```

These targets are implemented.
The browser target includes catalog checks.
Representative host load qualification remains separate from the container smoke test.
The load command provides a generated-audio baseline with 100 simulated listeners, shared sessions, and seek bursts.
Its Linux report includes service CPU, memory, disk counters, request latency, and media throughput.
The browser suite checks cold hls.js startup with 10 Mbps and 100 milliseconds of emulated latency.
Include deterministic package, API, catalog, browser, and artifact checks in `make ci`.
Keep load tests, real recordings, and production acceptance as separate evidence.
Record physical mobile coverage as not feasible.
Run `lifecycle-contract-test` and `loopaware-site-id-test` through the final CI composition.
Run the documentation checker on changed technical documents.
Run the Governor check after any selected manifest change.

## 13. Capacity, diagnostics, and operation

At 192 kbps, one listener transfers approximately 86.4 MB per hour before protocol overhead.
One hundred simultaneous listeners need approximately 19.2 Mbps of audio throughput.
The proposed 25 percent planning margin gives approximately 24 Mbps for that audience.
One thousand listener-hours transfer approximately 86.4 GB before overhead.
These are decimal estimates, rather than measured server capacity.

Estimate rendition storage with this formula:

```text
encoded bytes ~= total audio seconds * 192000 / 8
```

Add space for package overhead, retained packages, staging, and original backups.
Measure actual FFmpeg output because variable segment sizes affect peak transfer behavior.

Use 100 simultaneous listeners as the provisional load-test target.
Run the test for 15 minutes with a representative track and normal six-second request cadence.
Include seek bursts and multiple active tabs.
Proposed targets are fewer than 0.1 percent unexpected server errors and p95 grant latency below 250 milliseconds on the test network.
Measure startup below three seconds at 10 Mbps with 100 milliseconds round-trip latency.
Record CPU, memory, disk throughput, and network use with the exact test host identity.
Select the production host only after the owner confirms audience and available outbound capacity.

Emit structured events with request ID, route template, status, track ID, duration, and byte count.
Use route templates instead of raw media URLs in logs.
Redact Cookie, Set-Cookie, private filesystem paths, and authorization state in the service and reverse proxy.
Keep analytics payloads free of grant IDs and cookie values.
Use server counters to measure grants, rejected requests, bytes, active sessions, and active grants.
Label metrics by bounded categories rather than session identifiers.

Expose detailed metrics only on the private service boundary.
Expose minimal public health responses without catalog, storage, or runtime secrets.
Set readiness failure for a missing index, invalid package, unreadable active bytes, or unusable service configuration.
Monitor disk capacity, authorization failures, package errors, and restart frequency.
Record operational response thresholds in the runbook after the load test.

Back up original recordings, private indexes, and the package preparation records.
Prove one restore to an isolated directory and decode its resulting playlist.
For an invalid new media index, keep the last validated active index.
For a service defect, prepare a corrected forward release through the canonical lifecycle.
Use explicit track disablement as the immediate application control for affected recordings.

## 14. Production integration prerequisite

The local application policy requires a committed `.mprlab/deploy/resources.yml`.
B001 adds this declaration, the Pages artifact container, and canonical Gateway delegation in the Makefile.
The implementation removes the obsolete release helpers and source-owned Pages metadata.
Gateway adds the domain, Jekyll control, and release marker to the publication artifact.
The service uses the computercat inventory group, a retained media volume, and private port 8092.
The selected declaration passes real Gateway release, publication, and deployment plans with synthetic inventory.
Public lifecycle commands also reject non-default source in isolated Git fixtures.
These checks establish local contract acceptance.
Isolated-host deployment and production qualification remain required.

The sibling gateway currently owns `app-release`, `app-publish`, and `app-deploy`.
Its application contract assigns routing and runtime resources to the selected application's declaration.
Its README assigns inventory and shared Caddy machinery to the gateway.

Resolve this prerequisite in the selected application before production readiness.
Use the current gateway contract as the authoritative schema.
Keep gateway source changes outside this music implementation scope.
Do not invent resource fields or write a parallel deployment script from this document.
Record any required lifecycle repair as a separate owning task before execution.

The media feature needs these application surfaces after that prerequisite is resolved:

| Surface | Required declaration or evidence |
| --- | --- |
| Website | Existing domain on GitHub Pages, with `gh-pages` publication |
| Media service | Immutable application image, one instance, exact placement group |
| Private storage | Retained `tyemirov-site-music-media` volume at `/media`, with validated `selected.json` and `allowlist.json` |
| Media origin | Caddy route for `audio.tyemirov.net` to the application service |
| Configuration | Catalog allowlist, media root, exact Origins, limits, and `MUSIC_TRUSTED_PROXIES` from the private environment file |
| Health | Process, readiness, public HTTPS, and real media authorization probes |
| Operator data path | Private transfer and activation procedure for validated packages |

Confirm the physical host, inventory group, capacity, hostname ownership, and storage mapping from actual operator state.
Leave those values as open inputs until they are verified.
The owner selected computercat for the backend on September 8, 2026.
Gateway inventory maps group `computercat` to `computercat-host` at `192.168.1.158`.
Read-only SSH inspection confirmed Docker 29.8.0 on Linux x86_64, 16 CPUs, and 50,435,923,968 bytes of memory.
The configured runtime root is `/home/tyemirov/mprlab-runtime`.
Its filesystem reported 872,152,140 KiB available during that inspection.
These facts establish placement and available resources.
The declared media volume and audience capacity still require host qualification.
GitHub reports `gh-pages` with `/` as the Pages source on September 8, 2026.
The configured custom domain is `tyemirov.net`, with HTTPS enforced.
Verify this configuration again before production publication.
Verify the actual public `/.mprlab-release.json` during production acceptance.

Only the operator runs the production lifecycle.
After readiness passes, the canonical application command is:

```bash
make release && make publish && make deploy
```

This command is not certified ready by this plan.
Local tests establish product behavior, while an isolated host establishes deployment behavior.
Live HTTP and headless browser checks establish production playback acceptance after the operator rollout.

Use this application sequence within the approved lifecycle and media operation contract:

1. Place and verify private packages before their catalog entries become locally playable.
2. Activate the validated media service and package index.
3. Verify a protected fixture through the final HTTPS media origin.
4. Publish the website catalog and player after backend acceptance.
5. Verify one complete owner-selected song in the production website.
6. Verify unauthenticated rejection for its playlist, initialization file, and segment.
7. Record the website release, service image, media index digest, and browser evidence together.

Keep incomplete catalog records external-only until their recordings pass package acceptance.
Keep superseded package bytes while active grants can reference them.
Coordinate website and backend catalog updates so a newly visible Play control always has a ready package.

## 15. Open decisions and required inputs

| Input or decision | Proposed default | When required |
| --- | --- | --- |
| Public complete-song playback | Anonymous complete tracks | Before implementation scope acceptance |
| Media hostname | `audio.tyemirov.net` | Before production DNS and TLS qualification |
| Backend ownership | `services/music-stream/` in this repository | Before backend scaffolding |
| Initial recordings | One owner-selected track, then validated catalog recordings | Before real media preparation |
| Source location and track mapping | Owner-supplied private files mapped to permanent IDs | Before real media preparation |
| Source gaps | Keep affected tracks external-only | Before public catalog activation |
| Production host and inventory group | Owner selected computercat, inventory group `computercat`, one instance | Confirmed. Capacity and media mount qualification remain |
| Audience and outbound capacity | Provisional 100 simultaneous listeners | Before host qualification |
| Private media transfer | Existing operator SSH transport, to be verified | Before package activation runbook |
| Session restart interruption | One bounded recovery attempt | Before service acceptance |
| Physical mobile coverage | Not feasible because devices are unavailable | Excluded from completion gates by the owner |
| Whole-site continuous playback | Playback remains within the current document | Before broader navigation work |
| Maximum recording duration | Two hours | Before source validation contract acceptance |
| Lifecycle integration gap | B001 provides source integration and isolated release, publication, deployment, retry, and cleanup evidence | Production qualification remains with the operator |

Use synthetic fixtures while real recordings or production inputs remain unavailable.
Record exact missing inputs without claiming real-catalog or production acceptance.
Keep the existing artist catalog and platform links during this work.

## 16. Agent completion report

The implementing agent must provide these outputs:

1. List changed contracts and source files.
2. Record the expected failing integration tests and their later passing results.
3. Record the exact final `make ci` result and source revision.
4. Record the generated Pages artifact and private-content exclusion result.
5. Record browser versions and passed acceptance IDs.
   Record physical mobile coverage as not feasible.
6. Record accepted media packages and their private report locations without exposing audio or credentials.
7. Record deployment prerequisite status and remaining operator inputs.
8. Separate local behavior, device behavior, release, publication, deployment, and live acceptance.

Suggested task prompt:

```text
Implement docs/private-hls-implementation.md in the existing primary checkout.
Read AGENTS.md and its applicable references first.
Use the proposed defaults unless the user supplies different requirements.
Start with Milestone 0 and keep the integration-first evidence.
Keep one canonical music catalog in data/site.json.
Use synthetic audio until authorized source recordings are available.
Complete the local application, artifact, and browser checks.
Record source inputs and the agreed physical mobile coverage limitation.
Keep the identified lifecycle prerequisite in its own application-owned task.
Prepare the operator handoff after the applicable readiness checks pass.
Leave production execution to the operator.
```

## 17. Plan validation record

The repository inspection covered the existing music renderers, catalog, Pages builder, Makefile, and applicable governance documents.
Application implementation, actual recording ingestion, and production mutation were outside this task.

The proposed FFmpeg command ran locally with FFmpeg `8.1.2` and a generated 13-second tone.
It produced AAC-LC stereo audio at 48 kHz, one initialization file, and three fMP4 segments.
The resulting playlist had version 7, VOD type, and a final `EXT-X-ENDLIST`.
Complete decode passed.
The measured playlist duration was `13.021334` seconds, including normal encoder padding.
Temporary fixture files were removed after the probe.

This packaging probe verifies the proposed command and local decode.
It does not establish browser playback, real-recording quality, or deployed service behavior.

The official ASD-STE100 Issue 9 reference passed its pinned checksum gate.
The document review used Part 1 rules and Part 2 dictionary guidance.
The mechanical document checker and Governor check form separate recorded checks.
Those checks do not certify complete dictionary compliance.
Use the implementing agent's completion report for product acceptance evidence.
