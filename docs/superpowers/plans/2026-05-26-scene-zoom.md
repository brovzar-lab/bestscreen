# Scene Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-scene focused workspace: BMOC structural analysis, AI chat, AI rewrite with line-level diff, and a swap-into-script flow with automatic snapshot.

**Architecture:** One new module `scenezoom.js` exposing `window.SceneZoom = { open, close, render, bind }`. One new modal `#modal-scenezoom` in `index.html` with a three-column grid (scene text / BMOC / chat). Reuses `AI.stream`, `gatherProjectContext`, `takeSnapshot`, `serializeFountain`, `reclassifyAll`, `setDirty`. Per-scene state persisted to a new localStorage key `bestscreen.v3.p.<id>.scenezoom`. BMOC methodology is inlined as a `const` string (no build step). Diff via inline Myers (no dependency).

**Tech Stack:** Vanilla JS / CSS / HTML. No framework, no build step, no test framework. Verification is **visual via Playwright MCP** per CLAUDE.md #6.

**Spec:** `docs/superpowers/specs/2026-05-26-scene-zoom-design.md`

**Commit policy:** Per CLAUDE.md #3, only commit when the user asks. Each task ends with a suggested commit command — the executor should confirm with the user before running it (e.g., batch commits at task-cluster boundaries).

---

## File Structure

| Action | Path | Purpose |
|---|---|---|
| Create | `scenezoom.js` | ~600 LOC. Module surface, storage adapter, scene addressing, BMOC analyze / discuss / rewrite, diff, render. |
| Create | `docs/frameworks/bmoc.md` | Copy of the BMOC reference (provenance + future-edit target). Loaded by humans only — `scenezoom.js` inlines the text. |
| Modify | `index.html` (~lines 660+ for scripts; new modal markup before `</body>`) | Add `<script src="scenezoom.js">` between `features.js` and `io.js`. Add `<div id="modal-scenezoom">` markup. |
| Modify | `styles.css` | Add `#modal-scenezoom` block with 3-col grid, BMOC card, diff, chat. Add CSS variables to each theme. |
| Modify | `editor.js` | Add `contextmenu` listener on `#editor` → menu with "Scene Zoom" item. |
| Modify | `views.js` | Add Scene Zoom icon button next to existing `✨` on Beat Board and Cards scene cards. |
| Modify | `app.js` | Call `SceneZoom.bind()` on boot; wire Escape to close `#modal-scenezoom`. |
| Modify | `HANDOFF.md` | Document the new feature; mark Option-A correction. |

---

## Task 1: Create `scenezoom.js` module skeleton

**Files:**
- Create: `scenezoom.js`
- Modify: `index.html` (script tag block ~line 675)

- [ ] **Step 1: Create the module skeleton**

Create `scenezoom.js`:

```javascript
"use strict";
/* =============================================================================
 * BESTSCREEN SCENE ZOOM — per-scene BMOC analysis + chat + AI rewrite + diff
 *
 * Exposes window.SceneZoom = { open, close, render, bind }
 * Persists per-scene state under bestscreen.v3.p.<id>.scenezoom
 * ============================================================================= */

const SceneZoom = (() => {
  // ---------- state ----------
  let _cache = null;        // last-loaded scenezoom blob for current project
  let _cacheProjectId = null;
  let _currentSceneId = null;
  let _saveTimer = null;

  // ---------- public API (stubbed; filled in subsequent tasks) ----------
  function open(anchorLineIdx) {
    console.log("SceneZoom.open", anchorLineIdx);
  }
  function close() {
    const el = document.getElementById("modal-scenezoom");
    if (el) el.classList.remove("open");
    _currentSceneId = null;
  }
  function render() { /* filled in Task 6+ */ }
  function bind() { /* filled in Task 6 */ }

  return { open, close, render, bind };
})();

if (typeof window !== "undefined") window.SceneZoom = SceneZoom;
```

- [ ] **Step 2: Add the script tag**

Modify `index.html` script block. After the line:

```html
<script src="features.js"></script>
```

Insert:

```html
<script src="scenezoom.js"></script>
```

The block should read in order: `features.js`, `scenezoom.js`, `io.js`, `app.js`.

- [ ] **Step 3: Smoke-test the load**

Run: `npm run dev` and open `http://localhost:5173`. In the browser console:

```js
window.SceneZoom
window.SceneZoom.open(0)   // should log "SceneZoom.open 0"
```

Expected: object with `{ open, close, render, bind }`. No console errors. Page still loads.

- [ ] **Step 4: Suggested commit**

```bash
git add scenezoom.js index.html
git commit -m "Scene Zoom: scaffold module + script tag"
```

---

## Task 2: Storage layer

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Add load / save / debounced save**

Inside the IIFE in `scenezoom.js`, replace the `// ---------- state ----------` section + add helpers after the state vars:

```javascript
  // ---------- state ----------
  let _cache = null;
  let _cacheProjectId = null;
  let _currentSceneId = null;
  let _saveTimer = null;

  const STORAGE_SUFFIX = "scenezoom";

  function _loadBlob() {
    const id = (typeof appState !== "undefined") ? appState.projectId : null;
    if (!id) return null;
    if (_cache && _cacheProjectId === id) return _cache;
    try {
      const raw = localStorage.getItem(`bestscreen.v3.p.${id}.${STORAGE_SUFFIX}`);
      _cache = raw ? JSON.parse(raw) : { scenes: {} };
    } catch (e) {
      console.warn("SceneZoom: failed to parse stored blob, starting fresh", e);
      _cache = { scenes: {} };
    }
    _cacheProjectId = id;
    return _cache;
  }

  function _saveBlobNow() {
    const id = _cacheProjectId;
    if (!id || !_cache) return;
    try {
      localStorage.setItem(`bestscreen.v3.p.${id}.${STORAGE_SUFFIX}`, JSON.stringify(_cache));
    } catch (e) {
      console.warn("SceneZoom: save failed", e);
    }
  }

  function _saveBlob() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_saveBlobNow, 300);
  }

  function _getSceneRecord(sceneId, createIfMissing = false) {
    const blob = _loadBlob();
    if (!blob) return null;
    if (!blob.scenes[sceneId] && createIfMissing) {
      blob.scenes[sceneId] = { sceneId, slug: "", lastSeenAnchorIdx: -1,
        analysis: null, candidate: null, chat: [] };
    }
    return blob.scenes[sceneId] || null;
  }

  function _invalidateCache() {
    _cache = null;
    _cacheProjectId = null;
  }
```

- [ ] **Step 2: Wire cache invalidation when project changes**

In the `bind()` function (still a stub), add a one-line listener:

```javascript
  function bind() {
    // Invalidate cache when the user opens a different project so storage
    // reads/writes go against the new project id.
    window.addEventListener("hashchange", _invalidateCache);
  }
```

- [ ] **Step 3: Console smoke**

In the browser console after reload:

```js
// open any project, then:
const SZ = window.SceneZoom;
// (no public API for the internals — these are tested via the integration in later tasks)
localStorage.removeItem(`bestscreen.v3.p.${appState.projectId}.scenezoom`);
```

Expected: no errors during page load.

- [ ] **Step 4: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: storage layer (load/debounced save/per-scene record)"
```

---

## Task 3: Scene addressing — IDs, boundaries, text extraction

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Add scene-addressing helpers**

Add inside the IIFE, after the storage helpers:

```javascript
  // ---------- scene addressing ----------

  function _djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  // Walk upward from an arbitrary line index to the nearest scene heading.
  // Returns -1 if there's no preceding heading.
  function _walkToHeading(anchorLineIdx) {
    const editor = document.getElementById("editor");
    if (!editor) return -1;
    const lines = Array.from(editor.children);
    for (let i = Math.min(anchorLineIdx, lines.length - 1); i >= 0; i--) {
      if (lines[i] && lines[i].dataset.type === "scene") return i;
    }
    return -1;
  }

  // Find the line index of the next scene heading after `headingIdx`,
  // or lines.length if this is the last scene.
  function _findNextHeadingIdx(headingIdx) {
    const editor = document.getElementById("editor");
    const lines = Array.from(editor.children);
    for (let i = headingIdx + 1; i < lines.length; i++) {
      if (lines[i].dataset.type === "scene") return i;
    }
    return lines.length;
  }

  // Extract the raw lines (textContent) for a scene from headingIdx (inclusive)
  // up to but not including the next heading.
  function _getSceneLines(headingIdx) {
    const editor = document.getElementById("editor");
    const lines = Array.from(editor.children);
    const end = _findNextHeadingIdx(headingIdx);
    return lines.slice(headingIdx, end).map(el => ({
      type: el.dataset.type || "action",
      text: el.textContent || "",
    }));
  }

  // Build a string fingerprint stable across minor edits.
  // slug + first non-heading line + scene ordinal among headings.
  function _fingerprintScene(headingIdx) {
    const editor = document.getElementById("editor");
    const lines = Array.from(editor.children);
    const slug = (lines[headingIdx]?.textContent || "").trim().toUpperCase();
    let firstBody = "";
    for (let i = headingIdx + 1; i < lines.length; i++) {
      if (lines[i].dataset.type === "scene") break;
      const t = (lines[i].textContent || "").trim();
      if (t) { firstBody = t; break; }
    }
    let ordinal = 0;
    for (let i = 0; i <= headingIdx; i++) if (lines[i].dataset.type === "scene") ordinal++;
    return { slug, firstBody, ordinal };
  }

  function _getSceneIdForAnchor(headingIdx) {
    const fp = _fingerprintScene(headingIdx);
    return "sz-" + _djb2(`${fp.slug}||${fp.firstBody}||${fp.ordinal}`);
  }

  // Re-anchor a saved sceneId by walking all current headings and matching
  // on (slug + firstBody) first, then (slug + ordinal). Returns headingIdx or -1.
  function _reanchorSceneId(sceneId) {
    const blob = _loadBlob();
    const rec = blob?.scenes?.[sceneId];
    if (!rec) return -1;
    const editor = document.getElementById("editor");
    const lines = Array.from(editor.children);

    // Try recomputing the id at every heading and finding an exact match.
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].dataset.type !== "scene") continue;
      if (_getSceneIdForAnchor(i) === sceneId) return i;
    }
    // Slug-only fallback (handles edits to the first body line).
    const target = (rec.slug || "").toUpperCase();
    if (target) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].dataset.type === "scene" && lines[i].textContent.trim().toUpperCase() === target) return i;
      }
    }
    return -1;
  }
