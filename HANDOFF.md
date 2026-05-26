# Bestscreen — Session Handoff

> Live status only. **Stable conventions, architecture, and file map live in `CLAUDE.md`** (auto-loaded by Claude Code on every session). Update this file at end of session.

---

## TL;DR

Vanilla JS / CSS / HTML, no build. See `CLAUDE.md` for architecture. **Sprints 2 + 3 + 4 shipped on `sprints` this session.** Summary:

- **Sprint 4 — L4 + CV + SA**: AI streaming (SSE for Anthropic + OpenAI; ghost-overlay accept/cancel for line rewrites; live partial render in coverage modal). Coverage parsed into themed sections (LOGLINE/SYNOPSIS/STRENGTHS/CONCERNS/VERDICT) with a Save .txt button. Sides export gains an "Anonymize other characters' lines" toggle.
- **Sprint 3 — L1 + L2**: Series-shared bible (storage, merge, badges, promote/demote, conflict prompt). Entity-tracking continuity engine (state vocab, per-character timeline, categorized issue list with jump-to-scene).
- **Sprint 2 — M2 + L3**: Per-character arc tracker (Arcs tab in Bible with W/N/F/C × scene grid + gap analysis). Comment anchor stabilization (hybrid fingerprint + ±10 re-anchor + orphan ⚠).
- **Prep — module split**: 3,745-line `app.js` → 6 modules (`editor.js` / `panels.js` / `views.js` / `features.js` / `io.js` + slim `app.js`). Auto-loaded `CLAUDE.md` for stable conventions.

**Bug audit done.** Fixed: `REVISION_COLORS.find().css` crash on unknown rev value, `quickContinuityCount` running 30k regex tests per keystroke (now cached 2s). 21/21 smoke checks pass in Playwright.

**Branch state:** `sprints` is 4 commits ahead of `main` and `origin/sprints`. `main` still at `9b0a57e`. **Not yet pushed or deployed** — waiting on user confirmation per the no-auto-deploy rule.

---

## What's Currently Built (live)

### Solid

Project Dashboard · multi-project storage with autosave · 5 story templates · Beat Board with ghost cards · Cards corkboard · Bible view (Characters / Relationships / Locations / Rules) with force-directed graph (drag-to-pin) · Story Timeline with smart date parsing · Stats (8 KPI cards + plot-thread ribbon + pace bars + sentiment arc + presence matrix + cast bars + location bars + beat-template fidelity) · Inspector with goal/threads/mood/beat/color/tags/date/soundtrack/characters/props/revision · Revision color rainbow (9 industry colors) · Logline workshop with 6-criterion scoring · Snapshots with snapshot-to-snapshot diff · Inline comments (⌘; to post) · Sprint mode (fullscreen + word goal + timer + WPM) · Scrap bin · Read-aloud table read (Web Speech API, per-character voice) · Find/Replace · Smart typography · Dual dialogue (⌘D toggle; Fountain `^` roundtrip-safe) · Character hover popover (works on cues AND ALL-CAPS mentions) · Sides export · Coverage generator (AI when key set, local heuristic otherwise) · Continuity warnings (heuristic) · Public share link · Watermarked PDF + versioned PDF log · Track Changes log · 3 themes (Manuscript / Midnight / Court) · Command palette (⌘K) · Open / Save .fountain + .fdx · Voice dictation with command parsing · Ambient sound (Web Audio synthesis: rain / fireplace / cafe / vinyl / brown) · Soundtrack URL validator · Stat tooltips · AI assist (BYOK).

### Shallow / partial — to deepen

