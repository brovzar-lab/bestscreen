# Bestscreen — Project Conventions

Bestscreen is a **local-first screenwriting power tool**. Vanilla JS / CSS / HTML — no framework, no build step. Each `<div>` in `#editor` is one screenplay line (`data-type` attribute = scene/action/character/dialogue/etc.). The Fountain plain-text format is the source of truth on disk; the DOM is the working representation. localStorage is the persistence layer.

> **Live status, current sprint, and what's next live in `HANDOFF.md`.** This file (CLAUDE.md) only covers what's *stable* about the project — architecture, file map, conventions, deploy targets. Update CLAUDE.md when the architecture or conventions change. Update HANDOFF.md every session.

---

## Project paths

- **Source:** `/Users/quantumcode/CODE/Bestscreen`
- **Live:** https://bestscreen.web.app
- **GitHub:** https://github.com/brovzar-lab/bestscreen (handle is `brovzar-lab`)
- **Firebase project:** `wr-ai-ters-room` — multi-site. Bestscreen is one of N sites in that project. **Always deploy to `site: "bestscreen"`**, never the project's default site (already configured in `firebase.json`).

## Run / deploy

```bash
npm run dev                                              # → http://localhost:5173
firebase deploy --only hosting                           # → live (bestscreen.web.app)
firebase hosting:channel:deploy <name> --expires 30d     # → preview channel
```

## Branches

- `main` — live
- `sprints` — integration / WIP. Merge to `main` when verified.
- Always work on `sprints` (or a `feature/*` branch) for new work; never commit directly to `main` without confirmation.

---

## File Map

