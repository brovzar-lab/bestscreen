# Proofcheck — design spec

> Bestscreen's "best spell + grammar + consistency checker ever" for screenwriters. Toggleable EN / ES. Vanilla JS, no build step, fits the existing module-globals architecture.

**Status:** approved design, pending phase-1 implementation
**Date:** 2026-05-28
**Author:** Claude (Opus 4.7) for Billy
**Branch target:** `feature/proofcheck` off `feature/scene-zoom` head

---

## Goals

1. **Catch typos as you write** — distinct from the browser's native red squiggle, screenplay-aware (don't flag character cues or scene-heading proper nouns).
2. **Catch grammar, format, consistency mistakes on demand** — a single "Run check" produces a triaged, jump-able issue list.
3. **Speak both languages well** — English and Spanish dictionaries, rule packs, AI prompts; per-project setting with a titlebar toggle for mid-session switches.
4. **Be deeply finished per phase** — every phase shipped is end-to-end usable on its own. No half-checkers.

## Non-goals

- Voice match per character (already covered by ⌘J "Match Bible voice").
- Continuity engine work (already shipped — Bestscreen tracks death/arrest/pregnancy/marriage state separately).
- Server-side dictionary hosting. Everything ships in-bundle or via the existing BYOK Anthropic key.
- Real-time AI grammar (only Run check triggers AI; passive grammar checking would burn tokens with low value).
- Auto-fixing without writer consent. Every suggestion requires a click.

## Architecture — four layers, one panel

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Native browser spellcheck (always on, safety net)      │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: Bundled dicts + per-project custom — LIVE PASS         │
│   debounced 400 ms, viewport ± 200 lines, orange underline      │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: Local rule pass — DEEP PASS (instant, offline-OK)      │
│   tense · format · name variants · location variants ·          │
│   repetition · cliché                                           │
├─────────────────────────────────────────────────────────────────┤
│ Layer 4: AI pass — DEEP PASS (streams, tokens, on demand)       │
│   word-choice · sentence-flow · dialogue-flow · rare-spelling   │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                  ┌──────────────────────────────┐
                  │ Unified "Proof" sidebar tab  │
                  │ issue rows + filters + jump  │
                  └──────────────────────────────┘
