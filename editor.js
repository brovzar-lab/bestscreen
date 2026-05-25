"use strict";
/* editor.js — line classification, keydown/input handlers, char-hover popover, dual dialogue, smart typography, autocomplete, typewriter mode, voice dictation. */

/* =====================================================================
 * Classification
 * =================================================================== */

function classifyLine(text, prevText, prevType, nextText) {
  const t = (text || "").trim();
  if (!t) return "action";
  if (t.startsWith("!"))                                    return "action";
  if (t.startsWith(".") && !t.startsWith(".."))             return "scene";
  if (t.startsWith("@"))                                    return "character";
  if (t.startsWith(">") && t.endsWith("<"))                 return "centered";
  if (t.startsWith(">"))                                    return "transition";
  if (t.startsWith("#"))                                    return "section";
  if (t.startsWith("=") && !t.startsWith("=="))             return "synopsis";
  if (t.startsWith("[[") && t.endsWith("]]"))               return "note";
  if (SCENE_RE.test(t))                                     return "scene";
  if (t.startsWith("(") && t.endsWith(")")) {
    if (prevType === "character" || prevType === "dialogue" || prevType === "parenthetical") return "parenthetical";
  }
  if (TRANS_RE.test(t) && ALLCAPS_RE.test(t))               return "transition";
  if (ALLCAPS_RE.test(t) && t.endsWith(":"))                return "transition";
  if (ALLCAPS_RE.test(t) && !t.endsWith(":") && t.length > 0) {
    const stripped = t.replace(/[.,;!?]+$/, "").trim().toUpperCase();
    if (CHAR_BLACKLIST.has(stripped)) return "action";
    if (/^(END OF|ACT [A-Z]+|SCENE [A-Z0-9]+|PART [A-Z]+|CHAPTER )/i.test(stripped)) return "action";
    if ((nextText || "").trim()) return "character";
  }
  if ((prevType === "character" || prevType === "parenthetical") && (prevText || "").trim() !== "") return "dialogue";
  if (prevType === "dialogue" && (prevText || "").trim() !== "") return "dialogue";
  return "action";
}

function reclassifyAll() {
  const lines = $$("#editor > div");
  let prevText = "", prevType = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.textContent;
    const nextText = (i+1 < lines.length) ? (lines[i+1].textContent || "") : "";
    let type;
    if (line.dataset.forced === "true") type = line.dataset.type || classifyLine(text, prevText, prevType, nextText);
    else type = classifyLine(text, prevText, prevType, nextText);
    line.dataset.type = type;
    line.classList.toggle("empty", text.trim().length === 0);
    if (text.trim().length === 0) line.setAttribute("data-placeholder", placeholderFor(type, prevType));
    else line.removeAttribute("data-placeholder");
    prevText = text; prevType = type;
  }
  applySceneSentiment();
  applyPaceColors();
  applyMoodToPage();
  applyCommentMarkers();
  updateStatus();
  updateSidebar();
  updateInspector();
  bumpDailyStreak();
}
function placeholderFor(type, prevType) {
  switch (type) {
    case "scene": return "INT. LOCATION - TIME";
    case "character": return "CHARACTER";
    case "dialogue": return "Dialogue…";
    case "parenthetical": return "(beat)";
    case "transition": return "CUT TO:";
    default: return prevType === "" ? "Start writing…" : "";
  }
}

/* =====================================================================
 * Editor mechanics
 * =================================================================== */

