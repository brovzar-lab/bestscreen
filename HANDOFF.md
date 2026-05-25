# Bestscreen — Session Handoff

> Live status only. **Stable conventions, architecture, and file map live in `CLAUDE.md`** (auto-loaded by Claude Code on every session). Update this file at end of session.

---

## TL;DR

Vanilla JS / CSS / HTML, no build. See `CLAUDE.md` for architecture. **You are mid-prep for Sprint 2.** Just finished:

- **Split `app.js` (3,745 lines) → 6 modules:** `editor.js` / `panels.js` / `views.js` / `features.js` / `io.js` + a slim `app.js` (~740 lines). No logic changes — pure file reorganization. Verified in browser: dashboard → editor, Stats view, Bible view all render with zero JS errors.
- **Split `CLAUDE.md` from `HANDOFF.md`:** stable stuff (architecture, conventions, file map) → CLAUDE.md; live status (this file) is now ~1 page.

**Branch state:** `sprints` is ahead of `main` by these prep changes (uncommitted at time of write). `main` and `origin/sprints` still at `9b0a57e`.

---

## What's Currently Built (live)

### Solid

Project Dashboard · multi-project storage with autosave · 5 story templates · Beat Board with ghost cards · Cards corkboard · Bible view (Characters / Relationships / Locations / Rules) with force-directed graph (drag-to-pin) · Story Timeline with smart date parsing · Stats (8 KPI cards + plot-thread ribbon + pace bars + sentiment arc + presence matrix + cast bars + location bars + beat-template fidelity) · Inspector with goal/threads/mood/beat/color/tags/date/soundtrack/characters/props/revision · Revision color rainbow (9 industry colors) · Logline workshop with 6-criterion scoring · Snapshots with snapshot-to-snapshot diff · Inline comments (⌘; to post) · Sprint mode (fullscreen + word goal + timer + WPM) · Scrap bin · Read-aloud table read (Web Speech API, per-character voice) · Find/Replace · Smart typography · Dual dialogue (⌘D toggle; Fountain `^` roundtrip-safe) · Character hover popover (works on cues AND ALL-CAPS mentions) · Sides export · Coverage generator (AI when key set, local heuristic otherwise) · Continuity warnings (heuristic) · Public share link · Watermarked PDF + versioned PDF log · Track Changes log · 3 themes (Manuscript / Midnight / Court) · Command palette (⌘K) · Open / Save .fountain + .fdx · Voice dictation with command parsing · Ambient sound (Web Audio synthesis: rain / fireplace / cafe / vinyl / brown) · Soundtrack URL validator · Stat tooltips · AI assist (BYOK).

### Shallow / partial — to deepen

- **Series Bible** — per-project bibles exist; no series-level inheritance yet. (Sprint 3 / L1)
- **Continuity warnings** — naive substring heuristic; false positives. (Sprint 3 / L2)
- **Comment anchoring** — uses `lineIdx + textHash`; comments orphan silently if line text changes. (Sprint 2 / L3)
- **Per-character arc tracker** — `data-beat` is per-scene; no Want/Need/Flaw/Change grid per character yet. (Sprint 2 / M2)
- **Track Changes** — log + drawer viewer exist; no per-author redlines or accept/reject UI.
- **AI streaming** — fetch-based; no partial render.
- **Track-changes viewer drawer** — could use density polish.

---

## Sprint Plan

### 🛠 Sprint 2 (next up) — Rewriting power tools, ~3 hours

#### M2 — Per-character arc tracker
- New 5th tab in Bible view: **"Arcs"** (or expand Relationships tab).
- Per character × per scene: 4 toggle cells (Want / Need / Flaw / Change). Click to mark.
- Store on `bible.characters[].arc = [{ sceneId, want, need, flaw, change }]`.
- Use `data-line` index as `sceneId` (matches scene indexing elsewhere).
- Gap analysis below the grid: e.g., *"MARCUS's NEED beat doesn't appear in scenes 8–14"* (compute runs of consecutive scenes with no marks per character).
- Compact display: columns = scenes, rows grouped by character (W/N/F sub-rows).
- ~150 lines JS, ~40 lines CSS. New code goes in **`bible.js`** + **`panels.js`** (for inspector linkage if needed).

#### L3 — Comment anchor stabilization (~150 lines)
- Current: `lineKey = lineIdx + ":" + textHash(line)`. If text changes, the comment orphans silently.
- Fix: switch anchor to a **trailing-context fingerprint**: `hash(prevLineText + thisLineText + nextLineText)`.
- On editor input, if a comment's anchor no longer matches its expected line, search ±10 lines for a matching fingerprint and re-anchor.
- If no match, mark `orphaned: true` and render with a yellow ⚠ in the sidebar — user can manually re-anchor or delete.
- Files: **`panels.js`** (rewrite `makeLineKey`, `getLineByKey`, `applyCommentMarkers`; add `reanchorComments()` called from `reclassifyAll()`-debounced).

### 🏗 Sprint 3 — Structural depth, ~4 hours

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

> "Continue building Bestscreen (live at https://bestscreen.web.app, repo `brovzar-lab/bestscreen`). `CLAUDE.md` covers architecture and conventions; this `HANDOFF.md` covers what's next. We just finished Sprint 1 + Polish + a module-split prep. Pick up Sprint 2 (M2 character-arc tracker + L3 comment anchor stabilization) on the `sprints` branch."

— Last updated 2026-05-25.