```

The 4 layers exist for cost reasons (free vs paid, instant vs latent, offline-OK vs AI-required). The writer sees one Proof panel.

## Components

### `proofcheck.js` *(new)* — `window.Proof` namespace

```
Proof = {
  // lifecycle
  bind(),                       // wires shortcuts, sidebar tab, document listeners
  loadDictForProject(),         // lazy-loads dict-en or dict-es, seeds custom dict
  setLanguage(lang),            // "en" | "es" — switches dict, re-runs live pass

  // live (Layer 2)
  scheduleLivePass(),           // debounced 400ms; underlines unknown tokens in viewport
  ensureLivePass(),             // immediate pass (used on view switch)
  suggestionsFor(word),         // top-5 Levenshtein-2 within dict
  addToDict(word),              // writes to per-project custom dict
  ignoreForSession(word),       // session-only

  // deep (Layers 3 + 4)
  runDeepCheck(),               // returns Promise<Issue[]>, populates panel
  runLocalRules(),              // Layer 3 only — instant
  runAiPass(),                  // Layer 4 only — streams, fills panel as it goes

  // panel
  renderPanel(body),            // called by panels.js when "Proof" tab is active
  acceptIssue(issueId),         // applies suggestion, marks issue resolved
  acceptCategory(cat),          // mass accept
  jumpTo(issueId),              // editor scrollIntoView + pulse + popover

  // state
  language,                     // "en" | "es"
  loaded,                       // boolean — true once dict is parsed
  lastRunAt,                    // Date | null
  issues,                       // Issue[]
};
```

### `Issue` shape

```js
{
  id: "uuid",
  layer: 2 | 3 | 4,
  severity: "error" | "warning" | "suggestion",
  category: "spelling" | "grammar" | "format" | "consistency" | "style" | "ai-style",
  lineIdx: 42,                        // index of editor div
  range: [12, 19],                    // character range inside the line
  original: "INTERIOR",
  suggestion: "INT.",
  reasoning: "Standard Fountain slug.", // null for layer 2
  ignored: false,
  appliedAt: null,
}
```

### `proofcheck.js` internal pieces (sub-modules in one file, like Scene Zoom)

| Section | Responsibility |
|---|---|
| `dictLoader` | Loads dict-en.js or dict-es.js asynchronously, decodes the compressed blob into a `Set` |
| `customDict` | Reads/writes `bestscreen.v3.p.<id>.proofdict`; auto-seed from cue list + Bible + scene proper nouns |
| `liveUnderline` | Walks viewport lines, wraps unknown tokens in `<span class="proof-mark proof-unknown">` |
| `suggestionEngine` | Levenshtein-2 with Damerau-aware (transposition) tie-break; ranks by dictionary frequency if known |
| `ruleEN` / `ruleES` | Layer 3 rule packs per language (tense, format, repetition, cliché) |
| `clusterer` | Levenshtein-clusters character cue spellings & location slugs into canonical-vs-variants |
| `aiPass` | Builds the AI prompt (Fountain + lang + style guide), streams via `AI.stream`, parses JSON lines |
| `panel` | Renders the sidebar tab, handles filters and accept actions |

### Dictionary asset files

`dict-en.js` and `dict-es.js` ship as static JS assets. Each one is a single `const DICT_EN = "<base64-encoded LZ-string-compressed wordlist>";` declaration. On `loadDictForProject`, we LZ-decompress (algorithm inlined into proofcheck.js, ~80 LOC) and split on `\n` into a `Set`. This avoids the 250–350 KB gzipped asset blocking initial paint.

**Wordlist sources** (license-checked, all MIT/BSD/public domain):
- EN: derived from SCOWL "size 70" or `english-words` Hunspell base (LGPL — switch to MIT alternative if license incompatible; `wordlist` npm package's public-domain extract works)
- ES: RAE-derived "lemario-espanol" public-domain list (~180k entries)

If the user's browser blocks the dict load (offline, slow CDN), Layer 1 (native browser spellcheck) continues to provide red squiggles. No silent failure.

### Sidebar tab markup

```html
<button class="side-tab" data-tab="proof">Proof</button>
```

Sidebar body when "proof" is active:

```html
<div id="proof-panel">
  <div class="proof-toolbar">
    <button class="btn primary" id="proof-run">Run check</button>
    <div class="proof-lang">
      <button data-lang="en" class="active">EN</button>
      <button data-lang="es">ES</button>
    </div>
    <span class="proof-meta">23 issues · last run 2m ago</span>
  </div>
  <div class="proof-filters">
    <button class="chip" data-sev="error">●3</button>
    <button class="chip" data-sev="warning">●8</button>
    <button class="chip" data-sev="suggestion">●12</button>
    <span class="sep"></span>
    <button class="chip" data-cat="spelling">Spelling</button>
    ...
  </div>
  <div class="proof-list">
    <div class="proof-row" data-id="...">
      <div class="proof-row-meta">
        <span class="dot error"></span>
        <span class="cat">Format</span>
        <span class="line">Line 124</span>
      </div>
      <div class="proof-row-diff">
        <span class="strike">INTERIOR</span>
        <span class="arrow">→</span>
        <span class="add">INT.</span>
      </div>
      <div class="proof-row-reason">Standard Fountain slug.</div>
      <div class="proof-row-actions">
        <button class="btn small">Accept</button>
        <button class="btn small ghost">Skip</button>
      </div>
    </div>
  </div>
  <div class="proof-bulk">
    <button class="btn small">Accept all Errors</button>
    <button class="btn small ghost">Accept all in Format</button>
  </div>
</div>
```

### Titlebar language chip

In the existing titlebar, between project name and the autosave chip:

```html
<button id="proof-lang-chip" class="chip" title="Proof language">EN</button>
```

Click → toggles to ES, triggers `Proof.setLanguage("es")`, persists `meta.language`.

## Data flow

### Live pass (Layer 2)

```
user types
  → editor onInput
    → Proof.scheduleLivePass()  [debounced 400ms]
      → for each line in viewport ± 200:
        → strip cues, slugs, parentheticals (separately handled)
        → tokenize words
        → for each unknown token: wrap in <span class="proof-mark proof-unknown">
          → click/hover → popover with Levenshtein suggestions + Add/Ignore
