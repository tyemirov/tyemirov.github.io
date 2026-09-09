# ISSUES

Entries record newly discovered requests or changes.

Read `AGENTS.md` and its task-specific references before changes.

Format: `- [ ] [B042] (P1) {I007} Title`

## BugFixes

- [x] [B001] (P1) Align application publication with the current Gateway contract
  Goal:
  Make the application lifecycle obey the current repository deployment policy before production music activation.

  Requirements:
  - Use the current application declaration and sibling Gateway contract.
  - Keep the website on GitHub Pages with the `gh-pages` publication branch.
  - Keep music service configuration in the selected application.
  - Keep shared deployment machinery in Gateway.
  - Leave production execution to the operator.

  Deliverables:
  - Resolve the absent application declaration and local release-helper drift documented in the implementation plan, section 14.
  - Record actual Pages configuration and isolated-host deployment evidence.
  - Provide the canonical operator handoff for F001.

  Validation:
  - Expected: the application has a validated production declaration and the canonical Gateway lifecycle entry points.
  - Initial failure: the lifecycle integration test could not read the absent declaration.
  - The declaration now selects computercat, private media storage, the media route, and the Pages artifact container.
  - Real Gateway release, publication, and deployment plans pass with synthetic inventory and local Git origins.
  - All three public lifecycle commands delegate to Gateway and reject non-default source in isolated Git fixtures.
  - Gateway owns Pages domain and release metadata. The artifact container exports only public site content.
  - The service consumes `MUSIC_TRUSTED_PROXIES` through the declared private-value binding and rejects invalid CIDRs.
  - Final Linux CI passed after these changes, including all Gateway plans and 106 headless browser checks.
  - Both actual container image checks passed.
  - The container test verifies the declared AMD64 image and waits for the service readiness event before HTTP checks.
  - The isolated-host test passed Gateway volume creation, private SSH transfer, AMD64 media validation, and protected HTTP.
  - The test verified retained media after container replacement.
  - The extended host test passed HTTPS through the selected route rendered with Gateway's actual Caddy template.
  - Cookie authorization, CORS, byte ranges, grant removal, and client address limits passed through the proxy.
  - The actual application release passed canonical CI and sealed both artifacts with the isolated Docker host.
  - An exact release retry preserved the receipt and skipped CI and artifact assembly.
  - The exported source bundles, artifact hashes, release tag, and CI receipt passed independent verification.
  - The actual publication command pushed and verified the sealed image through a real isolated TLS registry.
  - Local provider fixtures and Git repositories received the release metadata and immutable Pages artifact reference.
  - An exact publication retry preserved the receipt and skipped artifact publication.
  - Exported registry data and the publication-to-release identity passed independent checks.
  - Actual Gateway foundation and application deployment commands passed on the isolated Linux host.
  - Gateway verified all six declared resources and the Caddy handler.
  - Exact retries kept the service container, desired resource generation, and Pages deployment identity.
  - The Pages HTTPS fixture served the activated Git artifact and its exact release marker.
  - Protected HTTPS media passed anonymous rejection, authorized access, byte ranges, and grant removal.
  - The actual Gateway cleanup playbook and its exact retry passed with an explicit isolated-host profile.
  - Production host, provider, DNS, TLS, and real-recording acceptance remain separate operator gates under F001.
  - GitHub reports `gh-pages` as the current Pages source, with `tyemirov.net` and HTTPS enforced.
  - The owner selected computercat. Gateway inventory maps group `computercat` to `computercat-host`, and read-only SSH checks reached its Docker runtime.
  - Final Linux CI passed after the deployment fixture changes, with 106 browser checks, six intentional skips, and no failures.

- [x] [B002] (P2) Restore the global site filter
  Goal:
  Apply the selected category to the public site sections.

  Requirements:
  - Keep content in `data/site.json`.
  - Connect visible category controls to the shared filter action.
  - Apply the selected category before section rendering.

  Validation:
  - Source review found that the existing filter action sets `currentFilter` and renders all sections without category selection.
  - This behavior predates F001. The catalog migration only changed the argument passed to `renderAll`.
  - Add browser coverage for category selection and clearing before the repair.
  - The initial browser checks failed because the visible category controls were absent.
  - Section and source filters now select content before the card limit, with keyboard focus preserved after selection and clearing.
  - Narrow-screen checks found and corrected overflow from fixed grid widths and hero links.
  - All eight filter checks passed in the final headless Linux CI run.

## Improvements

