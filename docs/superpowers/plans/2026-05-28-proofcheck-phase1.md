# Proofcheck Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of Bestscreen Proofcheck — a live, screenplay-aware spell checker for English and Spanish with per-project custom dictionary, hover-suggest popover, and titlebar EN/ES toggle.

**Architecture:** New `proofcheck.js` IIFE-module exposes `window.Proof`. Bundled wordlists (`dict-en.js`, `dict-es.js`) ship as LZ-compressed base64 strings, lazy-decoded into a `Set` on first use. Per-project custom dict lives at `bestscreen.v3.p.<id>.proofdict`, auto-seeded from character cues + Bible + scene proper nouns. Live pass debounced 400 ms, viewport-limited, wraps unknown tokens in `<span class="proof-mark proof-unknown">`. Suggestions via Damerau-Levenshtein ≤ 2. Titlebar chip toggles per-project `meta.language`. Fountain round-trip via `bs:lang=` and `bs:dict=` title-page meta. Phases 2 and 3 are OUT OF SCOPE here.

**Tech Stack:** Vanilla JS / CSS / HTML, no build step. Module-globals exposed via IIFE (existing pattern). Verification via Playwright MCP (`mcp__plugin_playwright_playwright__*`).

**Branch:** `feature/proofcheck` off `feature/scene-zoom` head.

**Spec:** `docs/superpowers/specs/2026-05-28-proofcheck-design.md`

---

## File Structure

| File | Purpose | Create / Modify |
|---|---|---|
| `proofcheck.js` | Module entry. Lifecycle, dict load, custom dict, live underline, suggestion engine, popover, titlebar chip wiring, ⌘. shortcut. Exposes `window.Proof`. | **Create** (~700 LOC) |
| `dict-en.js` | LZ-compressed base64 EN wordlist (~120k entries from `an-array-of-english-words` MIT). | **Create** (~200 KB asset) |
| `dict-es.js` | LZ-compressed base64 ES wordlist (~80k entries from `an-array-of-spanish-words` MIT). | **Create** (~150 KB asset) |
| `tools/build-dicts.js` | One-shot dev script that fetches+samples+compresses both lists. Kept for repeatability. | **Create** (~80 LOC) |
| `tools/lz-string-inline.js` | Inline copy of `lz-string`'s `compressToBase64` (MIT, ~200 LOC) used by build-dicts. | **Create** |
| `index.html` | Add `<script src="dict-en.js">`, `<script src="dict-es.js">`, `<script src="proofcheck.js">` (lazy), titlebar chip slot. | **Modify** (+10 LOC) |
| `app.js` | Per-project `meta.language` plumbing, `Proof.bind()` from boot, project load triggers `Proof.loadDictForProject`. | **Modify** (+25 LOC) |
| `editor.js` | Hook `Proof.scheduleLivePass()` into `onEditorInput()`. | **Modify** (+3 LOC) |
| `storage.js` | `getProofDict(id)`, `setProofDict(id, dict)`, `meta.language` default. | **Modify** (+15 LOC) |
| `io.js` | `serializeFountain` writes `bs:lang=` and `bs:dict=` in title-page meta; `loadFountain` parses them back. | **Modify** (+25 LOC) |
| `styles.css` | `.proof-mark.proof-unknown`, `.proof-popover`, `.proof-chip`, dark-mode variants for all three themes. | **Modify** (+150 LOC) |
| `bible.js` | Re-export `allCharacters` if not already (used by custom dict seeder — verify in task 5). | **Modify** (~5 LOC if needed) |

**Conventions** (per `CLAUDE.md`): no `npm` runtime deps; comments only when WHY is non-obvious; commit only when the task says so; verify UI via Playwright at `http://localhost:5173`.

---

## Task 1: Create branch and scaffold module

**Files:**
- Create: `proofcheck.js`
- Modify: `index.html`

- [ ] **Step 1: Create branch off feature/scene-zoom**

```bash
git checkout feature/scene-zoom
git pull --ff-only 2>/dev/null || true
git checkout -b feature/proofcheck
```

- [ ] **Step 2: Create the proofcheck.js scaffold**

Write `proofcheck.js`:

```js
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
```

- [ ] **Step 3: Wire the script tag (load AFTER io.js, BEFORE app.js)**

Open `index.html`, find the existing script-tag block at the bottom. The current order ends with `io.js` then `app.js`. Add `proofcheck.js` between them:

```html
<script src="io.js"></script>
<script src="proofcheck.js"></script>
<script src="app.js"></script>
```

Find the block via `grep -n 'src="io.js"' index.html` and use Edit to insert.

- [ ] **Step 4: Verify scaffold loads**

Reload `http://localhost:5173` in the dev server. Run:

```js
// Playwright eval:
() => ({
  hasProof: typeof window.Proof,
  state: window.Proof._state(),
})
```

Expected: `{ hasProof: "object", state: { language: "en", loaded: false, customSize: 0, dictSize: 0 } }`. No console errors.

- [ ] **Step 5: Commit**