function currentLine() {
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode) return null;
  let n = sel.anchorNode;
  while (n && n.parentNode !== editor) n = n.parentNode;
  if (n && n.parentNode === editor) return n;
  return null;
}
function ensureLineDiv() {
  if (editor.childNodes.length === 0) {
    const d = document.createElement("div");
    d.dataset.type = "action"; d.innerHTML = "<br>";
    editor.appendChild(d);
    placeCursor(d, 0);
  }
  Array.from(editor.childNodes).forEach(n => {
    if (n.nodeType === 3 || (n.nodeType === 1 && n.tagName !== "DIV")) {
      const d = document.createElement("div");
      d.dataset.type = "action";
      n.parentNode.insertBefore(d, n);
      d.appendChild(n);
    }
  });
  $$("#editor > div").forEach(d => { if (d.childNodes.length === 0) d.innerHTML = "<br>"; });
}
function placeCursor(node, offset) {
  const r = document.createRange();
  let target = node;
  if (node.nodeType === 1) {
    if (node.firstChild && node.firstChild.nodeType === 3) target = node.firstChild;
    else if (node.firstChild && node.firstChild.tagName === "BR") {
      r.setStartBefore(node.firstChild); r.collapse(true);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      return;
    }
  }
  const len = target.nodeType === 3 ? target.textContent.length : 0;
  r.setStart(target, Math.min(offset, len)); r.collapse(true);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
function getCaretOffsetInLine(line) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const r = sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(line);
  r.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return r.toString().length;
}
function cycleType(line, dir = 1) {
  const curr = line.dataset.type || "action";
  let idx = CYCLE.indexOf(curr); if (idx === -1) idx = 0;
  idx = (idx + dir + CYCLE.length) % CYCLE.length;
  forceType(line, CYCLE[idx]);
}
function forceType(line, type) {
  line.dataset.type = type; line.dataset.forced = "true";
  markRevised(line); logChange(line, "type", type);
  reclassifyAll();
}
function nextTypeAfter(t) {
  return { scene:"action", action:"action", character:"dialogue", dialogue:"action",
           parenthetical:"dialogue", transition:"scene" }[t] || "action";
}
function markRevised(line) {
  if (!line) return;
  if (appState.activeRevision && appState.activeRevision !== "white") line.dataset.rev = appState.activeRevision;
  else delete line.dataset.rev;
}

function onEditorKeydown(e) {
  const line = currentLine();
  if (ac.classList.contains("show")) {
    if (e.key === "ArrowDown") { e.preventDefault(); acMove(1); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); acMove(-1); return; }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); acAccept(); return; }
    if (e.key === "Escape") { e.preventDefault(); acClose(); return; }
  }
  if (e.key === "Tab") {
    e.preventDefault();
    if (line) cycleType(line, e.shiftKey ? -1 : 1);
    return;
  }
  if (e.key === "Enter") {
    if (e.shiftKey) return;
    e.preventDefault();
    if (!line) return;
    const currentType = line.dataset.type || "action";
    const text = line.textContent;
    const off = getCaretOffsetInLine(line);
    const before = text.substring(0, off);
    const after  = text.substring(off);
    line.textContent = before || ""; if (!line.textContent) line.innerHTML = "<br>";
    const nd = document.createElement("div");
    let newType;
    if (after.trim() === "") {
      if (currentType === "character" && before.trim() === "") {
        line.dataset.type = "action"; line.dataset.forced = "false";
        reclassifyAll(); return;
      }
      newType = nextTypeAfter(currentType);
    } else newType = currentType;
    nd.dataset.type = newType;
    nd.dataset.forced = (newType !== "action" && newType !== "dialogue") ? "true" : "false";
    if (after) nd.textContent = after; else nd.innerHTML = "<br>";
    markRevised(nd);
    line.parentNode.insertBefore(nd, line.nextSibling);
    placeCursor(nd, 0);
    reclassifyAll(); setDirty();
    return;
  }
  if (e.key === "Backspace") {
    if (!line) return;
    const off = getCaretOffsetInLine(line);
    if (off === 0 && line.textContent === "") {
      const prev = line.previousElementSibling;
      if (prev) {
        e.preventDefault();
        line.remove();
        placeCursor(prev, prev.textContent.length);
        reclassifyAll(); setDirty();
        return;
      }
    }
  }
  if (isModKey(e) && /^[1-6]$/.test(e.key)) {
    e.preventDefault();
    const map = { "1":"scene","2":"action","3":"character","4":"dialogue","5":"parenthetical","6":"transition" };
    if (line) forceType(line, map[e.key]); return;
  }
  if (isModKey(e) && (e.key === "r" || e.key === "R") && !e.shiftKey) {
    e.preventDefault();
    if (line) { if (line.dataset.rev) delete line.dataset.rev; else line.dataset.rev = appState.activeRevision || "white"; setDirty(); }
    return;
  }
  if (isModKey(e) && e.key === "/") {
    e.preventDefault();
    if (line) {
      const t = line.textContent;
      if (line.dataset.type === "note") {
        line.dataset.type = "action"; line.dataset.forced = "false";
        line.textContent = t.replace(/^\[\[/,"").replace(/\]\]$/,"");
      } else {
        line.dataset.type = "note"; line.dataset.forced = "true";
        line.textContent = "[[" + (t || "note") + "]]";
      }
      reclassifyAll(); setDirty();
    }
    return;
  }
  if (isModKey(e) && (e.key === ";" || e.key === ":")) {
    e.preventDefault();
    if (line) openCommentPopover(line);
    return;
  }
  if (isModKey(e) && (e.key === "'" || e.key === '"')) {
    e.preventDefault();
    toggleTypewriter();
    return;
  }
  if (isModKey(e) && (e.key === "d" || e.key === "D")) {
    e.preventDefault();
    toggleDualDialogueAt(line);
    return;
  }
}