- [x] [I001] (P1) Prepare the current shared footer and theme contract
  Goal:
  Use the current MPR UI contract on every public page before central I009 publication.

  Requirements:
  - Use literal `@latest` for each MPR UI asset.
  - Use one footer initializer with the sectioned menu and shared theme configuration.
  - Obtain project links from `MPRUI.getFooterSiteCatalog()`.
  - Preserve the contact link, catalog content, tracking pixel, and supporting article links.
  - Preserve the gallery and music application behavior.
  - Keep automated music tests silent and headless.

  Deliverables:
  - Convert all 14 footer entry points and their current browser tests.
  - Record the exact shared candidate, local validation, and public observations.
  - Retain final-candidate qualification and operator publication in central I009.

  Validation:
  - Preserve failed real-page menu and theme tests before production changes.
  - Verify every footer at phone and desktop widths.
  - Verify contact links, delayed library initialization, theme changes, and current asset URLs.
  - Run final native Linux CI after the last source change.
  Resolution:
  - Converted all 14 footer entry points to one current initializer and shared stylesheet.
  - Passed all 116 footer and theme checks across four browser projects.
  - Final Linux CI passed with 234 browser checks and 18 engine-specific skips.
  - Lifecycle, artifact, Go race, and media checks passed.
  - Both actual Pages and media image checks passed.
  - Recorded the B069 candidate digests and seven public HTTP observations.
  - Preserved F001 and its existing production acceptance gates.

## Maintenance

- [ ] [M400R] (P2) Backlog hygiene and archive
  Goal:
  Keep the issue tracker reliable, readable, and focused on active work while preserving resolved history in the appropriate archive.

  Requirements:
  - Cadence: run weekly during active development and before each release cut.
  - Validate section names, identifier prefixes, recurrence suffixes, priority markers, dependencies, and duplicate IDs against the current `issues-md-format.md`.
  - Reconcile stale statuses, duplicate issues, broken references, obsolete instructions, and entries filed in the incorrect section.
  - Before archival, update source documents with durable results from each resolved non-recurring issue.
  - Preserve the complete issue entry and its ID in the repository archive.
  - Keep active, blocked, planning, and recurring entries visible in `ISSUES.md`.

  Deliverables:
  - Normalized `ISSUES.md` structure and statuses.
  - Updated archive with complete entries removed from the active tracker.
  - A short `Last run:` note summarizing the cleanup and any follow-up issues filed.

  Validation:
  - Read `ISSUES.md` after edits and confirm that each issue is in the correct section.
  - Confirm that each issue has a unique section-aware ID.
  - Confirm recurring entries remain open and keep the `R` suffix.
  - Confirm no active, blocked, recurring, or planning work was archived.

- [ ] [M401R] (P2) Polish open issues
  Goal:
  Keep unresolved work executable by making each open issue concrete, ordered, and testable.

  Requirements:
  - Cadence: run weekly during active development and before handing a repo to automated execution.
  - Review every unresolved non-recurring issue for missing context, dependencies, repro steps, acceptance criteria, and validation expectations.
  - Make priorities concrete and make sure that each open issue has actionable deliverables.
  - Merge duplicate open issues or add explicit dependency links when separate entries must remain.
  - Do not close or implement issues as part of this polish pass unless that work is separately requested.

  Deliverables:
  - Open issues with enough detail for a person or agent to execute without rediscovery.
  - New or updated dependency markers where ordering matters.
  - A short `Last run:` note listing the number of issues polished and any blockers found.

  Validation:
  - Sample the open entries after the pass and confirm each has clear next actions and validation expectations.
  - Confirm that no recurring runbook has a closed status.
  - Confirm duplicates were merged or explicitly cross-referenced.

- [ ] [M402R] (P2) Architecture and policy review
  Goal:
  Catch architecture, policy, and workflow drift before it becomes hidden maintenance debt.

  Requirements:
  - Cadence: run monthly, before large refactors, and after major framework or runtime changes.
  - Review the codebase, docs, and workflow against `AGENTS.md`, `POLICY.md`, stack guides, and the current architecture notes.
  - Look for drift from forward-only contracts, edge-validation boundaries, smart-constructor usage, testing policy, and module ownership.
  - Classify each finding by its requested outcome. Record concrete scope, priority, and validation.
  - Close the pass with a no-action note only when the review finds no actionable drift.

  Deliverables:
  - Correctly classified issues for each actionable architecture or policy drift finding.
  - Updated notes on areas reviewed and areas intentionally left unchanged.
  - A short `Last run:` note with the review scope and outcome.

  Validation:
  - Confirm every finding is represented as an issue with owner-readable context and validation criteria.
  - Confirm no implementation changes were mixed into the review runbook unless separately requested.
  - Confirm all recurring runbooks remain open.

