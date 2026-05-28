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

  function loadDictForProject(pid) {
    projectId = pid;
    const meta = Storage.getMeta(pid);
    language = (meta && meta.language) || "en";

    // Lazy-load bundled wordlist on first use.
    if (!dict) {
      const raw = language === "es" ? (typeof DICT_ES_RAW === "string" ? DICT_ES_RAW : null)
                                    : (typeof DICT_EN_RAW === "string" ? DICT_EN_RAW : null);
      if (raw) {
        const payload = LZString.decompressFromBase64(raw);
        dict = new Set(payload.split("\n").filter(Boolean));
        loaded = true;
      }
    }

    // Load per-project custom dict
    const stored = Storage.getProofDict(pid);
    customDict = new Set(stored.words || []);
    sessionIgnore = new Set();

    // Auto-seed: character cues + Bible names + scene proper nouns
    seedCustomDict();
  }

  function seedCustomDict() {
    const editor = document.getElementById("editor");
    if (!editor) return;
    let added = 0;

    // 1. Character cue names (strip parens)
    editor.querySelectorAll("div[data-type='character']").forEach(d => {
      const name = (d.textContent || "").replace(/\s*\(.*\)\s*$/, "").trim();
      if (name && !customDict.has(name)) { customDict.add(name); added++; }
    });

    // 2. Bible character names
    if (window.Bible && typeof Bible.allCharacters === "function") {
      Bible.allCharacters().forEach(c => {
        const name = (c.name || "").trim();
        if (name && !customDict.has(name)) { customDict.add(name); added++; }
      });
    }

    // 3. Scene-heading proper nouns — any ALL-CAPS token of length >= 2 that
    //    isn't already in the base dict. Skips obvious words (INT, EXT, DAY, etc).
    const skipTokens = new Set(["INT","EXT","EST","DAY","NIGHT","CONTINUOUS","MORNING","EVENING","LATER","SAME","DUSK","DAWN","AFTERNOON","INT.","EXT.","I/E","INT/EXT"]);
    editor.querySelectorAll("div[data-type='scene']").forEach(d => {
      const text = (d.textContent || "").replace(/^\./, "");
      text.split(/[\s\-\/.,()]+/).forEach(tok => {
        const t = tok.trim();
        if (!t || t.length < 2) return;
        if (skipTokens.has(t.toUpperCase())) return;
        if (!/^[A-Z][A-Z'-]+$/.test(t)) return; // must be ALL CAPS
        if (!customDict.has(t)) { customDict.add(t); added++; }
      });
    });

    // Persist if seed grew the dict
    if (added > 0) {
      Storage.setProofDict(projectId, { words: Array.from(customDict), ignored: [] });
    }
  }

  function isKnown(word) {
    if (!word) return true;
    if (sessionIgnore.has(word)) return true;
    // Custom dict honors original case (cues are uppercase). Match raw and uppercase.
    if (customDict.has(word) || customDict.has(word.toUpperCase())) return true;
    if (dict && dict.has(word.toLowerCase())) return true;
    return false;
  }

  const SKIP_TYPES = new Set(["scene", "character", "transition", "parenthetical", "note", "section", "synopsis"]);

  const WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]*/g;

  function tokenize(line) {
    if (!line) return [];
    const type = line.dataset.type;
    if (SKIP_TYPES.has(type)) return [];
    const text = line.textContent || "";
    const out = [];
    let m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text)) !== null) {
      out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function setLanguage(lang) { language = lang; }
  function scheduleLivePass() {}
  function suggestionsFor(_word) { return []; }
  function addToDict(_word) {}
  function ignoreForSession(_word) {}

  return {
    bind, loadDictForProject, setLanguage,
    scheduleLivePass, suggestionsFor, addToDict, ignoreForSession, isKnown,
    tokenize,
    // introspection for tests:
    _state() { return { language, loaded, customSize: customDict.size, dictSize: dict?.size || 0 }; },
  };
})();

window.Proof = Proof;