```

- [ ] **Step 2: Wire `open(anchorLineIdx)` to compute/persist the sceneId**

Replace the stubbed `open()`:

```javascript
  function open(anchorLineIdx) {
    const headingIdx = _walkToHeading(anchorLineIdx);
    if (headingIdx < 0) {
      if (typeof toast === "function") toast("Place the cursor inside a scene first");
      return;
    }
    const sceneId = _getSceneIdForAnchor(headingIdx);
    const rec = _getSceneRecord(sceneId, true);
    rec.lastSeenAnchorIdx = headingIdx;
    const fp = _fingerprintScene(headingIdx);
    rec.slug = fp.slug;
    _saveBlob();
    _currentSceneId = sceneId;
    // Modal show happens in Task 6.
    console.log("SceneZoom: opened sceneId", sceneId, "at headingIdx", headingIdx);
  }
```

- [ ] **Step 3: Console smoke**

Reload, open a project, ensure the script has at least one scene heading. In console:

```js
// Find an editor line that is a scene heading:
const idx = Array.from(document.getElementById("editor").children).findIndex(el => el.dataset.type === "scene");
SceneZoom.open(idx);
// Now read the stored blob:
JSON.parse(localStorage.getItem(`bestscreen.v3.p.${appState.projectId}.scenezoom`)).scenes;
```

Expected: one scene record persisted with a `sz-...` key, `slug`, `lastSeenAnchorIdx`, and the default `analysis: null`, `candidate: null`, `chat: []`.

- [ ] **Step 4: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: scene addressing (id fingerprint + boundaries + re-anchor)"
```

---

## Task 4: Modal markup

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the modal markup**

Find the existing modal block in `index.html` (search for `<div class="modal-backdrop" id="modal-help">` — they all sit grouped near the bottom). After the last existing modal-backdrop block and before the `<script>` tags, insert:

```html
<!-- Scene Zoom workspace -->
<div class="modal-backdrop" id="modal-scenezoom">
  <div class="modal sz-modal">
    <div class="sz-titlebar">
      <div class="sz-titlebar-text">
        <span class="sz-title">Scene Zoom</span>
        <span class="sz-sep">·</span>
        <span class="sz-slug" id="sz-slug">—</span>
      </div>
      <button class="sz-close" id="sz-close" aria-label="Close">✕</button>
    </div>
    <div class="sz-grid">
      <div class="sz-col" id="sz-col-scene">
        <div class="sz-col-head">
          <div class="sz-tabs" id="sz-tabs">
            <button class="sz-tab active" data-tab="original">Original</button>
            <button class="sz-tab" data-tab="diff" disabled>Diff</button>
            <button class="sz-tab" data-tab="candidate" disabled>Candidate</button>
          </div>
          <span class="sz-tab-meta" id="sz-tab-meta"></span>
        </div>
        <div class="sz-body sz-screenplay" id="sz-scene-body"></div>
        <div class="sz-col-actions" id="sz-scene-actions">
          <button class="sz-btn sz-btn-primary" id="sz-swap" disabled>Swap candidate into script</button>
          <button class="sz-btn sz-btn-ghost" id="sz-discard" disabled>Discard candidate</button>
        </div>
      </div>
      <div class="sz-col" id="sz-col-bmoc">
        <div class="sz-col-head">
          <span>BMOC Analysis</span>
          <button class="sz-btn sz-btn-ghost sz-mini" id="sz-rerun" hidden>Re-run</button>
        </div>
        <div class="sz-body" id="sz-bmoc-body"></div>
      </div>
      <div class="sz-col" id="sz-col-chat">
        <div class="sz-col-head">
          <span id="sz-chat-head">Discuss</span>
          <button class="sz-btn sz-btn-ghost sz-mini" id="sz-chat-clear" hidden>Clear</button>
        </div>
        <div class="sz-body sz-chat-list" id="sz-chat-body"></div>
        <div class="sz-chat-input">
          <input type="text" id="sz-chat-input" placeholder="Run analysis first…" disabled />
          <button class="sz-btn sz-btn-primary" id="sz-chat-send" disabled>Send</button>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Verify markup loads**

Reload `http://localhost:5173`. In console:

```js
document.getElementById("modal-scenezoom")
document.getElementById("sz-slug")
document.getElementById("sz-bmoc-body")
```

Expected: each returns a real DOM node, no errors.

- [ ] **Step 3: Suggested commit**

```bash
git add index.html
git commit -m "Scene Zoom: modal markup with 3-column grid"
```

---

## Task 5: CSS — modal, grid, BMOC card, diff, chat, themes

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append the Scene Zoom block**

Append to the end of `styles.css`:

```css
/* =====================================================================
   SCENE ZOOM
   Full-screen modal with 3-col grid: scene text / BMOC / chat.
   ===================================================================== */

#modal-scenezoom .modal.sz-modal {
  width: min(1480px, 96vw);
  max-width: 96vw;
  height: min(820px, 92vh);
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  background: var(--bg-elev);
  color: var(--fg);
}

.sz-titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--bg-elev-2);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.sz-titlebar-text { display: inline-flex; gap: 6px; align-items: baseline; }
.sz-title { font-weight: 600; letter-spacing: .2px; }
.sz-sep { color: var(--muted); }
.sz-slug { color: var(--muted); font-family: var(--mono, "Courier New", monospace); }
.sz-close {
  background: transparent; color: var(--muted); border: none;
  font-size: 16px; cursor: pointer; padding: 0 4px;
}
.sz-close:hover { color: var(--fg); }

.sz-grid {
  display: grid;
  grid-template-columns: 1.15fr 1fr .95fr;
  flex: 1;
  min-height: 0;
}
.sz-col {
  display: flex; flex-direction: column;
  border-right: 1px solid var(--border);
  min-height: 0;
}
.sz-col:last-child { border-right: none; }

.sz-col-head {
  padding: 8px 12px;
  background: var(--bg-elev-2);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .8px;
  color: var(--muted);
  display: flex; justify-content: space-between; align-items: center;
  flex-shrink: 0;
}

.sz-body {
  padding: 12px 14px;
  overflow-y: auto;
  flex: 1;
  font-size: 12.5px;
  line-height: 1.5;
  min-height: 0;
}

.sz-col-actions {
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  display: flex; gap: 6px; flex-wrap: wrap;
  flex-shrink: 0;
}

.sz-tabs { display: flex; gap: 4px; }
.sz-tab {
  padding: 3px 9px;
  border-radius: 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .6px;
  cursor: pointer;
  background: transparent;
  color: var(--muted);
  border: 1px solid transparent;
}
.sz-tab.active { background: var(--bg-elev-3, var(--bg-elev-2)); color: var(--fg); border-color: var(--border); }
.sz-tab[disabled] { opacity: .35; cursor: not-allowed; }
.sz-tab-meta { font-size: 10px; color: var(--muted); }

.sz-btn {
  background: var(--bg-elev-3, var(--bg-elev-2));
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 6px 11px;
  border-radius: 5px;
  font-size: 11.5px;
  cursor: pointer;
}
.sz-btn:disabled { opacity: .4; cursor: not-allowed; }
.sz-btn-primary { background: var(--accent); border-color: var(--accent-strong, var(--accent)); color: var(--accent-fg, #fff); }
.sz-btn-ghost { background: transparent; color: var(--muted); }
.sz-btn-ghost:hover:not(:disabled) { color: var(--fg); }
.sz-mini { padding: 3px 8px; font-size: 10px; }

/* Screenplay rendering in left column */
.sz-screenplay { font-family: var(--mono, "Courier New", monospace); font-size: 11.5px; line-height: 1.45; }
.sz-screenplay .sl { white-space: pre-wrap; }
.sz-screenplay .sl-scene { font-weight: 700; text-transform: uppercase; margin: 6px 0 10px; }
.sz-screenplay .sl-action { margin: 0 0 8px; }
.sz-screenplay .sl-character { text-transform: uppercase; text-align: center; margin: 8px 0 2px; padding-right: 24%; }
.sz-screenplay .sl-paren { text-align: center; color: var(--muted); margin: 0; padding-right: 24%; font-style: italic; font-size: 11px; }
.sz-screenplay .sl-dialogue { text-align: left; margin: 0 0 6px; padding: 0 18% 0 18%; }
.sz-screenplay .sl-transition { text-transform: uppercase; text-align: right; margin: 8px 0; }

.sz-screenplay .sl.diff-add { background: rgba(74, 198, 132, .14); border-left: 2px solid #4ac684; padding-left: 4px; }
.sz-screenplay .sl.diff-del { background: rgba(220, 90, 90, .12); border-left: 2px solid #dc5a5a; padding-left: 4px; text-decoration: line-through; opacity: .65; }

/* BMOC card */
.bmoc-section { margin-bottom: 14px; }
.bmoc-label { font-size: 10px; text-transform: uppercase; letter-spacing: .7px; color: var(--muted); margin-bottom: 3px; }
.bmoc-value { font-size: 12.5px; color: var(--fg); }
.bmoc-pattern { display: inline-flex; gap: 4px; align-items: center; }
.bmoc-pip { width: 20px; height: 20px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
.bmoc-pip.yes { background: rgba(74, 198, 132, .22); color: #2f9e62; }
.bmoc-pip.no { background: rgba(220, 90, 90, .2); color: #c14747; }
.bmoc-pattern-label { font-size: 11px; color: var(--muted); margin-left: 8px; }
.bmoc-flags { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.bmoc-flag {
  display: flex; gap: 8px;
  padding: 8px 10px;
  background: rgba(220, 156, 60, .08);
  border-left: 3px solid #d99c3c;
  border-radius: 0 4px 4px 0;
  font-size: 11.5px; line-height: 1.4;
}
.bmoc-flag .icon { color: #d99c3c; flex-shrink: 0; }
.bmoc-actions { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }

.bmoc-empty, .sz-chat-empty {
  color: var(--muted); font-size: 12.5px; text-align: center; padding: 30px 16px;
}

/* Chat */
.sz-chat-list { display: flex; flex-direction: column; gap: 10px; }
.sz-chat-msg { padding: 8px 11px; border-radius: 6px; font-size: 12px; line-height: 1.45; }
.sz-chat-msg.user { background: var(--accent-soft, rgba(110, 100, 220, .15)); border-left: 2px solid var(--accent); }
.sz-chat-msg.ai { background: var(--bg-elev-2); border-left: 2px solid #4ac684; }
.sz-chat-author { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: var(--muted); margin-bottom: 4px; display: flex; justify-content: space-between; }
.sz-chat-rewrite-btn { font-size: 10px; padding: 2px 6px; }
.sz-chat-input {
  border-top: 1px solid var(--border);
  padding: 10px 12px;
  background: var(--bg-elev-2);
  display: flex; gap: 6px;
  flex-shrink: 0;
}
.sz-chat-input input {
  flex: 1;
  background: var(--bg-elev);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 6px 10px;
  font-size: 12px;
  outline: none;
}

/* Responsive collapse: ≤980px stacks the columns as tabs.
   Adds a header tab strip; columns become full-width and stack vertically with overflow. */
@media (max-width: 980px) {
  .sz-grid { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr 1fr; }
  .sz-col { border-right: none; border-bottom: 1px solid var(--border); }
  .sz-col:last-child { border-bottom: none; }
}
```

