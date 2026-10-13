# Pull request CI

The `CI` workflow runs `make ci` for pull requests to `master` and pushes to `master`.
The required GitHub check is `make ci`.
The branch must contain the latest `master` changes before merge.
The rule applies to administrators.

The repository runner uses the `tyemirov-site-ci` label on `computercat`.
The workflow uses the existing CI container for Node.js, Go, FFmpeg, and the three browser engines.
The workflow preserves test results for seven days.

The Gateway release archive is a private test dependency.
The runner stores the archive in `$HOME/.cache/tyemirov-site-ci/`.
The workflow specifies its SHA-256 digest and verifies the archive before use.
The job does not require a GitHub token for this dependency.

## Runner setup

1. Set the external contributor approval policy to `all_external_contributors`.
2. Register a repository runner with the `tyemirov-site-ci` label.
3. Download the pinned Gateway release with an authorized operator account.
4. Verify the release digest and copy the Linux AMD64 archive to the runner cache.
5. Start the `github-actions-tyemirov-site-ci.service` user service on `computercat`.
6. Review external pull request code before you approve its workflow run.

An approved run can execute code on the shared host and read the cached Gateway archive.
The repository runner does not isolate approved code from the shared host.

## Gateway updates

Update `MPRLAB_GATEWAY_CI_VERSION` in `Makefile` and the archive path and digest in `.github/workflows/ci.yml` together.
Install the verified archive in the runner cache before the workflow runs.

For local container validation, use `make music-ci-container` with an authenticated `gh` account.
This command downloads the release and invokes the same `music-ci-archive` target as GitHub Actions.