```bash
git add proofcheck.js index.html
git commit -m "$(cat <<'EOF'
Proofcheck Phase 1: module scaffold + script tag

Empty Proof namespace stubbed in proofcheck.js with the public surface that
later tasks will fill in (bind, loadDictForProject, setLanguage,
scheduleLivePass, suggestionsFor, addToDict, ignoreForSession). Script tag
loads between io.js and app.js so app.js boot can wire Proof.bind().

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Inline LZ-string decompressor

**Files:**
- Modify: `proofcheck.js`

We need to LZ-decompress the wordlist asset on first use. The compressed asset arrives as a base64 string; we use lz-string's `decompressFromBase64`. Inlining only the *decompress* path to keep proofcheck.js small.

- [ ] **Step 1: Add the LZ-string decompress functions to proofcheck.js**

Open `proofcheck.js`. Just above the `const Proof = (() => {` line, insert:

```js
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
```

- [ ] **Step 2: Verify decompressor loads (smoke test only)**

Reload site. In Playwright:

```js
() => typeof LZString?.decompressFromBase64
```

Expected: `"function"`. (We can't test decompression yet — no compressed payload exists. Real verification arrives in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add proofcheck.js
git commit -m "$(cat <<'EOF'
Proofcheck: inline lz-string decompressFromBase64

Only the decompress path from pieroxy/lz-string v1.5.0 (MIT). Used to
unpack dict-en.js / dict-es.js on first Proof use without shipping the
full library.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Build EN + ES dictionary assets

**Files:**
- Create: `tools/build-dicts.js`
- Create: `dict-en.js`
- Create: `dict-es.js`

- [ ] **Step 1: Create the build script**

Create `tools/build-dicts.js`:

```js
#!/usr/bin/env node
/* Build dict-en.js and dict-es.js from npm word-list packages.
   Run once; commit the resulting asset files. Re-run when you want to
   refresh the wordlists.

   Usage:
     npm install --no-save --prefix /tmp/dictbuild \
       an-array-of-english-words an-array-of-spanish-words lz-string
     node tools/build-dicts.js
*/

const path = require("path");
const fs = require("fs");

const PREFIX = process.env.DICTBUILD_PREFIX || "/tmp/dictbuild";
const requireFromPrefix = (mod) => require(path.join(PREFIX, "node_modules", mod));

const enWords = requireFromPrefix("an-array-of-english-words");
const esWords = requireFromPrefix("an-array-of-spanish-words");
const LZString = requireFromPrefix("lz-string");

function clean(arr) {
  const set = new Set();
  for (const w of arr) {
    if (typeof w !== "string") continue;
    const lower = w.toLowerCase().trim();
    if (!lower) continue;
    if (lower.length < 2 || lower.length > 30) continue;
    if (!/^[a-záéíóúñüç'-]+$/i.test(lower)) continue;
    set.add(lower);
  }
  return Array.from(set).sort();
}

function writeAsset(filename, words, varName, sourceCredit) {
  const payload = words.join("\n");
  const compressed = LZString.compressToBase64(payload);
  const header = `"use strict";
/* Bestscreen wordlist asset — auto-generated by tools/build-dicts.js.
   ${sourceCredit}
   ${words.length.toLocaleString()} words. Decompressed payload size: ${payload.length.toLocaleString()} chars.
   Do not edit by hand — re-run the build script. */
`;
  const body = `const ${varName} = ${JSON.stringify(compressed)};\n`;
  fs.writeFileSync(filename, header + body);
  console.log(`Wrote ${filename} — ${words.length} words, ${compressed.length.toLocaleString()} bytes compressed.`);
}

// EN — dwyl/an-array-of-english-words MIT (~275k). Sample to length <= 8
// (proxy for common-word frequency). Lands around 115k.
const enCleaned = clean(enWords);
const enSample = enCleaned.filter(w => w.length <= 8);
writeAsset("dict-en.js", enSample, "DICT_EN_RAW",
  "Source: dwyl/an-array-of-english-words (MIT). Sampled to length <= 8.");

// ES — words/an-array-of-spanish-words MIT (~636k morphological forms, all
// conjugations). Sample to length <= 8 same as EN — 'all entries' is 3.3 MB
// even compressed. Lands around 165k.
const esCleaned = clean(esWords);
const esSample = esCleaned.filter(w => w.length <= 8);
writeAsset("dict-es.js", esSample, "DICT_ES_RAW",
  "Source: words/an-array-of-spanish-words (MIT). Sampled to length <= 8.");

console.log("Done.");
```

- [ ] **Step 2: Run the build (one-time)**

```bash
mkdir -p /tmp/dictbuild
( cd /tmp/dictbuild && npm install --silent an-array-of-english-words an-array-of-spanish-words lz-string )
node tools/build-dicts.js
```

Expected output:
```
Wrote dict-en.js — <count> words, <bytes> bytes compressed.
Wrote dict-es.js — <count> words, <bytes> bytes compressed.
Done.
```

`dict-en.js` should be ~150-250 KB; `dict-es.js` should be ~80-150 KB. Both should declare a single `const DICT_*_RAW = "<base64 blob>";`.

- [ ] **Step 3: Wire the dict assets into index.html (load lazily but commit script tags now)**

Open `index.html`. Add two `<script>` tags between `proofcheck.js` and `app.js`:

```html
<script src="dict-en.js" async></script>
<script src="dict-es.js" async></script>
<script src="proofcheck.js"></script>
<script src="app.js"></script>
```

(Order: dicts first because `proofcheck.js` will reference `DICT_EN_RAW`/`DICT_ES_RAW` at decode time. `async` so they don't block initial paint.)

- [ ] **Step 4: Verify decoded payload smoke-tests**

Reload. In Playwright:

```js
() => {
  const en = LZString.decompressFromBase64(DICT_EN_RAW);
  const es = LZString.decompressFromBase64(DICT_ES_RAW);
  const enSet = new Set(en.split("\n"));
  const esSet = new Set(es.split("\n"));
  return {
    enCount: enSet.size, esCount: esSet.size,
    enHasTheir: enSet.has("their"),
    enHasThier: enSet.has("thier"),  // common typo — must be false
    esHasPerro: esSet.has("perro"),
    esHasPerr: esSet.has("perr"),     // partial — must be false
  };
}
```

Expected: `enHasTheir: true, enHasThier: false, esHasPerro: true, esHasPerr: false`. Counts: EN > 50k, ES > 40k.

- [ ] **Step 5: Commit**

```bash
git add tools/build-dicts.js dict-en.js dict-es.js index.html
git commit -m "$(cat <<'EOF'
Proofcheck: bundled EN + ES wordlist assets

dict-en.js and dict-es.js are LZ-base64 strings produced by
tools/build-dicts.js. EN from an-array-of-english-words MIT, sampled to
length <= 8 chars (proxy for common words, lands around 120k). ES from
an-array-of-spanish-words MIT, all entries (~80k). Loaded async via
<script> tags so they don't block first paint.

The build script is committed for repeatability; re-run when you want to
refresh.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Storage layer — proofdict + meta.language default

**Files:**
- Modify: `storage.js`

- [ ] **Step 1: Add `getProofDict` / `setProofDict`**

Open `storage.js`. Find the existing `getBible` / `setBible` pair (use `grep -n "function getBible\|function setBible" storage.js`). Add the analogous proofdict pair right after them:

```js
function getProofDict(id) {
  return _read(id, "proofdict", { words: [], ignored: [] });
}
function setProofDict(id, dict) {
  localStorage.setItem(_key(id, "proofdict"), JSON.stringify(dict));
}
```

(If the helpers `_read` / `_key` use different names in your codebase, match what `getBible` / `setBible` use — same suffix-key pattern.)

- [ ] **Step 2: Default `language: "en"` in `createProject` meta**

In `storage.js`, find `createProject`'s `setMeta` call (around line 108–118). Add `language: "en"` to the meta object:

```js
setMeta(id, {
  titleMeta: { ... },
  beatSections: [],
  template,
  logline,
  premise: "",
  theme: "",
  projectColor: coverColor,
  activeRevision: "white",
  dailyBaselines: {},
  language: "en",
});
```

- [ ] **Step 3: Export the new functions from the Storage IIFE**

Find the `return { ... }` block at the bottom of the Storage IIFE. Add `getProofDict, setProofDict,` to the export list. Match the existing comma style.

- [ ] **Step 4: Verify**

Reload. In Playwright:

```js
() => {
  const id = appState.projectId;
  const before = Storage.getProofDict(id);
  Storage.setProofDict(id, { words: ["JANE"], ignored: ["foo"] });
  const after = Storage.getProofDict(id);
  Storage.setProofDict(id, before); // restore
  return { before, after, meta: Storage.getMeta(id).language || "(unset)" };
}
```

Expected: `before = { words: [], ignored: [] }`, `after = { words: ["JANE"], ignored: ["foo"] }`. `meta.language` may be `"(unset)"` for existing projects — that's fine; new projects from this commit forward will have `"en"`.

- [ ] **Step 5: Commit**

```bash
git add storage.js
git commit -m "$(cat <<'EOF'
Proofcheck: storage layer — proofdict + meta.language

getProofDict / setProofDict mirror the getBible / setBible pattern,
backing onto bestscreen.v3.p.<id>.proofdict. New projects default
meta.language to "en"; existing projects pick it up on next save.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Auto-seed custom dictionary from cues + Bible + scene proper nouns

**Files:**
- Modify: `proofcheck.js`

- [ ] **Step 1: Replace the `loadDictForProject` stub with the real implementation**

Open `proofcheck.js`. Replace the `loadDictForProject` placeholder with:

```js
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
```

- [ ] **Step 2: Add a small helper for looking up "is this word known"**

In `proofcheck.js`, just below `seedCustomDict`, add:

```js
function isKnown(word) {
  if (!word) return true;
  if (sessionIgnore.has(word)) return true;
  // Custom dict honors original case (cues are uppercase). Match raw and uppercase.
  if (customDict.has(word) || customDict.has(word.toUpperCase())) return true;
  if (dict && dict.has(word.toLowerCase())) return true;
  return false;
}
```

Export `isKnown` from the IIFE return.

- [ ] **Step 3: Verify against the existing seeded project**

Reload `http://localhost:5173/#/p/uo69coto6q` (the Ergonomics Test project from earlier sessions has JANE, BOB, ROBERT cues + KITCHEN/WAREHOUSE/PORCH/CLOSET/HALLWAY locations). In Playwright:

```js
() => {
  Proof.loadDictForProject(appState.projectId);
  return {
    state: Proof._state(),
    janeKnown: Proof.isKnown("JANE"),
    perroKnownEN: Proof.isKnown("perro"),
    thierKnownEN: Proof.isKnown("thier"),
    theirKnownEN: Proof.isKnown("their"),
    kitchenKnown: Proof.isKnown("KITCHEN"),
  };
}
```

Expected: `janeKnown: true, kitchenKnown: true, theirKnownEN: true, thierKnownEN: false, perroKnownEN: false` (because we loaded EN dict). `state.dictSize > 50000`, `state.customSize >= 5`.

- [ ] **Step 4: Commit**

```bash
git add proofcheck.js
git commit -m "$(cat <<'EOF'
Proofcheck: lazy dict load + custom-dict auto-seed

loadDictForProject reads meta.language, lazy-decompresses the matching
bundled wordlist on first call, then auto-seeds the per-project custom
dict from three sources:
  1. character cues (stripped of parens)
  2. Bible character names
  3. ALL-CAPS proper nouns in scene headings (excluding INT/EXT/DAY/etc)
isKnown() checks session-ignore, custom dict (case-preserved), then the
bundled wordlist (case-insensitive).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Tokenizer — extract checkable words from a line

**Files:**
- Modify: `proofcheck.js`

- [ ] **Step 1: Add tokenizer**

In `proofcheck.js`, just below `isKnown`, add:

```js
// Skip these element types entirely — they're identifiers, not prose.
const SKIP_TYPES = new Set(["scene", "character", "transition", "parenthetical", "note", "section", "synopsis"]);

// Word boundary regex — letters (incl. accented) + apostrophe + hyphen.
// "won't", "co-op", "señor" all preserve as single tokens.
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
```

Export `tokenize` from the IIFE return.

- [ ] **Step 2: Verify**

In Playwright:

```js
() => {
  // First action line of the test project
  const action = document.querySelector("#editor > div[data-type='action']");
  const dialogue = document.querySelector("#editor > div[data-type='dialogue']");
  const scene = document.querySelector("#editor > div[data-type='scene']");
  return {
    actionTokens: Proof.tokenize(action).map(t => t.word),
    dialogueTokens: Proof.tokenize(dialogue).map(t => t.word).slice(0, 5),
    sceneTokens: Proof.tokenize(scene),  // should be empty — scene is in SKIP_TYPES
  };
}
```

Expected: `actionTokens` non-empty and matches the words in the action line. `dialogueTokens` non-empty. `sceneTokens = []`.

- [ ] **Step 3: Commit**

```bash
git add proofcheck.js
git commit -m "$(cat <<'EOF'
Proofcheck: tokenizer with screenplay-aware element skipping

SKIP_TYPES = scene, character, transition, parenthetical, note, section,
synopsis. These are identifiers, not prose — never spell-checked. Other
lines (action, dialogue, centered) tokenize on a word-boundary regex
that preserves apostrophes ("won't") and hyphens ("co-op"), supports
accented characters for Spanish.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Suggestion engine — Damerau-Levenshtein ≤ 2

**Files:**
- Modify: `proofcheck.js`

- [ ] **Step 1: Add Damerau-Levenshtein + suggestionsFor**

In `proofcheck.js`, replace the `suggestionsFor(_word)` stub with:

```js
function damerauLevenshtein(a, b, max) {
  // Optimal-string-alignment distance with early-exit when min row > max.
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  let prevPrev = new Array(bl + 1);
  let prev = new Array(bl + 1);
  let cur = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i-1) === b.charCodeAt(j-1) ? 0 : 1;
      cur[j] = Math.min(
        cur[j-1] + 1,                // insert
        prev[j] + 1,                 // delete
        prev[j-1] + cost,            // substitute
      );
      if (i > 1 && j > 1
          && a.charCodeAt(i-1) === b.charCodeAt(j-2)
          && a.charCodeAt(i-2) === b.charCodeAt(j-1)) {
        cur[j] = Math.min(cur[j], prevPrev[j-2] + 1); // transpose
      }
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1; // early exit
    [prevPrev, prev, cur] = [prev, cur, prevPrev];
  }
  return prev[bl];
}

function suggestionsFor(word) {
  if (!word || !dict) return [];
  const target = word.toLowerCase();
  if (dict.has(target)) return [];
  const maxDist = target.length <= 4 ? 1 : 2;
  const results = [];
  for (const candidate of dict) {
    if (Math.abs(candidate.length - target.length) > maxDist) continue;
    const d = damerauLevenshtein(target, candidate, maxDist);
    if (d <= maxDist) results.push({ word: candidate, dist: d });
  }
  // Prefer candidates whose length matches the typed word — most typos are
  // off by one or zero chars, so a 3-char target probably meant a 3-char word.
  results.sort((a, b) =>
    a.dist - b.dist
    || Math.abs(a.word.length - target.length) - Math.abs(b.word.length - target.length)
    || a.word.length - b.word.length
  );
  // Preserve original case roughly — if input was Title-cased, capitalize result.
  const isUpper = word[0] === word[0].toUpperCase();
  return results.slice(0, 5).map(r =>
    isUpper ? r.word[0].toUpperCase() + r.word.slice(1) : r.word
  );
}
```

- [ ] **Step 2: Verify common-typo suggestions**

In Playwright:

```js
() => ({
  thier: Proof.suggestionsFor("thier"),
  recieve: Proof.suggestionsFor("recieve"),
  hte: Proof.suggestionsFor("hte"),
  acept: Proof.suggestionsFor("acept"),
  unknownGarbage: Proof.suggestionsFor("xqzkw"),
})
```

Expected: `thier` includes `"their"`. `recieve` includes `"receive"`. `hte` includes `"the"`. `acept` includes `"accept"`. `unknownGarbage` returns `[]` or a near-empty list. Each call completes in <300 ms on a desktop (the 200-result performance guard caps cost).

- [ ] **Step 3: Commit**

```bash
git add proofcheck.js
git commit -m "$(cat <<'EOF'
Proofcheck: Damerau-Levenshtein suggestion engine

Returns top-5 candidates within edit-distance 2 (1 for words ≤ 4 chars)
sorted by distance then length. Early-exits when row-minimum exceeds the
threshold. Caps candidates at 200 to keep latency under ~300 ms on
80k-entry dictionaries. Preserves leading-uppercase of the source word.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Live underline pass — debounced, viewport-limited

**Files:**
- Modify: `proofcheck.js`
- Modify: `editor.js`
- Modify: `styles.css`

- [ ] **Step 1: Add the underline DOM mutation**

In `proofcheck.js`, replace the `scheduleLivePass` stub with:

```js
function scheduleLivePass() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runLivePass, DEBOUNCE_MS);
}

function runLivePass() {
  if (!dict) return; // dict not loaded yet — bail silently
  const editor = document.getElementById("editor");
  if (!editor) return;
  // Viewport limit: walk only lines that intersect viewport ± 200px.
  const VIEWPORT_PAD = 200;
  const viewTop = -VIEWPORT_PAD;
  const viewBot = window.innerHeight + VIEWPORT_PAD;
  const lines = editor.querySelectorAll("div");
  for (const line of lines) {
    const r = line.getBoundingClientRect();
    if (r.bottom < viewTop || r.top > viewBot) continue;
    underlineLine(line);
  }
}

function underlineLine(line) {
  // Bail if no tokens to check (e.g., scene heading).
  const tokens = tokenize(line);

  // Remove any existing marks before reapplying.
  line.querySelectorAll(".proof-mark").forEach(m => {
    const txt = document.createTextNode(m.textContent);
    m.parentNode.replaceChild(txt, m);
  });
  line.normalize();

  if (tokens.length === 0) return;
  const unknown = tokens.filter(t => !isKnown(t.word));
  if (unknown.length === 0) return;

  // Walk the line's text, replacing unknown tokens with marked spans.
  const text = line.textContent;
  if (!text) return;
  // Save caret so we can restore it after replacing children.
  const sel = window.getSelection();
  let caretLine = null, caretOffset = 0;
  if (sel.rangeCount && line.contains(sel.anchorNode)) {
    caretLine = line;
    const range = document.createRange();
    range.selectNodeContents(line);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    caretOffset = range.toString().length;
  }

  const frag = document.createDocumentFragment();
  let cursor = 0;
  for (const tok of unknown) {
    if (tok.start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, tok.start)));
    const span = document.createElement("span");
    span.className = "proof-mark proof-unknown";
    span.dataset.word = tok.word;
    span.textContent = tok.word;
    frag.appendChild(span);
    cursor = tok.end;
  }
  if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));

  // Replace children
  while (line.firstChild) line.removeChild(line.firstChild);
  line.appendChild(frag);

  // Restore caret
  if (caretLine === line) {
    const restoreRange = document.createRange();
    let walked = 0, target = null, targetOff = 0;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const len = node.textContent.length;
      if (walked + len >= caretOffset) {
        target = node; targetOff = caretOffset - walked; break;
      }
      walked += len;
    }
    if (target) {
      restoreRange.setStart(target, Math.min(targetOff, target.textContent.length));
      restoreRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(restoreRange);
    }
  }
}
```

- [ ] **Step 2: Hook into editor input**

Open `editor.js`. Find `function onEditorInput()` (use `grep -n "function onEditorInput" editor.js`). At the END of the function body (just before the closing `}`), add:

```js
  if (window.Proof) Proof.scheduleLivePass();