- [ ] **Step 2: Add fallback theme tokens at the top of each theme block**

In `styles.css`, find each theme's CSS variables block (search for `--bg-elev:` — there are three theme contexts: default/manuscript, midnight, court). For each, add these if missing:

```css
--bg-elev-3: /* one step lighter/darker than bg-elev-2 — match existing aesthetic */;
--accent-soft: /* the same accent at ~15% opacity */;
--accent-strong: /* the accent at full strength */;
--accent-fg: /* readable text-on-accent color */;
--mono: "Courier New", monospace;
```

If your styles already define these tokens, skip this step. If unsure, run the diff in step 3 and check; missing tokens degrade to the `var()` fallbacks in Step 1.

- [ ] **Step 3: Visual smoke**

Reload. In console:

```js
document.getElementById("modal-scenezoom").classList.add("open");
```

The modal should appear, full-screen-ish, with three empty columns. Each column shows its `Original / Diff / Candidate` tabs (left), `BMOC Analysis` header (middle), `Discuss` header (right). Close it:

```js
document.getElementById("modal-scenezoom").classList.remove("open");
```

Use Playwright (`mcp__plugin_playwright_playwright__browser_navigate` + `browser_take_screenshot`) to confirm the three themes look acceptable:

```
1. Open http://localhost:5173, switch theme to manuscript, run the show-modal snippet, screenshot.
2. Repeat for midnight + court.
```

Expected: no broken layout, dividers visible, three roughly equal columns.

- [ ] **Step 4: Suggested commit**

```bash
git add styles.css
git commit -m "Scene Zoom: CSS for modal, grid, BMOC card, diff, chat"
```

---

## Task 6: Open / close lifecycle + render entry point

**Files:**
- Modify: `scenezoom.js`
- Modify: `app.js`

- [ ] **Step 1: Implement `_show`, `_hide`, and replace stubs**

Add inside the IIFE in `scenezoom.js`, before the return statement:

```javascript
  function _show() {
    const el = document.getElementById("modal-scenezoom");
    if (el) el.classList.add("open");
  }
  function _hide() {
    const el = document.getElementById("modal-scenezoom");
    if (el) el.classList.remove("open");
    _currentSceneId = null;
  }

  function _setSlug(sceneId) {
    const rec = _getSceneRecord(sceneId);
    document.getElementById("sz-slug").textContent = rec?.slug || "—";
  }
```

Replace the existing `open(anchorLineIdx)` body (keep all earlier logic, append):

```javascript
  function open(anchorLineIdx) {
    const headingIdx = _walkToHeading(anchorLineIdx);
    if (headingIdx < 0) {
      if (typeof toast === "function") toast("Place the cursor inside a scene first");
      return;
    }
    const sceneId = _getSceneIdForAnchor(headingIdx);
    const rec = _getSceneRecord(sceneId, true);
    rec.lastSeenAnchorIdx = headingIdx;
    const fp = _fingerprintScene(headingIdx);
    rec.slug = fp.slug;
    _saveBlob();
    _currentSceneId = sceneId;
    _setSlug(sceneId);
    render();   // first render
    _show();
  }
```

Replace `close()`:

```javascript
  function close() { _hide(); }
```

Replace `render()`:

```javascript
  function render() {
    // The per-column render functions are defined in Tasks 8 / 11 / 12.
    // For now, just clear bodies so nothing stale lingers.
    if (!_currentSceneId) return;
    const sceneEl = document.getElementById("sz-scene-body");
    const bmocEl = document.getElementById("sz-bmoc-body");
    const chatEl = document.getElementById("sz-chat-body");
    if (sceneEl) sceneEl.innerHTML = "";
    if (bmocEl) bmocEl.innerHTML = `<div class="bmoc-empty">Run BMOC analysis to see the Beat Card and failure-mode scan.</div>`;
    if (chatEl) chatEl.innerHTML = `<div class="sz-chat-empty">Run analysis first to start a conversation.</div>`;
  }
```

- [ ] **Step 2: Wire bind() — close button, Escape, backdrop click**

Replace `bind()`:

```javascript
  function bind() {
    window.addEventListener("hashchange", _invalidateCache);

    const closeBtn = document.getElementById("sz-close");
    closeBtn?.addEventListener("click", _hide);

    const backdrop = document.getElementById("modal-scenezoom");
    backdrop?.addEventListener("click", (e) => {
      if (e.target === backdrop) _hide();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && backdrop?.classList.contains("open")) {
        e.stopPropagation();
        _hide();
      }
    }, true);   // capture phase so we beat other Escape handlers
  }
```

- [ ] **Step 3: Call `bind()` on boot**

In `app.js`, find the `boot()` function and add this line near the existing module-bind calls (search for `Bible.bind?.()` or similar to find the area):

```javascript
  if (typeof SceneZoom !== "undefined") SceneZoom.bind();
```

- [ ] **Step 4: Playwright smoke**

Reload. Use Playwright:

1. Navigate to `http://localhost:5173`.
2. Open or create a project with at least one scene heading.
3. In the editor, click a line inside a scene.
4. In console: `SceneZoom.open(<any line idx inside a scene>)` — the modal should open, slug populated.
5. Press `Escape` — modal closes.
6. Re-open via console call, click the backdrop outside the modal box — closes.
7. Re-open, click `✕` — closes.

Expected: all three close paths work; slug shows the scene heading text.

- [ ] **Step 5: Suggested commit**

```bash
git add scenezoom.js app.js
git commit -m "Scene Zoom: open/close lifecycle + bind"
```

---

## Task 7: Render scene text in left column (Original tab)

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Add scene-renderer helpers**

Add inside the IIFE:

```javascript
  // ---------- scene column rendering ----------

  function _typeToClass(type) {
    return "sl sl-" + (type || "action");
  }

  function _renderSceneLines(targetEl, scenelines, diffOps) {
    // If diffOps provided, render the diff. Otherwise render plain.
    targetEl.innerHTML = "";
    if (diffOps && Array.isArray(diffOps)) {
      diffOps.forEach(op => {
        const div = document.createElement("div");
        div.className = _typeToClass(op.type) +
          (op.kind === "add" ? " diff-add" : op.kind === "del" ? " diff-del" : "");
        div.textContent = op.text;
        targetEl.appendChild(div);
      });
      return;
    }
    scenelines.forEach(l => {
      const div = document.createElement("div");
      div.className = _typeToClass(l.type);
      div.textContent = l.text;
      targetEl.appendChild(div);
    });
  }

  function _renderSceneCol(tab = "original") {
    if (!_currentSceneId) return;
    const rec = _getSceneRecord(_currentSceneId);
    if (!rec) return;
    const anchorIdx = _reanchorSceneId(_currentSceneId);
    if (anchorIdx < 0) {
      document.getElementById("sz-scene-body").innerHTML =
        `<div class="bmoc-empty">Couldn't re-locate this scene in the current script (slug may have changed).</div>`;
      return;
    }
    const original = _getSceneLines(anchorIdx);
    const body = document.getElementById("sz-scene-body");

    // Tab availability
    const tabs = document.querySelectorAll("#sz-tabs .sz-tab");
    tabs.forEach(t => {
      const k = t.dataset.tab;
      t.classList.toggle("active", k === tab);
      if (k === "diff" || k === "candidate") {
        t.disabled = !rec.candidate;
      }
    });

    if (tab === "original" || !rec.candidate) {
      _renderSceneLines(body, original);
      document.getElementById("sz-tab-meta").textContent = "";
    } else if (tab === "candidate") {
      const candidateLines = _parseFountainLines(rec.candidate.fountainText);
      _renderSceneLines(body, candidateLines);
      document.getElementById("sz-tab-meta").textContent =
        "Candidate · " + _agoString(rec.candidate.createdAt);
    } else if (tab === "diff") {
      const candidateLines = _parseFountainLines(rec.candidate.fountainText);
      const ops = _diffLines(original, candidateLines);
      _renderSceneLines(body, null, ops);
      document.getElementById("sz-tab-meta").textContent =
        "Diff vs current original · " + _agoString(rec.candidate.createdAt);
    }

    // Action buttons
    document.getElementById("sz-swap").disabled = !rec.candidate;
    document.getElementById("sz-discard").disabled = !rec.candidate;
  }

  // Stub Fountain parser + diff + ago; filled in Tasks 14, 15.
  function _parseFountainLines(text) { return (text || "").split("\n").map(line => ({ type: "action", text: line })); }
  function _diffLines(a, b) { return [...a.map(l => ({...l, kind:"same"})), ...b.map(l => ({...l, kind:"add"}))]; }
  function _agoString(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s/60) + "m ago";
    return Math.floor(s/3600) + "h ago";
  }
```

- [ ] **Step 2: Wire `render()` to call `_renderSceneCol`**

Replace the `render()` body:

```javascript
  function render() {
    if (!_currentSceneId) return;
    _renderSceneCol("original");
    // BMOC + chat rendering wired in Tasks 11, 12.
    const bmocEl = document.getElementById("sz-bmoc-body");
    const chatEl = document.getElementById("sz-chat-body");
    if (bmocEl) bmocEl.innerHTML = `<div class="bmoc-empty">Run BMOC analysis to see the Beat Card and failure-mode scan.</div>`;
    if (chatEl) chatEl.innerHTML = `<div class="sz-chat-empty">Run analysis first to start a conversation.</div>`;
  }
```

- [ ] **Step 3: Playwright smoke**

1. Open a project, click a line inside a scene with multiple action + dialogue lines.
2. Console: `SceneZoom.open(<that line idx>)`.

Expected: left column shows the scene text formatted with scene heading uppercase, characters centered uppercase, dialogue indented, etc. Right column still shows empty-state copy.

- [ ] **Step 4: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: render scene text in Original tab"
```