- [ ] [M403R] (P1) Dependency and security audit
  Goal:
  Keep third-party dependencies, runtime versions, and security-sensitive configuration within the current supported contract.

  Requirements:
  - Cadence: run weekly for active apps and before each release cut.
  - Inspect package managers, lockfiles, language toolchains, container bases, and generated clients for known vulnerabilities or stale direct dependencies.
  - Review auth, secret, CORS, CSP, SQL, network, and service-authorization configuration for drift from the current contract.
  - Prefer current supported dependencies.
  - Do not add compatibility shims for obsolete dependency behavior.
  - File each actionable vulnerability, unsupported runtime, or security-contract gap under its outcome-based issue section.

  Deliverables:
  - Documented audit commands or data sources used for the pass.
  - Updated issues for each actionable dependency or security finding.
  - A short `Last run:` note with clean result or follow-up issue IDs.

  Validation:
  - Rerun the repository-native audit, lint, or dependency checks used for the pass.
  - Confirm every finding is either filed, fixed under a separate issue, or explicitly marked not applicable with evidence.
  - Confirm no secrets or private payloads were written into the tracker.

- [ ] [M404R] (P1) CI, release, and artifact health
  Goal:
  Keep the repository's validation, release, publication, and generated artifact surfaces trustworthy.

  Requirements:
  - Cadence: run before every release, publish, or deploy, and weekly for critical services.
  - Verify repository-native CI, lint, format, coverage, release, publish, Docker image, Pages, and artifact workflows still match the documented contract.
  - Do a check of generated artifacts, release tags, published images, and Pages outputs for source-to-public drift.
  - File concrete follow-up issues for failing gates, stale artifacts, missing release prerequisites, or undocumented workflow changes.
  - Do a production deployment only when the operator explicitly requests it.

  Deliverables:
  - Recorded gate status and artifact surfaces inspected.
  - Follow-up issues for each reproducible CI, release, publish, or artifact drift problem.
  - A short `Last run:` note with commands run and any skipped surfaces.

  Validation:
  - Use repository-native `make` targets or documented release helpers for checks.
  - Confirm release and deployment ownership boundaries remain separate.
  - Confirm public or published artifacts match the intended source revision when that surface is inspected.

- [ ] [M405R] (P1) Code contract and static hygiene
  Goal:
  Keep source contracts explicit, current, and statically guarded against policy drift.

  Requirements:
  - Cadence: run monthly and before large refactors.
  - Scan for dead code, unused exports, duplicated literals, silent fallbacks, legacy aliases, compatibility reads, and zero-but-invalid domain states.
  - Do a check of static analysis, coverage, schema, and contract guards that prevent drift.
  - File each concrete violation under its outcome-based issue section.
  - Keep only the current canonical contract.
  - Preserve obsolete behavior only when a current product requirement explicitly specifies it.

  Deliverables:
  - Issue entries for each actionable static hygiene or contract violation.
  - Notes on static tools, searches, and contract guards used during the pass.
  - A short `Last run:` note with clean result or follow-up issue IDs.

  Validation:
  - Rerun the relevant static checks, contract tests, or repository searches used to identify drift.
  - Confirm every finding has a narrow follow-up issue and does not duplicate existing backlog work.
  - Confirm no implementation changes were mixed into the audit unless separately requested.

- [ ] [M406R] (P1) Production drift and health
  Goal:
  Detect drift between runtime state and the intended repository contract.

  Requirements:
  - Cadence: run weekly for deployed services and after each publish or deploy.
  - Compare current source, runtime configuration, published images, public routes, scheduled jobs, and health checks for drift.
  - Inspect real operator-facing surfaces rather than assuming merged source is deployed.
  - File follow-up issues for stale images, stale Pages output, missing routes, failed monitors, invalid production config, or undocumented runtime differences.
  - Stop before production deploy or destructive operator actions unless the operator explicitly requests them.

  Deliverables:
  - Recorded source revision, public artifact, route, image, or health surfaces inspected.
  - Follow-up issues for each source-to-runtime drift finding.
  - A short `Last run:` note with evidence links or commands used.

  Validation:
  - Verify inspected production or public surfaces directly where access is available.
  - Confirm any deploy-required finding is filed with the exact publish/deploy boundary and owner.
  - Confirm no production state was changed by the audit unless explicitly requested.

