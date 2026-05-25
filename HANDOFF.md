# Bestscreen — Session Handoff

> **For the next Claude session.** This file is the complete context you need to pick up where the prior session left off.

---

## TL;DR — Quick Start

Bestscreen is a **local-first screenwriting power tool**. Vanilla JS / CSS / HTML — no framework, no build step. Each `<div>` in `#editor` is one screenplay line (`data-type` attribute = scene/action/character/dialogue/etc.). The Fountain plain-text format is the source of truth on disk; the DOM is the working representation.

**Project paths:**
- Source: `/Users/quantumcode/CODE/Bestscreen`
- Live: **https://bestscreen.web.app**
- GitHub: **https://github.com/brovzar-lab/bestscreen** (`brovzar-lab` is the user's GH handle)
- Firebase project: `wr-ai-ters-room` (multi-site — Bestscreen is one of N sites in that project; never deploy to the project's primary site again)

**Run / deploy:**
```bash
npm run dev                                              # → http://localhost:5173
firebase deploy --only hosting                           # → live (bestscreen.web.app)
firebase hosting:channel:deploy <name> --expires 30d     # → preview (bestscreen--<name>-<id>.web.app)
```

**Branch state at handoff:** `main` and `sprints` both at commit `956533c` (synced, fully deployed to live).

---

## File Map

| File | Lines | Purpose |
|---|---|---|
| `index.html` | ~675 | App shell — dashboard markup, editor markup, all modals, SVG icon sprites. `<script>` order matters: storage → templates → audio → ai → dashboard → bible → app |
| `styles.css` | ~2,150 | Design system, 3 themes (manuscript/midnight/court), all component styles, `@media print` for PDF. Responsive titlebar at ≤1280px and ≤980px |
| `app.js` | ~3,500 | Editor engine, classification, views, sidebar/inspector, all editor features |
| `storage.js` | ~290 | Multi-project data layer over localStorage. Single index + per-project keys. Exposes `window.Storage` |
| `templates.js` | ~130 | 5 story templates (Save the Cat, Hero's Journey, Three-Act, Story Circle, Five-Point TV). Exposes `window.Templates` |
| `dashboard.js` | ~530 | Project picker, search, series management, import/export. Exposes `window.Dashboard` |
| `bible.js` | ~510 | Character bibles, force-directed relationship graph (draggable nodes), locations, world rules. Exposes `window.Bible` |
| `audio.js` | ~290 | Web-Audio synthesized ambience (rain/fireplace/cafe/vinyl/brown) + per-scene soundtrack `<audio>`. Exposes `window.Audio` |
| `ai.js` | ~110 | Bring-your-own-key Anthropic/OpenAI integration with 7 prompt templates. Exposes `window.AI` |
| `dev-server.js` | ~104 | Zero-dependency Node http server (also handles `POST /api/selections` for `picker.html`) |
| `picker.html` | ~600 | Standalone feature-picker UI used at v3 planning time. Static; safe to leave in repo |
| `firebase.json` | small | Hosting config — `site: "bestscreen"` (NOT the project's default site), excludes dev-only files |
| `.firebaserc` | tiny | `"default": "wr-ai-ters-room"` |
| `sample.fountain` | tiny | Example screenplay used as importable demo |

**Excluded via `.gitignore`:** `node_modules/`, `*.log`, `v3-selections.json`, `.DS_Store`, `.firebase/`, `.playwright-mcp/`.

---

## Architecture Conventions (read before touching code)

### Module exposure
All non-app modules expose themselves as window globals:
```js
window.Storage = (() => { ... })();
window.Templates = { ... };
window.Audio = (() => { ... })();
window.AI = (() => { ... })();
window.Dashboard = (() => { ... })();
window.Bible = (() => { ... })();
window.App = { loadProject, getCastFromScript, getLocationsFromScript, setView };  // app.js exposes too
```
Load order in `index.html`: `storage → templates → audio → ai → dashboard → bible → app`. Anything that calls another module must be loaded after it.

### Editor source of truth
- Each top-level `<div>` in `#editor` is one screenplay line.
- `data-type` ∈ `scene | action | character | dialogue | parenthetical | transition | centered | note | section | synopsis`
- `data-forced="true"` means the user explicitly typed a type (don't auto-reclassify).
- Extra per-line metadata as `data-*` attrs: `color`, `tags`, `beat` (template beat ID), `thread` (comma-sep plot threads), `goal`, `mood`, `date`, `sound` (soundtrack URL), `rev` (revision color).
- Dual dialogue: wrap two character blocks in `<div class="dual-pair"><div>...</div><div>...</div></div>`.

### Fountain meta-comments
v3 stores Bestscreen-specific scene metadata inline in the Fountain text as `/* bs:k=v;k=v */` comments. Serializer emits them; parser strips and re-applies them as `data-*` attrs. This keeps roundtrip lossless without breaking standard Fountain readers.

### Inline modal helpers (don't use native `prompt`/`confirm`)
```js
const name = await window.bsPrompt({ title, label, placeholder, defaultValue, okText, multiline });
const ok   = await window.bsConfirm({ title, body, okText, cancelText, danger });
```
These are styled to match the rest of the UI. They live in `app.js` and are exposed globally so `dashboard.js` and `bible.js` can use them too (both have a `promptFallback` for defensive loading order).

### Storage layout
```
bestscreen.v3.index            { projects[], series[], settings, streak, pdfLog, lastOpenedId }
bestscreen.v3.p.<id>.doc       Fountain text (with bs:… meta)
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

## What's Currently Built (delivered status)

### v3 baseline + Sprint 1 + Polish = currently live

**Solid implementations:**
- Project Dashboard (create / import / search / pin / series / settings / streak heatmap)
- Multi-project storage with autosave per project
- 5 story templates (Save the Cat / Hero's Journey / Three-Act / Story Circle / Five-Point TV)
- Beat Board with ghost cards from template + drag-rearrange
- Cards (index-card corkboard) view
- Bible view (Characters / Relationships / Locations / Rules tabs)
- Character bibles with full form fields, auto-sync from script cast
- Force-directed relationship graph **with drag-to-pin** + double-click to release
- Story Timeline with smart date parsing (`Date.parse()` → fallback to string sort)
- Stats view: 8 KPI cards + **plot-thread timeline ribbon** + scene-length pace bars + sentiment arc + character presence matrix + cast bars + location bars + beat-template fidelity (falls back to template's canonical pages when script <20pp)
- Inspector with scene goal, plot threads, mood, beat tag, scene color, tags, in-story date, soundtrack URL, character chips, prop chips, revision picker
- Revision color rainbow (industry-standard 9 colors)
- Logline workshop with 6-criterion scoring meter
- Snapshots with diff against any other snapshot
- Inline comments (`⌘;` to post; popover anchored to line; sidebar list)
- Sprint mode (fullscreen, word goal, timer, WPM)
- Scrap bin (drag selected text onto bin button)
- Read-aloud table read (Web Speech API, per-character voice, plays scene soundtrack)
- Find/Replace with element-scope filter
- Smart typography (`--` → `—`, `...` → `…`, smart quotes)
- **Dual dialogue** (⌘D toggle; Fountain `^` serialization roundtrip-safe)
- **Character hover popover** showing bible card (want/need/flaw/traits) — works on character cues AND on ALL-CAPS mentions in action lines
- Sides export (pick scenes → fountain)
- Coverage generator (AI-enhanced when key set, local heuristic otherwise)
- Continuity warnings (heuristic — needs L2 rewrite)
- Public share link → self-contained read-only HTML, optionally with reader-side annotations
- Watermarked PDF + versioned PDF log (drawer viewer)
- Track Changes log (drawer viewer, CSV export)
- Three themes (Manuscript / Midnight / Court)
- Command palette (⌘K) indexing scenes + characters + commands
- Open / Save with .fountain + .fdx (FDX converter pulls TitlePage block too)
- **Voice dictation** with command parsing: "new scene", "interior X day", "new character ELLA", "parenthetical X", "transition cut to", "section X", "new line", "delete that"
- Ambient sound (multi-layered Web Audio: rain has droplets+thunder; fireplace has crackles+sizzle; cafe has murmur+clinks+espresso; vinyl has rotational click+pops; brown noise)
- Soundtrack URL validator (✓ direct audio / ⚠ CORS-blocked streaming service / probe via hidden `<audio>`)
- Stat tooltips (hover any pill in status bar for formula explanation)
- AI assist (BYOK Anthropic/OpenAI, applies to selection or whole line)

**Shallow / partial — flagged but not yet deepened:**
- Series Bible (each episode has its own bible — no inheritance from a series-level bible yet) — Sprint 3 / L1
- Continuity warnings (naive substring heuristic; false positives) — Sprint 3 / L2
- Comment anchoring (line text hash; comments orphan if line text changes) — Sprint 2 / L3
- Per-character arc tracker — only single `data-beat` per scene; no Want/Need/Flaw/Change grid per character — Sprint 2 / M2
- Track Changes — log written, viewer drawer added, but no per-author redlines or accept/reject UI
- AI streaming — request/response is fetch-based; no partial render
- Track-changes viewer drawer styling could use density

---

## Sprint Plan (what to do next)

The user selected 30 features back in v3 planning (`v3-selections.json` in repo). All are implemented at *some* depth; the remaining sprints deepen the ones that are still shallow.

### 🛠 Sprint 2 (next up) — Rewriting power tools, ~3 hours

**M2 — Per-character arc tracker**
- New panel inside the Bible view (5th tab: "Arcs", or expand the Relationships tab)
- For each character × each scene: 4 toggle cells (Want / Need / Flaw / Change). Click to mark.
- Store on `bible.characters[].arc = [{ sceneId, want: bool, need: bool, flaw: bool, change: bool }]`
- Use `data-line` index as `sceneId` (matches how scenes are indexed elsewhere)
- Visual gap analysis below the grid: "MARCUS's NEED beat doesn't appear in scenes 8–14" (compute runs of consecutive scenes with no marks for a character)
- Compact display: grid columns = scenes, rows grouped by character (3 sub-rows per character: W/N/F)
- Estimated effort: ~150 lines JS, ~40 lines CSS

**L3 — Comment anchor stabilization** (~150 lines)
- Current: `lineKey = lineIdx + ":" + textHash(line)`. If the line's text changes, the comment orphans (silently drops from view).
- Fix: change anchor to a **trailing-context fingerprint**: `hash(prevLineText + thisLineText + nextLineText)`.
- On editor input, if a comment's anchor no longer matches its expected line, search ±10 lines for a matching fingerprint and re-anchor.
- If no match found, mark comment as `orphaned: true` and render with a yellow ⚠ in the sidebar — user can manually re-anchor or delete.
- Files: `app.js` (rewrite `makeLineKey`, `getLineByKey`, `applyCommentMarkers`; add `reanchorComments()` called from `reclassifyAll()` debounced)

### 🏗 Sprint 3 — Structural depth, ~4 hours

**L1 — Shared bible across series episodes** (~250 lines)
- Storage migration: add `seriesBibles` keyed by `seriesId`. Existing per-project bibles stay; new "merged" view = `series ∪ episode (episode overrides)`.
- `Bible.open(pid)`: if `project.seriesId` exists, load merged bible. Character cards get a small badge "Series" vs "Episode" so user knows where it lives.
- New "Promote to series" button on each character/location card.
- Conflict resolver: when a character with the same name exists in both, prompt: "MARCUS exists in series bible — override locally, or pull series version?"
- Files: `storage.js` (new `getSeriesBible/setSeriesBible`), `bible.js` (merge logic, badges), `dashboard.js` (series cards show "X shared characters")

**L2 — Entity-tracking continuity engine** (~400 lines, biggest investment)
- Replace the naive "look for 'killed' + name later" heuristic with a real state model.
- Pre-built state vocabularies for: `injured`, `dead`, `pregnant`, `sober`, `drunk`, `employed`, `married`, `single`, `arrested`, `free`, `hospitalized`, `pregnant`.
- For each scene, parse for state-change verbs targeting known characters: `"Marcus is stabbed"` → `marcus.state = "injured"` at scene N.
- Track relationships too: `"Marcus marries Ella"` → set marriage state.
- Comparator: walk scenes in order, maintain state per character; flag inconsistencies (e.g., character died at scene 12, speaks at scene 20 with no resurrection trigger).
- Result UI: replace current `openContinuity()` modal with a categorized list (Death/Injury/Relationship/Other) with per-issue jump-to-scene buttons.
- Files: `app.js` (new `ContinuityEngine` module ~300 lines, replace `runContinuityCheck` and `quickContinuityCount`)

### Sprint 4+ — leftover polish & smaller deepening

- **AI streaming** (~200 lines) — SSE for Anthropic, OpenAI streaming. Show partial output flowing in a ghost overlay; click to accept.
- **Per-author Track Changes redlines** (~200 lines) — currently logs changes but doesn't display them inline as colored diffs in the script.
- **`@CharacterName` linking ENRICHMENT** — hover popover exists; add inline `@name` syntax detection in dialogue/action; clicking jumps to bible.
- **Real audio loops** — current Web Audio synthesis is good but not as good as real loops. Consider embedding small base64 mp3/ogg loops for the truly "natural" sound. Trade-off: file size.
- **Soundtrack URL probe accuracy** — current probe uses hidden `<audio>` which doesn't always fire `canplay` for cross-origin URLs. Consider showing a more nuanced "probably works" state.
- **Slideshow read mode** (#29 from the picker) — auto-advance scene by scene full-screen for cinematic reading. Currently not implemented.

### Features the user originally picked that are still IMPLEMENTED-BUT-SHALLOW (worth a polish pass)

These are in the live app at minimum-viable depth:
- #28 Coverage generator — works with AI, has local fallback. Could format as a real document with sections.
- #46 Watermarked PDF — works. Could let user save a watermark template per project (instead of typing each time).
- #25 Sides — works. Could add an option to anonymize other characters' lines.
- #36 Cinematic mood — page tint per mood works. Could extend to affect Read-Aloud voice tone via pitch/rate.
- #34 Soundtrack — per-scene URL works. Could add a small audio waveform preview.
- #38 Pace heatmap — works in Stats. Could add as a togglable overlay on the script view (currently the inspector toggle exists but mapping needs verification).

---

## Conventions / Constraints (rules from the user)

These are persisted as auto-memory in `/Users/quantumcode/.claude/projects/-Users-quantumcode-CODE-Bestscreen/memory/`:

1. **Don't replace deployed sites.** Before deploying to any existing hosting target (Firebase, Vercel, GitHub Pages), check what's currently live and offer additive options (new hosting site within the same project, subdomain, or sub-path). Confirmed via the `feedback_dont_replace_deploys.md` memory file. **For Bestscreen specifically:** Firebase project `wr-ai-ters-room` has multiple sites — always deploy to `site: "bestscreen"` (already configured in `firebase.json`), never to the project default.

2. **No README/docs without explicit ask.** The system prompt forbids creating `*.md` files unless the user asks. (This HANDOFF.md was explicitly requested.)

3. **No code comments without need.** Default to writing no comments; only add when the WHY is non-obvious (hidden constraint, subtle invariant, workaround for a specific bug).

4. **Commit only when asked.** Don't auto-commit. When the user explicitly says "commit" or asks for a deploy/PR, commit using the project's existing style: short title + descriptive body, `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`, HEREDOC for multi-line messages.

5. **The user expects deep, polished features over many half-done ones.** They explicitly said "I'd recommend picking 6-10 of the biggest-impact ones rather than 30 — keeps v3 polished rather than spread thin" (but then picked 30 anyway). Each sprint should ship *deeply finished* features, not stubs.

6. **The user reviews everything visually.** Use Playwright (`mcp__plugin_playwright_playwright__*`) to verify UI work before claiming success — screenshots, console errors, real button-click flows.

7. **Don't trust autosave caching during testing.** When testing parser fixes, the localStorage may hold a pre-fix parsed version. Re-inject the raw input to test the parser.

8. **The user's GitHub handle is `brovzar-lab`.** The Firebase login email is `billyrovzar@gmail.com`. Multiple screenwriting-related Firebase projects exist; only `wr-ai-ters-room` is bound here.

---

## Common Workflows for Fresh Session

### "Continue Sprint 2"
1. `cd /Users/quantumcode/CODE/Bestscreen && git checkout sprints`
2. Read this section: Sprint 2 — M2 + L3
3. Implement, test in browser (`npm run dev`), commit on `sprints`, deploy preview channel, ask user to verify
4. After approval: merge `sprints` → `main`, push, `firebase deploy --only hosting`

### "Promote sprint N to live"
```bash
git checkout main
git merge sprints --no-edit
git push origin main sprints
firebase deploy --only hosting
```

### "Deploy a preview channel"
```bash
firebase hosting:channel:deploy <name> --expires 30d
# URL pattern: https://bestscreen--<name>-<id>.web.app
```

### "Add a new feature on a fresh branch"
```bash
git checkout main
git checkout -b feature/<name>
# … work …
git push -u origin feature/<name>
```

### "Check what's on live vs local"
```bash
curl -s https://bestscreen.web.app/app.js | grep -c "<symbol from new code>"
```

---

## v3-selections.json — original feature picks

The user picked these 30 features (plus the confirmed Project Dashboard). All are currently in the codebase at some depth — refer to "What's Currently Built" above for which are solid vs shallow.

```
1. Story templates           2. Plot-thread visualizer    3. Character arc tracker
4. Scene-goal field          5. Logline workshop          6. Character bibles
7. Relationship map          10. Typewriter mode          12. Voice dictation
13. Writing-streak heatmap   14. Inline AI assist         16. Inline comments
17. Track Changes            19. Snapshot-to-snapshot diff 20. Continuity warnings
25. Sides export             26. Public share link        27. Annotated reading mode
28. Coverage generator       30. Series Bible             31. Story timeline
32. Multi-episode workspace  34. Soundtrack column        35. Ambient writing sounds
36. Cinematic mood           37. Sentiment arc graph      38. Pace heatmap
40. Beat-template fidelity   46. Watermarked PDF          47. Versioned PDF log
```

---

## One-Sentence Greeting for Fresh Claude

> "Continue building Bestscreen (the screenwriting power tool in `/Users/quantumcode/CODE/Bestscreen`, live at https://bestscreen.web.app, repo at https://github.com/brovzar-lab/bestscreen). Read HANDOFF.md for everything you need to know about the project, the conventions, and the remaining sprint plan. We just finished Sprint 1 + Polish; next up is Sprint 2 (M2 character-arc tracker + L3 comment anchor stabilization)."

— End of handoff. Last updated 2026-05-25.