---

## Task 8: Tab switching (Original / Diff / Candidate)

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Wire tab clicks in `bind()`**

Append inside `bind()`:

```javascript
    document.querySelectorAll("#sz-tabs .sz-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        _renderSceneCol(btn.dataset.tab);
      });
    });
```

- [ ] **Step 2: Playwright smoke**

1. Open a Scene Zoom on any scene.
2. Click `Diff` and `Candidate` tabs — both should be disabled (no candidate yet).
3. Click `Original` — stays selected.

Expected: tabs visually toggle `.active` only when enabled.

- [ ] **Step 3: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: wire tab switching"
```

---

## Task 9: Inline the BMOC methodology reference

**Files:**
- Modify: `scenezoom.js`
- Create: `docs/frameworks/bmoc.md` (provenance copy — humans only)

- [ ] **Step 1: Stash the human-readable copy**

Create `docs/frameworks/bmoc.md` with the full contents of the user-provided file at `/Users/quantumcode/CODE/lemon-studio-skills/bmoc-beat-engineer/references/russell-bmoc-methodology.md`. This is a provenance copy — `scenezoom.js` does not read from disk at runtime; it inlines the relevant subset as a string constant.

- [ ] **Step 2: Inline the BMOC constant**

Add near the top of `scenezoom.js`, inside the IIFE before the state vars:

```javascript
  // ---------- BMOC methodology (inlined; mirrors docs/frameworks/bmoc.md) ----------
  const BMOC_REFERENCE = `Peter Russell's BMOC methodology for scene-level beat engineering.

WHAT IS A BEAT: a dramatic mini-conflict with 4 elements — Hero (wants something now),
Antagonist (actively blocks), Active clash, Winner/loser by end. No clear shift = not a beat.

BEAT QUESTION: implicit binary Yes/No the audience tracks. Best ones double as character
revelation ("Will she get the files without betraying someone?").

5 SUSPENSE TOOLS:
- Surprise (from character strategy, not random)
- Reversal (power shift; conflict mutates)
- Ticking clock (social/psychological preferred over literal timers)
- Good news / bad news alternation (≥3 oscillations inside the beat)
- Raising stakes (more cost, fewer exits, moral line approaching)

BMOC = four crescendos. Each answers the SAME beat question Yes or No:
- B = Beginning (~25%): conflict engages
- M = Middle (~50%): contest deepens
- O = Obstacle (~75%): worst complication, "all is lost"
- C = Climax: final answer, outcome, price paid

BMOC points are CHOICES, not information. Audience must SEE the shift (a line lands, a door
closes, a confession drops, a price is named).

ANSWER PATTERNS (and emotional feel):
- Yes-Yes-No-Yes  → Classic comeback
- No-No-Yes-Yes   → Earned breakthrough
- Yes-No-No-No    → Collapse / tragedy
- No-Yes-No-Yes   → Scrappy chaos
- Yes-Yes-No-No   → Trap closes
- No-No-No-Yes    → Against all odds
- Yes-No-Yes-No   → Pyrrhic / ambiguous

10 FAILURE MODES TO SCAN FOR:
1. Mushy beat question (can't phrase as Yes/No)
2. Passive antagonist (absorbs, doesn't strategize)
3. No power shift (advantage doesn't change hands)
4. Missing or decorative ticking clock
5. Stakes don't escalate
6. BMOC points deliver INFORMATION instead of forcing CHOICES
7. Split beat used as a cheat (withholding without aftermath payoff)
8. Antagonist too weak (no leverage, no credible threat)
9. No tactic changes in dialogue (charm/deflection/accusation/moral claim/threat/humiliation/feigned vulnerability/sudden honesty)
10. Surprise comes from random events, not character

BEAT CARD (15 fields):
1. Beat ID / Storyline / Episode position
2. Hero (beat protagonist, NOT automatically the series protagonist)
3. Antagonist
4. Setting + constraint
5. Beat Question (binary)
6. Hero Want (external, concrete)
7. Hero Need/Wound being pressured (internal)
8. Antagonist Want + leverage
9. Stakes
10. Ticking clock(s)
11. Good News / Bad News plan (≥3 oscillations)
12. BMOC turns (B/M/O/C — each: event + Yes/No + tactic)
13. Surprise/Reversal
14. Winner/Loser end state
15. Transition hook
`;
```

- [ ] **Step 3: Confirm load**

Reload. In console: `typeof BMOC_REFERENCE === "undefined"` — wait, `BMOC_REFERENCE` is inside the IIFE so it's not global. Smoke-test by triggering a future analyze flow — for now just ensure no parse errors on page load.

- [ ] **Step 4: Suggested commit**

```bash
git add scenezoom.js docs/frameworks/bmoc.md
git commit -m "Scene Zoom: inline BMOC methodology reference"
```

---

## Task 10: BMOC Analyze — prompt, run, parse, persist

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Add prompts + analyze function**

Add inside the IIFE:

```javascript
  // ---------- BMOC analyze ----------

  const BMOC_ANALYZE_PROMPT = `${BMOC_REFERENCE}

You are running BMOC ANALYZE on a single scene from a screenplay.

PROJECT CONTEXT (for tone/character/world awareness):
{CONTEXT}

SCENE (analyze this and only this):
{SCENE}

Return ONLY valid JSON. No prose before or after. Use this exact shape:
{
  "beatQuestion": "Will X do Y without Z?",
  "hero": "Name (beat protagonist — not necessarily series protagonist)",
  "antagonist": "Name or force",
  "setting": "Where + constraint",
  "bmocPattern": ["yes" | "no", "yes" | "no", "yes" | "no", "yes" | "no"],
  "patternLabel": "No-No-No-Yes — against all odds",
  "tickingClock": "Description, or \\"[MISSING]\\" / \\"[WEAK: decorative]\\" if absent/weak",
  "flags": [
    { "mode": "passive-antagonist|no-power-shift|mushy-beat-q|info-not-choice|no-tactic-change|stakes-flat|missing-ticking-clock|weak-antagonist|surprise-not-character", "severity": "high"|"med"|"low", "summary": "One sentence — what fired and why it kills the scene.", "fix": "Concrete prescription. Not vague — name the change." }
  ],
  "beatCard": {
    "beatId": "", "storyline": "", "hero": "", "antagonist": "", "setting": "",
    "beatQuestion": "", "heroWant": "", "heroWound": "", "antagonistWantLeverage": "",
    "stakes": "", "tickingClock": "", "goodNewsBadNews": "",
    "bmocTurns": { "B": "", "M": "", "O": "", "C": "" },
    "surpriseReversal": "", "winnerLoser": "", "transitionHook": ""
  },
  "rewritePriority": "If you change one thing, change THIS first because…"
}

Mark missing or weak elements in the Beat Card with [MISSING] or [WEAK: reason]. Be direct.`;

  function _sceneLinesToFountainText(scenelines) {
    return scenelines.map(l => {
      if (l.type === "scene") return l.text.toUpperCase();
      if (l.type === "character") return l.text.toUpperCase();
      if (l.type === "transition") return l.text.toUpperCase() + ":";
      if (l.type === "paren") return "(" + l.text.replace(/^[(]|[)]$/g, "") + ")";
      return l.text;
    }).join("\n");
  }

  function _stripJsonFences(s) {
    return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  async function _runAnalyze() {
    if (!_currentSceneId) return;
    if (typeof AI === "undefined" || !AI.isConfigured?.()) {
      _renderBmocCol({ kind: "no-key" });
      return;
    }
    const rec = _getSceneRecord(_currentSceneId, true);
    const anchorIdx = _reanchorSceneId(_currentSceneId);
    if (anchorIdx < 0) {
      if (typeof toast === "function") toast("Couldn't re-locate this scene");
      return;
    }
    const sceneText = _sceneLinesToFountainText(_getSceneLines(anchorIdx));
    const ctx = (typeof gatherProjectContext === "function") ? gatherProjectContext({ scriptChars: 24000 }) : "";

    _renderBmocCol({ kind: "streaming", text: "" });
    let raw = "";
    try {
      for await (const chunk of AI.stream(BMOC_ANALYZE_PROMPT, { CONTEXT: ctx, SCENE: sceneText })) {
        raw += chunk;
        _renderBmocCol({ kind: "streaming", text: raw });
      }
    } catch (e) {
      console.error("BMOC analyze stream failed", e);
      _renderBmocCol({ kind: "error", message: String(e?.message || e) });
      return;
    }
    const cleaned = _stripJsonFences(raw);
    let parsed = null;
    try { parsed = JSON.parse(cleaned); } catch (_) { /* fall through */ }
    if (!parsed) {
      rec.analysis = { ranAt: Date.now(), rawModelOutput: raw, parseFailed: true };
      _saveBlob();
      _renderBmocCol({ kind: "parse-fail", raw });
      return;
    }
    rec.analysis = {
      ranAt: Date.now(),
      beatQuestion: parsed.beatQuestion || "",
      hero: parsed.hero || "",
      antagonist: parsed.antagonist || "",
      setting: parsed.setting || "",
      bmocPattern: Array.isArray(parsed.bmocPattern) ? parsed.bmocPattern.slice(0,4) : ["no","no","no","no"],
      patternLabel: parsed.patternLabel || "",
      tickingClock: parsed.tickingClock || "",
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      beatCard: parsed.beatCard || {},
      rewritePriority: parsed.rewritePriority || "",
      rawModelOutput: raw,
    };
    _saveBlob();
    _renderBmocCol({ kind: "loaded" });
    _seedDiagnosisChatMessage();   // defined in Task 13
  }

  // Stub the chat seed (filled in Task 13) so this task is independently runnable.
  function _seedDiagnosisChatMessage() { /* Task 13 */ }
```

- [ ] **Step 2: Verify the prompt is reachable**

For now you can't run this end-to-end without the Task 11 renderer. Confirm the file still loads without parse errors: reload the page, check the console for syntax errors.

- [ ] **Step 3: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: BMOC analyze prompt + run flow"
```

---

## Task 11: BMOC column renderer (empty / streaming / loaded / parse-fail / no-key)

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Add the renderer**

Add inside the IIFE:

```javascript
  function _renderBmocCol(state) {
    const body = document.getElementById("sz-bmoc-body");
    if (!body) return;

    if (!_currentSceneId) { body.innerHTML = ""; return; }
    const rec = _getSceneRecord(_currentSceneId);

    // Default state: derive from record if no explicit state passed.
    if (!state) {
      if (!rec?.analysis) state = { kind: "empty" };
      else if (rec.analysis.parseFailed) state = { kind: "parse-fail", raw: rec.analysis.rawModelOutput };
      else state = { kind: "loaded" };
    }

    if (state.kind === "no-key") {
      body.innerHTML = `<div class="bmoc-empty">No AI key configured. Open Settings (or fill <code>config.local.js</code> in dev) to enable Scene Zoom.</div>`;
      _setRerunVisibility(false);
      return;
    }

    if (state.kind === "empty") {
      body.innerHTML = `
        <div class="bmoc-empty">
          <p>Run BMOC analysis to get a Beat Card, failure-mode scan, and ranked fixes.</p>
        </div>
        <div class="bmoc-actions">
          <button class="sz-btn sz-btn-primary" id="sz-run-analyze">Run BMOC analysis</button>
        </div>`;
      document.getElementById("sz-run-analyze").addEventListener("click", _runAnalyze);
      _setRerunVisibility(false);
      return;
    }

    if (state.kind === "streaming") {
      body.innerHTML = `
        <div class="bmoc-empty">Analyzing…</div>
        <pre style="font-size:11px;color:var(--muted);white-space:pre-wrap;max-height:200px;overflow:auto">${_esc(state.text || "")}</pre>`;
      _setRerunVisibility(false);
      return;
    }

    if (state.kind === "error") {
      body.innerHTML = `<div class="bmoc-empty">Analysis failed: ${_esc(state.message)}</div>
        <div class="bmoc-actions"><button class="sz-btn" id="sz-run-analyze">Try again</button></div>`;
      document.getElementById("sz-run-analyze").addEventListener("click", _runAnalyze);
      return;
    }

    if (state.kind === "parse-fail") {
      body.innerHTML = `
        <div class="bmoc-empty">Couldn't parse the response as structured JSON. Raw output:</div>
        <pre style="font-size:11px;white-space:pre-wrap;background:var(--bg-elev-2);padding:8px;border-radius:4px;max-height:280px;overflow:auto">${_esc(state.raw)}</pre>
        <div class="bmoc-actions"><button class="sz-btn" id="sz-run-analyze">Re-run</button></div>`;
      document.getElementById("sz-run-analyze").addEventListener("click", _runAnalyze);
      _setRerunVisibility(true);
      return;
    }

    // kind === "loaded"
    const a = rec.analysis;
    const pipsHtml = a.bmocPattern.map((v, i) =>
      `<span class="bmoc-pip ${v === "yes" ? "yes" : "no"}">${"BMOC"[i]}</span>`
    ).join("");
    const flagsHtml = (a.flags || []).map(f =>
      `<div class="bmoc-flag"><span class="icon">⚠</span><div><b>${_esc(f.summary || f.mode || "")}</b><br><span style="color:var(--muted)">Fix:</span> ${_esc(f.fix || "")}</div></div>`
    ).join("");

    body.innerHTML = `
      <div class="bmoc-section">
        <div class="bmoc-label">Beat Question</div>
        <div class="bmoc-value">${_esc(a.beatQuestion || "[MISSING]")}</div>
      </div>
      <div class="bmoc-section">
        <div class="bmoc-label">Hero · Antagonist</div>
        <div class="bmoc-value">${_esc(a.hero || "?")} &nbsp;·&nbsp; ${_esc(a.antagonist || "?")}</div>
      </div>
      <div class="bmoc-section">
        <div class="bmoc-label">BMOC Pattern</div>
        <div class="bmoc-pattern">${pipsHtml}<span class="bmoc-pattern-label">${_esc(a.patternLabel || "")}</span></div>
      </div>
      <div class="bmoc-section">
        <div class="bmoc-label">Ticking Clock</div>
        <div class="bmoc-value">${_esc(a.tickingClock || "[MISSING]")}</div>
      </div>
      <div class="bmoc-section">
        <div class="bmoc-label">Failure-mode scan (${(a.flags || []).length})</div>
        <div class="bmoc-flags">${flagsHtml || "<div style='color:var(--muted);font-size:11.5px'>No flags fired.</div>"}</div>
      </div>
      <div class="bmoc-section">
        <div class="bmoc-label">Rewrite Priority</div>
        <div class="bmoc-value">${_esc(a.rewritePriority || "")}</div>
      </div>
      <div class="bmoc-actions">
        <button class="sz-btn sz-btn-primary" id="sz-run-rewrite">Generate rewrite</button>
        <button class="sz-btn" id="sz-show-beatcard">Show Beat Card (15 fields)</button>
      </div>
    `;
    _setRerunVisibility(true);
    document.getElementById("sz-run-rewrite").addEventListener("click", () => _runRewrite());
    document.getElementById("sz-show-beatcard").addEventListener("click", () => _showBeatCardModal(a.beatCard));
  }

  function _setRerunVisibility(show) {
    const btn = document.getElementById("sz-rerun");
    if (btn) btn.hidden = !show;
  }

  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => (
      {"&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"}[c]
    ));
  }

  // Stub rewrite + beat-card modal — filled in Tasks 14 and later.
  function _runRewrite() { console.log("Rewrite — implemented in Task 14"); }
  function _showBeatCardModal(card) {
    const body = JSON.stringify(card || {}, null, 2);
    if (typeof bsConfirm === "function") {
      bsConfirm({ title: "Beat Card", body: `<pre style='max-height:60vh;overflow:auto;font-size:11.5px'>${_esc(body)}</pre>`, okText: "Close", cancelText: "" });
    } else {
      alert(body);
    }
  }
```

- [ ] **Step 2: Wire the Re-run button + update render()**

Append to `bind()`:

```javascript
    document.getElementById("sz-rerun")?.addEventListener("click", _runAnalyze);
```

Update `render()`:

```javascript
  function render() {
    if (!_currentSceneId) return;
    _renderSceneCol("original");
    _renderBmocCol();
    // Chat in Task 12.
    const chatEl = document.getElementById("sz-chat-body");
    if (chatEl) chatEl.innerHTML = `<div class="sz-chat-empty">Run analysis first to start a conversation.</div>`;
  }
```

- [ ] **Step 3: Playwright smoke**

1. Open Scene Zoom on any scene in a project where AI is configured (config.live.js holds a key by default).
2. Middle column should show `Run BMOC analysis` button.
3. Click it. Streaming text appears, then resolves to the loaded view: beat question, hero/antagonist, BMOC pips, ticking clock, flags, rewrite priority, `Generate rewrite` + `Show Beat Card`.
4. Click `Show Beat Card` — modal with 15 fields appears.
5. Click `Re-run` in the column header — should re-stream.
6. Reload the page and re-open Scene Zoom on the same scene — analysis is still there.

Expected: full BMOC loop works end-to-end.

- [ ] **Step 4: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: BMOC column renderer (empty/streaming/loaded/error/parse-fail)"
```

---

## Task 12: Chat column — render + input + persistence

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Add the chat renderer**

Add inside the IIFE:

```javascript
  function _renderChatCol() {
    const body = document.getElementById("sz-chat-body");
    if (!body || !_currentSceneId) return;
    const rec = _getSceneRecord(_currentSceneId);
    const input = document.getElementById("sz-chat-input");
    const sendBtn = document.getElementById("sz-chat-send");

    if (!rec?.analysis) {
      body.innerHTML = `<div class="sz-chat-empty">Run analysis first to start a conversation.</div>`;
      input.placeholder = "Run analysis first…";
      input.disabled = true;
      sendBtn.disabled = true;
      document.getElementById("sz-chat-head").textContent = "Discuss";
      document.getElementById("sz-chat-clear").hidden = true;
      return;
    }

    input.disabled = false;
    sendBtn.disabled = false;
    input.placeholder = "Ask, or steer the rewrite…";

    const msgs = rec.chat || [];
    document.getElementById("sz-chat-head").textContent = `Discuss · ${msgs.length} msgs`;
    document.getElementById("sz-chat-clear").hidden = msgs.length === 0;

    body.innerHTML = msgs.map(m => {
      const author = m.role === "user" ? "You" : "AI · BMOC";
      const rewriteBtn = (m.role === "user")
        ? `<button class="sz-btn sz-btn-ghost sz-chat-rewrite-btn" data-msgid="${_esc(m.id)}">✨ Rewrite from this</button>`
        : "";
      return `<div class="sz-chat-msg ${m.role === "user" ? "user" : "ai"}">
        <div class="sz-chat-author"><span>${author}</span>${rewriteBtn}</div>
        <div>${_esc(m.text).replace(/\n/g, "<br>")}</div>
      </div>`;
    }).join("");

    body.querySelectorAll(".sz-chat-rewrite-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const msg = msgs.find(m => m.id === btn.dataset.msgid);
        _runRewrite(msg?.text || "");
      });
    });

    body.scrollTop = body.scrollHeight;
  }

  function _clearChat() {
    if (!_currentSceneId) return;
    const rec = _getSceneRecord(_currentSceneId);
    if (!rec) return;
    rec.chat = [];
    _saveBlob();
    _renderChatCol();
  }