- [ ] [M407R] (P2) Documentation and runbook hygiene
  Goal:
  Keep durable documentation and runbooks aligned with the current behavior users and operators actually rely on.

  Requirements:
  - Cadence: run before release cuts and after merge bursts that change user-facing or operator-facing behavior.
  - Review README, ARCHITECTURE, PRD, CHANGELOG, docs, runbooks, setup guides, and local workflow notes for stale behavior or missing new contracts.
  - Review changed English technical prose against `.mprlab/AGENTS.DOCS.md` and the official ASD-STE100 standard.
  - Add approved repository terms to `.mprlab/TERMINOLOGY.md`.
  - Update docs when closed issues changed durable behavior, public APIs, operator workflows, release semantics, or deployment expectations.
  - Remove or rewrite stale instructions instead of preserving obsolete alternatives.
  - File separate issues for documentation gaps that require product or implementation decisions.

  Deliverables:
  - Updated documentation or filed follow-up issues for each gap.
  - A short `Last run:` note listing docs inspected and changes made.
  - Cross-references from archived issue history to durable docs when useful.

  Validation:
  - Run the skill `prepare-ste-reference` script and use its verified official PDF.
  - Run the skill `check-ste` script on each English technical document that changed.
  - Review the changed text against Part 1 writing rules and the Part 2 dictionary.
  - Confirm that the producing agent completed the review without end-user work.
  - Do a check of links, command names, paths, and public contract descriptions changed by the pass.
  - Confirm docs describe the current canonical path only.
  - Confirm issue archive and active tracker references remain consistent.

## Features

- [-] [F001] (P1) Add private HLS music playback to the personal website
  Goal:
  Play complete songs on the website through an owner-operated media service with temporary cookie authorization.

  Status: The owner supplied the Music share. The SoundOn comparison and private package preparation are completed.
  A36 requires operator production execution and public acceptance.

  Requirements:
  - Implement [the implementation plan](../docs/private-hls-implementation.md), including its acceptance matrix and operator boundaries.
  - Use one canonical music catalog in `data/site.json`.
  - Authorize playlists, initialization files, and segments before each media response.
  - Keep original recordings and media packages outside public website artifacts.
  - Use native HLS and hls.js through the same current media contract.
  - Start with generated audio and integration-first evidence.
  - Use Playwright-managed headless browsers with muted audio for automated tests.
  - Keep desktop browsers outside the test workflow.
  - Provide a Linux container that runs the full CI suite.
  - Complete B001 before production readiness.

  Deliverables:
  - Provide the Go service, offline package commands, player, catalog migration, and accessible controls.
  - Provide focused Make targets, browser coverage, package validation, and the operations runbook.
  - Record local, publication, deployment, and live acceptance separately.
  - Record physical mobile testing as not feasible, with no pending acceptance action.

  Validation:
  - Complete milestones 0 through 5 and record acceptance results A01 through A36 from the implementation plan.
  - Preserve the expected failing integration results before production behavior changes.
  - Run the final repository CI after the last stack change.
  - Current evidence: [implementation validation](../docs/private-hls-validation.md) records the package, HTTP, and browser results.
  - The earlier Safari check is historical evidence only, and remote automation is off.
  - The current workflow excludes SafariDriver and physical devices.
  - Chromium, Firefox, and automated WebKit passed catalog, playback, recovery, and authorization checks.
  - `make music-ci-container` passed the full Linux CI suite with 106 browser checks and six intentional configuration-specific skips.
  - The 15-minute generated-audio load run completed all 100 listeners with zero errors and p95 grant latency of 34 milliseconds.
  - The Chromium hls.js check started playback in 459 milliseconds at 10 Mbps and 100 milliseconds of emulated latency.
  - These local results do not establish computercat capacity or production network behavior.
  - Repeated WebKit resume checks exposed an initial seek race. hls.js now owns its start position, and ten repeated checks passed.
  - Browser tests use muted audio and preserve real media decoding and playback progression.
  - The request log audit found an absent public track ID. The new HTTP integration case failed before the correction.
  - Structured request logs now include known track identity and exclude cookie, grant, asset, and private-path values.
  - Browser acceptance also verifies actual album navigation, footer contact, and the player's live-region attributes.
  - Final Linux CI passed after the acceptance audit, including 14 Go integration cases and 106 browser checks.
  - The offline activation command and pinned Linux container smoke test passed.
  - The [operations runbook](../docs/private-hls-operations.md) describes current local commands and production prerequisites.
  - The owner supplied the Music share. All 41 website tracks have local WAV candidates.
  - SoundOn lists six releases with 50 tracks. Four missing Volume II WAV files were exported from Suno.
  - All 50 mapped source WAV files pass full decode. All 41 website tracks use validated private HLS packages.
  - All 82 real-recording browser checks passed: 41 tracks through native HLS and 41 through hls.js.
  - A31 uses automated checks. The owner requires silent headless tests, with no manual listening gate.
  - Physical mobile acceptance is not feasible and is excluded from completion gates by the owner.

## Planning