```

### Deep pass

```
user clicks Run check
  → Proof.runDeepCheck()
    → runLocalRules() [synchronous, ~50ms]
      → render Layer 3 issues immediately
    → runAiPass() [async, streams]
      → chunk Fountain at scene boundaries if > 3 scenes
      → for each chunk: AI.stream() with the proofcheck prompt
        → parse JSON lines as they arrive, push into issues, re-render
      → resolve when last chunk done
    → update lastRunAt
```

### Accept flow

```
user clicks Accept on an issue
  → Proof.acceptIssue(id)
    → find issue.lineIdx, get the line
    → replace issue.range with issue.suggestion
    → markRevised(line), setDirty()
    → issue.appliedAt = Date.now()
    → re-render row in "done" state, fade out after 800 ms
```

## Per-project state

```
bestscreen.v3.p.<id>.proofdict     { words: ["JANE","RIKER","Bechdel"], ignored: [] }
bestscreen.v3.p.<id>.meta          { ..., language: "en"|"es" }
```

Custom dictionary auto-seeds on first dict load with:
- every distinct character cue (stripped of `(V.O.)` etc.)
- every Bible character `name`
- every ALL-CAPS proper noun in scene headings that doesn't match a regular English/Spanish word

User additions persist. "Ignore for session" is in-memory only.

**Fountain round-trip:** `bs:dict=` and `bs:lang=` in the title-page meta:

```
Title: My Script
Author: ...
bs:lang=en
bs:dict=JANE,RIKER,Bechdel
```

So exporting to .fountain and re-importing preserves both.

## UI: live underline visual

Distinct from existing line decorations:

| Decoration | Color | Style |
|---|---|---|
| Browser spellcheck | red | wavy underline (browser default) |
| Proof unknown word | `--proof-warn` (warm orange, like `#c97f1a`) | dotted underline 1px offset 2px |
| Comment marker | yellow margin | margin pip + bg tint |
| Page break "END OF PAGE N" | gray | divider rule |
| Revision asterisk | per-revision color | right-margin `*` |

The orange dotted underline reads as "soft warning, not error" — distinguishes Proof from browser-flagged misspellings.

## UI: severity dots

- Error (red, `#cf3a37`) — formatting or grammar must-fix
- Warning (amber, `#dfa116`) — likely problem worth review
- Suggestion (blue, `#3878b8`) — style hint, optional

## Performance budget

| Operation | Budget | Strategy |
|---|---|---|
| Dict load (EN or ES) | < 200 ms after project open | lazy on first Proof use OR after initial paint, whichever first |
| Live pass | < 30 ms / debounce | viewport-limited, incremental |
| Local rule pass (Layer 3) | < 150 ms on 120-page script | one walk, no DOM writes until end |
| AI pass (Layer 4) | streams, total < 30 s for 90-page script | scene-boundary chunks of ≤ 8000 chars; up to 4 chunks in flight |

If perf budgets exceed: chunk the live pass into requestIdleCallback slices, and gate AI chunks behind concurrency limits (we already have streaming infra from Scene Zoom).

## Phasing

### Phase 1 — Live spelling that doesn't suck

**Deliverables:**
- `proofcheck.js` scaffold + module global
- `dict-en.js`, `dict-es.js` assets shipped
- Lazy dict load + LZ unpack
- Per-project custom dict (`proofdict`) — auto-seed + manual add
- `meta.language` plumbed end-to-end (Storage, Fountain round-trip)
- Titlebar EN ⇄ ES chip
- Live underline pass (viewport-limited, debounced)
- Hover/right-click popover with suggestions, Add to dict, Ignore
- ⌘. shortcut to accept top suggestion when caret is on a flagged token

**Verification:**
- Open EN project, misspell "thier" → orange dotted underline
- Hover → popover shows "their", "there", "thier" not in dict
- Add "JANEZ" (made-up name) to dict → underline clears, persists across reload
- Switch to ES project — dict swaps, "perro" is fine, "perr" is flagged
- Character cue "JANEZ" never gets underlined (cue is in seed)
- Export to .fountain → `bs:lang=en` + `bs:dict=JANEZ,...` in title-page meta → re-import preserves both

**Estimate:** 4–6 hours of work, ~700 LOC + dict assets.

### Phase 2 — Deep panel with local rules

