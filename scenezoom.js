"use strict";
/* =============================================================================
 * BESTSCREEN SCENE ZOOM — per-scene BMOC analysis + chat + AI rewrite + diff
 *
 * Exposes window.SceneZoom = { open, close, render, bind }
 * Persists per-scene state under bestscreen.v3.p.<id>.scenezoom
 * ============================================================================= */

const SceneZoom = (() => {
  // Peter Russell's BMOC methodology (mirrors docs/frameworks/bmoc.md).
  // Inlined here because Bestscreen has no build step — the AI prompts need
  // this text at runtime in the browser.
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
    _renderBmocCol();
    _renderChatCol();
  }

  function _aiReady() {
    if (typeof AI === "undefined") return false;
    if (typeof AI.isConfigured === "function") return AI.isConfigured();
    const local = (typeof window !== "undefined" && window.BS_CONFIG && window.BS_CONFIG.ai) || {};
    const stored = (typeof Storage !== "undefined" && Storage.getSettings) ? (Storage.getSettings().ai || {}) : {};
    return !!(local.apiKey || stored.apiKey);
  }

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
      if (l.type === "parenthetical") return l.text.startsWith("(") ? l.text : "(" + l.text + ")";
      return l.text;
    }).join("\n");
  }

  function _stripJsonFences(s) {
    return (s || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  async function _runAnalyze() {
    if (!_currentSceneId) return;
    if (!_aiReady()) {
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
      bmocPattern: Array.isArray(parsed.bmocPattern) ? parsed.bmocPattern.slice(0, 4) : ["no","no","no","no"],
      patternLabel: parsed.patternLabel || "",
      tickingClock: parsed.tickingClock || "",
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      beatCard: parsed.beatCard || {},
      rewritePriority: parsed.rewritePriority || "",
      rawModelOutput: raw,
    };
    _saveBlob();
    _renderBmocCol({ kind: "loaded" });
    _seedDiagnosisChatMessage();
  }

  function _seedDiagnosisChatMessage() {
    if (!_currentSceneId) return;
    const rec = _getSceneRecord(_currentSceneId);
    if (!rec?.analysis) return;
    if ((rec.chat || []).some(m => m.kind === "diagnosis-seed")) return;
    const a = rec.analysis;
    const summary = `Diagnosis:\n• Beat question — ${a.beatQuestion}\n• Pattern — ${(a.bmocPattern || []).join("-")} (${a.patternLabel || ""})\n• Flags fired — ${(a.flags || []).map(f => f.mode).join(", ") || "none"}\n• Rewrite priority — ${a.rewritePriority || "(none specified)"}\n\nAsk follow-ups or click ✨ Rewrite from any of your messages to generate a candidate.`;
    rec.chat = rec.chat || [];
    rec.chat.unshift({ id: _genId(), role: "ai", text: summary, ts: Date.now(), kind: "diagnosis-seed" });
    _saveBlob();
    _renderChatCol();
  }

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
      {"&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"}[c]
    ));
  }

  function _setRerunVisibility(show) {
    const btn = document.getElementById("sz-rerun");
    if (btn) btn.hidden = !show;
  }

  function _renderBmocCol(state) {
    const body = document.getElementById("sz-bmoc-body");
    if (!body) return;
    if (!_currentSceneId) { body.innerHTML = ""; return; }
    const rec = _getSceneRecord(_currentSceneId);

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
        <div class="bmoc-empty"><p>Run BMOC analysis to get a Beat Card, failure-mode scan, and ranked fixes.</p></div>
        <div class="bmoc-actions"><button class="sz-btn sz-btn-primary" id="sz-run-analyze">Run BMOC analysis</button></div>`;
      document.getElementById("sz-run-analyze")?.addEventListener("click", _runAnalyze);
      _setRerunVisibility(false);
      return;
    }

    if (state.kind === "streaming") {
      body.innerHTML = `
        <div class="bmoc-empty">Analyzing…</div>
        <pre style="font-size:11px;color:var(--muted);white-space:pre-wrap;max-height:200px;overflow:auto;background:var(--bg);padding:6px;border-radius:4px">${_esc(state.text || "")}</pre>`;
      _setRerunVisibility(false);
      return;
    }

    if (state.kind === "error") {
      body.innerHTML = `<div class="bmoc-empty">Analysis failed: ${_esc(state.message)}</div>
        <div class="bmoc-actions"><button class="sz-btn" id="sz-run-analyze">Try again</button></div>`;
      document.getElementById("sz-run-analyze")?.addEventListener("click", _runAnalyze);
      return;
    }

    if (state.kind === "parse-fail") {
      body.innerHTML = `
        <div class="bmoc-empty">Couldn't parse the response as structured JSON. Raw output:</div>
        <pre style="font-size:11px;white-space:pre-wrap;background:var(--bg);padding:8px;border-radius:4px;max-height:280px;overflow:auto">${_esc(state.raw)}</pre>
        <div class="bmoc-actions"><button class="sz-btn" id="sz-run-analyze">Re-run</button></div>`;
      document.getElementById("sz-run-analyze")?.addEventListener("click", _runAnalyze);
      _setRerunVisibility(true);
      return;
    }

    const a = rec.analysis;
    const pipsHtml = (a.bmocPattern || []).map((v, i) =>
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
    document.getElementById("sz-run-rewrite")?.addEventListener("click", () => _runRewrite());
    document.getElementById("sz-show-beatcard")?.addEventListener("click", () => _showBeatCardModal(a.beatCard));
  }

  function _runRewrite() { console.log("Rewrite — implemented in Task 14"); }
  function _showBeatCardModal(card) {
    const body = JSON.stringify(card || {}, null, 2);
    if (typeof bsConfirm === "function") {
      bsConfirm({ title: "Beat Card", body: `<pre style='max-height:60vh;overflow:auto;font-size:11.5px;white-space:pre-wrap'>${_esc(body)}</pre>`, okText: "Close", cancelText: "" });
    } else {
      alert(body);
    }
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

  function _genId() { return "m_" + Math.random().toString(36).slice(2, 10); }

  const BMOC_DISCUSS_PROMPT = `${BMOC_REFERENCE}

You are continuing a focused conversation about ONE scene. Stay in BMOC terms.
Be direct, specific, and constructive — not generic writing advice. Reference
the Beat Card and the current scene text concretely.

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

  function _renderChatCol() {
    const body = document.getElementById("sz-chat-body");
    if (!body || !_currentSceneId) return;
    const rec = _getSceneRecord(_currentSceneId);
    const input = document.getElementById("sz-chat-input");
    const sendBtn = document.getElementById("sz-chat-send");
    const headEl = document.getElementById("sz-chat-head");
    const clearBtn = document.getElementById("sz-chat-clear");

    if (!rec?.analysis) {
      body.innerHTML = `<div class="sz-chat-empty">Run analysis first to start a conversation.</div>`;
      if (input) { input.placeholder = "Run analysis first…"; input.disabled = true; }
      if (sendBtn) sendBtn.disabled = true;
      if (headEl) headEl.textContent = "Discuss";
      if (clearBtn) clearBtn.hidden = true;
      return;
    }

    if (input) { input.disabled = false; input.placeholder = "Ask, or steer the rewrite…"; }
    if (sendBtn) sendBtn.disabled = false;

    const msgs = rec.chat || [];
    if (headEl) headEl.textContent = `Discuss · ${msgs.length} msgs`;
    if (clearBtn) clearBtn.hidden = msgs.length === 0;

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

  async function _sendChat(text) {
    if (!_currentSceneId) return;
    if (!_aiReady()) {
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

    document.getElementById("sz-rerun")?.addEventListener("click", _runAnalyze);

    const chatInput = document.getElementById("sz-chat-input");
    const chatSend = document.getElementById("sz-chat-send");
    const sendNow = async () => {
      const text = (chatInput?.value || "").trim();
      if (!text || chatInput?.disabled) return;
      chatInput.value = "";
      await _sendChat(text);
    };
    chatSend?.addEventListener("click", sendNow);
    chatInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendNow(); }
    });
    document.getElementById("sz-chat-clear")?.addEventListener("click", _clearChat);
  }

  return { open, close, render, bind };
})();

if (typeof window !== "undefined") window.SceneZoom = SceneZoom;
