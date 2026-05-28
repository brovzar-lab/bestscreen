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

/* ---------------------------------------------------------------------------
 * lz-string decompressFromBase64 — inlined from pieroxy/lz-string (MIT).
 * https://github.com/pieroxy/lz-string  v1.5.0 — only the decompress path.
 * ------------------------------------------------------------------------- */
const LZString = (() => {
  const keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const baseReverseDic = {};
  function getBaseValue(alphabet, character) {
    if (!baseReverseDic[alphabet]) {
      baseReverseDic[alphabet] = {};
      for (let i = 0; i < alphabet.length; i++) baseReverseDic[alphabet][alphabet.charAt(i)] = i;
    }
    return baseReverseDic[alphabet][character];
  }
  function _decompress(length, resetValue, getNextValue) {
    const dictionary = [];
    let enlargeIn = 4, dictSize = 4, numBits = 3, entry = "", result = [];
    let bits, resb, maxpower, power;
    const data = { val: getNextValue(0), position: resetValue, index: 1 };
    for (let i = 0; i < 3; i++) dictionary[i] = i;
    bits = 0; maxpower = Math.pow(2, 2); power = 1;
    while (power !== maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
      bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
    }
    let next = bits, c;
    switch (next) {
      case 0: bits = 0; maxpower = Math.pow(2, 8); power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
          bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
        } c = String.fromCharCode(bits); break;
      case 1: bits = 0; maxpower = Math.pow(2, 16); power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
          bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
        } c = String.fromCharCode(bits); break;
      case 2: return "";
    }
    dictionary[3] = c; let w = c; result.push(c);
    while (true) {
      if (data.index > length) return "";
      bits = 0; maxpower = Math.pow(2, numBits); power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
        bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
      }
      switch (c = bits) {
        case 0: bits = 0; maxpower = Math.pow(2, 8); power = 1;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
            bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
          }
          dictionary[dictSize++] = String.fromCharCode(bits); c = dictSize - 1; enlargeIn--; break;
        case 1: bits = 0; maxpower = Math.pow(2, 16); power = 1;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
            bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
          }
          dictionary[dictSize++] = String.fromCharCode(bits); c = dictSize - 1; enlargeIn--; break;
        case 2: return result.join("");
      }
      if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
      if (dictionary[c]) entry = dictionary[c];
      else { if (c === dictSize) entry = w + w.charAt(0); else return null; }
      result.push(entry);
      dictionary[dictSize++] = w + entry.charAt(0); enlargeIn--;
      w = entry;
      if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
    }
  }
  function decompressFromBase64(input) {
    if (input == null) return "";
    if (input === "") return null;
    return _decompress(input.length, 32, (i) => getBaseValue(keyStrBase64, input.charAt(i)));
  }
  return { decompressFromBase64 };
})();

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
