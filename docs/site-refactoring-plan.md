# Personal site refactoring plan

Status: local implementation complete. Public service repairs and live Google qualification remain open.
Audit date: September 11, 2026.

## Required outcome

The site presents work by Vadym Tyemirov.
MPR Lab makes software.
Personal models, decision frameworks, articles, music, and artwork belong under Vadym Tyemirov's name.
A model does not become an MPR Lab product because its implementation uses software.
Substack identifies a publication source, not the author or a subject.

This plan replaces the content ownership and navigation assumptions in the earlier website design.
The existing service, payment, publication, and authentication contracts remain the implementation baseline.
The user authorized correction and execution of this plan.

## Audit scope and method

The audit used the current checkout through `make up` at `http://localhost:8080`.
It covered all 28 generated public routes and the physical error page.
Each page was examined at widths of 1440 and 390 pixels.
The footer menu and the Freedom source disclosure were opened before their links were tested.
Keyboard activation was used for skip links.

| Coverage | Result |
| --- | --- |
| Page visits | 58 visits across 29 pages |
| Link occurrences | 1,120 across both widths |
| Successful link activations | 1,060, including 34 keyboard activations and 10 disclosed links |
| Failed pointer activations | Six: three error-page footer links at both widths |
| Hidden current-page links | Four occurrences, excluded from activation by design |
| Native email handoffs | 50 occurrences inspected. No mail application was opened |
| Unique HTTP destinations | 120: 46 local and 74 external |
| Successful destination requests | 108. All 46 local destinations passed |
| External destination failures | One HTTP 404, four transport failures, and seven HTTP 403 responses |
| Homepage filters | All ten controls, tested at both widths |
| Card filters | All 16 topic and source buttons on the initial homepage |
| Existing browser tests | Six passed through `make music-browser-test MUSIC_BROWSER_ARGS='site/ --project=chromium'` |

The [link ledger](site-link-audit-2026-09-11.json) records every occurrence, destination, filter result, and exception.
Screenshots and the audit scripts are in `output/site-audit/` in this checkout.

The audit activated anchors through the browser and recorded their navigation requests.
Document navigation received a controlled HTTP 204 response to keep each source page available for subsequent clicks.
Separate GET requests tested every unique destination without that interception.
Every canonical local page also received a direct browser visit.
External failures received a separate browser check.

These checks establish link activation and destination availability.
They do not establish complete external account, streaming, purchase, or email workflows.
HTTP 403 responses are access restrictions in this test environment, not proof that a URL is obsolete.
The audit did not change Google Cloud settings or complete a live owner login.

## Findings

| Priority | Finding | Evidence | Required change |
| --- | --- | --- | --- |
| P1 | Personal models have MPR Lab ownership labels | All four `projects` records use `source: "MPR Lab"` | Define ownership independently from format, subject, and publication source |
| P1 | Studio remains unavailable through live Google login | `/auth/nonce` returns 200. `/gsi/button` returns 403. The workspace remains hidden | Complete live provider qualification before claiming usable owner access |
| P2 | Modeling shows Tools and MPR Lab | `renderProjects()` always uses `.project-section`. `index.html` supplies its fixed title and promotion | Render personal models in their own section |
| P2 | Navigation mixes unrelated concepts | The same row contains Tools, Modeling, AI, Music, MPR Lab, and Substack | Separate page navigation, topic filters, and external destinations |
| P2 | Filters repeat equivalent views | Tools and MPR Lab show the same four models. Writings, AI, and Substack show the same four articles | Remove source filters and redundant choices |
| P2 | Filtered cards leave empty colored columns | `.home .project-list` always has four desktop columns | Size the grid for its visible cards and viewport |
| P2 | Project topic buttons lose keyboard focus | All four project topic clicks leave focus on `BODY` | Preserve focus through one shared filter control implementation |
| P2 | Filter state disappears on reload | Modeling leaves the URL unchanged. Reload selects All | Store the selected topic in the URL and support browser history |
| P2 | Music filtering retains the overview limit | The selected Music view shows three of the six live albums | Use the complete section page for section navigation |
| P2 | Model naming differs between card and page | Timeline opens `/timeseries/`, titled Decision Lens Prototype | Select one accurate title and description for the existing model |
| P2 | Two model pages overflow on phones | `/freedom/` reaches 626 pixels and `/timeseries/` reaches 415 pixels at a 390-pixel viewport | Repair the model layouts and verify their interactive states |
| P2 | Error-page footer links cannot be clicked | MPR Lab, Gravity Notes, and LoopAware fail at both widths | Keep the complete footer menu inside the viewport |
| P2 | External links need repair or qualification | The destination table below records 12 failures | Repair confirmed defects and keep restricted results distinct |
| P3 | Labels and actions add clutter | Writing, Writings, Essays, and Articles name the same area. Title and URL actions repeat | Use one section name and one clear primary card action |

