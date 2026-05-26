# Bestscreen — Session Handoff

> Live status only. **Stable conventions, architecture, and file map live in `CLAUDE.md`** (auto-loaded by Claude Code on every session). Update this file at end of session.

---

## TL;DR

**Bestscreen is shipped and live.** Seven sprints landed and got deployed to https://bestscreen.web.app this session. CLAUDE.md was updated to reflect everything.

Branch state:
- `main` is at `44f14e2`, pushed to GitHub and deployed.
- `sprints` was merged into `main` and is now equal to it.

Recent commits (most recent first):

```
44f14e2  Update CLAUDE.md with Sprints 2-7 architecture
6fa3eb1  Merge branch 'sprints'
c375dd3  Sprint 7: whole-character AI, AI arcs + rels, resizable sidebar, page breaks
5cc43c0  Sprint 6: multi-select + bulk AI + smarter editor import
1e79ad0  Sprint 5: AI everywhere + config bootstrap + beat-template bug fix
3ed5d03  Sprint 4: AI streaming (L4) + coverage formatting (CV) + sides anonymize (SA)
0ecce2d  Sprint 3: series-shared bible (L1) + entity-tracking continuity engine (L2)
9f2b51e  Sprint 2: character-arc tracker (M2) + stabilize comment anchors (L3)
a728544  Prep: split app.js into modules; add CLAUDE.md
```

---

## What's currently live

Everything from the original 15-item plan plus a lot more:

**Shipped this session (Sprints 2–7):**
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
- Whole-character AI fill — **Automatic** OR **Interview** mode (AI generates 3 tailored questions, user answers, second call uses answers to fill all 10 fields)
- AI suggest arcs (W/N/F/C across all characters × scenes)
- AI suggest relationships (typed edges between characters; dedupes against existing)
- Resizable scene sidebar (drag handle, persisted width, single-line slugs)
- Page-break visualization in editor (toggle in inspector overlays; dashed divider + "END OF PAGE N" label)

---

## What's NOT shipped (open items)

- **API key on the deployed site** — currently BYOK via Settings UI. We discussed two options at the end of the session:
  - **Option A**: hardcode the key into a `config.live.js` (NOT gitignored), accept that it's visible in deployed JS, mitigate with a monthly spend cap + key rotation.
  - **Option B (recommended)**: build a tiny Firebase Functions proxy that holds the secret server-side; AI module switches from `fetch("api.anthropic.com")` to `fetch("/api/anthropic")`. ~30 lines of Node. Free tier covers personal use.
  - **No decision made.** Next session should ask which one to build.
- **Per-author Track Changes redlines** — log + drawer viewer exist; no inline colored diffs in the script. ~200 LOC remaining.
- **Slideshow read mode** (#29 from original picker) — auto-advance scene-by-scene fullscreen. Never implemented.
- **Track-changes viewer drawer** — could use density polish.

### Polish ideas (low priority)

- `bible.js` is ~900 lines now — could split into `bible-core.js` + `bible-views.js` if it keeps growing.
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

> "Continue Bestscreen. CLAUDE.md has the full architecture and conventions. HANDOFF.md has the live state. We just shipped Sprints 2–7 to https://bestscreen.web.app. The open decision is whether to build a Firebase Functions proxy for the Anthropic API key (Option B) or hardcode it with a spend cap (Option A) — ask me before starting work. Pending features: Track Changes inline redlines (~200 LOC), slideshow read mode, polish passes."

— Last updated 2026-05-26.
