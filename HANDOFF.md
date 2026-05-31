# Bestscreen — Session Handoff

> Live status only. **Stable conventions, architecture, and file map live in `CLAUDE.md`** (auto-loaded by Claude Code on every session). Update this file at end of session.

---

## TL;DR — Soft Print redesign + a11y pass

**`theme-redesign` branch (off `main`):** Bestscreen has been redesigned under the **Soft Print** system — warm-paper light theme + warm-charcoal dark, single rose CTA, three desaturated semantic hues (sage/sand/clay) kept strictly off the brand. Hanken Grotesk + Spline Sans Mono replace the previous Inter/serif stack; Courier Prime stays on the actual screenplay editor by design. Light/dark toggle is persisted in `Storage.settings.theme` and honours `prefers-color-scheme` on first load.

Right after the redesign a visual audit (`docs/audits/2026-05-30-audit.md`) flagged 80 axe violations — mostly contrast and a11y debt exposed by the new palette. A follow-up "execute all audit fixes" pass has driven axe to **0 violations** while keeping the Soft Print look intact.

**Branch state (as of 2026-05-30):**
- `main` — at `6b8edef`, live at https://bestscreen.web.app. Pushed.
- `sprints` — fast-forwarded to match `main`. Pushed.
- `theme-redesign` — Soft Print redesign + IMMEDIATELY/LATER audit fixes. Not committed yet (waiting on user direction per `CLAUDE.md` rule 3).

### What was changed in the redesign

1. **Tokens.** `:root` carries the full Soft Print token set (surfaces, text, brand rose, sage/sand/clay, radii, spacing, shadows, ring). `[data-theme="dark"], [data-theme="midnight"]` mirrors them for warm charcoal. Existing legacy tokens (`--bg`, `--paper`, `--ink`, `--accent`, `--good`, `--warn`, etc.) are **aliased** to Soft Print tokens so the 3,900-line stylesheet keeps working without a wholesale find-and-replace.
2. **Fonts.** Google-fonts link in `index.html` loads Hanken Grotesk 400/500/600/700 + Spline Sans Mono 400/500/600. `--font-disp` (legacy display-serif) is re-pointed to `--sp-font`.
3. **Theme system.** `cycleTheme()` is now a 2-way light/dark toggle (legacy "manuscript"/"court"/"midnight" still resolve via `normalizeTheme()`).
4. **Brand-vs-status collisions resolved (8 spots):** save-state "saving" pulse, danger confirm button, danger hover on dashboard card actions, writing-streak heatmap top tint, proof-mark "unknown" underline, scene-pace heatmap, ambient-URL error chip, fidelity status pills. All status surfaces now use semantic hues; rose is brand-only.

### Audit fixes shipped on top of the redesign