The first footer link starts above the viewport on the error page.
Its measured vertical coordinate is -19 pixels on desktop and approximately -34 pixels on the phone.
The missing pointer access is a layout defect. The destination itself is available.

### External destination exceptions

| Destination | Location | Observed result | Plan |
| --- | --- | --- | --- |
| `rsvp.mprlab.com` | Shared footer | TLS protocol failure | Repair the service or its canonical entry in the shared footer catalog |
| `llm-crossword.mprlab.com` | Shared footer | TLS protocol failure | Repair the service or its canonical entry in the shared footer catalog |
| `archive.org/details/collectedworkso900cgju` | The Wittgenstein Mirror, Aion reference | HTTP 404 in GET and browser checks | Replace with a verified reference for the same work |
| `www.projectwhitehorse.com/pdfs/boyd/patterns%20of%20conflict.pdf` | The Wittgenstein Mirror, Patterns of Conflict | Certificate errors | Use a verified source for the same document |
| `scaife.perseus.org/reader/urn:cts:greekLit:tlg0059.tlg012.perseus-eng2:227-279/` | The Wittgenstein Mirror, Phaedrus | Connection reset | Verify the canonical edition and reader URL |
| `www.mercatus.org/publications/urban-economics/freedom-50-states` | Freedom source disclosure | HTTP 403, access blocked | Qualify the source in an allowed browser session |
| `journals.sagepub.com/doi/10.1111/poms.13086` | Codex Fast article | HTTP 403, browser challenge | Preserve the citation until its canonical URL is verified |
| `pubsonline.informs.org/doi/10.1287/opre.2013.1165` | Codex Fast article | HTTP 403, browser challenge | Preserve the citation until its canonical URL is verified |
| `pubsonline.informs.org/doi/10.1287/mnsc.18.5.319` | Codex Fast article | HTTP 403, browser challenge | Preserve the citation until its canonical URL is verified |
| `dl.acm.org/doi/10.1145/3442188.3445922` | The Wittgenstein Mirror | HTTP 403, browser challenge | Preserve the citation until its canonical URL is verified |
| `www.oreilly.com/library/view/generative-deep-learning/9781098134174/` | The Wittgenstein Mirror | HTTP 403, access denied | Preserve the citation until its canonical URL is verified |
| `openai.com/index/instruction-following/` | The Wittgenstein Mirror | HTTP 403 | Preserve the citation until its canonical URL is verified |

## Content and navigation design

### Personal ownership

| Current item | Proposed owner | Section | Subject |
| --- | --- | --- | --- |
| Minimum Sustainable Modern Civilization | Vadym Tyemirov | Models | Modeling |
| Decision Planes | Vadym Tyemirov | Models | Decisioning |
| The Vector of Liberty | Vadym Tyemirov | Models | Modeling |
| Time Series and Thresholds | Vadym Tyemirov | Models | Modeling |
| Four local articles | Vadym Tyemirov | Articles | Existing article subjects |
| Six albums | Vadym Tyemirov | Music | Music |
| Artwork, collections, and exhibits | Vadym Tyemirov | Gallery | Arts |
| MPR Lab | Software organization | Separate external destination | Software |

The current personal catalog contains no separate MPR Lab software product records.
The first implementation needs one external software link, not a new product collection with invented entries.