**Deliverables:**
- "Proof" sidebar tab + panel scaffold
- Run check button + filter chips + issue rows + jump-to-line + accept/skip + mass actions
- Rule packs:
  - `ruleEN.tense` — past-tense detection in action lines
  - `ruleES.tense` — pretérito/imperfecto in action lines
  - `ruleEN.format` / `ruleES.format` — slug format, CUT TO: colon, cue format, parenthetical placement
  - `ruleEN.cliche` / `ruleES.cliche` — built-in lists (~100 each)
  - `clusterer.names` — Levenshtein cluster cue spellings
  - `clusterer.locations` — same on slugs
  - `repetition` — sliding 50-word window
- ⌘⇧L shortcut → Run check

**Verification:**
- Action line "Bob walked into the room" → flagged: tense, suggested "walks"
- Scene heading "INTERIOR KITCHEN - DAY" → flagged: format, suggested "INT. KITCHEN - DAY"
- Two cues "JANE" and "JAYNE" both used → flagged: consistency, both clustered under "JANE"
- Word "suddenly" used 5 times in 30 lines → flagged: repetition
- Click any issue → editor jumps + pulses + popover
- Accept → line updated, undo toast appears
- Accept all Errors → batch apply

**Estimate:** 3–4 hours, ~400 LOC.

### Phase 3 — AI deep pass

**Deliverables:**
- AI prompt template (in EN and ES variants) — sends Fountain + language + Bible style guide context
- Scene-boundary chunking for scripts > ~3 scenes
- JSON-line streaming parser
- Issues from AI streamed into the same panel, prefixed by an "AI" badge
- Cost guard: if document > 50 pages, show a "this will use approximately N tokens — continue?" confirm
- Settings: enable/disable AI pass per Run

**Verification:**
- Run check on a 5-scene script → after Layer 3 issues populate, AI streams in word-choice / flow suggestions
- Big script (60+ pages) shows token confirm before AI runs
- Disable AI → only Layer 3 runs

**Estimate:** 2–3 hours, ~200 LOC.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Dictionary asset weight blocks paint | Lazy load gated behind first Proof use OR `requestIdleCallback`. Browser native spellcheck stays on as fallback. |
| Wordlist license issues | Source-verify before bundling. Have a clean MIT EN list (e.g., 1-of-the SCOWL "general size 50" exports) and a clean public-domain ES list (RAE-derived community lists). Document source in the dict asset file header. |
| Live underline performance on 120-page scripts | Viewport-limited pass + 400 ms debounce + `requestIdleCallback` chunking. Re-run only on insertions/deletions, not pure caret moves. |
| AI pass cost on huge scripts | Scene-boundary chunking + per-chunk token estimate + > 50-page confirm dialog + per-project disable. |
| Custom dict pollution (user accidentally adds "thier") | "Manage custom dictionary" link in Proof panel toolbar opens an editable modal. |
| Bilingual scripts (English action + Spanish dialogue) | Phase 1 ships strict per-project setting. Phase 2 considers a per-line language tag via `data-lang="es"`. Out of scope until requested. |

## File layout summary

```
proofcheck.js        new  ~800 LOC
dict-en.js           new  ~250 KB asset, ~20 LOC wrapper
dict-es.js           new  ~350 KB asset, ~20 LOC wrapper
app.js               mod  +30  (language meta, titlebar chip, shortcuts)
panels.js            mod  +150 (Proof sidebar tab)
editor.js            mod  +20  (live pass hook)
index.html           mod  +25  (sidebar tab, panel skeleton, titlebar chip slot, script tag)
styles.css           mod  +180 (orange underline, panel, severity dots, chip)
storage.js           mod  +15  (getProofDict/setProofDict, language in meta default)
io.js                mod  +20  (bs:lang, bs:dict round-trip)
```

Net ~1240 LOC across 8 files + ~600 KB of dictionary assets (loaded lazily).

## Open questions for the user before implementation

1. **Wordlist sources** — Phase 1 will commit one specific MIT/public-domain list per language. Recommended:
   - EN: `dwyl/english-words` (Unlicense, ~370k entries — too big; will sample down to ~120k by filtering to common-words list)
   - ES: derived from public-domain RAE lemario (~180k entries)

   If the user has a preferred source (e.g., a Hunspell `.dic` already trusted), say so before Phase 1 starts.

2. **Bilingual scripts** — Phase 1 is strictly per-project. If you write a script with English action + Spanish dialogue, you'll get false-positives in dialogue. Confirm this is OK to defer.

— end of spec —
