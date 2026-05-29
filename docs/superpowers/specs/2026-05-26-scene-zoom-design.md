# Scene Zoom — Design Spec

**Date:** 2026-05-26
**Status:** Approved design, ready for implementation plan
**Owner:** Billy Rovzar

---

## 1. Summary

A focused workspace for working on a single screenplay scene. The user opens Scene Zoom on any scene and gets:

1. **BMOC structural analysis** (Peter Russell's Beginning / Middle / Obstacle / Climax framework) — Beat Card, failure-mode scan, ranked fixes.
2. **A persistent AI chat** seeded with the diagnosis, to discuss the scene and steer changes.
3. **An AI rewrite candidate** generated from the diagnosis, viewable side-by-side with the original via a line-level diff. The user can swap the candidate into the script (archiving the original to snapshots) or discard it.

All state persists per scene in `localStorage`. Reopening Scene Zoom on the same scene later restores the Beat Card, the chat history, and the active rewrite candidate.

## 2. Goals & non-goals

### Goals
- Make every scene a "mini-war that turns and stings" (Russell's BMOC standard) using the existing AI plumbing.
- Give the user a single workspace for analyze → discuss → rewrite → diff → accept/reject, without leaving the editor surface for more than one click.
- Preserve full reversibility — accepted rewrites archive the original to the existing snapshots system.
- Keep the feature self-contained — one new module file, one new modal, additive CSS.

### Non-goals (v1)
- Multiple stored rewrite candidates per scene. We keep one active candidate; older candidates land in snapshots, not in a candidate list.
- Multiple structure filters. BMOC is the only filter in v1. The code paths must not bake "BMOC" into the data model so a second filter is a future-friendly addition, but no other filters ship now.
- Free-form scene boundary selection. The scene is auto-detected as `current scene heading → next scene heading`.
- Real-time collaborative editing inside Scene Zoom.
- Bulk Scene Zoom on multiple scenes at once. The existing multi-select bulk AI flow already covers bulk synopsis fill; Scene Zoom is intentionally one-scene-at-a-time.

## 3. User flow

### 3a. Entry
Two entry points trigger Scene Zoom on the scene under the cursor / on the card:

- **Right-click in editor** on any line inside a scene → context menu item **"Scene Zoom"**.
- **Scene Zoom icon** on every scene card in Cards view and Beat Board, adjacent to the existing `✨` AI button.

Both call `SceneZoom.open(sceneAnchorLineIdx)` where `sceneAnchorLineIdx` is the line index of the scene heading. If a non-heading line is passed, the module walks upward to the nearest heading.

### 3b. Modal opens
Full-screen modal (`#modal-scenezoom`) opens over the editor. Three columns:

- **Left — Scene text** with tabs `Original` / `Diff` / `Candidate`. Default tab on open: `Original` if no candidate exists, `Diff` if one does. Under the tabs sits the scene text rendered in screenplay format. Bottom action bar: `Swap candidate into script` / `Discard candidate` (both disabled when no candidate exists).
- **Middle — BMOC Analysis.** If no analysis exists yet, shows a single `Run BMOC analysis` button and brief explainer. If analysis exists, shows: Beat Question, Hero · Antagonist, BMOC Pattern (colored pips), Ticking-Clock note, Failure-Mode scan (list of flags with explanations), and actions `Generate rewrite` / `Show Beat Card (15 fields)` / `Re-run`.
- **Right — Chat thread** with input. Empty state copy: "Run BMOC analysis to start a conversation about this scene." After analysis exists, the thread is seeded with one AI message summarizing the diagnosis; user can ask, push back, or steer. Sending a message that says some variant of "rewrite it" delegates to the rewrite flow (we will not parse intent — there's a `✨ Rewrite from this message` button on each user message that explicitly triggers).

### 3c. Run BMOC analysis
Pressing `Run BMOC analysis` sends a prompt built from:
- The BMOC ANALYZE prompt template (derived from `russell-bmoc-methodology.md` §1–9 + SKILL.md ANALYZE workflow).
- `gatherProjectContext()` for whole-project context (title, logline, theme, template, bible, scene list with beat tags, full Fountain truncated).
- The **focused scene text** in full (not truncated) — extracted via `getSceneText(anchorIdx)`.
- The character wound context if available (Bible character notes for any character appearing in the scene).

The response is parsed into the structured BMOC analysis record (see §4) and persisted. Streaming is used (`AI.stream`) — the analysis card fills in progressively.

### 3d. Discuss in chat
Sending a chat message:
- Appends the user message to the persisted thread.
- Sends a "discuss" prompt that includes: BMOC ANALYZE methodology summary, current Beat Card, current scene text, full chat history, full project context.
- Streams the AI response into the thread.

### 3e. Generate rewrite
`Generate rewrite` (or the per-message `✨ Rewrite from this message` button):
- Sends the BMOC BUILD prompt with: methodology, current Beat Card and diagnosis, current scene text, optional steering message, project context.
- Streams the rewritten scene back as Fountain-formatted text.
- Parses the response into Fountain lines and stores them as the **active candidate**.
- Switches the left column to `Diff` tab automatically. If a candidate already existed, the previous candidate is archived to snapshots before being overwritten (see §5).

### 3f. Swap into script
`Swap candidate into script`:
1. Takes a snapshot of the **current original scene text** named `Pre-Scene-Zoom: <slug>` (so the user can roll back via the existing snapshots drawer).
2. Replaces the scene's DOM lines in the editor: delete lines `[anchorIdx, nextHeadingIdx)`, insert the candidate lines, run `reclassifyAll()` and `setDirty()`.
3. Clears the active candidate from the Scene Zoom record but keeps the Beat Card and chat thread. The diagnosis now reflects the previous version, so a small note appears: "Script updated. Re-run BMOC to analyze the new version."
4. Toast confirmation.

`Discard candidate` simply clears the active candidate from the record without snapshotting (it was never in the script).

### 3g. Close
`✕` or `Escape` closes the modal. All state already persisted on each action — closing is a free operation.

## 4. Data model

### 4a. Scene anchoring

Scenes are identified by a **stable scene ID** derived from a content fingerprint, not by line index (because line indices change every time the user edits). The ID is computed once when Scene Zoom first opens on a scene:

```
sceneId = "sz-" + djb2(slug + firstNonSlugLine + sceneIndexInDocument)
```

Where `slug` is the scene-heading text, `firstNonSlugLine` is the first action/character/etc. line that follows, and `sceneIndexInDocument` is the ordinal position. This produces an ID that survives most edits but resets on slug rename or significant reordering (acceptable failure mode — the analysis is re-anchored or re-run).

A small re-anchor pass on `open()` (similar to the existing comment hybrid fingerprint in `panels.js`) attempts to find a matching scene by slug + neighborhood before generating a new ID, so a Beat Card written yesterday still finds its scene today even after edits.

### 4b. Storage keys

New localStorage key per project:

```
bestscreen.v3.p.<id>.scenezoom = {
  scenes: {
    "<sceneId>": {
      sceneId,
      slug,
      lastSeenAnchorIdx,          // for diagnostic re-anchoring
      analysis: {
        ranAt,                    // timestamp
        beatQuestion: string,
        hero: string,
        antagonist: string,
        setting: string,
        bmocPattern: ["yes"|"no", "yes"|"no", "yes"|"no", "yes"|"no"],
        patternLabel: string,     // e.g. "No-No-No-Yes — against all odds"
        tickingClock: string,
        flags: [{
          mode: "passive-antagonist" | "no-power-shift" | "mushy-beat-q" | ...,
          severity: "high" | "med" | "low",
          summary: string,
          fix: string,
        }],
        beatCard: { ...15 fields per SKILL.md... },
        rewritePriority: string,
        rawModelOutput: string,   // for re-parse or debug
      } | null,
      candidate: {
        createdAt,
        sourceMessage: string | null,
        fountainText: string,     // the rewritten scene
      } | null,                   // diff is computed on render from live original + this fountainText
      chat: [
        { id, role: "user"|"ai", text, ts, kind?: "diagnosis-seed" }
      ]
    }
  }
}
```

This blob is loaded lazily — only when Scene Zoom is first opened in the session — and re-saved on every mutation (debounced 300ms, same pattern as existing autosave). Total size will stay well under localStorage limits even for a 60-scene project with full analyses.

## 5. Snapshots integration

The existing snapshots system (`bestscreen.v3.p.<id>.snaps`) takes a snapshot of the **whole document**, not a scene. To preserve simplicity we keep that contract: when the user swaps a candidate in, we snapshot the **whole document as it exists immediately before the swap**, with the name `Pre-Scene-Zoom: <slug> (YYYY-MM-DD HH:MM)`.

Rollback path: user opens the existing snapshots drawer → finds the labeled snapshot → restores. No new restore UI inside Scene Zoom.

## 6. AI prompts

Three prompt templates live in `scenezoom.js` as exported constants:

- `BMOC_ANALYZE_PROMPT` — modeled on SKILL.md ANALYZE workflow steps 1–4. Outputs strict JSON matching the `analysis` shape in §4b. Includes the full failure-mode list and answer-pattern table from `russell-bmoc-methodology.md` so the model has the rubric inline. Asks for `[MISSING]` / `[WEAK: reason]` tags on Beat Card fields that the scene doesn't provide.
- `BMOC_DISCUSS_PROMPT` — for chat. System message holds the methodology summary + current Beat Card + scene text. User-turn is the prior chat history + new message. Plain prose response (not JSON).
- `BMOC_BUILD_PROMPT` — modeled on SKILL.md BUILD workflow + 6 rewrite passes. Outputs **Fountain-formatted scene only** (no commentary, no JSON wrapping) so we can parse straight into editor lines. Includes the Beat Card and the latest steering message.

All three templates substitute `{CONTEXT}` via the existing `gatherProjectContext()` and use `AI.stream` for streaming. Failed JSON parses (analyze) fall back to a "couldn't structure that — here's the raw output" view that still saves under `rawModelOutput`.

The BMOC reference documents (`russell-bmoc-methodology.md` and `SKILL.md`) are **inlined into the prompts as strings**, not loaded from disk at runtime. Bestscreen has no build step and runs in a browser; the methodology text is embedded as a `const` at the top of `scenezoom.js`. If the user-supplied reference files change, we update the constant.

## 7. Diff algorithm

Line-level diff between original-scene Fountain lines and candidate Fountain lines. Use a small inline implementation of the Myers diff algorithm (~80 LOC) — no external dependency, no build step. Output shape:

```
[
  { type: "same", text },
  { type: "del", text },
  { type: "add", text },
  ...
]
```

Rendered in the `Diff` tab with `.diff-add` / `.diff-del` CSS classes (additive — green left border + tinted background for adds, red strikethrough for dels). The `Original` and `Candidate` tabs render the same Fountain lines without diff styling.

## 8. UI surface

### 8a. New markup in `index.html`

One new `<div class="modal-backdrop" id="modal-scenezoom">` near the other modals, structured as:

```
modal
  titlebar (slug + close)
  grid (3 columns)
    col: scene-text (tabs + body + actions)
    col: bmoc-analysis (header + scrollable body)
    col: chat (header + scrollable thread + input)
```

### 8b. New CSS in `styles.css`

Scoped to `#modal-scenezoom`:

- `.sz-grid` 3-column layout, collapses to single-column tabs at ≤980px (matching existing breakpoints).
- `.sz-col`, `.sz-col-head`, `.sz-body`, `.sz-tabs`, `.sz-tab`.
- `.bmoc-section`, `.bmoc-label`, `.bmoc-value`, `.bmoc-pattern`, `.bmoc-pip` (color variants `.yes` / `.no`), `.bmoc-flag` (with severity color variants).
- `.diff-add`, `.diff-del`.
- `.chat-msg` (`.user` / `.ai` variants), `.chat-author`, `.chat-input`.

All three themes (manuscript / midnight / court) get matching color tokens — defined as CSS variables in each theme block, the modal references the variables.

### 8c. New script `scenezoom.js`

Exposes `window.SceneZoom = { open, close, render, bind }`. Internal structure:

- **State** — in-memory cache of the loaded `scenezoom` blob plus the current `sceneId`.
- **Persistence** — `_load()` / `_saveDebounced()` against the localStorage key.
- **Scene addressing** — `_getSceneId(anchorIdx)`, `_findSceneByIdOrRefingerprint(sceneId)`, `_getSceneText(anchorIdx)`.
- **AI** — `_runAnalyze(sceneId)`, `_sendChat(sceneId, message)`, `_runRewrite(sceneId, steeringMessage?)`. All use `AI.stream` and update state progressively.
- **Diff** — `_computeDiff(originalLines, candidateLines)` (Myers).
- **Editor integration** — `_swapCandidate(sceneId)` writes back into the editor DOM and triggers `setDirty()`.
- **Rendering** — `_renderModal(sceneId)`, `_renderAnalysisCol(sceneId)`, `_renderSceneCol(sceneId, tab)`, `_renderChatCol(sceneId)`.
- **Wiring** — `bind()` attaches the right-click handler in the editor and is called by `app.js` on boot.

### 8d. Entry-point wiring

- **`editor.js`** — add a `contextmenu` listener on `#editor`. When the target is inside a scene, build a small native-style menu (reusing existing inline-modal styles) with at least one item: `Scene Zoom` → `SceneZoom.open(walkUpToHeading(target))`. Cancel on outside-click or `Escape`.
- **`views.js`** — render a second small icon button (📐 or matching the existing `✨`) on every scene card in Cards view and Beat Board. Click → `SceneZoom.open(scene.lineIndex)`.
- **`app.js`** — call `SceneZoom.bind()` from boot, mount `#modal-scenezoom` close handlers, ensure `Escape` closes Scene Zoom before falling through to other modals.

## 9. Script load order

`scenezoom.js` slots after `features.js` (uses `gatherProjectContext`), before `app.js` (which calls `bind()`):

```
config.live.js → config.local.js? → storage.js → templates.js → audio.js → ai.js
  → dashboard.js → bible.js → editor.js → panels.js → views.js → features.js
  → scenezoom.js → io.js → app.js
```

## 10. Failure modes & edge cases

- **No AI key configured** — show the existing "Configure AI in Settings" state inside the BMOC column. Chat is also disabled until configured.
- **AI returns malformed JSON for analyze** — fall back to rendering `rawModelOutput` in a `<pre>` with a "Re-run" button, save it so a future re-render still works.
- **AI rewrite returns non-Fountain (e.g. wrapped in markdown fences)** — strip ```fountain / ``` fences, strip leading prose if any, then parse. If parsing fails entirely, show the raw output with a "Copy as Fountain" button instead of a diff.
- **Scene ID can't be re-anchored** — slug renamed or scene moved heavily — Scene Zoom opens with empty state for that anchor (effectively a new scene). Old record stays in storage but becomes orphaned; a future "Scene Zoom: clean orphans" maintenance action could clean them up, but not in v1.
- **Editor has been changed mid-conversation** — when the user clicks `Swap candidate into script`, the current original-scene text is re-extracted from the DOM (not from cache) so we never overwrite intervening edits with stale data. The candidate is applied to the **current** scene bounds.
- **Multiple scenes share the same slug + neighborhood (rare)** — the `lastSeenAnchorIdx` field disambiguates as a tiebreaker on re-anchor.
- **Very long scene (>5k chars)** — fits well within Anthropic's context budget; no truncation in v1. We rely on the existing `scriptChars: 30000` cap inside `gatherProjectContext()` for the surrounding project context.

## 11. Testing checklist (for verification phase)

Visual verification with Playwright (per project working convention #6):

1. Right-click on a scene line → "Scene Zoom" appears → click opens modal.
2. Scene-card button on Beat Board / Cards opens modal on the right scene.
3. `Run BMOC analysis` streams a Beat Card; pattern pips render; flags render.
4. Chat send + stream works; thread persists after close/reopen.
5. `Generate rewrite` streams; switches to Diff tab; diff shows green adds / red dels.
6. `Swap candidate into script` updates editor lines and creates a snapshot in the snapshots drawer.
7. `Discard candidate` clears candidate, leaves analysis + chat intact.
8. `Escape` closes; reopening the same scene restores everything.
9. Edit the slug of a scene → Scene Zoom on it → re-anchors or starts fresh without erroring.
10. Empty-state copy renders correctly when no analysis has been run yet.
11. All three themes (manuscript / midnight / court) render acceptably.
12. ≤980px viewport collapses to single-column tabs without breakage.

## 12. Out-of-scope / future work

- Additional structure filters (Save the Cat per-scene fit, GCD, MRU, custom prompt-based filters). Data model supports this — `analysis` could become `analyses: { bmoc: {...}, gcd: {...} }`.
- Multi-candidate workshop with named candidates (e.g., "Yes-Yes-No-Yes pass", "Confront-wound pass") and side-by-side picker.
- Inter-scene continuity hints — surface relevant continuity-engine issues for the current scene inside the BMOC column.
- Voice dictation into the chat input.
- Export Beat Card to PDF / markdown.

## 13. Open questions

None at design time. All clarifying decisions are recorded in §2–§5.

## 14. Estimated complexity

- `scenezoom.js` ~600 LOC including prompts and diff.
- `styles.css` additions ~250 LOC.
- `index.html` modal markup ~80 LOC.
- `editor.js` + `views.js` + `app.js` wiring ~80 LOC combined.
- Total ~1,000 LOC. Fits the project's typical sprint feature size.