1. Keep `data/site.json` as the content source.
2. Define personal ownership at the catalog root and on each project record.
3. Use `vadym-tyemirov` for personal content and `mpr-lab` for the separate software destination.
4. Keep content kind separate from its subject and owner.
5. Replace the generic project kind `tool` with the intended personal kind `model`.
6. Permit MPR Lab ownership only on the separate `software` destination with `kind: "software"`.
7. Keep `kicker` as the canonical subject field and retain the approved subject vocabulary.
8. Keep article `source` for original publication attribution.
9. Remove the project `source` label that currently substitutes for ownership.
10. Retain model companion URLs and original Substack links.
11. Replace the top-level `mprlab` presentation block with personal model presentation data and a separate software destination.
12. Regenerate types and validators after the schema change.
13. Reject obsolete shapes. Do not add aliases or dual reads.

The required root `owner` is `vadym-tyemirov`.
Articles, albums, artwork, collections, and exhibits inherit this owner.
Their closed schemas reject independent ownership fields.
Personal model and series records also require this owner explicitly.
The separate `software` object identifies MPR Lab and its external destination.
No individual MPR Lab product inventory is defined.

Gallery drafts persist only Gallery content and master references.
Publication replaces the Gallery field in the complete source catalog and preserves its root ownership.
This refactor does not change the persisted Gallery shape.
No persisted data migration is required.
Historical purchase snapshots retain their existing contracts.

### Page navigation

The section names are **Models**, **Articles**, **Music**, and **Gallery**.
These labels identify destinations, not filters.
MPR Lab appears separately as **Software by MPR Lab** with an external-link indication.
Substack appears as a publication destination or an article source link.

| Page | Primary content | Header hierarchy |
| --- | --- | --- |
| `/` | Compact personal profile and selected work | No link to the current homepage |
| `/models/` | Complete personal model catalog | `[^]` |
| `/civilization/`, `/decisioning/`, `/freedom/`, `/timeseries/` | One personal model | `[^][Models]` |
| `/articles/` | Complete article catalog | `[^]` |
| `/articles/{slug}/` | Full article and source link | `[^][Articles]` |
| `/music/` | All six current albums | `[^]` |
| `/music/{slug}/` | Cover, tracks, player, and notes | `[^][Music]` |
| `/gallery/` | Collections and exhibits | `[^]` |
| Gallery detail, basket, and Studio pages | Selected gallery function | `[^][Gallery]` |

Keep the existing model URLs.
The route manifest supplies explicit parents for these routes. String prefixes cannot identify their Models parent.
Keep current pages out of header navigation.
Use one page heading and omit any repeated section kicker in a selected view.

### Topic filters

1. Make section controls ordinary links to their complete catalog pages.
2. Remove MPR Lab and Substack from the global filter vocabulary.
3. Keep topic tags connected to `window.toggleProjectFilter(tag)` through one shared implementation.
4. Resolve each tag against the canonical subject definitions.
5. Store the active topic in a URL query parameter.
6. Restore the same results on direct entry, reload, Back, and Forward.
7. Show a clear active topic and an All control when a topic is selected.
8. Show Modeling content under Modeling, without Tools or MPR Lab section labels.
9. Hide redundant subject chips when the view already identifies that subject.
10. Keep focus on the selected control or its visible equivalent after rendering.
11. Show an explicit empty result when no item matches.

The All homepage can show a bounded selection from each personal section.
Section pages and selected result views must not silently retain overview limits.

### Visual simplification

1. Keep the existing personal portrait and restrained color palette.
2. Shorten the homepage introduction and remove repeated professional claims from adjacent sections.
3. Remove the MPR Lab promotional heading, paragraph, and button from personal model results.
4. Give each section one name, one heading, and one clear destination.
5. Use a card title as the primary text link. Omit the repeated raw URL action.
6. Keep a model's companion article link distinct from its model action.
7. Use responsive card columns that contract to the visible item count.
8. Do not leave unused colored cells after filtering.
9. Keep album covers clickable and retain accessible streaming service icons.
10. Preserve image detail and a clear browsing path on Gallery pages.
11. Keep `mpr-header`, `mpr-footer`, the shared footer catalog, and the required global assets.
12. Label the footer credit as website software credit, separate from content authorship.
13. Keep the footer menu within the viewport on both short and long pages.