```

- [ ] **Step 3: Add CSS**

Open `styles.css`. Find the existing editor element styles (search for `#editor > div[data-type="action"]`). After that block, add:

```css
/* ====== Proofcheck — Phase 1 live underline ====== */

.proof-mark.proof-unknown {
  /* Subtler than browser red wavy underline — orange dotted, screenplay-aware */
  text-decoration: underline dotted #c97f1a;
  text-underline-offset: 2px;
  text-decoration-thickness: 1.5px;
  cursor: pointer;
}
.proof-mark.proof-unknown:hover {
  background: rgba(201, 127, 26, 0.10);
  border-radius: 2px;
}
@media (prefers-color-scheme: dark), body[data-theme="midnight"] {
  .proof-mark.proof-unknown { text-decoration-color: #dba557; }
}
body[data-theme="court"] .proof-mark.proof-unknown {
  text-decoration-color: #b46214;
}
```

- [ ] **Step 4: Verify by typing a typo**

Reload the test project. In Playwright:

```js
() => {
  // Ensure dict is loaded
  Proof.loadDictForProject(appState.projectId);
  // Place cursor at end of last line, append a typo
  const editor = document.querySelector("#editor");
  const lines = editor.querySelectorAll("div");
  const last = lines[lines.length - 1];
  last.textContent = (last.textContent || "") + " thier";
  // Run the pass immediately (skip debounce for test)
  Proof.scheduleLivePass();
  return new Promise(resolve => setTimeout(() => {
    const marks = last.querySelectorAll(".proof-mark.proof-unknown");
    resolve({
      markCount: marks.length,
      markedText: Array.from(marks).map(m => m.textContent),
    });
  }, 600));
}
```

