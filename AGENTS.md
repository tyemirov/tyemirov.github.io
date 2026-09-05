# Repository Mandates for AI Agents

## Forward-Only Contract Discipline

This repository follows a forward-only, confident programming paradigm. This is a binding agent contract: no fallbacks, no backward compatibility, no legacy support, and no compatibility shims. Do not spend design or implementation effort on backward compatibility considerations except for explicit one-off data migrations into the current canonical contract.

Repeat for emphasis because this rule is binding: no fallbacks, no backward compatibility, no legacy compatibility. Delete or reject obsolete code paths, stale schemas, deprecated config, and old persisted shapes instead of preserving them through compatibility layers, dual reads/writes, aliases, or best-effort recovery.

One-off data migrations are allowed only when they move existing persisted data into the current schema in a bounded operation. After migration, remove the bridge and keep only the current contract.

## Mandatory Global Assets

Every HTML page created or modified in this repository MUST include the following tracking script at the top of the `<head>` tag:

```html
<script defer src="https://loopaware.mprlab.com/pixel.js?site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b&api_origin=https%3A%2F%2Floopaware-api.mprlab.com"></script>
```

## UI/UX Standards

- **Project Cards:** Use the dynamic hydration system in `site.js` and `data/site.json`. Do not hardcode project cards in `index.html`.
- **Card Themes:** Available themes are `copper`, `teal`, `olive`, `slate`, `amber`, `indigo`, `violet`.
- **Footer:** Use the `mpr-footer` component from the `mpr-ui` library. Initialize it via script to include the "drop-up" menu from `globalThis.MPRUI.getFooterSiteCatalog()`.
- **Header:** Use the `mpr-header` component for internal project pages to maintain brand consistency.
- **Connectivity:** Every supporting web page (tools/prototypes) must include a prominent link back to its companion article on Substack.

## Typography & Branding

- **Non-breaking Spaces:** The brand "Morgan Stanley" MUST always use a non-breaking space (`&nbsp;` in HTML or `\u00A0` in JSON) to ensure the words never wrap.
- **Spelling:** Use American English standards (e.g., "Modeling" with one "l").
- **Kicker Lexicon:** Standardize on these labels: `AI`, `Modeling`, `Decisioning`, `Arts`, `Writings`.
- **Favicons:** Use the face-based PNG/ICO assets. Ensure any new project index files include the standard favicon links.

## Logic & Filtering

- **Global Filtering:** Any new section (like Writing or Arts) must support the global filtering logic in `site.js`. Clicking a kicker/source tag must trigger `window.toggleProjectFilter(tag)`.
- **Single Source of Truth:** `data/site.json` governs all content. Logic in `site.js` should handle the rendering of all sections (Projects, Writings, Arts).

## Content Management

- The single source of truth for site content is `data/site.json`.
- Articles/Essays that are part of a series should be elevated to a **Project Card** with a `parts` array in `site.json` to act as a hub.

<!-- BEGIN MPRLAB-GOVERNANCE -->
## MPR Lab Governance

Root `AGENTS.md` is the agent entrypoint. Shared rules live under `.mprlab/`.

Read `.mprlab/POLICY.md` for every task.
Read the following files only when their condition applies.
Read each selected guide in full before its first applicable action.

- Before edits: `.mprlab/PLANNING.md`.
- For technical prose: `.mprlab/AGENTS.DOCS.md` and `.mprlab/TERMINOLOGY.md`.
- For issue work: the selected issue and its dependencies in `.mprlab/ISSUES.md`.
- For tracker edits: `.mprlab/issues-md-format.md`.
- For Git operations: `.mprlab/AGENTS.GIT.md`.
- For Python changes: `.mprlab/AGENTS.PY.md`.
- For browser changes: `.mprlab/AGENTS.FRONTEND.md`.

File permission modes are outside agent scope.
Never examine, validate, compare, require, change, or record a file permission mode.
Never use a file permission mode in acceptance, security, credential, execution, publication, deployment, or failure analysis.
The values `0600` and `7777` have no governance meaning.
This rule does not change service authorization or operation authority.

Always reference each issue by its ID, for example `B001` or `I027`.
Never use an `ISSUES.md` file path, line number, or `path:line` syntax as an issue reference.

Do not create `.mprlab/AGENTS.md`. Scoped guidance belongs in `.mprlab/AGENTS.*.md` files.
If guidance conflicts, obey `.mprlab/POLICY.md` first, then root `AGENTS.md`, then the applicable scoped guide.
<!-- END MPRLAB-GOVERNANCE -->