```

- [ ] **Step 2: Wire input + send + clear in `bind()`**

Append inside `bind()`:

```javascript
    const chatInput = document.getElementById("sz-chat-input");
    const chatSend = document.getElementById("sz-chat-send");
    const sendNow = async () => {
      const text = (chatInput.value || "").trim();
      if (!text) return;
      chatInput.value = "";
      await _sendChat(text);
    };
    chatSend?.addEventListener("click", sendNow);
    chatInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendNow(); }
    });
    document.getElementById("sz-chat-clear")?.addEventListener("click", _clearChat);
```

- [ ] **Step 3: Update `render()`**

Final `render()`:

```javascript
  function render() {
    if (!_currentSceneId) return;
    _renderSceneCol("original");
    _renderBmocCol();
    _renderChatCol();
  }
```

- [ ] **Step 4: Stub `_sendChat`**

For now (filled in Task 13):

```javascript
  async function _sendChat(text) {
    if (!_currentSceneId) return;
    const rec = _getSceneRecord(_currentSceneId, true);
    rec.chat.push({ id: _genId(), role: "user", text, ts: Date.now() });
    rec.chat.push({ id: _genId(), role: "ai", text: "(AI response will stream in Task 13)", ts: Date.now() });
    _saveBlob();
    _renderChatCol();
  }
  function _genId() { return "m_" + Math.random().toString(36).slice(2, 10); }