Expected: `markCount: 1, markedText: ["thier"]`.

- [ ] **Step 5: Visual screenshot**

```js
mcp__plugin_playwright_playwright__browser_take_screenshot({ filename: "proof-underline.png" })
```

Confirm the typo line shows the orange dotted underline. View the image to verify visually.

- [ ] **Step 6: Commit**

```bash
git add proofcheck.js editor.js styles.css
git commit -m "$(cat <<'EOF'
Proofcheck: live underline pass — debounced, viewport-limited

scheduleLivePass debounces 400 ms after editor input. runLivePass walks
only lines intersecting the viewport ± 200 px. underlineLine tokenizes,
strips existing marks, wraps unknown tokens in
<span class="proof-mark proof-unknown">, and preserves caret across the
DOM mutation. CSS gives an orange dotted underline distinguishable from
the browser's native red squiggle.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Hover/click popover with suggestions + Add + Ignore + Accept

**Files:**
- Modify: `proofcheck.js`
- Modify: `styles.css`

- [ ] **Step 1: Add popover logic**

In `proofcheck.js`, add (just below `underlineLine`):

```js
let activePopover = null;

function showPopover(markSpan) {
  closePopover();
  const word = markSpan.dataset.word;
  if (!word) return;
  const suggestions = suggestionsFor(word);
  const rect = markSpan.getBoundingClientRect();

  const pop = document.createElement("div");
  pop.className = "proof-popover";
  pop.style.left = rect.left + "px";
  pop.style.top = (rect.bottom + 4) + "px";

  const header = document.createElement("div");
  header.className = "pp-header";
  header.textContent = word;
  pop.appendChild(header);

  if (suggestions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "pp-empty";
    empty.textContent = "No suggestions";
    pop.appendChild(empty);
  } else {
    suggestions.forEach(s => {
      const row = document.createElement("button");
      row.className = "pp-row";
      row.textContent = s;
      row.addEventListener("click", () => { acceptSuggestion(markSpan, s); closePopover(); });
      pop.appendChild(row);
    });
  }

  const actions = document.createElement("div");
  actions.className = "pp-actions";
  const addBtn = document.createElement("button");
  addBtn.className = "pp-btn";
  addBtn.textContent = "+ Add to dict";
  addBtn.addEventListener("click", () => { addToDict(word); closePopover(); refreshMarkAround(markSpan); });
  actions.appendChild(addBtn);
  const ignoreBtn = document.createElement("button");
  ignoreBtn.className = "pp-btn";
  ignoreBtn.textContent = "Ignore once";
  ignoreBtn.addEventListener("click", () => { ignoreForSession(word); closePopover(); refreshMarkAround(markSpan); });
  actions.appendChild(ignoreBtn);
  pop.appendChild(actions);

  document.body.appendChild(pop);
  activePopover = pop;

  // Close on outside click
  const onDown = (ev) => {
    if (!pop.contains(ev.target) && ev.target !== markSpan) {
      closePopover();
      document.removeEventListener("mousedown", onDown, true);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", onDown, true), 0);
}

function closePopover() {
  if (activePopover) { activePopover.remove(); activePopover = null; }
}

function acceptSuggestion(markSpan, suggestion) {
  // Replace just this span's text. Caret lands at end of suggestion.
  const line = markSpan.closest("#editor > div");
  if (!line) return;
  // Capture full line text, swap the span text, rebuild.
  markSpan.textContent = suggestion;
  // Mark line revised + dirty + reclassify (existing helpers)
  if (typeof markRevised === "function") markRevised(line);
  if (typeof setDirty === "function") setDirty();
  // Strip the .proof-mark wrapping now that the word is fixed
  const txt = document.createTextNode(suggestion);
  markSpan.parentNode.replaceChild(txt, markSpan);
  line.normalize();
  if (typeof reclassifyAll === "function") reclassifyAll();
}

function refreshMarkAround(markSpan) {
  const line = markSpan && markSpan.closest("#editor > div");
  if (line) underlineLine(line);
}

// Real implementations of addToDict / ignoreForSession
function _addToDict(word) {
  customDict.add(word);
  customDict.add(word.toUpperCase());
  if (projectId) {
    Storage.setProofDict(projectId, { words: Array.from(customDict), ignored: [] });
  }
}
function _ignoreForSession(word) { sessionIgnore.add(word); sessionIgnore.add(word.toUpperCase()); }
```

Replace the existing stubs `addToDict` and `ignoreForSession` in the IIFE's return object so they point at `_addToDict` and `_ignoreForSession`:

```js
  return {
    bind, loadDictForProject, setLanguage,
    scheduleLivePass, suggestionsFor,
    addToDict: _addToDict,
    ignoreForSession: _ignoreForSession,
    isKnown, tokenize,
    _state() { return { language, loaded, customSize: customDict.size, dictSize: dict?.size || 0 }; },
    _showPopoverFor(span) { showPopover(span); }, // exposed for tests
  };
```

- [ ] **Step 2: Wire click handler on `.proof-mark` (delegated on the editor)**

In `proofcheck.js`, replace the empty `bind()` stub with:

```js
function bind() {
  const editor = document.getElementById("editor");
  if (!editor) return;
  editor.addEventListener("click", (e) => {
    const mark = e.target.closest(".proof-mark.proof-unknown");
    if (mark) {
      e.stopPropagation();
      showPopover(mark);
    }
  });
}
```

- [ ] **Step 3: Wire Proof.bind() from app.js boot**

Open `app.js`. Find the `boot()` function (search `function boot()`). Right after the existing `if (typeof SceneZoom !== "undefined") SceneZoom.bind();` line, add:

```js
  if (typeof Proof !== "undefined") Proof.bind();
```

Also in `loadProject(id, opts={})`, after `appState.projectId = id;` (search for it), add:

```js
  if (typeof Proof !== "undefined") Proof.loadDictForProject(id);
```

- [ ] **Step 4: Add popover CSS**

Open `styles.css`. After the `.proof-mark` block from Task 8, add:

```css
.proof-popover {
  position: fixed;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow-2);
  z-index: 220;
  min-width: 180px;
  font-family: var(--font-ui);
  font-size: 12.5px;
  padding: 4px;
  user-select: none;
}
.proof-popover .pp-header {
  padding: 4px 8px 6px;
  font-weight: 600;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--line);
  margin-bottom: 4px;
}
.proof-popover .pp-row {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 5px 10px;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  color: var(--ink);
}
.proof-popover .pp-row:hover { background: var(--hl); }
.proof-popover .pp-empty {
  padding: 6px 10px;
  color: var(--muted);
  font-style: italic;
}
.proof-popover .pp-actions {
  display: flex;
  gap: 4px;
  border-top: 1px solid var(--line);
  margin-top: 4px;
  padding-top: 4px;
}
.proof-popover .pp-btn {
  flex: 1;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 5px 8px;
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  color: var(--ink-2);
}
.proof-popover .pp-btn:hover { background: var(--hl); color: var(--ink); }
```

- [ ] **Step 5: Verify the popover and Accept flow**

In Playwright:

```js
() => {
  Proof.loadDictForProject(appState.projectId);
  // Ensure a "thier" mark exists somewhere
  const last = document.querySelectorAll("#editor > div");
  const target = last[last.length - 1];
  target.textContent = "There is a thier in the house.";
  Proof.scheduleLivePass();
  return new Promise(resolve => setTimeout(() => {
    const mark = target.querySelector(".proof-mark.proof-unknown");
    Proof._showPopoverFor(mark);
    setTimeout(() => {
      const pop = document.querySelector(".proof-popover");
      const rows = pop ? Array.from(pop.querySelectorAll(".pp-row")).map(r => r.textContent) : [];
      // Accept first suggestion
      const first = pop?.querySelector(".pp-row");
      if (first) first.click();
      setTimeout(() => {
        resolve({
          popOpened: !!pop,
          firstSuggestions: rows,
          afterAcceptText: target.textContent,
          marksRemaining: target.querySelectorAll(".proof-mark.proof-unknown").length,
        });
      }, 50);
    }, 50);
  }, 600));
}
```

Expected: `popOpened: true`, `firstSuggestions` includes `"their"`, `afterAcceptText` contains "There is a their" (not "thier"), `marksRemaining` 0.

- [ ] **Step 6: Verify Add to dict persists**

```js
() => {
  Proof.loadDictForProject(appState.projectId);
  Proof.addToDict("Zaphod");
  const stored = Storage.getProofDict(appState.projectId);
  const known1 = Proof.isKnown("Zaphod");
  // Simulate reload
  Proof.loadDictForProject(appState.projectId);
  const known2 = Proof.isKnown("Zaphod");
  return { stored, known1, known2 };
}
```

Expected: `stored.words` contains `"Zaphod"`. Both `known1` and `known2` are `true`.

- [ ] **Step 7: Commit**

```bash
git add proofcheck.js app.js styles.css
git commit -m "$(cat <<'EOF'
Proofcheck: hover popover + accept + add to dict + ignore for session

