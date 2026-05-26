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
    console.log("SceneZoom: opened sceneId", sceneId, "at headingIdx", headingIdx);
  }
  function close() {
    const el = document.getElementById("modal-scenezoom");
    if (el) el.classList.remove("open");
    _currentSceneId = null;
  }
  function render() { /* filled in Task 6+ */ }
  function bind() {
    window.addEventListener("hashchange", _invalidateCache);
  }

  return { open, close, render, bind };
})();

if (typeof window !== "undefined") window.SceneZoom = SceneZoom;
