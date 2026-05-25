# Bestscreen — Session Handoff

> Live status only. **Stable conventions, architecture, and file map live in `CLAUDE.md`** (auto-loaded by Claude Code on every session). Update this file at end of session.

---

## TL;DR

Vanilla JS / CSS / HTML, no build. See `CLAUDE.md` for architecture. **Sprint 2 just shipped on `sprints`.** Just finished:

- **Sprint 2 — M2 + L3** (this session): Per-character arc tracker (Arcs tab in Bible) and comment anchor stabilization (hybrid fingerprint + ±10 re-anchor + orphan ⚠).
- **Prep — module split** (this session): Split `app.js` (3,745 lines) → 6 modules (`editor.js` / `panels.js` / `views.js` / `features.js` / `io.js` + slim `app.js` ~740). Pure file reorganization. Added auto-loaded `CLAUDE.md` for stable conventions.

**Branch state:** `sprints` ahead of `main` and `origin/sprints` by Sprint 2. `main` still at `9b0a57e`. Not yet pushed or deployed (waiting on user confirmation per the no-auto-deploy rule).

---

## What's Currently Built (live)

### Solid

Project Dashboard · multi-project storage with autosave · 5 story templates · Beat Board with ghost cards · Cards corkboard · Bible view (Characters / Relationships / Locations / Rules) with force-directed graph (drag-to-pin) · Story Timeline with smart date parsing · Stats (8 KPI cards + plot-thread ribbon + pace bars + sentiment arc + presence matrix + cast bars + location bars + beat-template fidelity) · Inspector with goal/threads/mood/beat/color/tags/date/soundtrack/characters/props/revision · Revision color rainbow (9 industry colors) · Logline workshop with 6-criterion scoring · Snapshots with snapshot-to-snapshot diff · Inline comments (⌘; to post) · Sprint mode (fullscreen + word goal + timer + WPM) · Scrap bin · Read-aloud table read (Web Speech API, per-character voice) · Find/Replace · Smart typography · Dual dialogue (⌘D toggle; Fountain `^` roundtrip-safe) · Character hover popover (works on cues AND ALL-CAPS mentions) · Sides export · Coverage generator (AI when key set, local heuristic otherwise) · Continuity warnings (heuristic) · Public share link · Watermarked PDF + versioned PDF log · Track Changes log · 3 themes (Manuscript / Midnight / Court) · Command palette (⌘K) · Open / Save .fountain + .fdx · Voice dictation with command parsing · Ambient sound (Web Audio synthesis: rain / fireplace / cafe / vinyl / brown) · Soundtrack URL validator · Stat tooltips · AI assist (BYOK).

### Shallow / partial — to deepen

- **Series Bible** — per-project bibles exist; no series-level inheritance yet. (Sprint 3 / L1)
- **Continuity warnings** — naive substring heuristic; false positives. (Sprint 3 / L2)
- ~~**Comment anchoring**~~ ✅ Shipped Sprint 2 / L3 — hybrid fingerprint + ±10 re-anchor + orphan ⚠.
- ~~**Per-character arc tracker**~~ ✅ Shipped Sprint 2 / M2 — Arcs tab in Bible with W/N/F/C × scene grid + gap analysis.
- **Track Changes** — log + drawer viewer exist; no per-author redlines or accept/reject UI.
- **AI streaming** — fetch-based; no partial render.
- **Track-changes viewer drawer** — could use density polish.

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

### 🏗 Sprint 3 (next up) — Structural depth, ~4 hours

**L1 — Shared bible across series episodes (~250 lines)** — storage migration adds `seriesBibles` keyed by `seriesId`. `Bible.open(pid)`: if `project.seriesId` exists, load merged bible. Character cards get a "Series" vs "Episode" badge. "Promote to series" button on each card. Conflict resolver prompt. Files: `storage.js`, `bible.js`, `dashboard.js`.

**L2 — Entity-tracking continuity engine (~400 lines, biggest investment)** — replace naive heuristic with a real state model. State vocabularies: `injured / dead / pregnant / sober / drunk / employed / married / single / arrested / free / hospitalized`. For each scene, parse state-change verbs targeting known characters. Track relationships. Walk scenes in order; flag inconsistencies. Categorized result UI with jump-to-scene. New `ContinuityEngine` module — likely a new file (~300 lines) or appended to `features.js`.

### Sprint 4+ — leftover polish

- **AI streaming** (~200 lines) — SSE for Anthropic; OpenAI streaming. Ghost overlay; click to accept.
- **Per-author Track Changes redlines** (~200 lines) — inline colored diffs in the script.
- **`@CharacterName` linking enrichment** — hover popover exists; add inline `@name` detection in dialogue/action; clicking jumps to bible.
- **Real audio loops** — embed small base64 mp3/ogg for more natural sound. Trade-off: file size.
- **Soundtrack URL probe accuracy** — current `<audio>` probe doesn't always fire `canplay` for cross-origin. Show "probably works" nuance.
- **Slideshow read mode** (#29 from picker) — auto-advance scene by scene full-screen.

### Already-implemented features that could use a polish pass

- **#28 Coverage** — works with AI + local fallback. Could format as a real document with sections.
- **#46 Watermarked PDF** — works. Save a watermark template per project.
- **#25 Sides** — works. Add option to anonymize other characters' lines.
- **#36 Cinematic mood** — page tint per mood works. Could affect Read-Aloud pitch/rate.
- **#34 Soundtrack** — per-scene URL works. Add a small waveform preview.
- **#38 Pace heatmap** — works in Stats. Could be a togglable overlay on the script view.

---

## Resuming a Fresh Session

Use:

> "Continue building Bestscreen (live at https://bestscreen.web.app, repo `brovzar-lab/bestscreen`). `CLAUDE.md` covers architecture and conventions; this `HANDOFF.md` covers what's next. Sprint 2 (M2 character arcs + L3 comment anchors) just shipped on the `sprints` branch and is not yet pushed/deployed — confirm before pushing. Next is Sprint 3 (L1 series-shared bible + L2 entity-tracking continuity engine)."

— Last updated 2026-05-25.