## Implementation sequence

| Step | Work | Owning files | Completion evidence |
| --- | --- | --- | --- |
| 1 | Add public regressions for ownership, Modeling results, focus, and short-page footer access | `tests/site/`, applicable model tests | Expected failures against the current site |
| 2 | Define ownership, subject, and content kind. Correct all four personal model records | `contracts/site.schema.json`, `data/site.json`, `assets/js/catalog.js` | Contract tests reject invalid MPR Lab ownership and obsolete shapes |
| 3 | Replace fixed MPR Lab rendering with shared personal content selection | `site.js`, shared content selectors, `articles/articles.js` | Correct cards, counts, headings, and filter focus |
| 4 | Add the Models index and explicit route parents | `scripts/site/build.mjs`, generated routes, templates | Every model has a working Home and Models path |
| 5 | Consolidate navigation and repair layout defects | `index.html`, `styles.css`, model styles, footer layout | Desktop and phone screenshots. No empty columns or horizontal overflow |
| 6 | Align model names and repair source links | `data/site.json`, model page metadata | Card and destination agreement. Verified replacement references |
| 7 | Repair shared footer destinations at their owner | Published `mpr-ui` catalog or the affected MPR Lab service | Working public destinations. No application-local catalog copy |
| 8 | Complete live Studio qualification | TAuth/Google configuration and shared authentication surface | Real owner login, workspace access, reload, and logout |
| 9 | Run final validation and update the design record | Repository-native checks and this audit ledger | Accepted results with no hidden skips or unresolved required paths |

Step 8 can proceed independently of the personal content work.
Use the existing TAuth and `mpr-ui` integration. Do not add an application-owned authentication path.
The prior controlled-provider result does not satisfy the live login criterion.

## Acceptance criteria

1. Attribute all personal models, articles, albums, and artwork to Vadym Tyemirov.
2. Show MPR Lab ownership only on explicit software products.
3. Make Modeling show exactly the intended personal models and one accurate view heading.
4. Remove Tools, MPR Lab, and Substack as misleading personal content filters.
5. Make all six live albums reachable from the complete Music index.
6. Match model card titles and descriptions to the destination content.
7. Retain local full articles and their visible original source links.
8. Preserve the requested Home and parent navigation without current-page links.
9. Preserve selected topics and keyboard focus through navigation and rendering.
10. Prevent horizontal overflow at 390, 768, and 1440 pixels.
11. Keep every footer menu link visible and operable on the error page.
12. Make every local link resolve to its intended page, file, or fragment.
13. Repair the confirmed external 404 and transport defects at their owning source.
14. Record restricted external destinations separately until they can receive live qualification.
15. Complete real owner login before describing Gallery administration as available.
16. Preserve checkout and publication authorization throughout the presentation changes.

Run focused browser tests while each public behavior changes.
Run `make site-contract-test`, `make pages-build`, and the relevant browser targets at their required checkpoints.
After the final implementation change, run `make ci` once.
Run `make local-test` separately when local authentication or service configuration changes.
Repeat the link audit against the generated artifact and the deployed site when publication is separately authorized.

## Selected decisions

- **Labels:** Models, Articles, Music, and Gallery are the default labels for the refactor.
- **Model title:** Use Time Series and Thresholds as the title for the current Timeline / Decision Lens Prototype model.
- **Software catalog:** Add individual MPR Lab products only when an explicit product inventory is supplied or verified.
- **External references:** Verify replacements against the cited work. Do not replace a failed citation with an unrelated available page.

The personal ownership boundary is confirmed by the user and is not an open decision.

## Execution evidence

The contract regressions failed before implementation because ownership, the Models index, and explicit parents were absent.
The initial browser regressions also failed on Models navigation and parent links.

After implementation, all 12 site contract tests passed.
All 31 focused Chromium tests passed.
A subsequent focused run passed four tests, including interactive model states and complete selected article results.
The browser coverage includes direct entry, reload, Back, Forward, keyboard focus, and widths of 390, 768, and 1440 pixels.
The local stack started successfully through `make up` at `http://localhost:8080`.