function onEditorInput() {
  ensureLineDiv();
  const line = currentLine();
  if (line) {
    smartTypoOnInput(line);
    const t = line.textContent;
    if (SCENE_RE.test(t.trim()) && line.dataset.type !== "scene") line.dataset.type = "scene";
    if (TRANS_RE.test(t.trim()) && ALLCAPS_RE.test(t.trim()))     line.dataset.type = "transition";
    if (ALLCAPS_RE.test(t.trim()) && t.trim().endsWith(":"))       line.dataset.type = "transition";
    if (t.trim().startsWith("(")) {
      const prev = line.previousElementSibling;
      if (prev && (prev.dataset.type === "character" || prev.dataset.type === "dialogue" || prev.dataset.type === "parenthetical")) {
        line.dataset.type = "parenthetical";
      }
    }
    markRevised(line);
    if (appState.typewriter) tightenTypewriter();
  }
  reclassifyAll(); setDirty();
  maybeShowAutocomplete();
}

function isModKey(e) { return e.metaKey || e.ctrlKey; }

/* =====================================================================
 * Character-name hover popover (bible linking)
 *
 * Mouse over any character cue or an ALL-CAPS name mention in action/dialogue
 * and a small popover floats nearby showing the bible entry (role, want, need,
 * flaw). Click the popover to jump to the Bible view's character card.
 * =================================================================== */
let charHoverPopEl = null;
let charHoverTimer = null;

function ensureCharHoverPop() {
  if (charHoverPopEl) return charHoverPopEl;
  charHoverPopEl = document.createElement("div");
  charHoverPopEl.className = "char-hover-pop";
  charHoverPopEl.style.cssText = "position:absolute;display:none;background:var(--paper);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow-2);padding:10px 12px;min-width:220px;max-width:300px;z-index:90;font-size:12.5px;line-height:1.45;color:var(--ink);cursor:pointer";
  $("#main").appendChild(charHoverPopEl);
  charHoverPopEl.addEventListener("mouseleave", hideCharHover);
  charHoverPopEl.addEventListener("click", () => {
    const name = charHoverPopEl.dataset.name;
    setView("bible");
    setTimeout(() => {
      // Scroll the right character card into view
      const cards = $$(".bib-char");
      const target = cards.find(c => c.querySelector(".bib-name")?.value?.toUpperCase() === name);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("nav-target");
      setTimeout(() => target?.classList.remove("nav-target"), 1200);
    }, 200);
    hideCharHover();
  });
  return charHoverPopEl;
}