| File | ~Lines | Purpose |
|---|---|---|
| `index.html` | ~680 | App shell — dashboard markup, editor markup, all modals, SVG icon sprites. Script load order matters (see below). |
| `styles.css` | ~2,150 | Design system, 3 themes (manuscript/midnight/court), all component styles, `@media print` for PDF. Responsive titlebar at ≤1280px and ≤980px. |
| `storage.js` | ~290 | Multi-project data layer over localStorage. Single index + per-project keys. Exposes `window.Storage`. |
| `templates.js` | ~130 | 5 story templates (Save the Cat, Hero's Journey, Three-Act, Story Circle, Five-Point TV). Exposes `window.Templates`. |
| `audio.js` | ~290 | Web-Audio synthesized ambience + per-scene soundtrack. Exposes `window.Audio`. |
| `ai.js` | ~110 | BYOK Anthropic/OpenAI with 7 prompt templates. Exposes `window.AI`. |
| `dashboard.js` | ~530 | Project picker, search, series management, import/export. Exposes `window.Dashboard`. |
| `bible.js` | ~510 | Character bibles, force-directed relationship graph, locations, world rules. Exposes `window.Bible`. |
| `editor.js` | ~700 | Editor engine: classification, keydown/input handlers, char-hover popover, dual dialogue, smart typography, autocomplete, typewriter mode, voice dictation. |
| `panels.js` | ~630 | Status bar, sidebar (scenes/cast/comments/threads), sentiment & pace overlays, comments (anchor/popover/markers), lightweight change log, inspector panel. |
| `views.js` | ~500 | Beat board, cards corkboard, stats dashboard (with SVG charts), story timeline. |
| `features.js` | ~700 | Find/replace, snapshots, scrap bin, sprint mode, read-aloud, command palette, logline workshop, coverage generator, sides export, continuity warnings, AI menu. |
| `io.js` | ~500 | Share link, Fountain serialize/parse (with `bs:` meta), watermarked PDF, change-log viewer, PDF-log viewer, file I/O (.fountain + .fdx). |
| `app.js` | ~740 | Core orchestration: state, constants, routing/boot, theme, save/dirty/autosave, daily streak, view switching, wire-editor-UI, global shortcuts, title page, inline modal helpers (`bsPrompt`/`bsConfirm`), utility (`escapeHtml`/`toast`), public API (`window.App`). |
| `dev-server.js` | ~104 | Zero-dependency Node http server. |
| `firebase.json` | small | Hosting config — `site: "bestscreen"`. Excludes dev-only files. |
| `.firebaserc` | tiny | `"default": "wr-ai-ters-room"`. |
| `sample.fountain` | tiny | Demo screenplay. |
| `picker.html` | ~600 | Standalone feature-picker from v3 planning. Static; safe to leave. |

**Excluded via `.gitignore`:** `node_modules/`, `*.log`, `v3-selections.json`, `.DS_Store`, `.firebase/`, `.playwright-mcp/`.

---

## Architecture Conventions

### Script load order (in `index.html`, at the bottom of `<body>`)

```
storage.js → templates.js → audio.js → ai.js → dashboard.js → bible.js
→ editor.js → panels.js → views.js → features.js → io.js → app.js
```

`app.js` loads **last** because its `window.App = { ... }` literal needs `loadProject` and `setView` (defined in app.js itself), but its method bodies reference functions across all other modules (resolved at call time, not parse time). Boot runs on `DOMContentLoaded`, so order across files doesn't matter for runtime — only for parse-time top-level references.

### Module exposure (script-scope globals)

All non-app modules expose themselves as window globals:

```js
window.Storage   = (() => { ... })();
window.Templates = { ... };
window.Audio     = (() => { ... })();
window.AI        = (() => { ... })();
window.Dashboard = (() => { ... })();
window.Bible     = (() => { ... })();
window.App       = { loadProject, getCastFromScript, getLocationsFromScript, setView };
```

The split editor/panels/views/features/io files do NOT have their own namespace — they share global scope with app.js. Functions hoist; top-level `let`/`const` are visible across files in script order.

### Editor source of truth

- Each top-level `<div>` in `#editor` is one screenplay line.
- `data-type` ∈ `scene | action | character | dialogue | parenthetical | transition | centered | note | section | synopsis`
- `data-forced="true"` means the user explicitly typed a type (don't auto-reclassify).
- Per-line metadata as `data-*` attrs: `color`, `tags`, `beat` (template beat ID), `thread` (comma-sep plot threads), `goal`, `mood`, `date`, `sound` (soundtrack URL), `rev` (revision color).
- Dual dialogue: wrap two character blocks in `<div class="dual-pair"><div>...</div><div>...</div></div>`.

### Fountain meta-comments

v3 stores Bestscreen-specific scene metadata inline in Fountain text as `/* bs:k=v;k=v */` comments. Serializer emits them; parser strips and re-applies them as `data-*` attrs. Keeps roundtrip lossless without breaking standard Fountain readers.

### Inline modal helpers (don't use native `prompt`/`confirm`)

```js
const name = await window.bsPrompt({ title, label, placeholder, defaultValue, okText, multiline });
const ok   = await window.bsConfirm({ title, body, okText, cancelText, danger });
```

These live in `app.js` and are exposed globally so `dashboard.js` and `bible.js` can use them (both have a `promptFallback` for defensive loading order).

### Storage layout (localStorage)

```
bestscreen.v3.index            { projects[], series[], settings, streak, pdfLog, lastOpenedId }
bestscreen.v3.p.<id>.doc       Fountain text (with bs: meta)
bestscreen.v3.p.<id>.meta      titleMeta, beatSections, template, logline, theme, premise, activeRevision, smartTypo, …
bestscreen.v3.p.<id>.bible     { characters[], locations[], rules[], relationships[] }
bestscreen.v3.p.<id>.snaps     [{ id, name, t, doc, words, pages }]
bestscreen.v3.p.<id>.comments  [{ id, lineKey, author, text, resolved, t }]
bestscreen.v3.p.<id>.changes   [{ t, type, lineIdx, value, author }]
bestscreen.v3.p.<id>.bin       [{ t, text }]
bestscreen.v3.p.<id>.pdfs      [{ t, name, watermark, version, sceneCount, pageCount }]
```

### Routing

Hash-based: `#/p/<projectId>` opens the editor; otherwise dashboard. `boot()` decides at load.

### Cache gotcha

Live deploys serve `*.css` and `*.js` with `Cache-Control: public, max-age=300`. After deploying, users need a hard refresh (`⌘⇧R` / `Ctrl+F5`) within 5 minutes or they'll see the cached version.

---

## Working Conventions (rules from the user)

These are also persisted as memories in `/Users/quantumcode/.claude/projects/-Users-quantumcode-CODE-Bestscreen/memory/`.

1. **Don't replace deployed sites.** Before deploying to any existing hosting target (Firebase / Vercel / GH Pages), check what's live and offer additive options (new site within same project, subdomain, sub-path). For Bestscreen: always deploy to `site: "bestscreen"`, never the project default.

2. **Default to no code comments.** Only add a comment when the WHY is non-obvious — a hidden constraint, subtle invariant, or workaround for a specific bug.

3. **Commit only when asked.** Don't auto-commit. When user explicitly asks: short title + descriptive body, `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`, HEREDOC for multi-line messages.

4. **Don't auto-deploy.** Confirm before pushing or deploying. A user approving one deploy isn't standing approval for all deploys.

5. **Deep features over many shallow ones.** Each sprint should ship deeply finished features, not stubs.

6. **Verify UI work visually.** Use Playwright (`mcp__plugin_playwright_playwright__*`) to confirm before claiming UI tasks complete — screenshots, console errors, real click flows.

7. **Don't trust autosave caching during testing.** When testing parser fixes, localStorage may hold a pre-fix parsed version. Re-inject raw input to test the parser.

8. **User identity.** GitHub handle `brovzar-lab`. Firebase login `billyrovzar@gmail.com`. Multiple screenwriting Firebase projects exist; only `wr-ai-ters-room` is bound here.

---

## Common Workflows

### Verify a change locally
```bash
npm run dev
# → open http://localhost:5173, use Playwright to exercise the change
```

### Promote sprints → main → live (only with confirmation)
```bash
git checkout main
git merge sprints --no-edit
git push origin main sprints
firebase deploy --only hosting
```

### Preview channel deploy
```bash
firebase hosting:channel:deploy <name> --expires 30d
# → https://bestscreen--<name>-<id>.web.app
```

### Compare local vs live
```bash
curl -s https://bestscreen.web.app/app.js | grep -c "<symbol from new code>"
```