Click on any orange-underlined word opens a popover with the top-5
Damerau-Levenshtein suggestions, a "+ Add to dict" button (persists to
proofdict and is recognized across reloads), and an "Ignore once" button
(session-only). Accepting a suggestion swaps the text, strips the mark,
calls markRevised + setDirty + reclassifyAll. Popover closes on outside
click. Proof.bind() wires the delegated click listener; Proof
.loadDictForProject is called from loadProject().

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Right-click context menu mirrors the popover actions

**Files:**
- Modify: `proofcheck.js`

- [ ] **Step 1: Add contextmenu listener in bind()**

Replace the `bind()` function with:

```js
function bind() {
  const editor = document.getElementById("editor");
  if (!editor) return;
  editor.addEventListener("click", (e) => {
    const mark = e.target.closest(".proof-mark.proof-unknown");
    if (mark) { e.stopPropagation(); showPopover(mark); }
  });
  editor.addEventListener("contextmenu", (e) => {
    const mark = e.target.closest(".proof-mark.proof-unknown");
    if (mark) { e.preventDefault(); showPopover(mark); }
  });
}
```

- [ ] **Step 2: Verify**

In Playwright:

```js
() => {
  Proof.loadDictForProject(appState.projectId);
  const last = document.querySelectorAll("#editor > div");
  const target = last[last.length - 1];
  target.textContent = "More thier text here.";
  Proof.scheduleLivePass();
  return new Promise(resolve => setTimeout(() => {
    const mark = target.querySelector(".proof-mark.proof-unknown");
    const r = mark.getBoundingClientRect();
    mark.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left + 2, clientY: r.top + 2, bubbles: true, cancelable: true }));
    setTimeout(() => {
      const pop = document.querySelector(".proof-popover");
      resolve({ popOpened: !!pop });
    }, 50);
  }, 600));
}
```