function showCharHover(name, x, y) {
  const c = Bible.getCharacterByName(name);
  const pop = ensureCharHoverPop();
  if (!c) {
    pop.innerHTML = `<div style="font-family:var(--font-screen);font-weight:700;font-size:12px">${escapeHtml(name)}</div>
      <div style="color:var(--muted);font-size:11px;margin-top:4px">Not in Bible yet — opens the Bible view to add.</div>`;
    pop.dataset.name = name;
  } else {
    const parts = [];
    if (c.role)   parts.push(`<div style="color:var(--muted);font-size:11px">${escapeHtml(c.role)}</div>`);
    if (c.want)   parts.push(`<div><b style="color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Want</b> ${escapeHtml(c.want)}</div>`);
    if (c.need)   parts.push(`<div><b style="color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Need</b> ${escapeHtml(c.need)}</div>`);
    if (c.flaw)   parts.push(`<div><b style="color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Flaw</b> ${escapeHtml(c.flaw)}</div>`);
    if (c.traits) parts.push(`<div><b style="color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Traits</b> ${escapeHtml(c.traits)}</div>`);
    if (parts.length === 0) parts.push(`<div style="color:var(--muted);font-size:11px">No details yet — click to open.</div>`);
    pop.innerHTML =
      `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
        <div style="width:24px;height:24px;border-radius:5px;background:${c.avatar};color:#fff;display:grid;place-items:center;font-family:var(--font-screen);font-weight:700;font-size:10px;flex:0 0 auto">${escapeHtml((c.name||"?").slice(0,2))}</div>
        <div style="font-family:var(--font-screen);font-weight:700;font-size:12px">${escapeHtml(c.name)}</div>
      </div>` + parts.join("");
    pop.dataset.name = c.name;
  }
  // Position relative to #main
  const mainRect = $("#main").getBoundingClientRect();
  const popMaxLeft = mainRect.width - 320;
  pop.style.left = Math.min(popMaxLeft, x - mainRect.left + 12) + "px";
  pop.style.top  = (y - mainRect.top + $("#main").scrollTop + 18) + "px";
  pop.style.display = "block";
}

function hideCharHover() {
  if (charHoverPopEl) charHoverPopEl.style.display = "none";
}