- ~~**Series Bible**~~ ✅ Shipped Sprint 3 / L1.
- ~~**Continuity warnings**~~ ✅ Shipped Sprint 3 / L2 — entity-tracking engine with state vocab.
- ~~**Comment anchoring**~~ ✅ Shipped Sprint 2 / L3.
- ~~**Per-character arc tracker**~~ ✅ Shipped Sprint 2 / M2.
- ~~**AI streaming**~~ ✅ Shipped Sprint 4 / L4 — SSE for Anthropic + OpenAI with ghost-overlay accept/cancel.
- ~~**Coverage formatting**~~ ✅ Shipped Sprint 4 / CV — sectioned with Save .txt.
- ~~**Sides anonymize**~~ ✅ Shipped Sprint 4 / SA.
- **Track Changes per-author redlines** — log + drawer viewer exist; no inline colored diffs in script. (~200 LOC remaining)
- **Track-changes viewer drawer** — could use density polish.
- **Slideshow read mode (#29)** — original picker item, never implemented.

---

## Sprint Plan

### ✅ Sprint 2 — Rewriting power tools (shipped this session)

**M2 — Per-character arc tracker** *(bible.js + styles.css)*
- New "Arcs" tab in Bible view, between Relationships and Locations.
- Per-character grid: 4 sub-rows (W/N/F/C), columns = scenes. Click any cell to toggle.
- Storage: `bible.characters[].arc = [{ sceneId, w, n, f, c }]`. Old-shape entries (pre-Sprint-2) are silently filtered on first toggle.
- Per-row count badge (e.g. `3/8 marked`).
- **Gap analysis** below the grid surfaces: never-marked, late entry (first mark ≥ scene 6), drops-out (no marks in last 5 scenes), large internal gaps (≥ 5 consecutive scenes unmarked).
- New `window.App.getScenesFromScript()` in `app.js` lets the bible see the script's scene list.

**L3 — Comment anchor stabilization** *(panels.js + styles.css)*
- Hybrid fingerprint: `idx:thisHash:ctxHash` where `thisHash` is the line's own text hash and `ctxHash` is `shortHash(prevText + "|||" + nextText)`.
- `getLineByKey()` accepts a partial match on EITHER hash — so editing the commented line OR a neighbor no longer orphans the comment.
- ±10-line search recovers from line moves (verified: insert 2 lines above → comment finds itself at the new index).
- New `reanchorComments()` runs inside `applyCommentMarkers()` (AFTER markers are stripped — otherwise the 💬 emoji bleeds into the hash, latent bug fixed).
- Orphaned comments show in Notes sidebar with an amber-left-border and ⚠ icon; clicking prompts to delete.
- Legacy 2-part keys (`idx:hash`) still resolve via the final-resort full-doc text-hash search.

### Sprint 5+ — leftover polish

- **Per-author Track Changes redlines** (~200 lines) — inline colored diffs in the script. Log already exists at `Storage.getChanges(pid)`; just need an "overlay" toggle that renders before/after diffs inline. The biggest remaining shallow feature.
- **Slideshow read mode** (#29) — auto-advance scene-by-scene fullscreen for cinematic reading. ~120 lines. Never implemented.
- **`@CharacterName` inline linking** — hover popover already works on cues; extend to detect `@name` syntax in action lines and link to bible.
- **Real audio loops** — synthesis is genuinely good (multi-layered rain/fireplace/cafe/vinyl/brown). Replacing with base64-inlined real samples is debatable — trades file size for naturalism.
- **`bible.js` split** — file is now ~860 lines after Sprint 3. Approaching the threshold where splitting into `bible-core.js` + `bible-views.js` would help. Not urgent.

### Already-implemented features that could use a polish pass

- **#46 Watermarked PDF** — works. Could save a watermark template per project.
- **#36 Cinematic mood** — page tint per mood works. Could affect Read-Aloud pitch/rate.
- **#34 Soundtrack** — per-scene URL works. Could add a waveform preview.
- **#38 Pace heatmap** — works in Stats. Could be togglable as an inline overlay on the script view.

---

## Resuming a Fresh Session

Use:

> "Continue building Bestscreen (live at https://bestscreen.web.app, repo `brovzar-lab/bestscreen`). `CLAUDE.md` covers architecture and conventions; this `HANDOFF.md` covers what's next. Sprints 2, 3, and 4 all shipped on the `sprints` branch this session — 13 of the original 15-item plan plus polish are done, verified in Playwright. **The branch hasn't been pushed or deployed yet** — confirm before doing either. The biggest remaining backlog item is per-author Track Changes redlines (~200 LOC)."

— Last updated 2026-05-26.