```

- [ ] **Step 5: Playwright smoke**

1. Open Scene Zoom on a scene with an existing BMOC analysis.
2. Chat input is enabled; placeholder "Ask, or steer the rewrite…".
3. Type "test" and press Enter. Both user message and stub AI message appear.
4. `✨ Rewrite from this` button visible on user message; the count "Discuss · 2 msgs" updates.
5. `Clear` button appears and clears the thread.
6. Reload → messages persist.

- [ ] **Step 6: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: chat column render + input + clear + persistence"
```

---

## Task 13: BMOC discuss prompt + real chat streaming + diagnosis seed

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Add prompts + replace `_sendChat`**

Add inside the IIFE:

```javascript
  const BMOC_DISCUSS_PROMPT = `${BMOC_REFERENCE}

You are continuing a focused conversation about ONE scene. Stay in BMOC terms. Be direct,
specific, and constructive — not generic writing advice. Reference the Beat Card and the
current scene text concretely.

PROJECT CONTEXT:
{CONTEXT}

SCENE:
{SCENE}

CURRENT BMOC DIAGNOSIS:
{DIAGNOSIS}

CHAT HISTORY (most recent last):
{HISTORY}

USER:
{MESSAGE}

Respond in plain prose. No JSON. Stay tight — 2-5 sentences unless the user asked for length.`;

  function _formatDiagnosisForPrompt(analysis) {
    if (!analysis) return "(no analysis run)";
    const flags = (analysis.flags || []).map(f => `- ${f.mode}: ${f.summary} | Fix: ${f.fix}`).join("\n");
    return `Beat Question: ${analysis.beatQuestion}
Hero: ${analysis.hero} | Antagonist: ${analysis.antagonist}
Setting: ${analysis.setting}
BMOC Pattern: ${(analysis.bmocPattern || []).join("-")} (${analysis.patternLabel || ""})
Ticking Clock: ${analysis.tickingClock}
Flags:
${flags}
Rewrite Priority: ${analysis.rewritePriority}`;
  }

  function _formatChatHistoryForPrompt(chat) {
    return (chat || []).map(m => `${m.role === "user" ? "USER" : "AI"}: ${m.text}`).join("\n");
  }

  async function _sendChat(text) {
    if (!_currentSceneId) return;
    if (typeof AI === "undefined" || !AI.isConfigured?.()) {
      if (typeof toast === "function") toast("Configure AI in Settings first");
      return;
    }
    const rec = _getSceneRecord(_currentSceneId, true);
    rec.chat = rec.chat || [];
    rec.chat.push({ id: _genId(), role: "user", text, ts: Date.now() });
    const aiMsg = { id: _genId(), role: "ai", text: "", ts: Date.now() };
    rec.chat.push(aiMsg);
    _saveBlob();
    _renderChatCol();

    const anchorIdx = _reanchorSceneId(_currentSceneId);
    const sceneText = (anchorIdx >= 0) ? _sceneLinesToFountainText(_getSceneLines(anchorIdx)) : "";
    const ctx = (typeof gatherProjectContext === "function") ? gatherProjectContext({ scriptChars: 18000 }) : "";

    try {
      for await (const chunk of AI.stream(BMOC_DISCUSS_PROMPT, {
        CONTEXT: ctx,
        SCENE: sceneText,
        DIAGNOSIS: _formatDiagnosisForPrompt(rec.analysis),
        HISTORY: _formatChatHistoryForPrompt(rec.chat.slice(0, -1)),
        MESSAGE: text,
      })) {
        aiMsg.text += chunk;
        _renderChatCol();
      }
    } catch (e) {
      aiMsg.text = "(error: " + (e?.message || e) + ")";
      _renderChatCol();
    }
    _saveBlob();
  }
```

- [ ] **Step 2: Implement diagnosis seed**

Replace the stubbed `_seedDiagnosisChatMessage`:

```javascript
  function _seedDiagnosisChatMessage() {
    if (!_currentSceneId) return;
    const rec = _getSceneRecord(_currentSceneId);
    if (!rec?.analysis) return;
    // Only seed once. If the chat already has a diagnosis-kind message, don't duplicate.
    if ((rec.chat || []).some(m => m.kind === "diagnosis-seed")) return;
    const a = rec.analysis;
    const summary = `Diagnosis:\n• Beat question — ${a.beatQuestion}\n• Pattern — ${(a.bmocPattern || []).join("-")} (${a.patternLabel || ""})\n• Flags fired — ${(a.flags || []).map(f => f.mode).join(", ") || "none"}\n• Rewrite priority — ${a.rewritePriority || "(none specified)"}\n\nAsk follow-ups or click ✨ Rewrite from any of your messages to generate a candidate.`;
    rec.chat = rec.chat || [];
    rec.chat.unshift({ id: _genId(), role: "ai", text: summary, ts: Date.now(), kind: "diagnosis-seed" });
    _saveBlob();
    _renderChatCol();
  }
```

- [ ] **Step 3: Playwright smoke**

1. Open Scene Zoom on a scene that already has a BMOC analysis (or re-run it).
2. The diagnosis seed message appears in chat.
3. Send "Why is the O point weak?" — AI streams a real response.
4. Reload → both messages persist.

- [ ] **Step 4: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: real chat streaming + diagnosis seed"
```

---

## Task 14: BMOC Build — rewrite prompt + run + parse Fountain candidate

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Add prompt + run function**

Add inside the IIFE:

```javascript
  const BMOC_BUILD_PROMPT = `${BMOC_REFERENCE}

You are running BMOC BUILD on a single scene. Use the diagnosis to engineer a stronger
version of the scene. Hit B/M/O/C as concrete observable turns. Make each BMOC point a
CHOICE (not information). Layer in: at least one ticking clock (prefer social/psychological),
≥3 good-news/bad-news oscillations, ≥2 stake escalations, one surprise or reversal driven
by character.

PROJECT CONTEXT:
{CONTEXT}

ORIGINAL SCENE:
{SCENE}

DIAGNOSIS:
{DIAGNOSIS}

OPTIONAL USER STEERING:
{STEERING}

Output the rewritten scene in standard Fountain format ONLY. No commentary before or after.
Scene heading in CAPS, characters in CAPS on their own line, parentheticals in (parens),
action as prose. Keep the scene roughly the same length unless the diagnosis demands otherwise.`;

  async function _runRewrite(steeringMessage = "") {
    if (!_currentSceneId) return;
    if (typeof AI === "undefined" || !AI.isConfigured?.()) {
      if (typeof toast === "function") toast("Configure AI in Settings first");
      return;
    }
    const rec = _getSceneRecord(_currentSceneId, true);
    if (!rec.analysis) {
      if (typeof toast === "function") toast("Run BMOC analysis first");
      return;
    }
    const anchorIdx = _reanchorSceneId(_currentSceneId);
    if (anchorIdx < 0) {
      if (typeof toast === "function") toast("Couldn't re-locate this scene");
      return;
    }

    // Archive any existing candidate to snapshots before overwriting.
    if (rec.candidate && typeof takeSnapshot === "function") {
      try {
        takeSnapshot(`Pre-rewrite candidate: ${rec.slug} (${new Date().toLocaleString()})`);
      } catch (_) {}
    }

    rec.candidate = { createdAt: Date.now(), sourceMessage: steeringMessage || null, fountainText: "" };
    _saveBlob();

    const sceneText = _sceneLinesToFountainText(_getSceneLines(anchorIdx));
    const ctx = (typeof gatherProjectContext === "function") ? gatherProjectContext({ scriptChars: 18000 }) : "";

    let raw = "";
    try {
      for await (const chunk of AI.stream(BMOC_BUILD_PROMPT, {
        CONTEXT: ctx,
        SCENE: sceneText,
        DIAGNOSIS: _formatDiagnosisForPrompt(rec.analysis),
        STEERING: steeringMessage || "(none)",
      })) {
        raw += chunk;
        rec.candidate.fountainText = _stripFountainFences(raw);
        // Re-render the scene column in candidate mode while streaming.
        _renderSceneCol("candidate");
      }
    } catch (e) {
      console.error("BMOC rewrite stream failed", e);
      if (typeof toast === "function") toast("Rewrite failed: " + (e?.message || e));
      return;
    }
    rec.candidate.fountainText = _stripFountainFences(raw);
    _saveBlob();
    _renderSceneCol("diff");
    if (typeof toast === "function") toast("Rewrite candidate ready — see Diff tab");
  }

  function _stripFountainFences(s) {
    return (s || "").replace(/^```(?:fountain)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
```

- [ ] **Step 2: Replace the stub `_runRewrite` reference**

The earlier stub `function _runRewrite() { console.log(...); }` should be deleted now that the real one is defined.

- [ ] **Step 3: Replace the stub Fountain parser**

Replace `_parseFountainLines` with a real one:

```javascript
  function _parseFountainLines(text) {
    if (!text) return [];
    const lines = text.split("\n");
    const out = [];
    const SCENE_RE = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.|INT |EXT )/i;
    const TRANS_RE = /^[A-Z\s]+:\s*$/;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();
      if (t === "") { out.push({ type: "action", text: "" }); continue; }
      if (SCENE_RE.test(t)) { out.push({ type: "scene", text: t }); continue; }
      if (/^\(.+\)$/.test(t)) { out.push({ type: "paren", text: t }); continue; }
      if (TRANS_RE.test(t)) { out.push({ type: "transition", text: t.replace(/:\s*$/, "") }); continue; }
      // Character cue heuristic: ALL CAPS line followed by a non-empty next line.
      const isAllCaps = t === t.toUpperCase() && /[A-Z]/.test(t) && t.length < 50;
      const nextNonEmpty = lines.slice(i+1).find(l => l.trim() !== "");
      if (isAllCaps && nextNonEmpty && !SCENE_RE.test(nextNonEmpty.trim())) {
        out.push({ type: "character", text: t });
        continue;
      }
      // If previous line was character or paren or dialogue, treat this as dialogue.
      const prev = out[out.length - 1];
      if (prev && (prev.type === "character" || prev.type === "paren" || prev.type === "dialogue")) {
        out.push({ type: "dialogue", text: t });
      } else {
        out.push({ type: "action", text: t });
      }
    }
    return out;
  }
```

- [ ] **Step 4: Playwright smoke**

1. Open Scene Zoom on a scene with a BMOC analysis.
2. Click `Generate rewrite` (BMOC column) — Diff tab auto-activates and streams in.
3. After completion, click `Original` then `Candidate` then `Diff` tabs — each renders correctly.
4. The `Swap candidate into script` and `Discard candidate` buttons are now enabled.
5. Reload → candidate still there.

- [ ] **Step 5: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: BMOC rewrite + Fountain parse"
```

---

## Task 15: Line-level Myers diff

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Replace `_diffLines` with real Myers diff**

Replace the existing stub:

```javascript
  // Line-level Myers diff over two arrays of {type, text}.
  // Returns ops: [{ type, text, kind: "same"|"add"|"del" }, ...]
  function _diffLines(a, b) {
    const n = a.length, m = b.length;
    // Key function — match on type + text to keep same-line stylings stable.
    const key = (l) => `${l.type}|${l.text}`;
    const max = n + m;
    if (max === 0) return [];
    const v = new Array(2 * max + 1).fill(0);
    const offset = max;
    const trace = [];
    for (let d = 0; d <= max; d++) {
      const vSnap = v.slice();
      trace.push(vSnap);
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
          x = v[offset + k + 1];
        } else {
          x = v[offset + k - 1] + 1;
        }
        let y = x - k;
        while (x < n && y < m && key(a[x]) === key(b[y])) { x++; y++; }
        v[offset + k] = x;
        if (x >= n && y >= m) {
          // Backtrack.
          const ops = [];
          let cx = n, cy = m;
          for (let dd = trace.length - 1; dd > 0; dd--) {
            const vPrev = trace[dd];
            const k2 = cx - cy;
            let prevK;
            if (k2 === -dd || (k2 !== dd && vPrev[offset + k2 - 1] < vPrev[offset + k2 + 1])) prevK = k2 + 1;
            else prevK = k2 - 1;
            const prevX = vPrev[offset + prevK];
            const prevY = prevX - prevK;
            while (cx > prevX && cy > prevY) {
              ops.push({ ...a[cx - 1], kind: "same" });
              cx--; cy--;
            }
            if (dd > 0) {
              if (cx === prevX) {
                ops.push({ ...b[cy - 1], kind: "add" });
                cy--;
              } else {
                ops.push({ ...a[cx - 1], kind: "del" });
                cx--;
              }
            }
          }
          while (cx > 0 && cy > 0) {
            ops.push({ ...a[cx - 1], kind: "same" });
            cx--; cy--;
          }
          while (cx > 0) { ops.push({ ...a[cx - 1], kind: "del" }); cx--; }
          while (cy > 0) { ops.push({ ...b[cy - 1], kind: "add" }); cy--; }
          return ops.reverse();
        }
      }
    }
    return [];
  }