function attachCharHover() {
  let lastName = null;
  editor.addEventListener("mousemove", (e) => {
    // Find the line under the cursor
    const target = e.target.closest("#editor > div");
    if (!target) return clearTimeout(charHoverTimer);
    let name = null;
    if (target.dataset.type === "character") {
      name = target.textContent.replace(/\s*\(.*\)\s*$/, "").trim().toUpperCase();
    } else if (["action","dialogue"].includes(target.dataset.type)) {
      // Find the ALL-CAPS word under the cursor by inspecting selection caret
      const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (range && range.startContainer.nodeType === 3) {
        const txt = range.startContainer.textContent;
        // Walk left/right from caret to find a word
        let l = range.startOffset, r = range.startOffset;
        while (l > 0 && /[A-Z'\-]/.test(txt[l-1])) l--;
        while (r < txt.length && /[A-Z'\-]/.test(txt[r])) r++;
        const word = txt.substring(l, r);
        if (word && word.length >= 2 && word === word.toUpperCase() && /^[A-Z]/.test(word)) {
          // Only show if this name is actually in cast / bible
          const cast = analyzeCharacters().map(c => c.name);
          if (cast.includes(word)) name = word;
        }
      }
    }
    if (name && name === lastName) return;
    lastName = name;
    clearTimeout(charHoverTimer);
    if (name) {
      charHoverTimer = setTimeout(() => {
        const rect = target.getBoundingClientRect();
        showCharHover(name, e.clientX, rect.top);
      }, 250);
    } else {
      hideCharHover();
    }
  });
  editor.addEventListener("mouseleave", () => { clearTimeout(charHoverTimer); hideCharHover(); });
}

/* =====================================================================
 * Dual dialogue (Fountain ^)
 * =================================================================== */
function getDialogueBlockAround(line) {
  if (!line) return null;
  const lines = $$("#editor > div");
  let idx = lines.indexOf(line);
  if (idx < 0) return null;
  while (idx >= 0 && lines[idx].dataset.type !== "character") {
    const t = lines[idx].dataset.type;
    if (t === "scene" || t === "action" || t === "transition") return null;
    idx--;
  }
  if (idx < 0) return null;
  const block = [lines[idx]];
  for (let j = idx + 1; j < lines.length; j++) {
    const t = lines[j].dataset.type;
    if (t === "dialogue" || t === "parenthetical") block.push(lines[j]);
    else break;
  }
  return { startIdx: idx, lines: block };
}

function toggleDualDialogueAt(line) {
  if (!line) return toast("Place cursor in a dialogue block first");

  // If already inside a .dual-pair, undo it
  const wrap = line.closest("div.dual-pair");
  if (wrap) {
    Array.from(wrap.children).forEach(half => {
      Array.from(half.children).forEach(child => editor.insertBefore(child, wrap));
    });
    wrap.remove();
    reclassifyAll(); setDirty();
    return toast("Dual dialogue removed");
  }

  const right = getDialogueBlockAround(line);
  if (!right) return toast("Cursor isn't in a dialogue block");

  // Walk back from this block's start to find the previous adjacent character cue
  const lines = $$("#editor > div");
  let i = right.startIdx - 1;
  while (i >= 0) {
    const t = lines[i].dataset.type;
    if (t === "character") break;
    if (t === "scene" || t === "action" || t === "transition") return toast("Need two adjacent character blocks");
    i--;
  }
  if (i < 0) return toast("No previous character cue found");
  const left = getDialogueBlockAround(lines[i]);
  if (!left || left.startIdx >= right.startIdx) return toast("Blocks must be adjacent");

  const wrapper = document.createElement("div");
  wrapper.className = "dual-pair";
  const leftCol = document.createElement("div");
  const rightCol = document.createElement("div");
  wrapper.appendChild(leftCol);
  wrapper.appendChild(rightCol);
  editor.insertBefore(wrapper, left.lines[0]);
  left.lines.forEach(n => leftCol.appendChild(n));
  right.lines.forEach(n => rightCol.appendChild(n));

  reclassifyAll(); setDirty();
  toast("Dual dialogue applied (⌘D again to undo)");
}

/* =====================================================================
 * Smart typography
 * =================================================================== */
function smartTypoOnInput(line) {
  if (!appState.smartTypo) return;
  const t = line.textContent;
  let out = t.replace(/--/g, "—").replace(/\.\.\./g, "…");
  if (line.dataset.type === "dialogue" || line.dataset.type === "action" || line.dataset.type === "parenthetical") {
    out = out.replace(/(^|[\s\(\[\{“])"/g, "$1“").replace(/"/g, "”")
             .replace(/(^|[\s\(\[\{“])'/g, "$1‘").replace(/'/g, "’");
  }
  if (out !== t) {
    const off = getCaretOffsetInLine(line);
    line.textContent = out;
    placeCursor(line, off + (out.length - t.length));
  }
}

/* =====================================================================
 * Autocomplete
 * =================================================================== */
let acItems = []; let acIndex = 0; let acContext = null;
function gatherCharacters() {
  const set = new Set();
  $$("#editor > div[data-type='character']").forEach(d => {
    const name = d.textContent.trim().replace(/^@/,"").replace(/\s*\(.*\)\s*$/,"").toUpperCase();
    if (name) set.add(name);
  });
  return Array.from(set).sort();
}
function gatherSlugs() {
  const set = new Set();
  $$("#editor > div[data-type='scene']").forEach(d => {
    const t = d.textContent.trim().replace(/^\./,"");
    if (t) set.add(t.toUpperCase());
  });
  return Array.from(set).sort();
}
function maybeShowAutocomplete() {
  const line = currentLine(); if (!line) return acClose();
  const t = line.textContent, type = line.dataset.type;
  let matches = [], prefix = "";
  if (type === "character" && t.trim().length > 0) {
    prefix = t.trim().toUpperCase();
    matches = gatherCharacters().filter(n => n !== prefix && n.startsWith(prefix));
    acContext = { kind: "char", line, prefix };
  } else if (type === "scene") {
    const m = t.match(/^(\.|INT\.?|EXT\.?|EST\.?|INT\.?\/EXT\.?|I\.?\/E\.?)\s*(.*)$/i);
    if (m && m[2].length > 0) {
      const head = m[1].toUpperCase() + " ";
      prefix = m[2].toUpperCase();
      matches = gatherSlugs().filter(s => s.startsWith(prefix.split(" - ")[0]) && s !== t.trim().toUpperCase());
      acContext = { kind: "scene", line, prefix, head };
    }
  }
  if (matches.length === 0) return acClose();
  acItems = matches.slice(0, 6); acIndex = 0;
  renderAutocomplete(); positionAutocomplete(line);
}
function renderAutocomplete() {
  ac.innerHTML = acItems.map((m,i) => `<div class="ac-item ${i===acIndex?'active':''}" data-i="${i}">${m}</div>`).join("");
  ac.classList.add("show");
  $$(".ac-item", ac).forEach(el => el.addEventListener("mousedown", e => {
    e.preventDefault(); acIndex = parseInt(el.dataset.i,10); acAccept();
  }));
}
function positionAutocomplete(line) {
  const rect = line.getBoundingClientRect();
  const stageRect = $("#main").getBoundingClientRect();
  ac.style.left = (rect.left - stageRect.left + $("#main").scrollLeft) + "px";
  ac.style.top  = (rect.bottom - stageRect.top + $("#main").scrollTop + 2) + "px";
}
function acMove(d) { acIndex = (acIndex + d + acItems.length) % acItems.length; renderAutocomplete(); }
function acAccept() {
  if (!acContext || !acItems[acIndex]) return acClose();
  const choice = acItems[acIndex], line = acContext.line;
  if (acContext.kind === "char") line.textContent = choice;
  else if (acContext.kind === "scene") line.textContent = acContext.head + choice;
  placeCursor(line, line.textContent.length);
  acClose(); reclassifyAll(); setDirty();
}
function acClose() { ac.classList.remove("show"); acItems = []; acContext = null; }

/* =====================================================================
 * Typewriter mode
 * =================================================================== */
function setTypewriter(on) {
  appState.typewriter = !!on;
  document.body.dataset.typewriter = on ? "true" : "";
  tightenTypewriter();
}
function toggleTypewriter() { setTypewriter(!appState.typewriter); }
function tightenTypewriter() {
  if (!appState.typewriter) return;
  $$("#editor > div").forEach(d => d.classList.remove("tw-active"));
  const line = currentLine();
  if (line) {
    line.classList.add("tw-active");
    const r = line.getBoundingClientRect();
    const m = $("#main");
    const targetTop = m.scrollTop + r.top - m.getBoundingClientRect().top - (m.clientHeight/2 - r.height/2);
    m.scrollTo({ top: targetTop, behavior: "smooth" });
  }
}

/* =====================================================================
 * Voice dictation
 * =================================================================== */
let dictation = null;
function toggleDictation() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast("Voice dictation not supported in this browser");
  if (dictation) {
    dictation.stop(); dictation = null;
    $("#btn-dictate").classList.remove("recording");
    return;
  }
  dictation = new SR();
  dictation.continuous = true; dictation.interimResults = true;
  dictation.onresult = e => {
    let finalText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
    }
    if (!finalText.trim()) return;
    handleDictatedPhrase(finalText.trim());
  };
  dictation.onerror = e => { toast("Mic error: " + e.error); dictation = null; $("#btn-dictate").classList.remove("recording"); };
  dictation.onend = () => { if (dictation) { dictation.start(); } };
  dictation.start();
  $("#btn-dictate").classList.add("recording");
  toast("Listening… try 'new scene', 'new character ELLA', or 'parenthetical beat'");
}

/* Voice commands & auto-classification.
   Phrases:
     "new scene" / "interior X / exterior X day|night"  → scene heading
     "new character X"                                  → character cue
     "parenthetical X"                                  → parenthetical
     "transition X" / "cut to" / "fade to black"        → transition
     "new line" / "next line"                           → blank action
     "section X"                                        → section
     "delete that"                                      → delete current line
   Otherwise: append to current line as-is. */
function handleDictatedPhrase(text) {
  const t = text.trim();
  const lc = t.toLowerCase();

  // Command parsing
  const newSceneMatch = lc.match(/^(?:new scene|scene heading|(?:interior|exterior|int|ext)(?:.*?)\s*(?:day|night|morning|evening|dawn|dusk|continuous|later)?)/i);
  const newCharMatch  = lc.match(/^(?:new character|character)\s+(.+)$/i);
  const parenMatch    = lc.match(/^(?:parenthetical|paren|aside)\s+(.+)$/i);
  const transMatch    = lc.match(/^(?:transition|cut to|smash cut to|dissolve to|fade to(?: black| white)?|fade out)\b(.*)$/i);
  const sectionMatch  = lc.match(/^(?:section|act)\s+(.+)$/i);

  if (lc === "new line" || lc === "next line") {
    insertNewBlankLine("action");
    return;
  }
  if (lc === "delete that" || lc === "delete line") {
    const line = currentLine();
    if (line && line.previousElementSibling) {
      const prev = line.previousElementSibling;
      line.remove();
      placeCursor(prev, prev.textContent.length);
      reclassifyAll(); setDirty();
    }
    return;
  }
  if (newSceneMatch) {
    // If it's "new scene", create new blank scene line. If it's full "interior X day",
    // create a new scene line with the body.
    const isJustCommand = /^(new scene|scene heading)/.test(lc);
    const body = isJustCommand
      ? "INT. "
      : "INT. " + t.replace(/^(interior|exterior|int|ext)\.?\s+/i, "").toUpperCase();
    insertNewBlankLine("scene", body);
    return;
  }
  if (newCharMatch) {
    insertNewBlankLine("character", newCharMatch[1].toUpperCase());
    return;
  }
  if (parenMatch) {
    insertNewBlankLine("parenthetical", "(" + parenMatch[1].replace(/[.)]$/, "") + ")");
    return;
  }
  if (transMatch) {
    const body = (transMatch[0].replace(/^transition\s+/i, "")).toUpperCase().replace(/[.]$/, "") + (lc.endsWith(":") ? "" : ":");
    insertNewBlankLine("transition", body);
    return;
  }
  if (sectionMatch) {
    insertNewBlankLine("section", "# " + sectionMatch[1]);
    return;
  }

  // No command — append to current line, with auto-capitalization for character lines
  const line = currentLine() || editor.lastElementChild;
  if (!line) return;
  let out = line.textContent;
  if (line.dataset.type === "character") {
    out += t.toUpperCase();
  } else {
    out += (out && !/[\s\-——…("]$/.test(out) ? " " : "") + t;
  }
  line.textContent = out;
  placeCursor(line, out.length);
  reclassifyAll(); setDirty();
}

function updateSoundtrackStatus(url) {
  const el = $("#amb-st-status"); if (!el) return;
  el.classList.remove("ok","warn","error");
  url = (url || "").trim();
  if (!url) { el.textContent = ""; return; }
  let host = "";
  try { host = new URL(url).hostname; } catch { el.textContent = "✗ invalid URL"; el.classList.add("error"); return; }
  if (/^(open\.spotify|spotify\.com|music\.youtube|youtube\.com|youtu\.be|soundcloud\.com|tidal\.com|music\.apple)/i.test(host)) {
    el.textContent = "⚠ streaming service — won't play (CORS blocked)"; el.classList.add("warn"); return;
  }
  if (/\.(mp3|ogg|wav|m4a|aac|flac|opus|webm)(\?|$)/i.test(url)) {
    el.textContent = "✓ direct audio"; el.classList.add("ok"); return;
  }
  // Try probing with the Audio element to see if it can load
  el.textContent = "checking…"; el.classList.add("warn");
  const test = new window.Audio();
  let settled = false;
  const settle = (ok, msg) => {
    if (settled) return; settled = true;
    el.classList.remove("ok","warn","error");
    if (ok) { el.textContent = "✓ playable"; el.classList.add("ok"); }
    else { el.textContent = msg || "⚠ unknown format"; el.classList.add("warn"); }
  };
  test.addEventListener("canplay", () => settle(true));
  test.addEventListener("error", () => settle(false, "⚠ couldn't load (CORS or bad URL)"));
  setTimeout(() => settle(false, "⚠ couldn't verify (timed out)"), 4000);
  test.src = url;
}

function insertNewBlankLine(type, body = "") {
  const line = currentLine() || editor.lastElementChild;
  const nd = document.createElement("div");
  nd.dataset.type = type;
  nd.dataset.forced = "true";
  if (body) nd.textContent = body; else nd.innerHTML = "<br>";
  markRevised(nd);
  if (line && line.nextSibling) line.parentNode.insertBefore(nd, line.nextSibling);
  else editor.appendChild(nd);
  placeCursor(nd, nd.textContent.length);
  reclassifyAll(); setDirty();
}