The canonical catalog now contains personal ownership, Models presentation, and a separate software destination.
The generated Models index links all four personal models.
The Music index retains all six albums and 50 track titles.

Topic state uses the `topic` query parameter and the canonical kicker vocabulary.
Selected views remove repeated subject chips and overview limits.
The shared footer credit reads “Website software by MPR Lab.”
The model grids and the error-page footer passed the responsive browser checks.

### Repaired references

| Work | Verified destination | Evidence |
| --- | --- | --- |
| Aion | [IAAP collected works reference](https://iaap.org/resources/academic-resources/collected-works-abstracts/volume-9-2-aion-researches-phenomenology-self/) | HTTP 200. Identifies Volume 9, Part 2 and its contents |
| Patterns of Conflict | [Air University Press edition](https://www.airuniversity.af.edu/Portals/10/AUPress/Books/B_0151_Boyd_Discourse_Winning_Losing.pdf) | HTTP 200 PDF. Contains Boyd's original briefing in the collected edition |
| Phaedrus | [Perseus text](https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.01.0174%3Atext%3DPhaedrus) | HTTP 200. Contains the Fowler translation at section 227a |

The article text retains its cited works and original publication links.
The seven restricted destinations retain their existing citations.

### Remaining external gates

The shared footer still obtains its catalog from published `mpr-ui@latest`.
The RSVP manifest declares `rsvp.mprlab.com` as its current production hostname.
The shared catalog also declares `llm-crossword.mprlab.com`.
Their TLS failures require repair of the owning public services or an owner-confirmed replacement destination.
A temporary service failure does not establish that either product is retired.
No application-local catalog copy or replacement URL was introduced.

Live Google qualification remains open.
The supported control of the signed-in browser fails with `sky requires node_repl; configure NODE_REPL_TRUSTED_SERVICES`.
This prevents inspection or correction of the Google Cloud OAuth client in that browser.
The prior controlled TAuth login result does not establish live owner access.
No production publication or service deployment occurred.

### Audit after implementation

The [new link ledger](site-link-audit-after-refactor-2026-09-11.json) contains the complete results after the refactor.

| Coverage | Result |
| --- | --- |
| Page visits | 90 visits across 30 pages at three widths |
| Link occurrences | 1,731 |
| Successful activation | 1,650, including 54 keyboard links and 15 disclosed links |
| Failed activation | Zero after keyboard and disclosure checks |
| Native email handoffs | 75 inspected without opening a mail application |
| Hidden current-page links | Six occurrences, excluded by design |
| Local HTTP destinations | All 47 passed |
| External HTTP destinations | 73 examined. Open Library passed the final GET and browser checks |
| Remaining external exceptions | Two TLS failures and seven access restrictions |
| Topic controls | All six controls at three widths |
| Horizontal overflow | Zero pages |
| Browser JavaScript exceptions | Zero pages |

The new live Studio check returned HTTP 200 from `/auth/nonce` and HTTP 403 from `/gsi/button`.
Google reported: “The given origin is not allowed for the given client ID.”
The owner workspace remained hidden.
This result remains distinct from the passing controlled authentication tests.

The final review reproduced focus loss during browser history navigation.
The shared topic controller now focuses the restored topic after Back and Forward.
The focused browser regression passed after this correction.
The first CI run was stopped before completion to include this correction in a new final run.

### Final validation

`make ci` passed after the final implementation correction.
The browser suite reported 543 passed tests and 21 existing skips across Chromium, Chromium HLS, Firefox, and WebKit.
These skips select the browser run that owns HTTP contract, HLS transport, timing, or history-cache qualification.
Each selected check passed in its assigned run.
The new refactoring tests passed in all four runs without skips.

Site contract generation, static artifact construction, lifecycle planning, music checks, and Gallery API checks passed.
The document language checks and `git diff --check` also passed.
No local service or authentication configuration changed, so the separate `make local-test` gate did not apply.
The rebuilt local site remains available at `http://localhost:8080`.

The final CI log is `output/playwright/site-refactor/ci-final.log`.
The audit scripts and screenshots are in `output/site-refactor-audit/`.
The temporary execution plan remains open for the public service repairs and live Google qualification.