```

- [ ] **Step 2: Playwright smoke**

1. With a scene + rewrite candidate already present, click `Diff` tab.
2. Identical lines render plain; added lines have green left border + tinted background; removed lines have red strikethrough.
3. Sanity-check with a deliberately small change: in dev tools, set `rec.candidate.fountainText` to a string identical to the original — Diff tab should show all `same` (no green / no red).

- [ ] **Step 3: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: inline Myers diff for line-level scene comparison"
```

---

## Task 16: Swap candidate into script (with auto-snapshot)

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Implement swap + discard**

Add inside the IIFE:

```javascript
  function _candidateToDomLines(fountainText) {
    // Parse candidate Fountain into the SAME DOM-line shape used by the editor:
    // create <div data-type="..."> elements. This piggybacks on reclassifyAll()
    // to normalize anything we got wrong.
    const lines = _parseFountainLines(fountainText);
    return lines.map(l => {
      const div = document.createElement("div");
      div.setAttribute("data-type", l.type);
      div.textContent = l.text;
      return div;
    });
  }

  async function _swapCandidate() {
    if (!_currentSceneId) return;
    const rec = _getSceneRecord(_currentSceneId);
    if (!rec?.candidate) return;
    const anchorIdx = _reanchorSceneId(_currentSceneId);
    if (anchorIdx < 0) {
      if (typeof toast === "function") toast("Couldn't re-locate this scene");
      return;
    }

    if (typeof bsConfirm === "function") {
      const ok = await bsConfirm({
        title: "Swap candidate into script?",
        body: "A snapshot of the current document will be saved automatically so you can revert.",
        okText: "Swap",
        cancelText: "Cancel"
      });
      if (!ok) return;
    }

    // Auto-snapshot the whole document.
    if (typeof takeSnapshot === "function") {
      try { takeSnapshot(`Pre-Scene-Zoom: ${rec.slug} (${new Date().toLocaleString()})`); } catch (_) {}
    }

    // Locate the scene bounds in the live editor (re-read after snapshot, since
    // snapshot doesn't mutate DOM but we want the current values).
    const editor = document.getElementById("editor");
    const lines = Array.from(editor.children);
    const endIdx = _findNextHeadingIdx(anchorIdx);
    const newNodes = _candidateToDomLines(rec.candidate.fountainText);

    // Splice the DOM: remove [anchorIdx, endIdx), insert newNodes at anchorIdx.
    const removeCount = endIdx - anchorIdx;
    for (let i = 0; i < removeCount; i++) editor.removeChild(lines[anchorIdx]);
    const before = editor.children[anchorIdx] || null;
    newNodes.forEach(n => editor.insertBefore(n, before));

    if (typeof reclassifyAll === "function") reclassifyAll();
    if (typeof setDirty === "function") setDirty();

    // Clear candidate, keep analysis + chat.
    rec.candidate = null;
    _saveBlob();
    _renderSceneCol("original");
    _renderBmocCol();
    if (typeof toast === "function") toast("Candidate swapped into script. Snapshot saved.");
  }

  function _discardCandidate() {
    if (!_currentSceneId) return;
    const rec = _getSceneRecord(_currentSceneId);
    if (!rec) return;
    rec.candidate = null;
    _saveBlob();
    _renderSceneCol("original");
  }
```

- [ ] **Step 2: Wire the buttons in `bind()`**

Append inside `bind()`:

```javascript
    document.getElementById("sz-swap")?.addEventListener("click", _swapCandidate);
    document.getElementById("sz-discard")?.addEventListener("click", _discardCandidate);
```

- [ ] **Step 3: Playwright smoke**

1. Generate a rewrite candidate on a scene.
2. Click `Swap candidate into script`. Confirm in the bsConfirm modal.
3. The Scene Zoom modal updates (Original tab now shows the new scene).
4. Close Scene Zoom. The editor now has the rewritten scene.
5. Open the existing Snapshots drawer — a `Pre-Scene-Zoom: <slug> (...)` snapshot is at the top.
6. Restore that snapshot to verify rollback works.

