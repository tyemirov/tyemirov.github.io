# Browser dependency snapshots

The browser suite uses real MPR UI 4.3.7, Bootstrap 5.3.3, and D3 7.9.0 code. It uses captured Google Fonts responses. The manifest records source URLs, capture dates, the user agent, versions, and SHA-256 hashes. It includes all font files that the captured stylesheets reference and the upstream licenses.

`browser-assets.mjs` verifies file hashes before installation. It serves captured responses at their original browser URLs. Uncaptured UI, chart, parser, and font requests fail explicitly. The YAML parser comes from the repository's pinned `js-yaml` package. The local Google sign-in protocol fixture supports authentication against the real test service.

The shared fixture aborts requests to the analytics origin. Production pages keep their required pixel declaration and site ID.

The live qualification installer remains in `shared-ui-assets.mjs`. Routine browser results qualify the captured dependency versions.

## Refresh the snapshots

1. Select the published UI version and verified hashes in `tests/music/capture-browser-assets.mjs`.
2. Commit the capture script to the working branch.
3. Run `gh workflow run ci.yml --ref <branch> -f capture_assets=true`.
4. Download the `browser-assets-<commit>` artifact from that capture run.
5. Verify its manifest hashes and licenses.
6. Replace the snapshot files with the verified artifact files.
7. Run the browser dependency regression and affected browser tests.
8. Commit the complete snapshot and run normal PR CI.

The explicit capture mode retrieves public dependencies. Normal pull-request and push CI execute the complete `make ci` target.
