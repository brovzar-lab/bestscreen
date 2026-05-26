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
| `index.html` | ~700 | App shell — dashboard markup, editor markup, all modals, SVG icon sprites. Script load order matters (see below). Loads optional `config.local.js` first via `onerror="this.remove()"` so a 404 in production is harmless. |
| `styles.css` | ~2,500 | Design system, 3 themes (manuscript/midnight/court), all component styles, `@media print` for PDF. Responsive titlebar at ≤1280px and ≤980px. |
| `storage.js` | ~340 | Multi-project data layer over localStorage. Single index + per-project keys + per-series keys. Exposes `window.Storage`. |
| `templates.js` | ~130 | 5 story templates (Save the Cat, Hero's Journey, Three-Act, Story Circle, Five-Point TV). Exposes `window.Templates`. |
| `audio.js` | ~290 | Web-Audio synthesized ambience + per-scene soundtrack. Exposes `window.Audio`. |
| `ai.js` | ~150 | BYOK Anthropic/OpenAI with prompt templates **and** streaming. Reads keys from `window.BS_CONFIG.ai` first, then Settings UI. Exposes `window.AI` (`complete` / `stream` / `getCommands` / `isConfigured`). |
| `dashboard.js` | ~540 | Project picker, search, series management, import/export (incl. .fountain/.fdx to new project). Exposes `window.Dashboard`. |
| `bible.js` | ~900 | Characters / Relationships / Arcs (W/N/F/C per scene) / Locations / World rules. Series-shared bible support with promote/demote. Exposes `window.Bible`. |
| `editor.js` | ~700 | Editor engine: classification, keydown/input handlers, char-hover popover, dual dialogue, smart typography, autocomplete, typewriter mode, voice dictation. |
| `panels.js` | ~700 | Status bar, sidebar (scenes/cast/comments/threads), sentiment & pace overlays, **page-break visualization**, comments (hybrid-fingerprint anchor + popover + markers), lightweight change log, inspector panel. |
| `views.js` | ~700 | Beat board (with template ghost cards + beat-tag selector + multi-select), cards corkboard (with multi-select), stats dashboard (with SVG charts), story timeline. Shared `_selectedScenes` set drives bulk-AI actions. |
| `features.js` | ~1,400 | Find/replace, snapshots, scrap bin, sprint mode, read-aloud, command palette, logline workshop, coverage generator, sides export (with anonymize), continuity engine (Sprint 3 state-vocab), AI menu **and** all the AI affordances: `gatherProjectContext`, `aiInlineFill`, scene-synopsis fill, bulk synopsis fill, character-field fill, whole-character fill (auto + interview), arc fill, relationship fill, logline AI. |
| `io.js` | ~500 | Share link, Fountain serialize/parse (with `bs:` meta), watermarked PDF, change-log viewer, PDF-log viewer, file I/O (.fountain + .fdx). |
| `app.js` | ~830 | Core orchestration: state, constants, routing/boot, theme, save/dirty/autosave, daily streak, view switching, wire-editor-UI, global shortcuts, title page, sidebar resize handle, smart 3-way open-file flow, inline modal helpers (`bsPrompt`/`bsConfirm`), utility (`escapeHtml`/`toast`), public API (`window.App`). |
| `dev-server.js` | ~104 | Zero-dependency Node http server. |
| `.env.example` | small | Cheat-sheet documenting the keys; copy to `.env` and fill in. |
| `config.example.js` | small | Loadable JS template; copy to `config.local.js` (gitignored), fill in `apiKey`, page loads it as `window.BS_CONFIG`. |
| `firebase.json` | small | Hosting config — `site: "bestscreen"`. Excludes dev-only files. |
| `.firebaserc` | tiny | `"default": "wr-ai-ters-room"`. |
| `sample.fountain` | tiny | Demo screenplay. |
| `picker.html` | ~600 | Standalone feature-picker from v3 planning. Static; safe to leave. |

**Excluded via `.gitignore`:** `node_modules/`, `*.log`, `v3-selections.json`, `.DS_Store`, `.firebase/`, `.playwright-mcp/`, **`.env`**, **`config.local.js`**.

---

## Architecture Conventions

### Script load order (in `index.html`, at the bottom of `<body>`)

```
config.local.js?  →  storage.js → templates.js → audio.js → ai.js → dashboard.js → bible.js
                     → editor.js → panels.js → views.js → features.js → io.js → app.js
```

`config.local.js` is **optional and gitignored** — if present it sets `window.BS_CONFIG` for the AI module. The `<script>` tag uses `onerror="this.remove()"` so 404 (production) is harmless.

`app.js` loads **last** because its `window.App = { ... }` literal needs `loadProject` and `setView` (defined in app.js itself), but its method bodies reference functions across all other modules (resolved at call time, not parse time). Boot runs on `DOMContentLoaded`, so order across files doesn't matter for runtime — only for parse-time top-level references.

### Module exposure (script-scope globals)

All non-app modules expose themselves as window globals:

```js
window.Storage   = (() => { ... })();
window.Templates = { ... };
window.Audio     = (() => { ... })();
window.AI        = { getCommands, complete, stream, isConfigured };
window.Dashboard = (() => { ... })();
window.Bible     = { open, render, bind, syncCharactersFromScript, getCharacterByName,
                     bulkSetArcs, bulkAddRelationships, allCharacters, getSeriesId };
window.App       = { loadProject, getCastFromScript, getLocationsFromScript,
                     getScenesFromScript, setView };
window.BS_CONFIG = { ai: { provider, apiKey, model }, firebase: {...}, authorName };  // optional, from config.local.js
```

The split editor/panels/views/features/io files do NOT have their own namespace — they share global scope with app.js. Functions hoist; top-level `let`/`const` are visible across files in script order.

### Editor source of truth

- Each top-level `<div>` in `#editor` is one screenplay line.
- `data-type` ∈ `scene | action | character | dialogue | parenthetical | transition | centered | note | section | synopsis`
- `data-forced="true"` means the user explicitly typed a type (don't auto-reclassify).
- Per-line metadata as `data-*` attrs:
  - `color` — visual scene-card color tint (red/amber/green/blue/violet/gray). **Do NOT use `data-beat` for color** — they're separate as of Sprint 5.
  - `beat` — template beat id (e.g. `catalyst`, `midpoint`). Used by the fidelity engine; assigned via the per-card dropdown in Beat Board.
  - `tags`, `thread` (comma-sep plot threads), `goal`, `mood`, `date`, `sound` (soundtrack URL), `rev` (revision color).
  - `page-end="N"` — runtime marker added by `applyPageBreaks()` (Sprint 7) on lines that end a page. CSS renders an "END OF PAGE N" divider when `body[data-pagebreaks="true"]`.
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
                                 settings includes sidebarWidth (Sprint 7)
bestscreen.v3.p.<id>.doc       Fountain text (with bs: meta)
bestscreen.v3.p.<id>.meta      titleMeta, beatSections, template, logline, theme, premise,
                                activeRevision, smartTypo, showSceneNumbersInPdf, showPageBreaks
bestscreen.v3.p.<id>.bible     { characters[], locations[], rules[], relationships[] }
                                 characters carry arc: [{ sceneId, w, n, f, c }] (Sprint 2)
bestscreen.v3.p.<id>.snaps     [{ id, name, t, doc, words, pages }]
bestscreen.v3.p.<id>.comments  [{ id, lineKey, author, text, resolved, t, orphaned? }]
                                 lineKey = idx:thisHash:ctxHash (Sprint 2 hybrid fingerprint)
bestscreen.v3.p.<id>.changes   [{ t, type, lineIdx, value, author }]
bestscreen.v3.p.<id>.bin       [{ t, text }]
bestscreen.v3.p.<id>.pdfs      [{ t, name, watermark, version, sceneCount, pageCount }]
bestscreen.v3.s.<seriesId>.bible  { characters[], locations[], rules[], relationships[] }
                                   Optional — shared across all episodes that have project.seriesId
                                   set. Bible.allCharacters() merges series + episode views.
```

### Routing

Hash-based: `#/p/<projectId>` opens the editor; otherwise dashboard. `boot()` decides at load.

### Cache gotcha

Live deploys serve `*.css` and `*.js` with `Cache-Control: public, max-age=300`. After deploying, users need a hard refresh (`⌘⇧R` / `Ctrl+F5`) within 5 minutes or they'll see the cached version.

---

## AI integration pattern

Every AI affordance in the app routes through two helpers in `features.js`:

```js
const ctx = gatherProjectContext({ scriptChars: 30000 });
// → multi-section string with title / logline / theme / template / bible (episode + series merged)
//   / scene list with beat tags & synopses / full Fountain script (truncated)

const result = await aiInlineFill({
  anchor: someDomNode,                // overlay positions itself below this element
  label: "AI · field-name",           // shown in the ghost overlay header
  prompt: "…template with {CONTEXT}…", // your prompt; {CONTEXT} is interpolated
  vars: { CONTEXT: ctx },
});
// Promise resolves to the accepted text (string) or null if cancelled / errored.
```

**Always pass `gatherProjectContext()` as `CONTEXT`.** That's the foundation of "AI knows everything about the project". Each AI button differs only in its prompt + write-back target.

Streaming is via `AI.stream(promptTemplate, vars)` (async generator yielding text chunks). `aiInlineFill` already handles streaming + the accept/cancel UI; new buttons should use it instead of calling `AI.complete` directly.

For bulk operations (e.g. fill N synopses in one call): use sequence numbers `1..N` as JSON keys instead of real line indices — models hallucinate near-real positions. Sort writes in **reverse document order** when each write triggers `reclassifyAll()` so earlier insertions don't invalidate later targets.

---

## Local config (`.env` / `config.local.js`)

Bestscreen has no build step, so a true `.env` can't be read by the browser. We use a pair:

- `.env.example` — documentation cheat sheet, listing the keys the user should set.
- `config.example.js` — loadable JS template; user copies to `config.local.js` and edits.
- `config.local.js` — gitignored, sets `window.BS_CONFIG` at runtime.

`AI.resolveAI()` reads keys with this precedence:

1. `window.BS_CONFIG.ai` (from `config.local.js`)
2. Settings UI (per-browser localStorage, BYOK)

So local dev fills in `config.local.js` once and stops seeing the Settings prompt forever; production deploys (which don't ship `config.local.js`) fall back to BYOK as before.

Firebase keys are placeholders in `config.example.js` — currently unused at runtime (we use Hosting only; `firebase deploy` handles auth via `firebase login`).

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
