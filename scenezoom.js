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

  function open(anchorLineIdx) {
    console.log("SceneZoom.open", anchorLineIdx);
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