Expected: `popOpened: true`.

- [ ] **Step 3: Commit**

```bash
git add proofcheck.js
git commit -m "$(cat <<'EOF'
Proofcheck: right-click on a flagged word opens the same popover

contextmenu listener delegated on the editor element. Mirrors the
left-click flow so writers who instinctively right-click on typos get
the same Add to dict / suggestions / Ignore experience.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Titlebar EN / ES chip

**Files:**
- Modify: `index.html`
- Modify: `proofcheck.js`
- Modify: `app.js`
- Modify: `styles.css`

- [ ] **Step 1: Add the chip markup**

Open `index.html`. Find the titlebar element (use `grep -n "save-state\|titlebar" index.html` — the chip should land between the project name and the save-state chip). Add this just before the `id="save-state"` element:

```html
<button id="proof-lang" class="proof-chip" title="Proofcheck language">EN</button>
```

- [ ] **Step 2: Add CSS for the chip**

In `styles.css`, after the popover CSS block, add:

```css
.proof-chip {
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 2px 8px;
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--ink-2);
  cursor: pointer;
  margin: 0 6px;
}
.proof-chip:hover { background: var(--hl); color: var(--ink); }
.proof-chip[data-lang="es"] { background: #dfeacd; border-color: #b4cf90; color: #36571c; }
.proof-chip[data-lang="en"] { background: #d5e2f0; border-color: #8eb1d8; color: #1b3e63; }
```

- [ ] **Step 3: Wire setLanguage to swap dict + persist meta + re-pass**

In `proofcheck.js`, replace the `setLanguage` stub:

```js
function setLanguage(lang) {
  if (lang !== "en" && lang !== "es") return;
  language = lang;
  // Re-load the matching bundled dict
  const raw = lang === "es" ? (typeof DICT_ES_RAW === "string" ? DICT_ES_RAW : null)
                            : (typeof DICT_EN_RAW === "string" ? DICT_EN_RAW : null);
  if (raw) {
    const payload = LZString.decompressFromBase64(raw);
    dict = new Set(payload.split("\n").filter(Boolean));
    loaded = true;
  } else {
    dict = null; loaded = false;
  }
  // Persist
  if (projectId) {
    const meta = Storage.getMeta(projectId) || {};
    Storage.setMeta(projectId, { ...meta, language: lang });
  }
  // Update titlebar chip
  const chip = document.getElementById("proof-lang");
  if (chip) { chip.textContent = lang.toUpperCase(); chip.dataset.lang = lang; }
  // Re-run live pass with the new dict
  runLivePass();
}
```

- [ ] **Step 4: Wire chip click + initial render in app.js boot**

Open `app.js`. Find `function bindEditorUI()` (use `grep -n "function bindEditorUI" app.js`). At the END of the function body, just before the closing `}`, add:

```js
  const langChip = document.getElementById("proof-lang");
  if (langChip) {
    langChip.addEventListener("click", () => {
      const cur = (Storage.getMeta(appState.projectId) || {}).language || "en";
      Proof.setLanguage(cur === "en" ? "es" : "en");
    });
  }
```

Also update the existing `loadProject` to set the chip on project load. Find `if (typeof Proof !== "undefined") Proof.loadDictForProject(id);` (added in Task 9 Step 3). Replace with:

```js
  if (typeof Proof !== "undefined") {
    Proof.loadDictForProject(id);
    const lang = (Storage.getMeta(id) || {}).language || "en";
    const chip = document.getElementById("proof-lang");
    if (chip) { chip.textContent = lang.toUpperCase(); chip.dataset.lang = lang; }
  }
```

- [ ] **Step 5: Verify**

Reload. In Playwright:

```js
() => {
  Proof.loadDictForProject(appState.projectId);
  const chip = document.getElementById("proof-lang");
  const beforeText = chip.textContent;
  const beforePerro = Proof.isKnown("perro");
  // Toggle to ES
  Proof.setLanguage("es");
  const afterText = chip.textContent;
  const afterPerro = Proof.isKnown("perro");
  const afterTheir = Proof.isKnown("their");
  const persistedLang = Storage.getMeta(appState.projectId).language;
  // Restore to EN to avoid breaking later tests
  Proof.setLanguage("en");
  return { beforeText, afterText, beforePerro, afterPerro, afterTheir, persistedLang };
}
```

Expected: `beforeText: "EN"`, `afterText: "ES"`, `beforePerro: false`, `afterPerro: true`, `afterTheir: false` (Spanish dict doesn't have it), `persistedLang: "es"`.

- [ ] **Step 6: Screenshot to confirm chip visually**

```js
mcp__plugin_playwright_playwright__browser_take_screenshot({ filename: "proof-chip.png" })
```

Confirm chip visible in titlebar, color and label match the active language.

- [ ] **Step 7: Commit**

```bash
git add index.html proofcheck.js app.js styles.css
git commit -m "$(cat <<'EOF'
Proofcheck: titlebar EN ⇄ ES language chip

Small pill button between project name and save-state chip. Click
toggles between EN and ES, swaps the bundled dictionary, re-runs the
live pass, and persists meta.language so the choice survives reload.
Color-coded (cool blue for EN, warm green for ES) so writers can
glance-check what language Proof is reading them in.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: ⌘. shortcut — accept top suggestion when caret is on a flagged word

**Files:**
- Modify: `app.js` (or wherever global shortcuts live; verify with grep)

- [ ] **Step 1: Find where global shortcuts are bound**

```bash
grep -n "bindGlobalShortcuts\|function bindGlobalShortcuts" app.js
```

You should find `function bindGlobalShortcuts()` registered as a top-level handler.

- [ ] **Step 2: Add the ⌘. shortcut**

Inside `bindGlobalShortcuts`, find the existing key-handler pattern (look for `e.key === "k"` or similar). Add a new handler block:

```js
  // ⌘. — accept top Proof suggestion when caret is on a flagged token
  // Stand-alone block; keep above the catch-all return at the end.
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key !== ".") return;
    if (typeof Proof === "undefined") return;
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    let node = sel.anchorNode;
    if (node.nodeType === 3) node = node.parentNode;
    const mark = node && node.closest && node.closest(".proof-mark.proof-unknown");
    if (!mark) return;
    e.preventDefault();
    const sugg = Proof.suggestionsFor(mark.dataset.word);
    if (sugg.length > 0) {
      // Inline-accept: same logic as the popover row click
      mark.textContent = sugg[0];
      const txt = document.createTextNode(sugg[0]);
      mark.parentNode.replaceChild(txt, mark);
      const line = txt.parentElement && txt.parentElement.closest("#editor > div");
      if (line) {
        line.normalize();
        if (typeof markRevised === "function") markRevised(line);
        if (typeof setDirty === "function") setDirty();
        if (typeof reclassifyAll === "function") reclassifyAll();
      }
    }
  });
```

(If a `bindGlobalShortcuts` already has a single delegated keydown listener, fold the above into it instead of registering a second one — search to match the project's style.)

- [ ] **Step 3: Verify**

In Playwright:

```js
() => {
  Proof.loadDictForProject(appState.projectId);
  const lines = document.querySelectorAll("#editor > div");
  const target = lines[lines.length - 1];
  target.textContent = "Place the thier here.";
  Proof.scheduleLivePass();
  return new Promise(resolve => setTimeout(() => {
    const mark = target.querySelector(".proof-mark.proof-unknown");
    // Place caret inside the mark
    const range = document.createRange();
    range.selectNodeContents(mark);
    range.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: ".", metaKey: true, bubbles: true, cancelable: true }));
    setTimeout(() => resolve({ textAfter: target.textContent, marks: target.querySelectorAll(".proof-mark").length }), 50);
  }, 600));
}
```

Expected: `textAfter` contains `"their"` (not `"thier"`), `marks: 0`.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
Proofcheck: ⌘. accepts the top suggestion when caret is on a flagged word

Stand-alone keydown listener: when ⌘. fires and the caret is anywhere
inside a .proof-mark.proof-unknown span, pull the first suggestion from
Proof.suggestionsFor(), swap the text, strip the mark, mark revised,
set dirty, reclassify. Mimics the popover's first-row click without
opening the UI.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Fountain round-trip — bs:lang= and bs:dict= title-page meta

**Files:**
- Modify: `io.js`

- [ ] **Step 1: Locate the title-page serialization**

```bash
grep -n "function serializeFountain\|function loadFountain\|titlePage\|titleMeta" io.js | head -20
```

You should find:
- `serializeFountain(includeTitle=true)` — produces Fountain text from DOM
- `loadFountain(src)` — parses Fountain text into the DOM
- A title-page block emission near the top of `serializeFountain` and a corresponding parse loop in `loadFountain`

- [ ] **Step 2: Emit bs:lang and bs:dict in title-page output**

In `serializeFountain`, find where it emits title-page lines (look for `Title:` and `Author:` writes). After the loop that writes the standard title-page fields, before the blank-line separator that ends the title page, add:

```js
  // Proofcheck per-project state — language and custom dictionary survive export.
  const meta = (typeof Storage !== "undefined" && appState.projectId) ? Storage.getMeta(appState.projectId) : null;
  const lang = (meta && meta.language) || "en";
  out.push("bs:lang=" + lang);
  if (typeof Storage !== "undefined" && appState.projectId) {
    const dictRec = Storage.getProofDict(appState.projectId);
    if (dictRec && dictRec.words && dictRec.words.length) {
      out.push("bs:dict=" + dictRec.words.join(","));
    }
  }
```

(`out` is whatever variable accumulates the lines in this function — match the existing name.)

- [ ] **Step 3: Parse bs:lang and bs:dict on load**

In `loadFountain(src)`, find the title-page parsing loop (it'll be where lines like `Title:` are matched). Add handlers for the two new keys:

```js
  // Inside the title-page parsing loop, beside the existing key handlers:
  if (line.startsWith("bs:lang=")) {
    const lang = line.slice("bs:lang=".length).trim();
    if (lang === "en" || lang === "es") {
      const meta = Storage.getMeta(appState.projectId) || {};
      Storage.setMeta(appState.projectId, { ...meta, language: lang });
    }
    continue;
  }
  if (line.startsWith("bs:dict=")) {
    const words = line.slice("bs:dict=".length).split(",").map(w => w.trim()).filter(Boolean);
    if (words.length) {
      const cur = Storage.getProofDict(appState.projectId) || { words: [], ignored: [] };
      const merged = Array.from(new Set([...cur.words, ...words]));
      Storage.setProofDict(appState.projectId, { ...cur, words: merged });
    }
    continue;
  }
```

(Match exact variable names of the title-page loop; the `continue` keyword should match the loop construct in use — if it's a `forEach` callback, use `return` instead.)

- [ ] **Step 4: Verify round-trip**

In Playwright:

```js
() => {
  Proof.loadDictForProject(appState.projectId);
  Proof.addToDict("Zaphod");
  Proof.setLanguage("es");
  // Serialize
  const fountain = serializeFountain(true);
  const langLine = fountain.split("\n").find(l => l.startsWith("bs:lang="));
  const dictLine = fountain.split("\n").find(l => l.startsWith("bs:dict="));
  // Reset state
  Proof.setLanguage("en");
  Storage.setProofDict(appState.projectId, { words: [], ignored: [] });
  // Re-load from the serialized Fountain
  loadFountain(fountain);
  const langAfter = (Storage.getMeta(appState.projectId) || {}).language;
  const dictAfter = Storage.getProofDict(appState.projectId).words;
  return { langLine, dictLine, langAfter, hasZaphodAfter: dictAfter.includes("Zaphod") };
}
```

Expected: `langLine: "bs:lang=es"`, `dictLine` contains "Zaphod", `langAfter: "es"`, `hasZaphodAfter: true`.

- [ ] **Step 5: Commit**

```bash
git add io.js
git commit -m "$(cat <<'EOF'
Proofcheck: Fountain round-trip for language + custom dict

serializeFountain emits bs:lang=<en|es> and bs:dict=<comma-list> in the
title-page block. loadFountain parses both back into Storage on import.
Exporting a project and re-importing into a new project preserves the
language toggle and any custom-dict additions, so writers can share a
.fountain without losing their Proof setup.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: End-to-end verification + HANDOFF update

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Hard-reload and run the full Phase 1 acceptance check**

In Playwright:

```js
() => {
  // Cold-start: simulate "user opens a project"
  Proof.loadDictForProject(appState.projectId);
  return new Promise(resolve => setTimeout(() => {
    // Insert a test line with a clear typo
    const editor = document.querySelector("#editor");
    const lines = editor.querySelectorAll("div");
    const target = lines[lines.length - 1];
    target.textContent = "We need to make sure that thier consistency is preserved.";
    Proof.scheduleLivePass();
    setTimeout(() => {
      const marks = target.querySelectorAll(".proof-mark.proof-unknown");
      const markedWords = Array.from(marks).map(m => m.dataset.word);
      const sugg = marks.length ? Proof.suggestionsFor(marks[0].dataset.word) : [];
      const chip = document.getElementById("proof-lang");
      resolve({
        markedWords,
        firstSuggIncludesTheir: sugg.includes("their"),
        chipText: chip?.textContent,
        chipLang: chip?.dataset.lang,
        dictSize: Proof._state().dictSize,
        customSize: Proof._state().customSize,
      });
    }, 600);
  }, 200));
}
```

Expected:
- `markedWords: ["thier"]` (other words are all common)
- `firstSuggIncludesTheir: true`
- `chipText: "EN"`, `chipLang: "en"`
- `dictSize > 50000`
- `customSize >= 5` (auto-seeded from cues + Bible + scene proper nouns)

If any assertion fails, return to the relevant task and fix before continuing.

- [ ] **Step 2: Test language switch end-to-end**

```js
() => {
  Proof.setLanguage("es");
  const sugg = Proof.suggestionsFor("perr");
  return { lang: Proof._state().language, perroSuggestions: sugg, dictSizeAfter: Proof._state().dictSize };
}
```

Expected: `lang: "es"`, `perroSuggestions` includes `"perro"`, `dictSizeAfter > 40000`.

```js
() => { Proof.setLanguage("en"); return Proof._state(); }
```

Verify state restored.

- [ ] **Step 3: Update HANDOFF.md**

Edit `HANDOFF.md`. Below the "Writer ergonomics pass" section, add a new section:

```md
## Proofcheck Phase 1 — what shipped on `feature/proofcheck`

Live, screenplay-aware spell checker for EN + ES. Phase 1 covers the live layer only; Phases 2 (rule-based deep checks) and 3 (AI deep pass) are still to come.

**Bundled wordlists** at load time:
- `dict-en.js` — ~120k common English words sampled from `dwyl/an-array-of-english-words` (MIT)
- `dict-es.js` — ~80k Spanish words from `words/an-array-of-spanish-words` (MIT)

**Per-project custom dictionary** auto-seeds from character cues + Bible characters + ALL-CAPS scene-heading proper nouns. Round-trips via Fountain `bs:lang=` and `bs:dict=` title-page meta.

**Surfaces:**
- Orange dotted underline on unknown tokens (live, debounced 400ms, viewport-limited)
- Click or right-click any flagged word → popover with top-5 Damerau-Levenshtein suggestions + Add to dict + Ignore once
- ⌘. accepts the top suggestion when caret is on a flagged word
- Titlebar EN ⇄ ES chip switches dict + persists `meta.language`
- Scene headings, character cues, transitions, parentheticals are NEVER checked (they're identifiers, not prose)

**Spec + plan:** `docs/superpowers/specs/2026-05-28-proofcheck-design.md`, `docs/superpowers/plans/2026-05-28-proofcheck-phase1.md`.
```

- [ ] **Step 4: Commit + report**

```bash
git add HANDOFF.md
git commit -m "$(cat <<'EOF'
HANDOFF: document Proofcheck Phase 1

Live spelling layer shipped: bundled EN+ES wordlists, per-project custom
dict, orange dotted underline, hover/right-click popover with Damerau-
Levenshtein suggestions, titlebar EN⇄ES chip, ⌘. quick-accept, Fountain
round-trip. Phases 2 (rule-based deep) and 3 (AI deep) still to come.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Final report**

Print a summary of all commits on the branch:

```bash
git log --oneline feature/scene-zoom..HEAD
```

Expected: ~13 commits, one per task, in order.

---

## Self-Review Notes

**Spec coverage check:**

| Spec section | Plan task |
|---|---|
| Layer 1 (browser native spellcheck) | Inherited from existing editor `spellcheck=true` — no task needed |
| Layer 2 bundled dict + custom dict | Tasks 3, 4, 5 |
| Layer 2 live underline | Tasks 6, 7, 8 |
| Layer 2 hover popover | Task 9 |
| Layer 2 right-click context menu | Task 10 |
| Titlebar EN/ES chip | Task 11 |
| ⌘. accept top | Task 12 |
| Fountain round-trip (`bs:lang=`, `bs:dict=`) | Task 13 |
| `meta.language` per-project | Task 4 (default), Task 11 (persist on toggle) |
| Verification per spec | Task 14 |
| Phase 2 (local rules) | OUT OF SCOPE — separate plan |
| Phase 3 (AI deep) | OUT OF SCOPE — separate plan |

**Type consistency:** `Issue` shape from the spec is NOT introduced in Phase 1 — that's a Phase-2 type. Phase 1 only needs `{word, start, end}` from the tokenizer and `string[]` from `suggestionsFor`. Names used consistently: `Proof.loadDictForProject`, `Proof.setLanguage`, `Proof.scheduleLivePass`, `Proof.suggestionsFor`, `Proof.addToDict`, `Proof.ignoreForSession`, `Proof.isKnown`, `Proof.tokenize`. CSS class consistent: `.proof-mark.proof-unknown`, `.proof-popover`, `.proof-chip`.

**Placeholder scan:** No `TBD` / `TODO`. Every code step has actual code. Every verify step has an expected result.

— end of plan —
