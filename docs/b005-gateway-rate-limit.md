# B005 Gateway Rate-Limit Adoption

Gateway B568 and I245 are implemented in installed runtime `v4.2.0`.
The runtime source is `5d50c59d986d515166e6db6cf0deeb2a4cc3cf5d`.
Direct package validation passed on September 14, 2026.
The application now consumes the supported handler access contract.

## Current Application Policy

Gallery and music use `api.tyemirov.net`.
The music handler declares 6,000 requests per connection address in a 60-second window.
Its browser policy permits credentialed requests from `https://tyemirov.net` and `https://www.tyemirov.net`.
Caddy exposes `Retry-After` on rate responses to those exact origins.
Gallery and TAuth retain their existing handler policies.

Gateway owns policy validation, request order, and independent handler counters.
The application owns its selected policy and numerical budget.
A hostname-wide budget remains a valid alternative when an application selects it.
This application uses an independent music budget.
The music service keeps authorization and capacity checks without request quotas or token buckets.

## Installed-Runtime Qualification

The updated host test validates a captured installed package before it uses that package's tasks and Caddy template.
The first run without a handler policy accepted all 6,001 requests.
After the declaration change, `make music-host-test` passed.
The test reads its threshold from the selected application policy.

The test verified these results:

- Exactly 6,000 probe requests reached the music service within one window.
- The next request received HTTP 429 and a positive `Retry-After`.
- Both permitted browser origins received credentialed access to the cooldown headers.
- An unlisted origin received no browser access grant.
- Forged forwarding headers did not create an independent request budget.
- A different connection address retained its own budget.
- Gallery and auth probe upstreams remained available after the music budget was exhausted.
- One hundred listeners behind one address obtained grants and media.
- Private-port isolation, TLS, CORS, byte ranges, grant removal, and renewal passed.
- Chromium, Firefox, and WebKit passed playback, seeking, and reload.

The unrelated upstream probes qualify Caddy route isolation.
They do not qualify Gallery business operations or live TAuth login.
The test cleaned its host resources, and the qualification VM returned to its stopped state.
The evidence is `output/playwright/host/host-results.json`.
The [operations runbook](private-hls-operations.md) gives the installed-runtime inputs.

## Earlier Dedicated-Hostname Failure

The isolated host test used the real Gateway template and its declared music route.
The host test used Gateway checkout `5f890d541b2676b0e81cca44fb5db2397d4a915d`.
Its Caddy template is identical to source `2bdddf6dc69671aa7331ed84c4277516215b706a` of installed runtime `v4.1.0`.
Caddy image identity was `docker.io/temirov/caddy-ratelimit@sha256:b45d6bea1555119a0d2e7f44d1e8ead45c22e5e2af22f328f5a843ec9084f5c9`.
The test sent 6,001 requests from one connection address within one 60-second window.
Every request reached the backend and returned HTTP 404.
The test expected 6,000 backend responses and one HTTP 429 response.
Unique forged address headers accompanied these requests.

The Caddy adapter places the matched `handle` before the separate `route` that contains `rate_limit`.
The reverse proxy terminates the matched request before the rate limiter runs.
The adapter reports this order even when the rate-limit block appears first in the Caddyfile.
Caddy documents its directive ordering and the role of an enclosing [route block](https://caddyserver.com/docs/caddyfile/directives/route).

## Anonymous Reproduction

Use this Caddyfile with the pinned image:

```caddyfile
:18080 {
    route {
        rate_limit {
            zone example-music {
                key {remote_host}
                events 2
                window 60s
            }
        }
    }
    @music path /music /music/*
    handle @music {
        reverse_proxy 127.0.0.1:18092
    }
}
:18092 {
    respond "upstream" 200
}
```

1. Run `caddy adapt --config Caddyfile --adapter caddyfile` in the pinned image.
2. Examine `apps.http.servers` in the JSON output.
3. Confirm that the port 18080 server places `reverse_proxy` before `rate_limit`.
4. Start this configuration on an isolated host.
5. Send three requests to `http://127.0.0.1:18080/music/probe` within 60 seconds.
6. Require the third response to return HTTP 429.

Result before B568: All three requests returned HTTP 200.
Required result: The third request returns HTTP 429 and a positive `Retry-After` value.
The application must not compensate with an address parser or manual proxy list.

## Code Acceptance

The first Linux CI run passed 581 browser cases, skipped 21 cases, and failed two WebKit cases.
B004 records the Studio timeout, and B009 records the Time Series report width.
The focused Linux rerun passed the Studio case and reproduced the report width failure.
B004 and B009 are now corrected, with failing regressions retained before each correction.
The corrected focused checks passed all eight cases across four browser projects.
Final `make music-ci-container` passed, including 583 browser cases, 21 explicit skips, and the Gallery backend checks.

The complete CI log is `output/playwright/b004-b009-ci-final.log`.
B005 is closed because implementation and required code validation are completed.
Production deployment and public acceptance are separate operational concerns outside this task.
Existing sealed receipts remain unchanged.
