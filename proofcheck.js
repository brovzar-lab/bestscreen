"use strict";
/* =============================================================================
 * BESTSCREEN PROOFCHECK — Phase 1 (live spelling)
 *
 * Layers: bundled wordlists + per-project custom dict + live underline +
 * Damerau-Levenshtein suggestions. Phases 2 (local rules) and 3 (AI deep)
 * land later.
 *
 * Exposes window.Proof.
 * ============================================================================= */

const Proof = (() => {
  let language = "en";          // "en" | "es"
  let dict = null;              // Set<string> — bundled wordlist (lowercase)
  let customDict = new Set();   // per-project additions (uppercase preserved for cues)
  let sessionIgnore = new Set();
  let loaded = false;
  let projectId = null;
  let debounceTimer = null;
  const DEBOUNCE_MS = 400;

  // Placeholder — real implementations follow in later tasks
  function bind() {}
  function loadDictForProject(pid) { projectId = pid; }
  function setLanguage(lang) { language = lang; }
  function scheduleLivePass() {}
  function suggestionsFor(_word) { return []; }
  function addToDict(_word) {}
  function ignoreForSession(_word) {}

  return {
    bind, loadDictForProject, setLanguage,
    scheduleLivePass, suggestionsFor, addToDict, ignoreForSession,
    // introspection for tests:
    _state() { return { language, loaded, customSize: customDict.size, dictSize: dict?.size || 0 }; },
  };
})();

window.Proof = Proof;