| Item | Result |
|---|---|
| Darken `--sp-rose` to `#A1505D` (rose-strong → new rose; 5.4:1 on white) | ✅ |
| Darken `--sp-text-3` to `#6E6757` light / `#9A9182` dark (4.6:1 on surface) | ✅ |
| 13 static modals + dynamic `bsPrompt`/`bsConfirm` get `id` on `<h2>` matching `aria-labelledby` | ✅ |
| 32 form-rows get `<label for=…>`; 6 freestanding inputs get `aria-label` | ✅ |
| Universal `:focus-visible` ring via `--sp-ring` on `.iconbtn`, `.view-tab`, `.menu-item`, `.scene-item`, `.dash-card`, `.np-color`, `.sp-tab`, `.cast-item`, `.beat-card`, `.idx-card` | ✅ |
| `@media (prefers-reduced-motion: reduce)` block | ✅ |
| `autosave()` guards `#save-state` lookup so it no-ops on the dashboard | ✅ |
| Dashboard wraps content in `<main aria-label="Projects">`; SVG sprite wrapped in `role="presentation"`; sidebar/inspector/menubar get aria-labels | ✅ |
| Drawers swapped `aria-hidden=true|false` for the `inert` attribute (focusable content no longer trapped inside hidden region) | ✅ |
| `<dt>`/`<dd>` in inspector now sit inside `<dl class="ins-kv">` | ✅ |
| Inspector `.ins-head` promoted to `<h2>`; sub-section `<h4>`s promoted to `<h3>` to fix heading order | ✅ |
| View-tab buttons get explicit `aria-label` (visible span hidden at narrow viewports otherwise) | ✅ |
| Menubar drops `role="menubar"` (children weren't menuitems anyway) | ✅ |
| `soft-print.css` linked before `styles.css` so the `.sp-*` component classes are available for future work; token cascade lets styles.css's contrast-fixed values win | ✅ |

### Audit numbers — before / after

| Category | Before redesign | After redesign | After fixes |
|---|---|---|---|
| axe `color-contrast` | (n/a) | 32 | **0** |
| axe `label` | (n/a) | 12 | **0** |
| axe `select-name` | (n/a) | 7 | **0** |
| axe `aria-dialog-name` | (n/a) | 13 | **0** |
| axe `region` | (n/a) | 16 | **0** |
| All other axe rules | (n/a) | 0 | **0** |
| Console warnings on load | 1 (autosave) | 1 | **0** |
| Design score (8 dimensions) | — | 3.9 / 5 | ≈ 4.7 / 5 (Color & Contrast now 5/5) |

### Files touched

| File | Purpose |
|---|---|
| `index.html` | `data-theme="light"`, font preconnect, soft-print.css link, modal title ids, label `for=`s, view-tab aria-labels, `<main>` wrapper, sprite container, `<h1>`s, drawer `inert`, sidebar/inspector/menubar labels |
| `styles.css` | Soft Print tokens + legacy alias layer, two `[data-theme]` blocks, scene/pace/streak/status pill remap to tokens, focus-visible block, prefers-reduced-motion block, `.visually-hidden` utility, `.btn.danger` |
| `app.js` | 2-way theme toggle, dynamic modal `role="dialog"` + labelledby, autosave dashboard guard, drawer `inert` flips, `.modalConfirm` danger now uses `.btn.danger` class |
| `panels.js` | `<dl class="ins-kv">` wrapper, `<h3>` (was `<h4>`), `aria-label` on `#ins-template-sel` |
| `menubar.js` | Drops `role="menubar"` at runtime |
| `features.js` | Drawer `inert` flips |
| `dashboard.js` | Default new-project color + cover palette warmed to the SP rose / status palette |
| `io.js` | Exported HTML preview button uses the new rose hex |
| `soft-print.css`, `soft-print-spec.md`, `soft-print.tokens.json` | Spec assets, kept in repo root |
| `docs/audits/2026-05-30-audit.md` + 11 screenshots | Audit report + visual evidence |

### How to verify

```bash
npm run dev   # already running on :5173
```
- `curl -s http://localhost:5173/?cb=1 -o /dev/null` → 200.
- Open dashboard → toggle theme button (top-right moon/sun) flips light ↔ dark and persists across reload.
- Open the editor → same toggle (also persisted via `Storage.settings.theme`).
- Open `bsConfirm({danger:true})` → OK button is clay-filled, not rose.
- DevTools → run axe-core 4.9.1 → zero violations.

### Out of scope (SOMEDAY items in the audit, deliberately not done)

- Lazy-load `dict-en.js` (1.5 MB) and `dict-es.js` (3.3 MB) — biggest perf hit but a refactor that touches Proofcheck init.
- Wholesale sweep replacing legacy alias tokens (`var(--accent)`, `var(--ink)` etc.) with their `--sp-*` counterparts across every JS / CSS site. The alias layer at the top of `styles.css` makes the swap optional.
- Adding the audit screenshots as Playwright visual-regression baselines.

---

## Earlier session work (historical — pre-redesign)

Branch state:
- `main` — live, at `668a7e5` (Option-A API key shipped). Pushed.
- `feature/scene-zoom` — Scene Zoom complete + writer ergonomics pass complete, 21 commits ahead of main. NOT yet merged.
- `feature/proofcheck` — Proofcheck Phase 1 complete, built on top of `feature/scene-zoom`. NOT yet merged.

Recent commits on `feature/scene-zoom` (most recent first):

```
d4a9f2d  Production mode + print pagination + revision marks + status polish
cf8514f  AI: ⌘J dialogue rewrite menu + ⌘B Bible jump + cast right-click rename
2d47e34  Editor: smart Tab + CAPS+Enter promote + auto-CONT'D + smart paste + scene autocomplete
de40fc2  chore: gitignore stray PNGs in repo root
9b8e52b  HANDOFF: document Scene Zoom feature, mark Option-A shipped
8f0ae09  Scene Zoom: per-card entry buttons in Beat Board + Cards view
fef3ae0  Scene Zoom: right-click context-menu entry in editor
625730d  Scene Zoom: swap candidate into script + auto-snapshot + discard
bc56c4c  Scene Zoom: real Myers diff (line-level)
483fa84  Scene Zoom: BMOC rewrite + Fountain parser
5e70aa0  Scene Zoom: chat column — render + streaming + diagnosis seed
c2ce64e  Scene Zoom: BMOC analyze + column renderer
c92804c  Scene Zoom: inline BMOC methodology reference
8bc5d2e  Scene Zoom: render scene text (Original / Diff / Candidate tabs)
2a5638d  Scene Zoom: open/close lifecycle + bind
7211aed  Scene Zoom: CSS for modal, grid, BMOC card, diff, chat
c65ea34  Scene Zoom: modal markup with 3-column grid
208d8e9  Scene Zoom: scene addressing (id fingerprint + boundaries + re-anchor)
c90bb95  Scene Zoom: storage layer (load/debounced save/per-scene record)
db50c5a  Scene Zoom: scaffold module + script tag
52aa53c  Scene Zoom: spec + plan + brainstorm artifacts gitignore
```

---

## Scene Zoom — what shipped on `feature/scene-zoom`

A per-scene focused workspace driven by Peter Russell's BMOC (Beginning / Middle / Obstacle / Climax) methodology.

**Entry points:**
- Right-click any line inside a scene in the editor → "🔍 Scene Zoom"
- 🔍 button on every scene card in Beat Board + Cards view (next to existing ✨)

**Inside the modal — three columns:**
- **Left** — scene text with Original / Diff / Candidate tabs; Swap into script (with auto-snapshot) / Discard buttons
- **Middle** — BMOC analysis card: Beat Question, Hero · Antagonist, BMOC Pattern as colored pips, Ticking Clock, Failure-mode flags with fix prescriptions, Rewrite Priority, Generate-rewrite + Show-Beat-Card actions
- **Right** — persistent chat thread seeded with the diagnosis; per-message ✨ Rewrite-from-this button

**Persistence:** per-scene state (analysis + candidate + chat) saved to `bestscreen.v3.p.<id>.scenezoom`. Survives close/reopen and minor edits via fingerprint-based re-anchoring.

**Source-of-truth for BMOC:** `docs/frameworks/bmoc.md` (full methodology); `scenezoom.js` inlines a ~60-line runtime subset (no build step).

**Spec + plan:** `docs/superpowers/specs/2026-05-26-scene-zoom-design.md` and `docs/superpowers/plans/2026-05-26-scene-zoom.md`.

---

## Writer ergonomics pass — what shipped on `feature/scene-zoom`

A coherent "make Bestscreen feel like Writer's Duet / Final Draft for input" pass. Playwright-verified end-to-end on 2026-05-28.

**Input ergonomics (`2d47e34`):**
- **Smart Tab** — context-aware jump replaces the 6-way carousel. `action → character → parenthetical → dialogue → parenthetical → …`, Shift+Tab reverses. Writer's hand never needs 4 presses.
- **CAPS+Enter promote** — type a name in ALL CAPS on a blank/unforced action line and hit Enter → auto-promotes to character cue + new dialogue line.
- **Auto (CONT'D)** — same speaker twice in a row across action gets render-time `(CONT'D)` via `data-contd`. Typed value and Fountain serialization stay clean.
- **Smart paste** — multi-line Fountain-shaped clipboard parses into proper element divs instead of one action paragraph. Single-line paste falls through to legacy.
- **Scene autocomplete** — split into Location (before dash) and Time-of-Day (after dash). Accepting a location appends ` - ` so the writer flows straight into TOD picker. Most-recent locations rank first.

**AI + Bible nav (`cf8514f`):**
- **⌘J** — AI dialogue rewrite menu (5 presets: Tighten · Make punchier · More subtext · Match Bible voice · Three alternatives). Carries full project context + the speaker's Bible Voice field, streams via `aiInlineFill`.
- **⌘B** — jump to the Bible card for the character at cursor.
- **Cast sidebar right-click** — Open in Bible · Rename throughout… · Jump to first cue. Rename rewrites every cue + every ALL-CAPS body mention + the Bible record (episode + series) in one shot.
- New `Bible.renameCharacter(oldName, newName)` API.

**Production + print + polish (`d4a9f2d`):**
- **Lock scene numbers (production)** in Inspector → Overlays. Locks every heading at 1..N. Inserted scenes between locked numbers get letter suffixes (12A, 12B, ...). Badge in editor margin + PDF use the same number. Round-trips via `bs:sceneNum=` Fountain meta.
- **(MORE) / CONT'D in print** — pre-print `injectMoreContd()` inserts industry-standard markers at every dialogue-spanning page break, stripped after `window.print()`.
- **Revision asterisks** in print — right-margin `*` color-matched to WGA revision color (blue/pink/yellow/green/goldenrod/buff/salmon/cherry).
- **Status pill color-coded** by current element type (warm for scene/transition, cool for character/dialogue, neutral for action).
- **Save heartbeat** — chip shows "unsaved · 12s" while dirty, briefly "saved · 3s" after autosave.
- **Scene sidebar drag-over class fix** (`drag-over` instead of `active`) so drop highlight no longer collides with "current scene".
- **Title page…** button added to Inspector → Story.
- Help table + status hint updated to advertise the new shortcuts.

---

## Proofcheck Phase 1 — what shipped on `feature/proofcheck`

Live, screenplay-aware spell checker for EN + ES. Phase 1 covers the live layer only; Phases 2 (rule-based deep checks) and 3 (AI deep pass) are still to come.

**Bundled wordlists** at load time:
- `dict-en.js` — ~270k common English words from `an-array-of-english-words` (MIT), sampled to length ≤ 15 chars
- `dict-es.js` — ~635k Spanish words from `an-array-of-spanish-words` (MIT), sampled to length ≤ 15 chars

Both LZ-base64 compressed assets; lazy-decoded on first project open via inline `lz-string` decompressFromBase64.

**Per-project custom dictionary** auto-seeds from character cues + Bible characters + ALL-CAPS scene-heading proper nouns (skipping INT/EXT/DAY/etc). Round-trips via Fountain `bs:lang=` and `bs:dict=` title-page meta.

**Surfaces:**
- Orange dotted underline on unknown tokens (live, debounced 400ms, viewport-limited)
- Click or right-click any flagged word → popover with top-5 Damerau-Levenshtein suggestions + Add to dict + Ignore once
- ⌘. accepts the top suggestion when caret is on a flagged word
- Titlebar EN ⇄ ES chip switches dict + persists `meta.language` (cool-blue for EN, warm-green for ES)
- Scene headings, character cues, transitions, parentheticals are NEVER checked (they're identifiers, not prose)

**Known Phase 1 limitations** (Phase 2 candidates):
- Suggestion ranking is alphabetical among ties — typing "thier" suggests "shier" before "their" because of length-tied alphabetical sort. Needs frequency-based ranking via top-1000 common-word boost.
- Single-letter words ("a", "I") get flagged because the build script filters dict entries < 2 chars. Needs a small whitelist or unfiltered short-words pass.
- Spanish suggestion ranking: "perro" does not surface in top-5 for the query "perr" — edit-distance ties are broken alphabetically, so "pero" (4 chars, distance 1) ranks above "perro" (5 chars, distance 1). Needs frequency boost for common words.
- No grammar checking yet (Phase 2). No AI deep pass yet (Phase 3).

**Branch:** `feature/proofcheck` (off `feature/scene-zoom`). Not yet merged.

**Spec + plan:** `docs/superpowers/specs/2026-05-28-proofcheck-design.md`, `docs/superpowers/plans/2026-05-28-proofcheck-phase1.md`.

---

## What's currently live (pre-Scene-Zoom)

Everything from Sprints 1–7 plus the Option-A API key. AI features work out of the box for anyone using the live site.

**Sprints 2–7 shipped earlier:**
- Per-character arc tracker (Bible → Arcs tab) with gap analysis
- Comment anchor stabilization (hybrid `idx:thisHash:ctxHash` fingerprint + ±10 re-anchor + orphan ⚠)
- Series-shared bible (promote/demote between episode and series; merged view with badges)
- Entity-tracking continuity engine (death / arrest / pregnancy / marriage state model + categorized issues with jump-to-scene)
- AI streaming (SSE for Anthropic + OpenAI; ghost-overlay accept/cancel pattern)
- Coverage formatting (themed sections + Save .txt)
- Sides export anonymize toggle
- ✨ buttons on every beat / scene card / bible character field / logline workshop — each carries full project context via `gatherProjectContext()`
- Beat-template bug fix (`data-color` vs `data-beat` split + template-beat dropdown per scene card)
- Editable template chooser in the Inspector
- Multi-select + bulk AI on Beat Board / Cards view (one batched API call for N synopses)
- Smarter `⌘O` import (3-way prompt: Cancel / Replace current / Open as new project)
- Whole-character AI fill — **Automatic** OR **Interview** mode
- AI suggest arcs (W/N/F/C across all characters × scenes)
- AI suggest relationships (typed edges between characters; dedupes against existing)
- Resizable scene sidebar (drag handle, persisted width, single-line slugs)
- Page-break visualization in editor

---

## Next step — visual verification of Scene Zoom

Before merging `feature/scene-zoom` to `main`:

1. `npm run dev` → `http://localhost:5173`
2. Open a project with at least 5 scenes
3. Right-click a line inside a scene → "🔍 Scene Zoom" → modal opens
4. Click "Run BMOC analysis" → streams a Beat Card + flags
5. Send a chat message → AI responds with the methodology in mind
6. Click "Generate rewrite" → Diff tab auto-shows green/red line-level changes
7. "Swap candidate into script" → confirms, swaps, creates "Pre-Scene-Zoom: \<slug\>" snapshot in the existing snapshots drawer
8. Close (✕ / Escape / backdrop), reopen on same scene → state persists
9. Open Beat Board + Cards view → 🔍 buttons present next to ✨ on every card
10. Resize to ~960px → columns stack vertically
11. Cycle themes (manuscript / midnight / court) → contrast holds in all three

If all that passes, merge to `main` and deploy:

```bash
git checkout main
git merge feature/scene-zoom --no-edit
git push origin main
firebase deploy --only hosting   # ask first, per CLAUDE.md #4
```

---

## What's NOT shipped (still open)

- **Per-author Track Changes redlines** — log + drawer viewer exist; no inline colored diffs in the script body. ~200 LOC remaining. Scene Zoom's Diff tab is per-scene; Track Changes would be document-wide and per-author.
- **Slideshow read mode** (#29 from original picker) — auto-advance scene-by-scene fullscreen.
- **Track-changes viewer drawer** density polish.

## Future migration

- **Firebase Functions proxy for the Anthropic API key** (Option B). Currently shipping Option A (key embedded in `config.live.js` with monthly spend cap + rotation in the Anthropic console). Move to a server proxy when spend gets noisy enough that public exposure is a real problem.

## Polish ideas (low priority)

- `bible.js` is ~900 lines — could split into `bible-core.js` + `bible-views.js` if it keeps growing.
- `scenezoom.js` is ~900 lines — same potential split if more filters/modes get added (the spec already anticipates `analyses: { bmoc: {...}, gcd: {...} }` for v2).
- `#46` PDF watermark template per project.
- `#36` Cinematic mood affecting Read-Aloud pitch/rate.
- `#34` Soundtrack waveform preview.
- `#38` Pace heatmap as a togglable inline overlay on the script view.
- Real audio loops (base64-inlined) — synthesis is already good; tradeoff is bundle size.

---

## Local-dev API key setup (one-time, if not already done)

```bash
cp .env.example .env                  # fill in ANTHROPIC_API_KEY
cp config.example.js config.local.js  # paste the same key into the apiKey field
```

Both are gitignored. `index.html` loads `config.local.js` with `onerror="this.remove()"` so the 404 in production is harmless. The AI module reads keys with precedence `window.BS_CONFIG.ai.apiKey` → Settings UI. So once you've filled `config.local.js`, the Settings prompt never appears in dev.

---

## Resuming a fresh session

> "Continue Bestscreen on `feature/scene-zoom`. Scene Zoom + writer ergonomics pass are both implemented (21 commits ahead of main). Spec + plan + BMOC reference live in `docs/`. Ergonomics pass is Playwright-verified. Open task: visual verification of Scene Zoom per the checklist in HANDOFF.md, then merge to main + deploy. Pending after merge: Track Changes inline redlines, slideshow read mode, polish."

— Last updated 2026-05-28 (Proofcheck Phase 1 documented).
