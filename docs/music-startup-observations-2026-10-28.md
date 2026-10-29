# Music startup observations: October 28, 2026

The reported symptom is a pause before a song starts.
This investigation did not reproduce a long pause or establish its cause.
Production code and configuration were unchanged.

## Service evidence

The current music container runs version `2.0.14` and started at 15:52 PDT on October 28.
The retained request sample covers 15:53 through 21:11 PDT, before the diagnostic playback requests.
All 189 requests returned successful HTTP status codes.

| Request | Count | Median duration | 95th percentile | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Create playback grant | 23 | 0 ms | 0 ms | 3 ms |
| Audio byte range | 89 | 60 ms | 1,337 ms | 8,094 ms |

The service records duration in whole milliseconds.
Audio duration measures the complete response, not the time until the listener hears sound.
The slowest response sent 5,042,643 bytes for `ostatki-sladki-01`.
These records do not establish an eight-second playback delay.

The container reported zero restarts and no out-of-memory termination.
One idle sample reported 0% CPU use and 5.34 MiB of memory.
These observations do not exclude earlier resource contention or network delay.

## Browser evidence

The production album was opened in automated Chrome 156.
The measured interval starts at the Play click and ends at the audio `playing` event.
This event measures playback state, not the first audible sound.
Each row represents one local sample.

| Browser network configuration | Click to playing |
| --- | ---: |
| Normal connection | 316 ms |
| CDP emulation: 2 Mbps download, 150 ms latency | 597 ms |
| CDP emulation: 0.5 Mbps download, 300 ms latency | 608 ms |

The last sample used disabled browser caching and cleared cookies.
The player audio element appeared 1,885 ms after navigation in that sample.
The configured emulation does not establish the experience of a listener on another network or browser.
WebKit validation was unavailable because the CLI browser executable was not installed.

## Findings and next actions

The production page has preconnect links for fonts, but none for `https://api.tyemirov.net`.
The grant API requires a CORS preflight and does not return `Access-Control-Max-Age`.
The browser uses a short default cache lifetime when this header is absent.
The historical sample contains 24 grant-creation preflights and 23 grant-creation requests.
The current encoder already uses FFmpeg `+faststart`.

Local copies of all five album recordings matched the production media index SHA-256 values.
FFmpeg examined the first 12 seconds of each file with `silencedetect=noise=-45dB:d=0.1`.
The longest detected initial silence was 0.163 seconds.
This check found no multi-second initial silence at that threshold.

1. Add browser timing for Play, grant completion, first playback, and later stalls.
2. Record browser family and track ID without cookies, grant URLs, or listener identifiers.
3. Open the API connection before Play through a preconnect link.
4. Add bounded CORS preflight caching with coverage for the existing origin and header restrictions.
5. Measure cold and repeated playback across Chromium, Firefox, and WebKit with controlled network conditions.

The connection and preflight changes can reduce setup round trips.
Longer preflight caching primarily helps subsequent requests, not the first request from a fresh browser context.
Their effect on the reported pause remains unverified.
The timing records are necessary to identify the delay in actual listener sessions.

## Evidence limits

The retained container logs cover only the current container lifetime.
They exclude browser startup timing, DNS, TLS, and time before requests reach the service.
Reverse-proxy logs were unavailable through the current SSH account because Docker access was denied.
Thus, this investigation does not isolate delays at the proxy or on remote listener networks.

Source boundaries: `music/player/api.js`, `music/player/engine.js`,
`services/music-stream/internal/stream/server.go`, and `scripts/music/prepare.mjs`.