- [ ] **Step 4: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: swap candidate into script + auto-snapshot + discard"
```

---

## Task 17: Right-click entry point in editor

**Files:**
- Modify: `editor.js`

- [ ] **Step 1: Inspect existing context-menu wiring**

Search `editor.js` and `features.js` for any existing `contextmenu` handler. If one exists (e.g., the AI right-click menu via `AI.getCommands()`), we **add** a Scene Zoom item to that existing menu instead of creating a parallel one. If none exists, create a new one.

Run: `grep -n "contextmenu\|contextMenu" /Users/quantumcode/CODE/Bestscreen/editor.js /Users/quantumcode/CODE/Bestscreen/features.js`. Use the output to decide which branch below applies.

- [ ] **Step 2a: If an existing context menu exists**

Find the array of menu items that gets rendered (it will be near a function that returns / renders the menu options — likely AI commands). Add an item:

```javascript
{ id: "scene-zoom", label: "🔍 Scene Zoom", run: (lineEl) => {
    const idx = Array.from(document.getElementById("editor").children).indexOf(lineEl);
    if (idx >= 0 && window.SceneZoom) window.SceneZoom.open(idx);
  }
}
```

Make sure the menu's click handler invokes `item.run(targetLineEl)`.

- [ ] **Step 2b: If no existing context menu exists**

Add to `editor.js`, after the existing keydown wiring (find the end of `function wireEditor()` or equivalent):

```javascript
  document.getElementById("editor")?.addEventListener("contextmenu", (e) => {
    const line = e.target.closest("#editor > div");
    if (!line) return;
    e.preventDefault();
    const menu = document.createElement("div");
    menu.className = "sz-ctxmenu";
    menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:var(--bg-elev-2);border:1px solid var(--border);border-radius:6px;padding:4px 0;z-index:9999;font-size:12px;min-width:160px;box-shadow:0 6px 20px rgba(0,0,0,.25)`;
    menu.innerHTML = `<button class="sz-ctxmenu-item" style="display:block;width:100%;text-align:left;padding:6px 12px;background:transparent;border:none;color:var(--fg);cursor:pointer">🔍 Scene Zoom</button>`;
    document.body.appendChild(menu);
    const close = () => { menu.remove(); document.removeEventListener("click", close); document.removeEventListener("keydown", escListener, true); };
    const escListener = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); close(); } };
    setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("keydown", escListener, true);
    }, 0);
    menu.querySelector(".sz-ctxmenu-item").addEventListener("click", () => {
      const idx = Array.from(document.getElementById("editor").children).indexOf(line);
      if (idx >= 0 && window.SceneZoom) window.SceneZoom.open(idx);
      close();
    });
  });
```

- [ ] **Step 3: Add hover style for menu item**

Append to `styles.css`:

```css
.sz-ctxmenu-item:hover { background: var(--bg-elev-3, var(--bg-elev)); }
```

- [ ] **Step 4: Playwright smoke**

1. Right-click any line inside a scene in the editor.
2. Menu shows "🔍 Scene Zoom".
3. Click it. Scene Zoom opens on the correct scene (slug matches the scene the cursor was in).
4. Press Escape on the open menu — it closes without opening Scene Zoom.

- [ ] **Step 5: Suggested commit**

```bash
git add editor.js styles.css
git commit -m "Scene Zoom: right-click context-menu entry point in editor"
```

---

## Task 18: Scene-card entry points (Beat Board + Cards view)

**Files:**
- Modify: `views.js`

- [ ] **Step 1: Locate the existing sparkle (✨) button rendering**

Run `grep -n "✨\|aiBeatSynopsis\|aiSceneCard" /Users/quantumcode/CODE/Bestscreen/views.js` to find where the per-scene-card AI button is rendered. There are two render sites (Beat Board and Cards view) — both need a sibling Scene Zoom button.

- [ ] **Step 2: Add the Scene Zoom button next to ✨ in both render sites**

At each location where the `✨` button is rendered, immediately after that button's `<button>` element, render a sibling:

```javascript
`<button class="card-btn" data-zoom="${sceneObj.lineIndex}" title="Scene Zoom">🔍</button>`
```

(Match the exact CSS class and attribute style the existing ✨ button uses — search around the ✨ to copy its class names.)

- [ ] **Step 3: Wire the click**

In the same view's event-binding code (typically a delegated handler on the cards container), add:

```javascript
container.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-zoom]");
  if (!btn) return;
  e.stopPropagation();
  const idx = parseInt(btn.dataset.zoom, 10);
  if (!isNaN(idx) && window.SceneZoom) window.SceneZoom.open(idx);
});
```

If the existing AI sparkle uses a similar delegation pattern, follow it exactly — don't introduce a parallel mechanism.

- [ ] **Step 4: Playwright smoke**

1. Open Beat Board view; each scene card has the existing ✨ AND a new 🔍 button.
2. Click 🔍 on any card. Scene Zoom opens on that scene.
3. Switch to Cards view. Same thing — 🔍 on every card opens Scene Zoom.

- [ ] **Step 5: Suggested commit**

```bash
git add views.js
git commit -m "Scene Zoom: per-card entry buttons in Beat Board + Cards view"
```

---

## Task 19: Polish — empty states, no-key state, malformed-Fountain edge case

**Files:**
- Modify: `scenezoom.js`

- [ ] **Step 1: Confirm `AI.isConfigured` exists; if not, derive a check**

`grep -n "isConfigured" /Users/quantumcode/CODE/Bestscreen/ai.js`. If `AI.isConfigured` isn't a real function (the module surface in CLAUDE.md says it is), replace calls with an inline check:

```javascript
function _aiReady() {
  if (typeof AI === "undefined") return false;
  if (typeof AI.isConfigured === "function") return AI.isConfigured();
  // Fallback: probe BS_CONFIG.ai or Storage settings.
  const local = (window.BS_CONFIG && window.BS_CONFIG.ai) || {};
  const stored = (typeof Storage !== "undefined" && Storage.getSettings) ? (Storage.getSettings().ai || {}) : {};
  return !!(local.apiKey || stored.apiKey);
}
```

Then replace every `AI.isConfigured?.()` call inside `scenezoom.js` with `_aiReady()`.

- [ ] **Step 2: Malformed Fountain candidate**

In `_runRewrite`, after stripping fences, if `_parseFountainLines(fountainText).length === 0`, surface a clear error:

```javascript
const parsed = _parseFountainLines(rec.candidate.fountainText);
if (parsed.length === 0) {
  if (typeof toast === "function") toast("Rewrite returned unparseable output — see Candidate tab raw");
  // Still leave the candidate text in place — Candidate tab will render it line-by-line via the existing parser (each line as 'action'), which is acceptable degraded mode.
}
```

This is enough — degraded mode shows the raw text as action lines. The user can still copy it.

- [ ] **Step 3: Playwright smoke**

1. Open Settings → clear the AI key in localStorage (or set `window.BS_CONFIG.ai = {}` in console). Reload.
2. Open Scene Zoom — middle column shows "No AI key configured" copy. Chat is disabled.
3. Restore key. Reload. Everything works.

- [ ] **Step 4: Suggested commit**

```bash
git add scenezoom.js
git commit -m "Scene Zoom: polish — no-key state + malformed Fountain fallback"
```

---

## Task 20: Responsive collapse below 980px

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Verify the breakpoint already added in Task 5 works**

The Task 5 CSS already has:

```css
@media (max-width: 980px) {
  .sz-grid { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr 1fr; }
  ...
}
```

This stacks the columns vertically. At very narrow widths each column is short but scrollable.

- [ ] **Step 2: Playwright smoke**

1. Open Scene Zoom on a scene with full analysis + candidate + chat.
2. Resize browser to ~960px wide.
3. Columns stack vertically. Each is independently scrollable. Buttons remain reachable.
4. Switch tabs in the scene column — still works.

If the stacked layout feels cramped, tighten paddings inside the media query:

```css
@media (max-width: 980px) {
  .sz-grid { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr 1fr; }
  .sz-col { border-right: none; border-bottom: 1px solid var(--border); min-height: 220px; }
  .sz-col:last-child { border-bottom: none; }
  .sz-body { padding: 8px 10px; }
}
```

- [ ] **Step 3: Suggested commit (if you tightened paddings)**

```bash
git add styles.css
git commit -m "Scene Zoom: responsive polish at narrow widths"
```

If no changes were needed, skip.

---

## Task 21: HANDOFF.md + Option-A correction

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Update HANDOFF.md**

Replace the section "## What's NOT shipped (open items)" to remove the now-obsolete Option-A/B decision and add Scene Zoom:

```markdown
## What's NOT shipped (open items)

- **Per-author Track Changes redlines** — log + drawer viewer exist; no inline colored diffs in the script. ~200 LOC remaining.
- **Slideshow read mode** (#29 from original picker) — auto-advance scene-by-scene fullscreen. Never implemented.
- **Track-changes viewer drawer** — could use density polish.

## Shipped this session

- **Scene Zoom** — per-scene focused workspace with BMOC structural analysis (Peter Russell's Beginning / Middle / Obstacle / Climax), persistent AI chat, AI rewrite with line-level diff, and swap-into-script flow with automatic snapshot. Entry points: right-click in editor + 🔍 button on every scene card in Beat Board / Cards view. See `docs/superpowers/specs/2026-05-26-scene-zoom-design.md` and `docs/superpowers/plans/2026-05-26-scene-zoom.md`.

## Future migration

- **Firebase Functions proxy for the Anthropic API key** (Option B from prior session). Currently shipping Option A (key embedded in `config.live.js` with monthly spend cap + rotation). Move to a server proxy when spend gets noisy enough that public exposure is a real problem.
```

Update the last-updated date at the bottom of the file.

- [ ] **Step 2: Suggested commit**

```bash
git add HANDOFF.md
git commit -m "HANDOFF: document Scene Zoom + remove obsolete Option A/B decision"
```

---

## Task 22: Full Playwright verification pass

**Files:** (no changes — verification only)

- [ ] **Step 1: Golden-path verification**

Using Playwright MCP at `http://localhost:5173`:

1. Create or open a project with at least 5 scenes.
2. Right-click in editor → Scene Zoom opens → close.
3. Open Beat Board → 🔍 on a card → Scene Zoom opens on that scene → close.
4. Inside Scene Zoom: `Run BMOC analysis` → streams → loaded view appears.
5. Send a chat message → AI responds.
6. Click `Generate rewrite` → Diff tab auto-opens, streams in.
7. Toggle Original / Diff / Candidate tabs — each renders correctly.
8. `Swap candidate into script` → confirms, swaps, toast appears, modal updates.
9. Open Snapshots drawer → `Pre-Scene-Zoom: <slug>` snapshot exists.
10. Reload → re-open Scene Zoom on the same scene → analysis + chat persist.

Screenshot each major state. Confirm no console errors throughout.

- [ ] **Step 2: Edge-case verification**

1. Clear the AI key → reload → open Scene Zoom → no-key state renders, chat disabled.
2. Rename a scene heading slug after running BMOC → re-open Scene Zoom on that scene → re-anchor either succeeds or you get the new-scene empty state (no crash).
3. Switch theme manuscript → midnight → court inside Scene Zoom — no broken contrast.
4. Resize to ~960px — three columns stack, all interactive.

- [ ] **Step 3: Verify no regressions**

Run the existing app flows quickly:

- Editor typing + autosave still works.
- Cards / Beat Board / Stats / Timeline views still render.
- Existing AI ✨ buttons on beats and scene cards still work.
- Snapshots, comments, find/replace untouched.

- [ ] **Step 4: Suggested final commit + deploy decision**

```bash
git status            # confirm nothing surprising staged
git log --oneline -25 # review the task-by-task commit history
```

Ask the user whether to:
- Merge to `main` and deploy to a Firebase preview channel first (`firebase hosting:channel:deploy scene-zoom --expires 30d`).
- Or deploy directly to live (`firebase deploy --only hosting`).
- Or leave on `sprints` until they verify more.

Do not deploy without explicit user confirmation (CLAUDE.md #4).

---

## Self-Review

**Spec coverage:** Each section of `2026-05-26-scene-zoom-design.md` maps to one or more tasks:
- §3a entry — Tasks 17, 18 ✓
- §3b modal — Tasks 4, 5, 6 ✓
- §3c analyze — Tasks 9, 10, 11 ✓
- §3d chat — Tasks 12, 13 ✓
- §3e rewrite — Task 14 ✓
- §3f swap — Task 16 ✓
- §3g close — Task 6 ✓
- §4 data model — Tasks 2, 3 ✓
- §5 snapshots integration — Task 16 ✓
- §6 prompts — Tasks 9, 10, 13, 14 ✓
- §7 diff — Task 15 ✓
- §8a markup — Task 4 ✓
- §8b CSS — Tasks 5, 17, 20 ✓
- §8c script — Tasks 1, 2, 3, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 19 ✓
- §8d wiring — Tasks 6 (bind), 17, 18 ✓
- §9 script load order — Task 1 ✓
- §10 failure modes — Tasks 10 (parse fail), 14 (Fountain fence), 16 (re-anchor on swap), 19 (no key, malformed) ✓
- §11 testing checklist — Task 22 ✓

**Placeholder scan:** No "TBD", "TODO", "implement later", or vague-error-handling steps. Every code block is complete. The one external "search and decide" step (Task 17 Step 1) is reasonable: it adapts to whichever context-menu state the editor is in today.

**Type / signature consistency:**
- `_runAnalyze`, `_runRewrite`, `_sendChat` — all match across tasks ✓
- `_getSceneRecord(sceneId, createIfMissing)` — consistent ✓
- `_renderSceneCol(tab)`, `_renderBmocCol(state?)`, `_renderChatCol()` — names stable ✓
- `_diffLines(a, b)` returns ops shape `{ type, text, kind }` — `_renderSceneLines` reads `.kind` and `.text` ✓
- `analysis` shape in storage matches spec §4b ✓
- `candidate` shape in storage matches spec §4b corrected (no pre-computed diff) ✓

**Spec requirement → task:** All accounted for. The `lastSeenAnchorIdx` field from spec §4b is written in Task 3 `open()` but never read explicitly — it's reserved for future re-anchor tiebreaking per spec §10. Acceptable to leave wired-in-but-unread.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-scene-zoom.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
