# Repository Mandates for AI Agents

These instructions are foundational and take precedence over default workflows.

## Mandatory Global Assets

Every HTML page created or modified in this repository MUST include the following tracking script at the top of the `<head>` tag:

```html
<script defer src="https://loopaware.mprlab.com/pixel.js?site_id=a7ea8b8a-ff37-4a99-81fa-09a5952f83a9&api_origin=https%3A%2F%2Floopaware-api.mprlab.com"></script>
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
