"use strict";
/* =============================================================================
 * BESTSCREEN SCENE ZOOM — per-scene BMOC analysis + chat + AI rewrite + diff
 *
 * Exposes window.SceneZoom = { open, close, render, bind }
 * Persists per-scene state under bestscreen.v3.p.<id>.scenezoom
 * ============================================================================= */

const SceneZoom = (() => {
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

  function _djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  function _walkToHeading(anchorLineIdx) {
    const editor = document.getElementById("editor");
    if (!editor) return -1;
    const lines = Array.from(editor.children);
    for (let i = Math.min(anchorLineIdx, lines.length - 1); i >= 0; i--) {
      if (lines[i] && lines[i].dataset.type === "scene") return i;
    }
    return -1;
  }

  function _findNextHeadingIdx(headingIdx) {
    const editor = document.getElementById("editor");
    const lines = Array.from(editor.children);
    for (let i = headingIdx + 1; i < lines.length; i++) {
      if (lines[i].dataset.type === "scene") return i;
    }
    return lines.length;
  }

  function _getSceneLines(headingIdx) {
    const editor = document.getElementById("editor");
    const lines = Array.from(editor.children);
    const end = _findNextHeadingIdx(headingIdx);
    return lines.slice(headingIdx, end).map(el => ({
      type: el.dataset.type || "action",
      text: el.textContent || "",
    }));
  }

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

  // Re-anchor a saved sceneId by replaying the fingerprint across all current
  // headings; falls back to slug-only match if no exact fingerprint hits.
  function _reanchorSceneId(sceneId) {
    const blob = _loadBlob();
    const rec = blob?.scenes?.[sceneId];
    if (!rec) return -1;
    const editor = document.getElementById("editor");
    const lines = Array.from(editor.children);

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].dataset.type !== "scene") continue;
      if (_getSceneIdForAnchor(i) === sceneId) return i;
    }
    const target = (rec.slug || "").toUpperCase();
    if (target) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].dataset.type === "scene" && lines[i].textContent.trim().toUpperCase() === target) return i;
      }
    }
    return -1;
  }

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
    const el = document.getElementById("sz-slug");
    if (el) el.textContent = rec?.slug || "—";
  }

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
    render();
    _show();
  }
  function close() { _hide(); }

  function render() {
    if (!_currentSceneId) return;
    _renderSceneCol("original");
    const bmocEl = document.getElementById("sz-bmoc-body");
    const chatEl = document.getElementById("sz-chat-body");
    if (bmocEl) bmocEl.innerHTML = `<div class="bmoc-empty">Run BMOC analysis to see the Beat Card and failure-mode scan.</div>`;
    if (chatEl) chatEl.innerHTML = `<div class="sz-chat-empty">Run analysis first to start a conversation.</div>`;
  }

  function _typeToClass(type) {
    const t = type === "parenthetical" ? "paren" : (type || "action");
    return "sl sl-" + t;
  }

  function _renderSceneLines(targetEl, scenelines, diffOps) {
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
    (scenelines || []).forEach(l => {
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
    const body = document.getElementById("sz-scene-body");
    if (!body) return;

    const anchorIdx = _reanchorSceneId(_currentSceneId);
    if (anchorIdx < 0) {
      body.innerHTML = `<div class="bmoc-empty">Couldn't re-locate this scene in the current script (slug may have changed).</div>`;
      return;
    }
    const original = _getSceneLines(anchorIdx);

    document.querySelectorAll("#sz-tabs .sz-tab").forEach(t => {
      const k = t.dataset.tab;
      t.classList.toggle("active", k === tab);
      if (k === "diff" || k === "candidate") {
        t.disabled = !rec.candidate;
      }
    });

    const meta = document.getElementById("sz-tab-meta");

    if (tab === "original" || !rec.candidate) {
      _renderSceneLines(body, original);
      if (meta) meta.textContent = "";
    } else if (tab === "candidate") {
      const candidateLines = _parseFountainLines(rec.candidate.fountainText);
      _renderSceneLines(body, candidateLines);
      if (meta) meta.textContent = "Candidate · " + _agoString(rec.candidate.createdAt);
    } else if (tab === "diff") {
      const candidateLines = _parseFountainLines(rec.candidate.fountainText);
      const ops = _diffLines(original, candidateLines);
      _renderSceneLines(body, null, ops);
      if (meta) meta.textContent = "Diff vs current original · " + _agoString(rec.candidate.createdAt);
    }

    const swap = document.getElementById("sz-swap");
    const discard = document.getElementById("sz-discard");
    if (swap) swap.disabled = !rec.candidate;
    if (discard) discard.disabled = !rec.candidate;
  }

  // Stubs — replaced in Task 14 (parser) and Task 15 (Myers diff).
  function _parseFountainLines(text) {
    return (text || "").split("\n").map(line => ({ type: "action", text: line }));
  }
  function _diffLines(a, b) {
    return [...a.map(l => ({ ...l, kind: "same" })), ...b.map(l => ({ ...l, kind: "add" }))];
  }
  function _agoString(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    return Math.floor(s / 3600) + "h ago";
  }

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
    }, true);

    document.querySelectorAll("#sz-tabs .sz-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        _renderSceneCol(btn.dataset.tab);
      });
    });
  }

  return { open, close, render, bind };
})();

if (typeof window !== "undefined") window.SceneZoom = SceneZoom;
