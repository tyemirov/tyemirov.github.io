# Music playback timing

The player sends one observation for each start or resume attempt.
An observation ends with playback, an error, or cancellation by a newer attempt or document disposal.
The service writes accepted observations as `music_playback_observation` JSON log records.

| Field | Meaning |
| --- | --- |
| `trackId` | Catalog track ID |
| `action` | `start` or `resume` |
| `outcome` | `playing`, `error`, or `cancelled` |
| `browser` | Browser engine family hint |
| `timeZone` | Browser time zone hint, such as `Asia/Tbilisi` or `Europe/Moscow` |
| `elapsedMs` | Time from attempt start to its outcome |
| `grantMs` | Time from attempt start to authorization completion, or null |
| `readyMs` | Time from attempt start to media readiness after source loading, or null |

All durations are cumulative whole milliseconds from one attempt start.
The client caps durations at 300,000 ms.
Where present, the service requires `grantMs <= readyMs <= elapsedMs`.
A resume with an existing source has no new readiness measurement.
The `playing` outcome measures browser playback state, not the first audible sound.

Compare `elapsedMs` across browser and time zone groups to find slow starts.
Compare `grantMs` with `readyMs` to distinguish authorization delay from media preparation.
Browser time zones can be manually selected and do not establish listener country or network route.

The payload excludes IP addresses, raw user-agent strings, cookies, grant URLs, and persistent listener identifiers.
The endpoint requires an allowed origin, a valid existing session, and a known track.
First-grant failures and blocked cookies can prevent observation collection.
Network failures can also prevent delivery.
The sender makes one asynchronous attempt with a five-second timeout and no retry.
Observation delivery does not delay playback.

Generated pages preconnect to the configured API origin with credentials.
The player adjusts this connection hint to the validated runtime API origin for local environments.
Successful CORS preflights use `Access-Control-Max-Age: 600`.
Rejected origins, methods, and headers do not receive this cache header.
Actual playback authorization remains necessary for each request.

The changes take effect after the application release is published and deployed.

## Validation on October 28, 2026

Before implementation, public interface tests failed because observations and the connection hint were absent.
The recovery regression first detected an incorrect clock reset and then passed after correction.
The focused browser scenarios passed in Chromium, Firefox, and WebKit, including delivery to the real media service.
The API tests passed with Go race detection, including origin, session, body, timing-order, and preflight-cache restrictions.
Independent source review found no remaining blockers.

The complete `make ci` run passed with 868 browser tests and eight existing skips.
Validation selected the physical packaged Gateway v7.0.9 executable through `MPRLAB_GATEWAY_EXECUTABLE`.
This selection satisfies the existing lifecycle test requirement for a packaged executable rather than its launcher.
