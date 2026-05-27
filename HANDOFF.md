# Bestscreen — Session Handoff

> Live status only. **Stable conventions, architecture, and file map live in `CLAUDE.md`** (auto-loaded by Claude Code on every session). Update this file at end of session.

---

## TL;DR

**Scene Zoom is implemented on `feature/scene-zoom` and ready for visual verification.** Sprints 1–7 plus Option-A API key are live at https://bestscreen.web.app. Scene Zoom adds a per-scene BMOC workspace (analyze + chat + AI rewrite + diff + swap-into-script) with persistent state.

Branch state:
- `main` — live, at `668a7e5` (Option-A API key shipped). Pushed.
- `feature/scene-zoom` — Scene Zoom complete, 17 commits ahead of main. NOT yet merged.

Recent commits on `feature/scene-zoom` (most recent first):

```
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

> "Continue Bestscreen on `feature/scene-zoom`. Scene Zoom is fully implemented (17 commits ahead of main). Spec + plan + BMOC reference live in `docs/`. Open task: visual verification with Playwright per the checklist in HANDOFF.md, then merge to main + deploy. Pending after Scene Zoom: Track Changes inline redlines, slideshow read mode, polish."

— Last updated 2026-05-26.
