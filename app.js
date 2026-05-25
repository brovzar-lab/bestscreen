"use strict";
/* =============================================================================
 * BESTSCREEN v3 — engine
 *
 * Architecture:
 *   - boot() decides between dashboard and editor based on URL hash & state.
 *   - In editor: each <div> in #editor is one screenplay line (data-type).
 *     Per-project state stored via Storage. Reactively rebuilds sidebar /
 *     inspector / status / overlays on every input.
 *   - Public namespace `App` exposes hooks for Dashboard / Bible.
 * ============================================================================= */

const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

const CYCLE = ["action","scene","character","dialogue","parenthetical","transition"];
const REVISION_COLORS = [
  { id: "white",     label: "White",     css: "#cfcfcf" },
  { id: "blue",      label: "Blue",      css: "#2b6cb0" },
  { id: "pink",      label: "Pink",      css: "#d93b8c" },
  { id: "yellow",    label: "Yellow",    css: "#c9a017" },
  { id: "green",     label: "Green",     css: "#3a8e3f" },
  { id: "goldenrod", label: "Goldenrod", css: "#b8851a" },
  { id: "buff",      label: "Buff",      css: "#c39256" },
  { id: "salmon",    label: "Salmon",    css: "#e07856" },
  { id: "cherry",    label: "Cherry",    css: "#b22222" },
];
const SCENE_COLORS = [
  { id: "",       label: "None",   css: "transparent" },
  { id: "red",    label: "Red",    css: "#cf3a37" },
  { id: "amber",  label: "Amber",  css: "#dfa116" },
  { id: "green",  label: "Green",  css: "#4f8a3a" },
  { id: "blue",   label: "Blue",   css: "#3878b8" },
  { id: "violet", label: "Violet", css: "#7a55b8" },
];
const PLOT_THREADS = [
  { id: "a", label: "A-Story",  css: "#cf3a37" },
  { id: "b", label: "B-Story",  css: "#3878b8" },
  { id: "c", label: "C-Story",  css: "#4f8a3a" },
  { id: "d", label: "Theme",    css: "#dfa116" },
  { id: "e", label: "Subplot",  css: "#7a55b8" },
  { id: "f", label: "Other",    css: "#c2486d" },
];
const MOODS = [
  { id: "",           label: "None" },
  { id: "hopeful",    label: "Hopeful" },
  { id: "tense",      label: "Tense" },
  { id: "melancholy", label: "Melancholy" },
  { id: "dark",       label: "Dark" },
  { id: "romantic",   label: "Romantic" },
];

const SCENE_RE   = /^(INT\.?|EXT\.?|EST\.?|INT\.?\/EXT\.?|I\.?\/E\.?)[\.\s]/i;
const TRANS_RE   = /[A-Z][A-Z0-9 \-]+TO:$/;
const ALLCAPS_RE = /^[A-Z0-9][A-Z0-9 ()\-'.,&/:]*$/;

// Sentiment lexicon — expanded from ~80 to ~400 words for usable coverage
const SENT_POS = new Set(("love loves loved loving lovely lover great greatest amazing amazed amazing wonderful wonders happy happily happiness joy joyful joyous smile smiles smiling laugh laughs laughing laughter hope hoped hopeful hopefully brilliant beautiful beautifully kind kindly warm warmly bright brighter brightest safe safely safety peace peaceful gentle gently tender tenderly win wins won winner winning friend friends friendly friendship trust trusts trusted trusting thrill thrills thrilled incredible perfect perfectly bliss blissful soft softly soothing forgive forgives forgiven heal healing healed calm calmly cherish cherished sweet sweetly delight delighted relieved relief grateful gratitude thanks thank thanked proud proudly pride lucky luckily fortunate blessed blessing blessings hug hugs hugged hugging kiss kisses kissed kissing embrace embraced wedding marry married celebrate celebration party laughed magic magical hero heroic save saves saved saving rescue rescued together unite united reunite reunited triumph triumphant succeed succeeded success successful victory victorious dream dreams dreamed lullaby lullabies").split(/\s+/).filter(Boolean));
const SENT_NEG = new Set(("hate hates hated hateful hating angry anger angrily rage raged raging scream screams screamed screaming shout shouts shouted shouting cry cries cried crying weep weeps wept weeping tear tears teary fear fears feared afraid scared scary scares scaring terror terrified terrifying horror horrible horribly horrify dark darkness darker darkest cold colder coldly cruel cruelty cruelly kill kills killed killer killing dying death dead die died deathly hurt hurts hurting wound wounded wounds bleed bleeds bled bleeding blood bloody broken break breaks breaking grief grieving grieved sad sadly sadness lonely loneliness empty emptiness bitter bitterly bitterness pain pains painful painfully ache aches aching loss lose loses lost losing rotten poison poisoned poisonous evil evils panic panicked panicking violent violence crash crashed crashing gun guns knife knives stab stabbed stabbing shot shoots shooting nightmare nightmares destroy destroyed destroying destruction war wars warring fight fights fought fighting attack attacks attacked attacking betray betrayed betrayal abandoned abandon abandons leaving leave left alone forsaken haunt haunted haunting ghost ghosts curse cursed cursing damn damned damnation suffer suffered suffering misery miserable hopeless helpless desperate despair despise despised despising loathe loathed loathing disgust disgusted disgusting ugly ugliness vile vileness wretched wretch worthless useless pointless meaningless tragedy tragic burn burned burning explode exploded explosion sick sickness ill illness disease diseased ruined ruin ruining drown drowned drowning suffocate suffocating choke choking strangle strangled scream screamed terror chase chased pursued").split(/\s+/).filter(Boolean));

// Tokens that look like character cues but aren't — exclude from cast detection
const CHAR_BLACKLIST = new Set([
  "FADE IN","FADE OUT","FADE TO BLACK","FADE TO WHITE","SMASH CUT","HARD CUT","MATCH CUT",
  "CUT TO","DISSOLVE TO","WIPE TO","BACK TO","JUMP CUT","INTERCUT","CONTINUED","CONT'D",
  "MORE","THE END","END","TITLE","TITLE OVER","TITLE CARD","SUPER","SUPERIMPOSE",
  "TO BE CONTINUED","BLACK","WHITE","BEGIN","BEGINS","ENDS","FADE","INSERT","FLASHBACK",
  "END FLASHBACK","FLASH CUT","FREEZE FRAME","SLOW MOTION","BACK TO PRESENT",
  "COLD OPEN","END OF COLD OPEN","TEASER","END OF TEASER","TAG","END OF TAG",
  "ACT ONE","ACT TWO","ACT THREE","ACT FOUR","ACT FIVE","END OF ACT","END OF EPISODE",
]);

const editor = $("#editor");
const ac     = $("#autocomplete");

let appState = {
  projectId: null,
  titleMeta: { title: "", credit: "Written by", author: "", source: "", date: "", contact: "", episode: "" },
  filename: "untitled.fountain",
  isDirty: false,
  saveTimer: null,
  view: "script",
  sidebarTab: "scenes",
  activeRevision: "white",
  smartTypo: true,
  showSceneNumbersInPdf: true,
  typewriter: false,
  sprint: null,
  template: null,
  logline: "",
  premise: "",
  theme: "",
  paceMode: false,
  // Daily streak baseline (for "today" counter when project opens)
  todayBaseline: 0,
  todayKey: "",
};

/* =====================================================================
 * Routing — boot decides dashboard vs editor
 * =================================================================== */

function boot() {
  applyTheme();
  Audio.setVolume(0.18);
  bindGlobalShortcuts();
  bindDashboardModals();

  // Route
  const hash = location.hash;
  if (hash.startsWith("#/p/")) {
    const id = hash.slice(4).split("/")[0];
    if (Storage.getProject(id)) {
      loadProject(id);
      return;
    }
  }
  const last = Storage.getLastOpened();
  if (last && Storage.getProject(last)) {
    loadProject(last);
    return;
  }
  Dashboard.show();
}

function bindDashboardModals() {
  // Wired once at boot so the dashboard can open them
  $("#np-cancel")?.addEventListener("click", () => $("#modal-newproj").classList.remove("open"));
  $("#np-go")?.addEventListener("click", () => Dashboard.createFromModal());
  $$(".np-color").forEach(c => c.addEventListener("click", () => {
    $$(".np-color").forEach(x => x.classList.toggle("selected", x === c));
  }));
  $("#ns-cancel")?.addEventListener("click", () => $("#modal-newseries").classList.remove("open"));
  $("#ns-go")?.addEventListener("click", () => Dashboard.createSeries());
  $("#st-cancel")?.addEventListener("click", () => $("#modal-settings").classList.remove("open"));
  $("#st-save")?.addEventListener("click", () => {
    Storage.setSettings({
      author: $("#st-author").value,
      ai: { provider: $("#st-ai-provider").value, apiKey: $("#st-ai-key").value, model: $("#st-ai-model").value }
    });
    $("#modal-settings").classList.remove("open"); toast("Settings saved");
  });
  $("#btn-theme-dash")?.addEventListener("click", cycleTheme);
  $$(".modal-backdrop").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); }));
}

window.addEventListener("hashchange", () => {
  const hash = location.hash;
  if (hash.startsWith("#/p/")) {
    const id = hash.slice(4).split("/")[0];
    if (Storage.getProject(id) && appState.projectId !== id) loadProject(id);
  } else if (hash === "" || hash === "#/dashboard") {
    Dashboard.show();
  }
});

function loadProject(id, opts={}) {
  Dashboard.hide();
  appState.projectId = id;
  const project = Storage.getProject(id);
  const doc = Storage.getDoc(id) || "";
  const meta = Storage.getMeta(id) || {};

  appState.titleMeta = meta.titleMeta || appState.titleMeta;
  appState.activeRevision = meta.activeRevision || "white";
  appState.template = meta.template || null;
  appState.logline = meta.logline || "";
  appState.premise = meta.premise || "";
  appState.theme = meta.theme || "";
  appState.smartTypo = meta.smartTypo !== false;
  appState.showSceneNumbersInPdf = meta.showSceneNumbersInPdf !== false;
  appState.filename = (project?.name || "untitled") + ".fountain";

  // Daily counters
  loadTodayCount();

  // Bind editor-shell events once
  if (!appState._bound) { bindEditorUI(); appState._bound = true; }

  loadFountain(doc || sampleStarter(project?.type));

  // Project name from dashboard wins over starter's "Title: Untitled"
  if (project?.name && (appState.titleMeta.title === "Untitled" || !appState.titleMeta.title)) {
    appState.titleMeta.title = project.name;
  }
  $("#doc-title-name").textContent = appState.titleMeta.title || project?.name || "Untitled";
  $("#rev-badge").style.background = REVISION_COLORS.find(r => r.id===appState.activeRevision)?.css || "#fff";
  saveBinBadge();

  setView("script");
  if (opts.lineNo) setTimeout(() => navigateToLineByDocLine(opts.lineNo), 100);
  editor.focus();
}

/* =====================================================================
 * Theme
 * =================================================================== */
function applyTheme() {
  const t = Storage.getSettings().theme || "manuscript";
  document.documentElement.dataset.theme = t === "manuscript" ? "" : t;
}
function cycleTheme() {
  const themes = ["manuscript","midnight","court"];
  const cur = Storage.getSettings().theme || "manuscript";
  const next = themes[(themes.indexOf(cur) + 1) % themes.length];
  Storage.setSettings({ theme: next });
  applyTheme();
  toast(`Theme: ${next}`);
}

/* =====================================================================
 * Save / dirty state
 * =================================================================== */

function setDirty() {
  appState.isDirty = true;
  $("#save-state")?.classList.add("dirty");
  $("#save-state .lbl")?.replaceChildren(document.createTextNode("unsaved"));
  clearTimeout(appState.saveTimer);
  appState.saveTimer = setTimeout(autosave, 700);
}
function setSaved() {
  appState.isDirty = false;
  $("#save-state")?.classList.remove("dirty");
  $("#save-state .lbl")?.replaceChildren(document.createTextNode("saved"));
}
function autosave() {
  if (!appState.projectId) return;
  try {
    $("#save-state").classList.add("saving");
    const doc = serializeFountain(true);
    Storage.setDoc(appState.projectId, doc);
    Storage.setMeta(appState.projectId, {
      ...Storage.getMeta(appState.projectId),
      titleMeta: appState.titleMeta,
      activeRevision: appState.activeRevision,
      template: appState.template,
      logline: appState.logline,
      premise: appState.premise,
      theme: appState.theme,
      smartTypo: appState.smartTypo,
      showSceneNumbersInPdf: appState.showSceneNumbersInPdf,
    });
    Storage.updateProject(appState.projectId, { lastModified: Date.now(), name: appState.titleMeta.title || Storage.getProject(appState.projectId)?.name });
    setTimeout(() => { $("#save-state").classList.remove("saving"); setSaved(); }, 80);
  } catch (e) { console.warn("autosave failed", e); }
}

/* Daily count: tracks added words today (delta from baseline at open). */
function loadTodayCount() {
  const k = new Date().toISOString().slice(0,10);
  appState.todayKey = k;
  appState.todayBaseline = currentWordCount();
}
function bumpDailyStreak() {
  const k = new Date().toISOString().slice(0,10);
  if (appState.todayKey !== k) {
    appState.todayKey = k;
    appState.todayBaseline = currentWordCount();
  }
  const delta = Math.max(0, currentWordCount() - appState.todayBaseline);
  // We track absolute delta as today's contribution
  // Update storage but don't accumulate every keystroke; debounce in autosave
  const idx = Storage.readIndex();
  idx.streak = idx.streak || {};
  idx.streak[k] = delta;
  Storage.writeIndex(idx);
}

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
    // Dual dialogue toggle — simplified
    e.preventDefault();
    toast("Dual dialogue: place cursor between two character blocks (feature stub)");
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
 * Status, scenes, characters
 * =================================================================== */
function currentWordCount() {
  return $$("#editor > div").reduce((acc,d) => acc + (d.textContent.match(/\b[\w']+\b/g) || []).length, 0);
}
function updateStatus() {
  const line = currentLine();
  $("#stat-type").textContent = line ? prettyType(line.dataset.type) : "Action";
  const words = currentWordCount();
  const pages = Math.max(0, Math.ceil(linesToPages()));
  const scenes = $$("#editor > div[data-type='scene']").length;
  $("#stat-pages").textContent = `${pages} ${pages===1?"page":"pages"}`;
  $("#stat-runtime").textContent = `~${pages} min`;
  $("#stat-words").textContent = `${words.toLocaleString()} words`;
  $("#stat-scenes").textContent = `${scenes} ${scenes===1?"scene":"scenes"}`;
  const todayDelta = Math.max(0, words - appState.todayBaseline);
  $("#stat-today").textContent = `${todayDelta.toLocaleString()} today`;
  const warnings = quickContinuityCount();
  const cn = $("#stat-continuity");
  if (cn) {
    if (warnings > 0) { cn.classList.add("has-warning"); cn.textContent = `⚠ ${warnings} continuity`; }
    else { cn.classList.remove("has-warning"); cn.textContent = ""; }
  }
}
function prettyType(t) {
  return ({ scene:"Scene Heading", action:"Action", character:"Character", dialogue:"Dialogue",
            parenthetical:"Parenthetical", transition:"Transition", centered:"Centered",
            note:"Note", section:"Section", synopsis:"Synopsis" })[t] || "Action";
}
function linesToPages() {
  /* Calibrated to industry standard ~55 lines/page at 12pt single-spaced.
     Counts physical lines per element using realistic wrap widths and per-
     element vertical-spacing overhead. */
  let total = 0;
  // Characters per line for each element type at standard margins
  const W = { scene:60, action:60, character:32, dialogue:35, parenthetical:25, transition:60, centered:60 };
  // Extra vertical lines (blanks above/below) per element
  const SPACING = { scene:2, action:1, character:0.5, dialogue:0, parenthetical:0, transition:1.5, centered:1 };
  $$("#editor > div").forEach(d => {
    const type = d.dataset.type;
    if (["note","section","synopsis"].includes(type)) return;
    const t = (d.textContent || "").trim();
    if (!t) return; // blank lines don't add to page count
    const w = W[type] || 60;
    const wrapped = Math.max(1, Math.ceil(t.length / w));
    total += wrapped + (SPACING[type] || 0);
  });
  // Industry: 54-55 lines per page including margins
  const pages = total / 54;
  // Anything with content rounds up to at least 1 page
  return total > 0 ? Math.max(pages, 0.5) : 0;
}

/* =====================================================================
 * Sidebar
 * =================================================================== */
function setSidebarTab(name) {
  appState.sidebarTab = name;
  $$(".side-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  updateSidebar();
}
function updateSidebar() {
  const body = $("#side-body");
  if (!body) return;
  switch (appState.sidebarTab) {
    case "scenes":     return renderScenesSidebar(body);
    case "characters": return renderCastSidebar(body);
    case "comments":   return renderCommentsSidebar(body);
    case "threads":    return renderThreadsSidebar(body);
  }
}
function renderScenesSidebar(body) {
  const scenes = collectScenes();
  if (scenes.length === 0) {
    body.innerHTML = `<div class="side-empty">No scenes yet.<br><br>Type <kbd>INT.</kbd> or <kbd>EXT.</kbd> to begin.</div>`;
    return;
  }
  body.innerHTML = scenes.map((s,i) => {
    const color = s.color ? "color-" + s.color : "";
    return `<div class="scene-item ${color}" data-line="${s.lineIndex}" draggable="true">
      <div class="si-color"></div>
      <div class="si-text">
        <div class="si-slug">${escapeHtml(s.slug)}</div>
        <div class="si-meta"><b>${i+1}</b> · ${s.words} w · ${s.characters.size} char${s.threadIds.length ? " · "+s.threadIds.join("/") : ""}</div>
      </div>
      <div class="si-num">${pad(s.pageAt,2)}</div>
    </div>`;
  }).join("");
  $$(".scene-item", body).forEach(el => {
    el.addEventListener("click", () => navigateToLine(parseInt(el.dataset.line,10), el));
    el.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", el.dataset.line); el.classList.add("dragging"); });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));
    el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("active"); });
    el.addEventListener("dragleave", () => el.classList.remove("active"));
    el.addEventListener("drop", e => {
      e.preventDefault(); el.classList.remove("active");
      const from = parseInt(e.dataTransfer.getData("text/plain"),10);
      const to = parseInt(el.dataset.line,10);
      moveScene(from, to);
    });
  });
}
function pad(n, w) { return String(n).padStart(w, "0"); }
function renderCastSidebar(body) {
  const cast = analyzeCharacters();
  if (cast.length === 0) { body.innerHTML = `<div class="side-empty">No characters yet.</div>`; return; }
  const max = Math.max(1, ...cast.map(c => c.words));
  body.innerHTML = cast.map(c => `
    <div class="cast-item" data-name="${escapeHtml(c.name)}">
      <div class="ci-name">${escapeHtml(c.name)}</div>
      <div class="ci-meta">${c.cues} cues · ${c.words} words · ${c.scenes} scenes</div>
      <div class="ci-bar"><div class="ci-fill" style="width:${(c.words/max*100).toFixed(0)}%"></div></div>
    </div>`).join("");
  $$(".cast-item", body).forEach(el => el.addEventListener("click", () => {
    const name = el.dataset.name;
    const first = $$("#editor > div[data-type='character']").find(d =>
      d.textContent.replace(/\s*\(.*\)\s*$/,"").trim().toUpperCase() === name);
    if (first) navigateToLine($$("#editor > div").indexOf(first), null);
  }));
}
function renderCommentsSidebar(body) {
  const comments = Storage.getComments(appState.projectId);
  if (comments.length === 0) {
    body.innerHTML = `<div class="side-empty">No notes.<br><br>Press <kbd>⌘ ;</kbd> on any line to add a comment.</div>`;
    return;
  }
  body.innerHTML = comments.map(c => `
    <div class="note-item note-sidebar-item" data-line-key="${escapeHtml(c.lineKey)}">
      <div class="ns-line">${escapeHtml(getLineByKey(c.lineKey)?.textContent?.slice(0,40) || "(missing line)")}</div>
      <div style="font-family:var(--font-ui);font-size:11.5px;margin-top:4px">${escapeHtml(c.text)}</div>
    </div>`).join("");
  $$(".note-sidebar-item", body).forEach(el => el.addEventListener("click", () => {
    const line = getLineByKey(el.dataset.lineKey);
    if (line) navigateToLine($$("#editor > div").indexOf(line), null);
  }));
}
function renderThreadsSidebar(body) {
  // Show plot threads (toggle filter)
  body.innerHTML = `
    <div class="thread-bar">
      ${PLOT_THREADS.map(t => `<div class="thread-dot" data-tid="${t.id}" style="background:${t.css}" title="${t.label}">${t.id.toUpperCase()}</div>`).join("")}
    </div>
    <div id="thread-scenes-list"></div>
  `;
  const listEl = $("#thread-scenes-list");
  function renderList(filter) {
    const scenes = collectScenes();
    const filtered = filter ? scenes.filter(s => s.threadIds.includes(filter)) : scenes;
    listEl.innerHTML = filtered.map((s,i) => `
      <div class="scene-item" data-line="${s.lineIndex}">
        <div class="si-color" style="background:${PLOT_THREADS.find(t=>t.id===s.threadIds[0])?.css || 'transparent'}"></div>
        <div class="si-text">
          <div class="si-slug">${escapeHtml(s.slug)}</div>
          <div class="si-meta">${(s.threadIds.length ? s.threadIds.join(",") + " · " : "")}p.${s.pageAt}</div>
        </div>
      </div>
    `).join("") || `<div class="side-empty">No scenes match.</div>`;
    $$(".scene-item", listEl).forEach(el => el.addEventListener("click", () =>
      navigateToLine(parseInt(el.dataset.line,10), null)));
  }
  $$(".thread-dot", body).forEach(d => {
    d.addEventListener("click", () => {
      $$(".thread-dot", body).forEach(x => x.classList.toggle("selected", x === d && !x.classList.contains("selected")));
      const sel = $$(".thread-dot.selected", body)[0];
      renderList(sel ? sel.dataset.tid : null);
    });
  });
  renderList(null);
}

function getLineByKey(key) {
  // lineKey: "lineIdx:textHash" — fallback: search by text-substring
  const lines = $$("#editor > div");
  if (!key) return null;
  const [idxStr, hash] = key.split(":");
  const idx = parseInt(idxStr, 10);
  if (lines[idx] && shortHash(lines[idx].textContent) === hash) return lines[idx];
  // fallback: find by hash
  return lines.find(l => shortHash(l.textContent) === hash) || null;
}
function makeLineKey(line) {
  const lines = $$("#editor > div");
  return `${lines.indexOf(line)}:${shortHash(line.textContent)}`;
}
function shortHash(s) {
  let h = 0; for (const c of (s||"")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

function navigateToLine(lineIdx, sidebarEl) {
  const target = $$("#editor > div")[lineIdx];
  if (!target) return;
  setView("script");
  setTimeout(() => {
    target.scrollIntoView({behavior:"smooth", block:"center"});
    placeCursor(target, 0); editor.focus();
    target.classList.add("nav-target");
    setTimeout(() => target.classList.remove("nav-target"), 1200);
  }, 50);
  if (sidebarEl) {
    $$(".scene-item.active").forEach(s => s.classList.remove("active"));
    sidebarEl.classList.add("active");
  }
}
function navigateToLineByDocLine(docLineNo) {
  // Maps fountain doc line index to editor line; approximate
  const target = $$("#editor > div")[Math.min(docLineNo, $$("#editor > div").length-1)];
  if (target) target.scrollIntoView({behavior:"smooth", block:"center"});
}

function collectScenes() {
  const out = [];
  const lines = $$("#editor > div");
  let runningPages = 1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].dataset.type === "scene") {
      const slug = lines[i].textContent.replace(/^\./,"").trim();
      const color = lines[i].dataset.color || "";
      const tags = (lines[i].dataset.tags || "").split(",").map(t => t.trim()).filter(Boolean);
      const threadIds = (lines[i].dataset.thread || "").split(",").map(t => t.trim()).filter(Boolean);
      const goal = lines[i].dataset.goal || "";
      const mood = lines[i].dataset.mood || "";
      const beatTag = lines[i].dataset.beat || "";
      const date = lines[i].dataset.date || "";
      const soundtrack = lines[i].dataset.sound || "";
      let words = 0, actionWords = 0, dialogWords = 0; let characters = new Set();
      let end = lines.length;
      let sentiment = 0;
      for (let j = i+1; j < lines.length; j++) {
        if (lines[j].dataset.type === "scene") { end = j; break; }
        const t = lines[j].dataset.type;
        const tokens = (lines[j].textContent.toLowerCase().match(/[a-z']+/g) || []);
        const wc = tokens.length;
        tokens.forEach(w => { if (SENT_POS.has(w)) sentiment++; if (SENT_NEG.has(w)) sentiment--; });
        if (t === "action") actionWords += wc;
        else if (t === "dialogue") dialogWords += wc;
        words += wc;
        if (t === "character") {
          const n = lines[j].textContent.replace(/\s*\(.*\)\s*$/,"").trim().toUpperCase();
          if (n) characters.add(n);
        }
      }
      out.push({
        slug, lineIndex: i, words, actionWords, dialogWords, characters,
        color, tags, threadIds, goal, mood, beatTag, date, soundtrack,
        sentiment, pageAt: runningPages, endLine: end
      });
      runningPages += Math.max(1, Math.round((end - i) / 30));
    }
  }
  return out;
}
function analyzeCharacters() {
  const map = new Map();
  const lines = $$("#editor > div");
  const sceneOf = i => { for (let j = i; j >= 0; j--) if (lines[j] && lines[j].dataset.type === "scene") return j; return -1; };
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].dataset.type === "character") {
      const name = lines[i].textContent.replace(/\s*\(.*\)\s*$/,"").trim().toUpperCase();
      if (!name) continue;
      if (!map.has(name)) map.set(name, { name, cues: 0, words: 0, sceneIdxs: new Set() });
      const c = map.get(name);
      c.cues++; c.sceneIdxs.add(sceneOf(i));
      for (let j = i+1; j < lines.length; j++) {
        const t = lines[j].dataset.type;
        if (t === "dialogue") c.words += (lines[j].textContent.match(/\b[\w']+\b/g) || []).length;
        else if (t === "parenthetical") continue; else break;
      }
    }
  }
  return Array.from(map.values()).map(c => ({...c, scenes: c.sceneIdxs.size})).sort((a,b) => b.words - a.words);
}
function moveScene(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const lines = $$("#editor > div");
  const block = [lines[fromIdx]];
  for (let j = fromIdx+1; j < lines.length; j++) { if (lines[j].dataset.type === "scene") break; block.push(lines[j]); }
  const toLine = lines[toIdx];
  block.forEach(n => editor.insertBefore(n, toLine));
  reclassifyAll(); setDirty();
}

/* =====================================================================
 * Sentiment & pace overlays
 * =================================================================== */
function applySceneSentiment() {
  const scenes = collectScenes();
  scenes.forEach(s => {
    const line = $$("#editor > div")[s.lineIndex];
    if (!line) return;
    if (s.sentiment > 2) line.dataset.sentiment = "pos";
    else if (s.sentiment < -2) line.dataset.sentiment = "neg";
    else line.dataset.sentiment = "neutral";
  });
}
function applyPaceColors() {
  const scenes = collectScenes();
  if (scenes.length === 0) return;
  const avg = scenes.reduce((a,s) => a + s.words, 0) / scenes.length;
  const sd = Math.sqrt(scenes.reduce((a,s) => a + (s.words - avg)**2, 0) / scenes.length) || 1;
  scenes.forEach(s => {
    const line = $$("#editor > div")[s.lineIndex];
    if (!line) return;
    const z = (s.words - avg) / sd;
    if (z > 1.2)       line.dataset.pace = "hot";
    else if (z > 0.4)  line.dataset.pace = "warm";
    else if (z > -0.4) line.dataset.pace = "cool";
    else               line.dataset.pace = "cold";
  });
}
function applyMoodToPage() {
  const paper = $("#paper");
  if (!paper) return;
  ["mood-hopeful","mood-tense","mood-melancholy","mood-dark","mood-romantic"].forEach(c => paper.classList.remove(c));
  const sc = currentScene();
  if (sc && sc.mood) paper.classList.add("mood-" + sc.mood);
}

/* =====================================================================
 * Comments
 * =================================================================== */
let activeCommentLine = null;
function applyCommentMarkers() {
  if (!appState.projectId) return;
  const comments = Storage.getComments(appState.projectId);
  const byKey = new Map();
  comments.forEach(c => byKey.set(c.lineKey, (byKey.get(c.lineKey) || 0) + 1));
  $$("#editor > div").forEach(d => {
    const m = d.querySelector(".line-comment-marker");
    if (m) m.remove();
  });
  $$("#editor > div").forEach(d => {
    const key = makeLineKey(d);
    if (byKey.get(key)) {
      const m = document.createElement("span");
      m.className = "line-comment-marker";
      m.textContent = "💬";
      m.title = byKey.get(key) + " comment(s)";
      m.addEventListener("click", e => { e.stopPropagation(); openCommentPopover(d); });
      d.appendChild(m);
    }
  });
}
function openCommentPopover(line) {
  activeCommentLine = line;
  const pop = $("#comment-pop");
  const key = makeLineKey(line);
  const comments = Storage.getComments(appState.projectId).filter(c => c.lineKey === key);
  $("#cp-thread").innerHTML = comments.map(c => `
    <div class="cp-msg">
      <div class="who">${escapeHtml(c.author || "you")} · ${new Date(c.t).toLocaleString()}</div>
      <div>${escapeHtml(c.text)}</div>
    </div>
  `).join("") || `<div class="muted" style="font-size:11.5px">No comments yet.</div>`;
  $("#cp-input").value = "";
  const rect = line.getBoundingClientRect();
  const mainRect = $("#main").getBoundingClientRect();
  pop.style.left = Math.min(rect.right + 8 - mainRect.left, mainRect.width - 340) + "px";
  pop.style.top  = (rect.top - mainRect.top + $("#main").scrollTop) + "px";
  pop.classList.add("open");
  pop.setAttribute("aria-hidden", "false");
  $("#cp-input").focus();
}
function postComment() {
  if (!activeCommentLine) return;
  const text = $("#cp-input").value.trim();
  if (!text) return;
  const author = Storage.getSettings().author || "you";
  const key = makeLineKey(activeCommentLine);
  const arr = Storage.getComments(appState.projectId);
  arr.push({ id: Storage.uid(), lineKey: key, author, text, resolved: false, t: Date.now() });
  Storage.setComments(appState.projectId, arr);
  openCommentPopover(activeCommentLine);
  applyCommentMarkers();
  updateSidebar();
}
function closeCommentPopover() {
  if ($("#cp-input") === document.activeElement) document.activeElement.blur();
  $("#comment-pop").classList.remove("open");
  $("#comment-pop").setAttribute("aria-hidden", "true");
  activeCommentLine = null;
}

/* =====================================================================
 * Track Changes (lightweight)
 * =================================================================== */
function logChange(line, type, value) {
  if (!appState.projectId) return;
  const arr = Storage.getChanges(appState.projectId);
  arr.push({ t: Date.now(), type, lineIdx: $$("#editor > div").indexOf(line), value, author: Storage.getSettings().author || "you" });
  if (arr.length > 1000) arr.splice(0, arr.length - 1000);
  Storage.setChanges(appState.projectId, arr);
}

/* =====================================================================
 * Inspector
 * =================================================================== */
function updateInspector() {
  const body = $("#inspector-body");
  if (!body) return;
  const sc = currentScene();
  const breakdown = scriptBreakdown();
  body.innerHTML = `
    ${sc ? renderInspectorScene(sc) : `<div class="ins-section"><div class="side-empty" style="padding:20px 0">Place cursor in a scene to edit its details.</div></div>`}
    <div class="ins-section">
      <h4>Revision</h4>
      <div class="ins-color-row" id="rev-row">
        ${REVISION_COLORS.map(r => `<div class="ins-color-dot ${r.id===appState.activeRevision?'selected':''}" data-rev="${r.id}" title="${r.label}" style="background:${r.css}"></div>`).join("")}
      </div>
    </div>
    <div class="ins-section">
      <h4>Story</h4>
      <div class="ins-kv">
        <dt>Template</dt><dd>${appState.template ? Templates.get(appState.template)?.name : "—"}</dd>
        <dt>Logline</dt><dd style="white-space:normal">${escapeHtml(appState.logline) || "<i style='color:var(--muted)'>none</i>"}</dd>
        <dt>Theme</dt><dd>${escapeHtml(appState.theme) || "—"}</dd>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn small" id="ins-logline">Open logline workshop</button>
      </div>
    </div>
    <div class="ins-section">
      <h4>Overlays</h4>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0"><input type="checkbox" id="opt-pace" ${appState.paceMode?"checked":""}/> Pace heatmap on script</label>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0"><input type="checkbox" id="opt-typewriter" ${appState.typewriter?"checked":""}/> Typewriter mode</label>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0"><input type="checkbox" id="opt-smart-typo" ${appState.smartTypo?"checked":""}/> Smart typography</label>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0"><input type="checkbox" id="opt-scene-num" ${appState.showSceneNumbersInPdf?"checked":""}/> Scene numbers in PDF</label>
    </div>
    <div class="ins-section">
      <h4>Breakdown — all scenes</h4>
      <div class="ins-kv">
        <dt>Locations</dt><dd>${breakdown.locations.length}</dd>
        <dt>Day / night</dt><dd>${breakdown.dayCount} / ${breakdown.nightCount}</dd>
        <dt>Int / ext</dt><dd>${breakdown.intCount} / ${breakdown.extCount}</dd>
      </div>
    </div>
  `;
  // Wire revision dots
  $$(".ins-color-dot", $("#rev-row")).forEach(d => d.addEventListener("click", () => {
    appState.activeRevision = d.dataset.rev;
    $("#rev-badge").style.background = REVISION_COLORS.find(r => r.id === d.dataset.rev).css;
    updateInspector(); setDirty();
  }));
  $("#opt-pace")?.addEventListener("change", e => {
    appState.paceMode = e.target.checked;
    document.body.dataset.pace = appState.paceMode ? "true" : "";
  });
  $("#opt-typewriter")?.addEventListener("change", e => { setTypewriter(e.target.checked); });
  $("#opt-smart-typo")?.addEventListener("change", e => { appState.smartTypo = e.target.checked; setDirty(); });
  $("#opt-scene-num")?.addEventListener("change", e => { appState.showSceneNumbersInPdf = e.target.checked; setDirty(); });
  $("#ins-logline")?.addEventListener("click", openLoglineWorkshop);

  if (sc) wireInspectorScene(sc);
}

function renderInspectorScene(s) {
  const lines = $$("#editor > div");
  const sceneLine = lines[s.lineIndex];
  const props = extractProps(s);
  return `
    <div class="ins-section">
      <h4>Scene ${s.index + 1}</h4>
      <div class="ins-kv">
        <dt>Slug</dt><dd style="font-family:var(--font-screen)">${escapeHtml(s.slug)}</dd>
        <dt>Words</dt><dd>${s.words} (${s.actionWords} action / ${s.dialogWords} dialogue)</dd>
        <dt>Page</dt><dd>${s.pageAt}</dd>
      </div>
    </div>
    <div class="ins-section">
      <h4>Goal</h4>
      <textarea class="ins-goal" id="ins-scene-goal" placeholder="What does this scene accomplish?">${escapeHtml(sceneLine.dataset.goal || "")}</textarea>
    </div>
    <div class="ins-section">
      <h4>Plot threads</h4>
      <div class="ins-color-row" id="ins-thread-row">
        ${PLOT_THREADS.map(p => {
          const active = (sceneLine.dataset.thread || "").split(",").includes(p.id);
          return `<div class="ins-color-dot ${active?'selected':''}" data-thread="${p.id}" style="background:${p.css}" title="${p.label}"></div>`;
        }).join("")}
      </div>
    </div>
    <div class="ins-section">
      <h4>Mood</h4>
      <select id="ins-mood" class="ins-tag-input">
        ${MOODS.map(m => `<option value="${m.id}" ${(sceneLine.dataset.mood||"")===m.id?"selected":""}>${m.label}</option>`).join("")}
      </select>
    </div>
    <div class="ins-section">
      <h4>Beat tag (for template fidelity)</h4>
      <input class="ins-tag-input" id="ins-beat" value="${escapeHtml(sceneLine.dataset.beat || "")}" placeholder="e.g. catalyst, midpoint" />
    </div>
    <div class="ins-section">
      <h4>Color</h4>
      <div class="ins-color-row" id="scene-color-row">
        ${SCENE_COLORS.map(c => `<div class="ins-color-dot ${(sceneLine.dataset.color||'')===c.id?'selected':''}" data-color="${c.id}" title="${c.label}" style="background:${c.css||'transparent'};border:2px solid ${c.id ? 'transparent' : 'var(--line)'}"></div>`).join("")}
      </div>
    </div>
    <div class="ins-section">
      <h4>Tags</h4>
      <input class="ins-tag-input" id="scene-tags" value="${escapeHtml(sceneLine.dataset.tags || "")}" placeholder="plot a, A-story…" />
    </div>
    <div class="ins-section">
      <h4>In-story date (for Timeline)</h4>
      <input class="ins-tag-input" id="ins-date" value="${escapeHtml(sceneLine.dataset.date || "")}" placeholder="2026-05-25, or Tuesday morning" />
    </div>
    <div class="ins-section">
      <h4>Soundtrack URL</h4>
      <input class="ins-tag-input" id="ins-sound" value="${escapeHtml(sceneLine.dataset.sound || "")}" placeholder="https://… mp3/ogg" />
    </div>
    <div class="ins-section">
      <h4>Characters in scene</h4>
      <div class="ins-chip-row">
        ${Array.from(s.characters).map(c => `<span class="ins-chip">${escapeHtml(c)}</span>`).join("") || "<span class='muted' style='font-size:11px'>None</span>"}
      </div>
    </div>
    <div class="ins-section">
      <h4>Likely props</h4>
      <div class="ins-chip-row">
        ${props.length ? props.slice(0,12).map(p => `<span class="ins-chip">${escapeHtml(p)}</span>`).join("") : "<span class='muted' style='font-size:11px'>None detected</span>"}
      </div>
    </div>
  `;
}

function wireInspectorScene(s) {
  const lines = $$("#editor > div");
  const sceneLine = lines[s.lineIndex];
  $("#ins-scene-goal")?.addEventListener("change", e => { sceneLine.dataset.goal = e.target.value; setDirty(); });
  $$(".ins-color-dot", $("#ins-thread-row")).forEach(d => d.addEventListener("click", () => {
    const id = d.dataset.thread;
    const cur = (sceneLine.dataset.thread || "").split(",").filter(Boolean);
    const set = new Set(cur);
    if (set.has(id)) set.delete(id); else set.add(id);
    sceneLine.dataset.thread = Array.from(set).join(",");
    if (!sceneLine.dataset.thread) delete sceneLine.dataset.thread;
    updateInspector(); updateSidebar(); setDirty();
  }));
  $("#ins-mood")?.addEventListener("change", e => {
    if (e.target.value) sceneLine.dataset.mood = e.target.value;
    else delete sceneLine.dataset.mood;
    applyMoodToPage(); setDirty();
  });
  $("#ins-beat")?.addEventListener("change", e => {
    if (e.target.value.trim()) sceneLine.dataset.beat = e.target.value.trim();
    else delete sceneLine.dataset.beat;
    setDirty();
  });
  $$(".ins-color-dot", $("#scene-color-row")).forEach(d => d.addEventListener("click", () => {
    const v = d.dataset.color;
    if (v) sceneLine.dataset.color = v; else delete sceneLine.dataset.color;
    updateInspector(); updateSidebar(); setDirty();
  }));
  $("#scene-tags")?.addEventListener("change", e => { sceneLine.dataset.tags = e.target.value; setDirty(); updateSidebar(); });
  $("#ins-date")?.addEventListener("change", e => { sceneLine.dataset.date = e.target.value; setDirty(); });
  $("#ins-sound")?.addEventListener("change", e => { sceneLine.dataset.sound = e.target.value; setDirty(); });
}

function currentScene() {
  const line = currentLine();
  const lines = $$("#editor > div");
  if (!line) return null;
  let idx = lines.indexOf(line); if (idx < 0) return null;
  let sceneIdx = -1;
  for (let j = idx; j >= 0; j--) if (lines[j].dataset.type === "scene") { sceneIdx = j; break; }
  if (sceneIdx === -1) return null;
  let sceneNum = 0;
  for (let j = 0; j <= sceneIdx; j++) if (lines[j].dataset.type === "scene") sceneNum++;
  let words=0, actionWords=0, dialogWords=0, characters=new Set();
  for (let j = sceneIdx+1; j < lines.length; j++) {
    if (lines[j].dataset.type === "scene") break;
    const t = lines[j].dataset.type;
    const wc = (lines[j].textContent.match(/\b[\w']+\b/g) || []).length;
    words += wc;
    if (t === "action") actionWords += wc;
    if (t === "dialogue") dialogWords += wc;
    if (t === "character") {
      const n = lines[j].textContent.replace(/\s*\(.*\)\s*$/,"").trim().toUpperCase();
      if (n) characters.add(n);
    }
  }
  const pageAt = Math.max(1, Math.round((sceneIdx / Math.max(1, lines.length)) * Math.max(1, Math.ceil(linesToPages()))));
  return {
    index: sceneNum - 1, lineIndex: sceneIdx,
    slug: lines[sceneIdx].textContent.replace(/^\./,"").trim(),
    mood: lines[sceneIdx].dataset.mood || "",
    words, actionWords, dialogWords, characters, pageAt,
  };
}
function scriptBreakdown() {
  const scenes = collectScenes();
  const locations = new Set();
  let dayCount = 0, nightCount = 0, intCount = 0, extCount = 0;
  scenes.forEach(s => {
    const slug = s.slug.toUpperCase();
    const m = slug.match(/^(INT\.?|EXT\.?|EST\.?|INT\.?\/EXT\.?|I\.?\/E\.?)\s*(.+?)(?:\s*[-–]\s*(.+))?$/);
    if (m) {
      const head = m[1]; const loc = m[2] ? m[2].trim() : "";
      const tod = (m[3] || "").trim();
      if (loc) locations.add(loc);
      if (head.startsWith("INT")) intCount++;
      if (head.startsWith("EXT")) extCount++;
      if (/(DAY|MORNING|DAWN)/.test(tod)) dayCount++;
      else if (/(NIGHT|DUSK|EVENING)/.test(tod)) nightCount++;
    }
  });
  return { scenes, locations: Array.from(locations).sort(), dayCount, nightCount, intCount, extCount };
}
function extractProps(scene) {
  const lines = $$("#editor > div");
  const out = new Set();
  const charNames = new Set($$("#editor > div[data-type='character']").map(d =>
    d.textContent.replace(/\s*\(.*\)\s*$/,"").trim().toUpperCase()));
  for (let j = scene.lineIndex+1; j < lines.length; j++) {
    if (lines[j].dataset.type === "scene") break;
    if (lines[j].dataset.type !== "action") continue;
    const matches = lines[j].textContent.match(/\b[A-Z][A-Z0-9'\-]{2,}(?:\s+[A-Z][A-Z0-9'\-]{2,})?\b/g) || [];
    matches.forEach(m => { const t = m.trim(); if (t.length>=3 && !charNames.has(t.toUpperCase())) out.add(t); });
  }
  return Array.from(out);
}

/* =====================================================================
 * View switching
 * =================================================================== */
function setView(v) {
  appState.view = v;
  $$(".view-tab").forEach(el => el.classList.toggle("active", el.dataset.view === v));
  $$(".view").forEach(el => el.classList.toggle("active", el.id === "view-" + v));
  if (v === "beats")    renderBeatBoard();
  if (v === "cards")    renderCards();
  if (v === "stats")    renderStats();
  if (v === "timeline") renderTimeline();
  if (v === "bible") {
    // Auto-pull characters from script before showing Bible so the cast list
    // is always in sync with the screenplay (creates stub entries for unknown cues).
    const cast = analyzeCharacters().map(c => c.name)
      .filter(n => !CHAR_BLACKLIST.has(n.replace(/[.,;!?]+$/,""))); // be defensive
    Bible.syncCharactersFromScript(cast);
    Bible.open(appState.projectId);
  }
}

/* =====================================================================
 * Beat Board (with template ghost cards)
 * =================================================================== */
function renderBeatBoard() {
  const board = $("#beats-board");
  const lines = $$("#editor > div");
  const sections = [];
  let cur = { title: "Screenplay", lineIndex: -1, scenes: [] };
  lines.forEach((l, i) => {
    if (l.dataset.type === "section") {
      sections.push(cur);
      cur = { title: l.textContent.replace(/^#+\s*/,""), lineIndex: i, scenes: [] };
    } else if (l.dataset.type === "scene") {
      cur.scenes.push({ lineIndex: i, slug: l.textContent.replace(/^\./,"").trim(), beatColor: l.dataset.beat || "" });
    }
  });
  sections.push(cur);

  // If user has a template, prepend a "Template" virtual section with ghost cards
  let html = "";
  if (appState.template) {
    const t = Templates.get(appState.template);
    if (t) {
      const realPages = Math.max(1, Math.ceil(linesToPages()));
      // Use template's canonical length when script is too short, so cards show meaningful page targets
      const fidPages = realPages < 20 ? (t.pages || 110) : realPages;
      html += `<div class="beat-section">
        <div class="beat-section-head">
          <svg class="ic bs-grip"><use href="#i-target"/></svg>
          <div class="bs-title" style="font-weight:700;color:var(--accent)">${escapeHtml(t.name)} — targets</div>
          <span class="bs-count">${t.beats.length} beats · ${fidPages}p</span>
        </div>
        <div class="beat-section-cards">
          ${t.beats.map(b => {
            const expectedPage = Math.round(b.at * fidPages);
            return `<div class="beat-card beat-gray" style="opacity:.8">
              <div class="bc-slug">${escapeHtml(b.name)}</div>
              <div class="bc-syn" style="font-style:italic;color:var(--muted);font-size:11.5px">${escapeHtml(b.desc || "")}</div>
              <div class="bc-foot"><span>p. ${expectedPage}</span><span>tag: ${b.id}</span></div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }
  }

  html += sections.filter(s => s.scenes.length > 0 || s.lineIndex !== -1).map((sec, idx) => `
    <div class="beat-section" data-section="${idx}" data-line="${sec.lineIndex}">
      <div class="beat-section-head">
        <svg class="ic bs-grip"><use href="#i-grip"/></svg>
        <input class="bs-title" value="${escapeHtml(sec.title)}" data-section="${idx}" />
        <span class="bs-count">${sec.scenes.length} scene${sec.scenes.length===1?'':'s'}</span>
      </div>
      <div class="beat-section-cards" data-section="${idx}">
        ${sec.scenes.map(s => {
          const stats = collectSceneStats(s.lineIndex);
          const color = s.beatColor || "gray";
          const syn = synopsisAfter(s.lineIndex);
          return `<div class="beat-card beat-${color}" draggable="true" data-line="${s.lineIndex}">
            <div class="bc-colors">${["red","amber","green","blue","violet","gray"].map(c => `<div class="bc-color" data-color="${c}" style="background:${beatColorCSS(c)}"></div>`).join("")}</div>
            <div class="bc-slug">${escapeHtml(s.slug)}</div>
            <textarea class="bc-syn" data-line="${s.lineIndex}" placeholder="Beat / synopsis…">${escapeHtml(syn)}</textarea>
            <div class="bc-foot"><span>${stats.words} words</span><span>${stats.characters.size} char</span></div>
          </div>`;
        }).join("")}
      </div>
    </div>
  `).join("");
  board.innerHTML = html;

  // Wire
  $$(".beat-card", board).forEach(card => {
    card.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", card.dataset.line); card.classList.add("dragging"); });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dblclick", () => navigateToLine(parseInt(card.dataset.line,10), null));
    $$(".bc-color", card).forEach(d => d.addEventListener("click", e => {
      e.stopPropagation();
      const lineIdx = parseInt(card.dataset.line, 10);
      const line = $$("#editor > div")[lineIdx];
      if (line) line.dataset.beat = d.dataset.color;
      setDirty(); renderBeatBoard();
    }));
  });
  $$(".beat-section-cards", board).forEach(zone => {
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.parentElement.classList.add("drop-target"); });
    zone.addEventListener("dragleave", () => zone.parentElement.classList.remove("drop-target"));
    zone.addEventListener("drop", e => {
      e.preventDefault(); zone.parentElement.classList.remove("drop-target");
      const fromIdx = parseInt(e.dataTransfer.getData("text/plain"),10);
      const sectionIdx = parseInt(zone.dataset.section, 10);
      moveSceneToSection(fromIdx, sectionIdx);
    });
  });
  $$(".bc-syn", board).forEach(ta => ta.addEventListener("blur", () => {
    setSynopsisAfter(parseInt(ta.dataset.line, 10), ta.value); setDirty();
  }));
}
function beatColorCSS(c) { return ({red:"#cf3a37",amber:"#dfa116",green:"#4f8a3a",blue:"#3878b8",violet:"#7a55b8",gray:"#888"})[c] || "#888"; }
function collectSceneStats(lineIdx) {
  const lines = $$("#editor > div"); let words=0, characters=new Set();
  for (let j = lineIdx+1; j < lines.length; j++) {
    if (lines[j].dataset.type === "scene") break;
    words += (lines[j].textContent.match(/\b[\w']+\b/g) || []).length;
    if (lines[j].dataset.type === "character") {
      const n = lines[j].textContent.replace(/\s*\(.*\)\s*$/,"").trim().toUpperCase();
      if (n) characters.add(n);
    }
  }
  return { words, characters };
}
function synopsisAfter(sceneLineIdx) {
  const lines = $$("#editor > div");
  for (let j = sceneLineIdx+1; j < lines.length; j++) {
    if (lines[j].dataset.type === "synopsis") return lines[j].textContent.replace(/^=\s?/, "");
    if (lines[j].dataset.type === "scene") break;
    if (lines[j].textContent.trim() === "") continue;
    break;
  }
  return "";
}
function setSynopsisAfter(sceneLineIdx, value) {
  const lines = $$("#editor > div");
  for (let j = sceneLineIdx+1; j < lines.length; j++) {
    if (lines[j].dataset.type === "synopsis") { lines[j].remove(); break; }
    if (lines[j].dataset.type === "scene") break;
    if (lines[j].textContent.trim() === "") continue; else break;
  }
  if (value.trim()) {
    const d = document.createElement("div");
    d.dataset.type = "synopsis"; d.dataset.forced = "true";
    d.textContent = "= " + value.trim();
    const sceneNode = $$("#editor > div")[sceneLineIdx];
    sceneNode.parentNode.insertBefore(d, sceneNode.nextSibling);
  }
  reclassifyAll();
}
function moveSceneToSection(sceneLineIdx, targetSectionIdx) {
  const lines = $$("#editor > div");
  const scene = lines[sceneLineIdx];
  if (!scene || scene.dataset.type !== "scene") return;
  const block = [scene];
  for (let j = sceneLineIdx+1; j < lines.length; j++) {
    if (lines[j].dataset.type === "scene" || lines[j].dataset.type === "section") break;
    block.push(lines[j]);
  }
  const sections = lines.filter(l => l.dataset.type === "section");
  let reference;
  if (targetSectionIdx === 0) reference = editor.firstElementChild;
  else { const sec = sections[targetSectionIdx - 1]; reference = sec ? sec.nextElementSibling : null; }
  block.forEach(b => editor.insertBefore(b, reference));
  reclassifyAll(); setDirty();
  renderBeatBoard();
}

/* =====================================================================
 * Cards view
 * =================================================================== */
function renderCards() {
  const root = $("#cards");
  const scenes = collectScenes();
  if (scenes.length === 0) {
    root.innerHTML = `<div class="side-empty" style="grid-column:1/-1;text-align:center;padding:80px 20px;color:var(--muted)">No scenes yet — go to the Script tab and write one.</div>`;
    return;
  }
  root.innerHTML = scenes.map((s,i) => `
    <div class="idx-card" draggable="true" data-line="${s.lineIndex}">
      <div class="ic-num">${i+1}.</div>
      <div class="ic-slug">${escapeHtml(s.slug)}</div>
      <textarea class="ic-syn" data-line="${s.lineIndex}" placeholder="What happens?">${escapeHtml(synopsisAfter(s.lineIndex))}</textarea>
      <div class="ic-foot"><span>${s.words} w · ${s.characters.size} char</span><span>${Array.from(s.characters).slice(0,3).join(", ")}</span></div>
    </div>
  `).join("");
  $$(".idx-card").forEach(card => {
    card.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", card.dataset.line); card.classList.add("dragging"); });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", e => { e.preventDefault(); card.classList.add("drop-target"); });
    card.addEventListener("dragleave", () => card.classList.remove("drop-target"));
    card.addEventListener("drop", e => {
      e.preventDefault(); card.classList.remove("drop-target");
      moveScene(parseInt(e.dataTransfer.getData("text/plain"),10), parseInt(card.dataset.line,10));
      renderCards();
    });
    card.addEventListener("dblclick", () => navigateToLine(parseInt(card.dataset.line,10), null));
  });
  $$(".ic-syn").forEach(ta => ta.addEventListener("blur", () => { setSynopsisAfter(parseInt(ta.dataset.line,10), ta.value); setDirty(); }));
}

/* =====================================================================
 * Stats view (with sentiment arc + pace heatmap + beat fidelity)
 * =================================================================== */
function renderStats() {
  const body = $("#stats-body");
  const scenes = collectScenes();
  const cast = analyzeCharacters();
  const breakdown = scriptBreakdown();
  const totalWords = currentWordCount();
  const totalPages = Math.max(0, Math.ceil(linesToPages()));
  const dialogueWords = scenes.reduce((a,s) => a + s.dialogWords, 0);
  const actionWords   = scenes.reduce((a,s) => a + s.actionWords, 0);
  const ratio = (dialogueWords + actionWords) ? Math.round(dialogueWords/(dialogueWords+actionWords)*100) : 0;

  body.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="sc-lbl">Pages</div><div class="sc-val">${totalPages}</div><div class="sc-sub">${totalWords.toLocaleString()} words</div></div>
      <div class="stat-card"><div class="sc-lbl">Runtime</div><div class="sc-val">~${totalPages}</div><div class="sc-sub">minutes</div></div>
      <div class="stat-card"><div class="sc-lbl">Scenes</div><div class="sc-val">${scenes.length}</div><div class="sc-sub">avg ${scenes.length ? Math.round(totalWords/scenes.length) : 0} w</div></div>
      <div class="stat-card"><div class="sc-lbl">Cast</div><div class="sc-val">${cast.length}</div><div class="sc-sub">speaking roles</div></div>
      <div class="stat-card"><div class="sc-lbl">Locations</div><div class="sc-val">${breakdown.locations.length}</div><div class="sc-sub">${breakdown.intCount}I/${breakdown.extCount}E</div></div>
      <div class="stat-card"><div class="sc-lbl">Day / Night</div><div class="sc-val">${breakdown.dayCount} / ${breakdown.nightCount}</div></div>
      <div class="stat-card"><div class="sc-lbl">Dialogue %</div><div class="sc-val">${ratio}%</div><div class="sc-sub">${dialogueWords.toLocaleString()} / ${(actionWords+dialogueWords).toLocaleString()}</div></div>
      <div class="stat-card"><div class="sc-lbl">Today</div><div class="sc-val">${Math.max(0,totalWords - appState.todayBaseline)}</div><div class="sc-sub">words</div></div>
    </div>

    <div class="stat-chart">
      <h3>Pace heatmap — scene length</h3>
      <div class="sc-sub">Long bars = long scenes. Red = above average, blue = below. Click a bar to jump.</div>
      ${svgPaceBars(scenes)}
    </div>

    <div class="stat-chart">
      <h3>Sentiment arc</h3>
      <div class="sc-sub">Emotional valence per scene (lexicon-based). The line is the rolling average.</div>
      ${svgSentimentArc(scenes)}
    </div>

    <div class="stat-chart">
      <h3>Character presence</h3>
      <div class="sc-sub">Rows = characters, columns = scenes. Dot = present.</div>
      ${svgPresence(scenes, cast)}
    </div>

    <div class="stat-chart">
      <h3>Dialogue distribution</h3>
      ${svgCastBars(cast)}
    </div>

    <div class="stat-chart">
      <h3>Locations</h3>
      ${svgLocationBars(scenes)}
    </div>

    ${appState.template ? `
      <div class="stat-chart">
        <h3>Beat-template fidelity — ${escapeHtml(Templates.get(appState.template)?.name || "")}</h3>
        <div class="sc-sub">Tag scenes with a beat ID in the Inspector (e.g. <kbd>catalyst</kbd>) to populate.</div>
        ${renderFidelityTable(scenes, totalPages)}
      </div>
    ` : ""}
  `;
}

function svgPaceBars(scenes) {
  if (scenes.length === 0) return `<div class="muted">No data yet.</div>`;
  const w = 900, h = 200, pad = 24;
  const max = Math.max(1, ...scenes.map(s => s.words));
  const avg = scenes.reduce((a,s) => a + s.words, 0) / scenes.length;
  const bw = (w - pad*2) / scenes.length;
  const bars = scenes.map((s,i) => {
    const bh = (s.words / max) * (h - pad*2);
    const x = pad + i*bw, y = h - pad - bh;
    const col = s.words > avg*1.4 ? "#cf3a37" : s.words > avg*1.05 ? "#dfa116" : s.words < avg*0.6 ? "#3878b8" : "#4f8a3a";
    return `<rect x="${x+1}" y="${y}" width="${Math.max(1, bw-2)}" height="${bh}" fill="${col}" rx="1" data-line="${s.lineIndex}"><title>Scene ${i+1}: ${s.slug} (${s.words}w)</title></rect>`;
  }).join("");
  const avgY = h - pad - (avg/max)*(h-pad*2);
  return `<svg viewBox="0 0 ${w} ${h}" style="height:200px">
    <line x1="${pad}" x2="${w-pad}" y1="${avgY}" y2="${avgY}" stroke="var(--muted)" stroke-dasharray="3 3"/>
    ${bars}
  </svg>`;
}
function svgSentimentArc(scenes) {
  if (scenes.length === 0) return `<div class="muted">No data yet.</div>`;
  const w = 900, h = 220, pad = 24;
  const max = Math.max(2, ...scenes.map(s => Math.abs(s.sentiment)));
  const mid = h/2;
  const sw = (w - pad*2) / scenes.length;
  const bars = scenes.map((s,i) => {
    const cx = pad + i*sw + sw/2;
    const dy = (s.sentiment / max) * (h/2 - pad);
    const col = s.sentiment >= 0 ? "#4f8a3a" : "#cf3a37";
    return `<rect x="${cx-Math.max(1,sw/3)}" y="${dy<0?mid:mid-dy}" width="${Math.max(2, sw/1.5)}" height="${Math.abs(dy)}" fill="${col}" opacity="0.65"/>`;
  }).join("");
  // Rolling average line (window 5)
  const window = 5;
  const points = scenes.map((s,i) => {
    const lo = Math.max(0, i-Math.floor(window/2));
    const hi = Math.min(scenes.length, i+Math.ceil(window/2));
    const v = scenes.slice(lo,hi).reduce((a,x) => a + x.sentiment, 0) / (hi-lo);
    return `${pad + i*sw + sw/2},${mid - (v/max) * (h/2 - pad)}`;
  }).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" style="height:220px">
    <line x1="${pad}" x2="${w-pad}" y1="${mid}" y2="${mid}" stroke="var(--line)"/>
    ${bars}
    <polyline points="${points}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
}
function svgPresence(scenes, cast) {
  if (scenes.length === 0 || cast.length === 0) return `<div class="muted">No data yet.</div>`;
  const top = cast.slice(0, 12);
  const w = 900, rowH = 22, pad = 140;
  const h = top.length * rowH + 30;
  const cellW = Math.max(6, (w - pad - 10) / scenes.length);
  let svg = `<svg viewBox="0 0 ${w} ${h}" style="height:${h}px">`;
  top.forEach((c, ri) => {
    const y = ri * rowH + 18;
    svg += `<text x="${pad - 8}" y="${y+4}" text-anchor="end" font-family="var(--font-screen)" font-size="10" fill="var(--ink-2)">${escapeHtml(c.name)}</text>`;
    scenes.forEach((s, ci) => {
      const present = s.characters.has(c.name);
      const x = pad + ci * cellW + cellW/2;
      svg += present
        ? `<circle cx="${x}" cy="${y}" r="${Math.min(5, cellW/2-1)}" fill="var(--accent)" />`
        : `<circle cx="${x}" cy="${y}" r="1.2" fill="var(--line)" />`;
    });
  });
  scenes.forEach((s, ci) => {
    if ((ci+1) % 5 === 0 || ci === 0 || ci === scenes.length - 1) {
      const x = pad + ci * cellW + cellW/2;
      svg += `<text x="${x}" y="${h - 6}" text-anchor="middle" font-size="9" fill="var(--muted)">${ci+1}</text>`;
    }
  });
  return svg + "</svg>";
}
function svgCastBars(cast) {
  if (cast.length === 0) return `<div class="muted">No cast yet.</div>`;
  const top = cast.slice(0, 12);
  const w = 900, rowH = 26, pad = 130;
  const h = top.length * rowH + 10;
  const maxV = Math.max(1, ...top.map(c => c.words));
  let svg = `<svg viewBox="0 0 ${w} ${h}" style="height:${h}px">`;
  top.forEach((c, i) => {
    const y = i * rowH + 6;
    const bw = ((c.words / maxV) * (w - pad - 40));
    svg += `<text x="${pad - 8}" y="${y+14}" text-anchor="end" font-family="var(--font-screen)" font-size="11" fill="var(--ink-2)">${escapeHtml(c.name)}</text>`;
    svg += `<rect x="${pad}" y="${y+4}" width="${bw}" height="${rowH-10}" fill="var(--accent)" rx="3" />`;
    svg += `<text x="${pad + bw + 6}" y="${y+14}" font-size="11" fill="var(--muted)" dominant-baseline="middle">${c.words}</text>`;
  });
  return svg + "</svg>";
}
function svgLocationBars(scenes) {
  const counts = new Map();
  scenes.forEach(s => {
    const m = s.slug.toUpperCase().match(/^(?:INT\.?|EXT\.?|EST\.?|INT\.?\/EXT\.?|I\.?\/E\.?)\s*(.+?)(?:\s*[-–]\s*.+)?$/);
    const loc = m ? m[1].trim() : s.slug;
    counts.set(loc, (counts.get(loc) || 0) + 1);
  });
  const sorted = Array.from(counts.entries()).sort((a,b) => b[1]-a[1]).slice(0,10);
  if (sorted.length === 0) return `<div class="muted">No locations yet.</div>`;
  const w = 900, rowH = 26, pad = 200;
  const h = sorted.length * rowH + 10;
  const maxV = Math.max(1, ...sorted.map(s => s[1]));
  let svg = `<svg viewBox="0 0 ${w} ${h}" style="height:${h}px">`;
  sorted.forEach(([loc, n], i) => {
    const y = i * rowH + 6;
    const bw = ((n / maxV) * (w - pad - 40));
    svg += `<text x="${pad - 8}" y="${y+14}" text-anchor="end" font-family="var(--font-screen)" font-size="11" fill="var(--ink-2)">${escapeHtml(loc)}</text>`;
    svg += `<rect x="${pad}" y="${y+4}" width="${bw}" height="${rowH-10}" fill="#3878b8" rx="3" />`;
    svg += `<text x="${pad + bw + 6}" y="${y+14}" font-size="11" fill="var(--muted)" dominant-baseline="middle">${n}</text>`;
  });
  return svg + "</svg>";
}

function renderFidelityTable(scenes, totalPages) {
  const t = Templates.get(appState.template);
  if (!t) return "";
  // Use the template's canonical length when the script is too short to
  // produce useful targets (otherwise all beats collapse to pages 0–3).
  const fidelityPages = totalPages < 20 ? (t.pages || 110) : totalPages;
  const usingTemplate = fidelityPages !== totalPages;
  const banner = usingTemplate
    ? `<div class="sc-sub" style="margin-bottom:8px"><b>Showing targets for a full ${fidelityPages}-page script.</b> Your script is currently ${totalPages} page${totalPages===1?'':'s'}; targets will recompute against your real length once you pass 20 pages.</div>`
    : "";
  return `${banner}<div>${t.beats.map(b => {
    const expected = Math.round(b.at * fidelityPages);
    const sc = scenes.find(s => (s.beatTag || "").toLowerCase() === b.id || (s.beatTag || "").toLowerCase() === b.name.toLowerCase());
    const actual = sc ? sc.pageAt : null;
    const dev = (actual && expected) ? actual - expected : null;
    let status = "none", label = "—";
    if (actual) {
      const tolerance = Math.max(2, totalPages * 0.04);
      if (Math.abs(dev) <= tolerance) { status = "ok"; label = "On"; }
      else if (Math.abs(dev) <= tolerance*2) { status = "warn"; label = (dev>0?"+":"")+dev; }
      else { status = "miss"; label = (dev>0?"+":"")+dev; }
    }
    return `<div class="fid-row">
      <div><div class="fid-name">${escapeHtml(b.name)}</div><div class="fid-desc">${escapeHtml(b.desc || "")}</div></div>
      <div class="fid-meta">expected p.${expected}</div>
      <div class="fid-meta">${actual ? "actual p."+actual : "<span class='muted'>untagged</span>"}</div>
      <div class="fid-status ${status}">${label}</div>
    </div>`;
  }).join("")}</div>`;
}

/* =====================================================================
 * Timeline view
 * =================================================================== */
function renderTimeline() {
  const body = $("#timeline-body");
  const scenes = collectScenes();
  // Smart sort: parse as Date first, fall back to string comparison for ambiguous dates
  const dateKey = (s) => {
    const d = Date.parse(s.date);
    if (!isNaN(d)) return [0, d];      // Real dates sort numerically, before strings
    return [1, s.date.toLowerCase()];  // Strings ("Tuesday morning") sort alphabetically after
  };
  const dated = scenes.filter(s => s.date).sort((a, b) => {
    const ka = dateKey(a), kb = dateKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (typeof ka[1] === "number") return ka[1] - kb[1];
    return ka[1].localeCompare(kb[1]);
  });
  const undated = scenes.filter(s => !s.date);
  if (dated.length === 0) {
    body.innerHTML = `<div class="side-empty" style="text-align:center;padding:40px">No dated scenes yet.<br><br>In the Inspector, set "In-story date" on any scene to plot it here.</div>`;
    return;
  }
  body.innerHTML = `
    <div style="margin-bottom:18px;color:var(--muted);font-size:12.5px">Chronological view. Scenes without a date are listed at the bottom.</div>
    ${dated.map(s => `
      <div class="tl-event" data-line="${s.lineIndex}">
        <div class="tl-date">${escapeHtml(s.date)}</div>
        <div class="tl-body">
          <div class="tl-slug">${escapeHtml(s.slug)}</div>
          <div class="tl-summary">${escapeHtml(synopsisAfter(s.lineIndex) || ("Scene at script position " + (s.lineIndex+1)))}</div>
        </div>
      </div>
    `).join("")}
    ${undated.length ? `
      <h3 style="margin-top:24px;color:var(--muted);text-transform:uppercase;font-size:11px;letter-spacing:0.06em">Undated scenes</h3>
      ${undated.map(s => `
        <div class="tl-event" data-line="${s.lineIndex}">
          <div class="tl-date" style="color:var(--muted)">—</div>
          <div class="tl-body"><div class="tl-slug">${escapeHtml(s.slug)}</div></div>
        </div>
      `).join("")}
    ` : ""}
  `;
  $$(".tl-event", body).forEach(el => el.addEventListener("click", () =>
    navigateToLine(parseInt(el.dataset.line,10), null)));
}

/* =====================================================================
 * Find / Replace
 * =================================================================== */
let findMatches = []; let findIndex = -1;
function findRun() {
  const q = $("#find-input").value;
  const caseSens = $("#find-case").checked;
  const wholeWord = $("#find-word").checked;
  const scope = $("#find-scope").value;
  findMatches = [];
  if (!q) { $("#find-info").textContent = "0 / 0"; clearHighlights(); return; }
  let re;
  try {
    const esc = q.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const pattern = wholeWord ? `\\b${esc}\\b` : esc;
    re = new RegExp(pattern, caseSens ? "g" : "gi");
  } catch (e) { return; }
  clearHighlights();
  $$("#editor > div").forEach((line, li) => {
    if (scope !== "all" && line.dataset.type !== scope) return;
    const t = line.textContent; let m;
    while ((m = re.exec(t)) !== null) {
      findMatches.push({ lineIdx: li, start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++;
    }
  });
  renderFindHighlights();
  $("#find-info").textContent = `${findMatches.length ? findIndex+1 : 0} / ${findMatches.length}`;
  if (findMatches.length > 0) { findIndex = 0; jumpToMatch(); }
}
function clearHighlights() {
  $$("#editor mark.find").forEach(m => {
    const t = document.createTextNode(m.textContent);
    m.parentNode.replaceChild(t, m);
  });
  $$("#editor > div").forEach(d => d.normalize());
}
function renderFindHighlights() {
  clearHighlights();
  const byLine = new Map();
  findMatches.forEach((m, i) => {
    if (!byLine.has(m.lineIdx)) byLine.set(m.lineIdx, []);
    byLine.get(m.lineIdx).push({ ...m, mi: i });
  });
  const lines = $$("#editor > div");
  byLine.forEach((ms, idx) => {
    const line = lines[idx]; const t = line.textContent;
    let html = ""; let pos = 0;
    ms.sort((a,b) => a.start - b.start).forEach(m => {
      html += escapeHtml(t.substring(pos, m.start));
      html += `<mark class="find" data-mi="${m.mi}">${escapeHtml(t.substring(m.start, m.end))}</mark>`;
      pos = m.end;
    });
    html += escapeHtml(t.substring(pos));
    line.innerHTML = html;
  });
}
function jumpToMatch() {
  if (findIndex < 0 || findIndex >= findMatches.length) return;
  const m = findMatches[findIndex];
  const line = $$("#editor > div")[m.lineIdx];
  if (line) line.scrollIntoView({behavior:"smooth", block:"center"});
  $$("#editor mark.find").forEach(mk => mk.classList.remove("current"));
  const mk = $(`#editor mark.find[data-mi="${findIndex}"]`); if (mk) mk.classList.add("current");
  $("#find-info").textContent = `${findIndex+1} / ${findMatches.length}`;
}
function findNext() { if (findMatches.length === 0) return; findIndex = (findIndex + 1) % findMatches.length; jumpToMatch(); }
function findPrev() { if (findMatches.length === 0) return; findIndex = (findIndex - 1 + findMatches.length) % findMatches.length; jumpToMatch(); }
function findReplaceCurrent() {
  if (findIndex < 0 || findIndex >= findMatches.length) return;
  const m = findMatches[findIndex]; const line = $$("#editor > div")[m.lineIdx];
  const t = line.textContent; const repl = $("#replace-input").value;
  line.textContent = t.substring(0, m.start) + repl + t.substring(m.end);
  markRevised(line); reclassifyAll(); setDirty(); findRun();
}
function findReplaceAll() {
  const repl = $("#replace-input").value;
  if (findMatches.length === 0) return;
  const byLine = new Map();
  findMatches.forEach(m => { if (!byLine.has(m.lineIdx)) byLine.set(m.lineIdx, []); byLine.get(m.lineIdx).push(m); });
  const lines = $$("#editor > div");
  byLine.forEach((ms, idx) => {
    const line = lines[idx]; let t = line.textContent;
    ms.sort((a,b) => b.start - a.start).forEach(m => { t = t.substring(0, m.start) + repl + t.substring(m.end); });
    line.textContent = t; markRevised(line);
  });
  reclassifyAll(); setDirty(); toast(`Replaced ${findMatches.length}`); findRun();
}

function renameCharacter(from, to) {
  if (!from || !to) return 0;
  const FROM = from.toUpperCase().trim(), TO = to.toUpperCase().trim();
  let renamed = 0;
  $$("#editor > div").forEach(line => {
    const type = line.dataset.type; const orig = line.textContent;
    if (type === "character") {
      const m = orig.match(/^(\s*@?\s*)([^()]+?)(\s*\(.*\))?\s*$/);
      if (m && m[2].trim().toUpperCase() === FROM) {
        line.textContent = TO + (m[3] || ""); markRevised(line); renamed++;
      }
    } else if (["dialogue","action","parenthetical"].includes(type)) {
      const re = new RegExp(`\\b${FROM.replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&")}\\b`, "gi");
      if (re.test(orig)) {
        const newText = orig.replace(re, match => {
          if (match === match.toUpperCase()) return TO;
          if (match[0] === match[0].toUpperCase()) return TO.charAt(0) + TO.slice(1).toLowerCase();
          return TO.toLowerCase();
        });
        if (newText !== orig) { line.textContent = newText; markRevised(line); renamed++; }
      }
    }
  });
  reclassifyAll(); setDirty(); return renamed;
}

/* =====================================================================
 * Snapshots / Bin / Sprint / Read-aloud
 * =================================================================== */
function openBin() { const d = $("#drawer-bin"); d.classList.add("open"); d.setAttribute("aria-hidden","false"); renderBin(); }
function renderBin() {
  const b = Storage.getBin(appState.projectId); const body = $("#bin-body");
  if (b.length === 0) { body.innerHTML = `<div class="side-empty" style="padding:30px 16px">Empty.<br><br>Drag selected text onto the bin button.</div>`; return; }
  body.innerHTML = b.map((s,i) => `
    <div class="scrap" data-i="${i}">
      <div class="sc-date"><span>${new Date(s.t).toLocaleString()}</span><button class="sc-del" data-i="${i}">✕</button></div>
      <pre>${escapeHtml(s.text)}</pre>
    </div>`).join("");
  $$(".scrap", body).forEach(el => el.addEventListener("click", e => {
    if (e.target.classList.contains("sc-del")) return;
    restoreFromBin(parseInt(el.dataset.i, 10));
  }));
  $$(".sc-del", body).forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    const arr = Storage.getBin(appState.projectId);
    arr.splice(parseInt(btn.dataset.i,10),1);
    Storage.setBin(appState.projectId, arr); saveBinBadge(); renderBin();
  }));
}
function addToBin(text) {
  if (!text || !text.trim()) return;
  const arr = Storage.getBin(appState.projectId);
  arr.unshift({ t: Date.now(), text });
  Storage.setBin(appState.projectId, arr);
  saveBinBadge();
  $("#btn-bin").classList.add("active");
  setTimeout(() => $("#btn-bin").classList.remove("active"), 600);
  toast("Sent to bin");
}
function restoreFromBin(i) {
  const arr = Storage.getBin(appState.projectId);
  const scrap = arr[i]; if (!scrap) return;
  arr.splice(i,1); Storage.setBin(appState.projectId, arr); saveBinBadge();
  const line = currentLine() || editor.lastElementChild;
  scrap.text.split(/\n+/).filter(l => l.length).forEach(t => {
    const d = document.createElement("div"); d.dataset.type = "action"; d.textContent = t; markRevised(d);
    if (line && line.nextSibling) line.parentNode.insertBefore(d, line.nextSibling); else editor.appendChild(d);
  });
  reclassifyAll(); setDirty(); renderBin(); toast("Restored");
}
function saveBinBadge() {
  if (!appState.projectId) return;
  const n = Storage.getBin(appState.projectId).length;
  $("#bin-count").textContent = n;
  $("#bin-count").classList.toggle("show", n > 0);
}

function openSnap() { const d = $("#drawer-snap"); d.classList.add("open"); d.setAttribute("aria-hidden","false"); renderSnaps(); }
function renderSnaps() {
  const snaps = Storage.getSnaps(appState.projectId); const body = $("#snap-body");
  if (snaps.length === 0) { body.innerHTML = `<div class="side-empty" style="padding:30px 16px">No snapshots yet.</div>`; return; }
  body.innerHTML = snaps.map((s,i) => `
    <div class="snap-row" data-i="${i}">
      <div class="sr-head">
        <div><div class="sr-name">${escapeHtml(s.name)}</div><div class="sr-meta">${new Date(s.t).toLocaleString()} · ${s.pages}p · ${s.words}w</div></div>
        <div class="sr-actions">
          <button class="btn small" data-act="diff" data-i="${i}">Diff</button>
          <button class="btn small" data-act="restore" data-i="${i}">Restore</button>
          <button class="btn small ghost" data-act="delete" data-i="${i}">✕</button>
        </div>
      </div>
    </div>`).join("");
  $$(".btn", body).forEach(btn => btn.addEventListener("click", () => {
    const i = parseInt(btn.dataset.i,10); const arr = Storage.getSnaps(appState.projectId);
    if (btn.dataset.act === "diff") showDiff(arr[i]);
    else if (btn.dataset.act === "restore") restoreSnap(arr[i]);
    else if (btn.dataset.act === "delete") { arr.splice(i,1); Storage.setSnaps(appState.projectId, arr); renderSnaps(); }
  }));
}
function takeSnapshot(name) {
  const arr = Storage.getSnaps(appState.projectId);
  const doc = serializeFountain(true);
  arr.unshift({ id: Storage.uid(), name: name || ("Snapshot " + new Date().toLocaleString()),
    t: Date.now(), doc, pages: Math.ceil(linesToPages()), words: currentWordCount() });
  if (arr.length > 30) arr.pop();
  Storage.setSnaps(appState.projectId, arr);
  $("#snap-name").value = ""; renderSnaps(); toast("Snapshot saved");
}
async function restoreSnap(s) {
  if (!(await modalConfirm({ title:"Restore snapshot?", body:"Current work will be replaced. Take a snapshot first if you want to keep it.", okText:"Restore", danger:true }))) return;
  loadFountain(s.doc); setDirty();
  $("#modal-diff").classList.remove("open");
  toast("Snapshot restored");
}

function showDiff(s) {
  const snaps = Storage.getSnaps(appState.projectId);
  $("#diff-pick").innerHTML = `<option value="current">Current document</option>` +
    snaps.filter(x => x.id !== s.id).map(x => `<option value="${x.id}">${escapeHtml(x.name)} · ${new Date(x.t).toLocaleString()}</option>`).join("");
  $("#diff-name").textContent = "— " + s.name;
  $("#diff-a-label").textContent = s.name;

  function compare() {
    const pick = $("#diff-pick").value;
    const left = s.doc;
    const right = pick === "current" ? serializeFountain(true) : (snaps.find(x => x.id === pick)?.doc || "");
    const labelR = pick === "current" ? "Current" : snaps.find(x => x.id === pick)?.name;
    $("#diff-b-label").textContent = labelR;
    const { left: lL, right: lR } = diffLines(left, right);
    $("#diff-old").innerHTML = lL; $("#diff-new").innerHTML = lR;
  }
  $("#diff-pick").onchange = compare; compare();
  $("#diff-restore").onclick = () => restoreSnap(s);
  $("#modal-diff").classList.add("open");
}
function diffLines(oldText, newText) {
  const a = oldText.split("\n"); const b = newText.split("\n");
  const n = a.length, m = b.length;
  const dp = Array.from({length: n+1}, () => new Array(m+1).fill(0));
  for (let i = n-1; i >= 0; i--)
    for (let j = m-1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
  let left = "", right = ""; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { left += escapeHtml(a[i]) + "\n"; right += escapeHtml(b[j]) + "\n"; i++; j++; }
    else if (dp[i+1][j] >= dp[i][j+1]) { left += `<span class="del">${escapeHtml(a[i])}</span>\n`; right += `\n`; i++; }
    else { left += `\n`; right += `<span class="add">${escapeHtml(b[j])}</span>\n`; j++; }
  }
  while (i < n) { left += `<span class="del">${escapeHtml(a[i++])}</span>\n`; right += `\n`; }
  while (j < m) { left += `\n`; right += `<span class="add">${escapeHtml(b[j++])}</span>\n`; }
  return { left, right };
}

/* ----- Sprint mode ----- */
let sprintTimer = null;
function startSprint() {
  const goal = parseInt($("#sprint-goal").value, 10) || 500;
  const mins = parseInt($("#sprint-min").value, 10) || 15;
  appState.sprint = { goal, mins, startTs: Date.now() };
  $("#sprint-target").textContent = goal + " w";
  $("#sprint-overlay").classList.add("open");
  $("#sprint-overlay").setAttribute("aria-hidden","false");
  $("#sprint-editor").innerHTML = "<div data-type='action'><br></div>";
  $("#sprint-editor").focus();
  $("#modal-sprint").classList.remove("open");
  sprintTimer = setInterval(updateSprint, 250);
}
function updateSprint() {
  if (!appState.sprint) return;
  const { goal, mins, startTs } = appState.sprint;
  const elapsed = (Date.now() - startTs) / 1000;
  const remain = Math.max(0, mins*60 - elapsed);
  $("#sprint-clock").textContent = `${pad(Math.floor(remain/60),2)}:${pad(Math.floor(remain%60),2)}`;
  const w = ($("#sprint-editor").innerText.match(/\b[\w']+\b/g) || []).length;
  $("#sprint-written").textContent = w;
  $("#sprint-wpm").textContent = elapsed > 0 ? Math.round(w / (elapsed/60)) : 0;
  $("#sprint-bar").style.width = Math.min(100, (w/goal)*100) + "%";
  if (remain <= 0) endSprint(true);
}
function endSprint(auto=false) {
  clearInterval(sprintTimer); sprintTimer = null;
  const txt = $("#sprint-editor").innerText.trim();
  if (txt) {
    txt.split(/\n+/).filter(p => p.trim()).forEach(p => {
      const d = document.createElement("div"); d.dataset.type = "action"; d.textContent = p; markRevised(d);
      editor.appendChild(d);
    });
  }
  appState.sprint = null;
  if ($("#sprint-overlay").contains(document.activeElement)) document.activeElement.blur();
  $("#sprint-overlay").classList.remove("open"); $("#sprint-overlay").setAttribute("aria-hidden","true");
  reclassifyAll(); setDirty();
  toast(auto ? "Time's up — added to script" : "Sprint added to script");
}

/* ----- Read aloud ----- */
let aloudSeq = []; let aloudIdx = 0; let aloudVoiceMap = new Map(); let aloudPlaying = false;
function openAloud() {
  if (!window.speechSynthesis) return toast("Speech synthesis not supported");
  $("#aloud-overlay").classList.add("open"); $("#aloud-overlay").setAttribute("aria-hidden","false");
  aloudSeq = compileAloud(); aloudIdx = 0; assignVoices(); renderAloudCurrent();
}
function compileAloud() {
  const lines = $$("#editor > div"); const seq = []; let curChar = null; let curSceneSoundtrack = null;
  lines.forEach(l => {
    const t = l.dataset.type; const txt = (l.textContent || "").trim();
    if (!txt) return;
    if (t === "scene") { seq.push({ kind:"scene", text: txt }); curSceneSoundtrack = l.dataset.sound || null; }
    else if (t === "action")     seq.push({ kind:"action", text: txt });
    else if (t === "character")  curChar = txt.replace(/\s*\(.*\)\s*$/,"").trim();
    else if (t === "parenthetical") seq.push({ kind:"paren", text: txt, char: curChar });
    else if (t === "dialogue")   seq.push({ kind:"dialogue", text: txt, char: curChar });
    else if (t === "transition") seq.push({ kind:"transition", text: txt });
    if (seq.length) seq[seq.length-1].soundtrack = curSceneSoundtrack;
  });
  return seq;
}
function assignVoices() {
  const voices = window.speechSynthesis.getVoices(); aloudVoiceMap.clear();
  const characters = Array.from(new Set(aloudSeq.filter(u => u.char).map(u => u.char)));
  const scheme = $("#aloud-scheme").value;
  if (scheme === "single" || voices.length === 0) { characters.forEach(c => aloudVoiceMap.set(c, voices[0])); return; }
  characters.forEach((c, i) => aloudVoiceMap.set(c, voices[i % voices.length]));
}
function renderAloudCurrent() {
  const u = aloudSeq[aloudIdx]; const body = $("#aloud-body");
  if (!u) { body.innerHTML = `<div class="aloud-current"><div class="aloud-text">— END —</div></div>`; return; }
  let html;
  if (u.kind === "scene")       html = `<div class="aloud-current"><div class="aloud-text scene">${escapeHtml(u.text)}</div></div>`;
  else if (u.kind === "action") html = `<div class="aloud-current"><div class="aloud-text action">${escapeHtml(u.text)}</div></div>`;
  else if (u.kind === "transition") html = `<div class="aloud-current"><div class="aloud-text scene">${escapeHtml(u.text)}</div></div>`;
  else if (u.kind === "paren")  html = `<div class="aloud-current"><div class="aloud-character">${escapeHtml(u.char || "")}</div><div class="aloud-text action">${escapeHtml(u.text)}</div></div>`;
  else html = `<div class="aloud-current"><div class="aloud-character">${escapeHtml(u.char || "")}</div><div class="aloud-text">${escapeHtml(u.text)}</div></div>`;
  body.innerHTML = html;
  if (u.soundtrack) Audio.playSoundtrack(u.soundtrack);
}
function aloudPlay() {
  if (aloudPlaying) { window.speechSynthesis.cancel(); aloudPlaying = false; $("#aloud-play").textContent = "Play"; return; }
  aloudPlaying = true; $("#aloud-play").textContent = "Pause"; speakNext();
}
function speakNext() {
  if (!aloudPlaying || aloudIdx >= aloudSeq.length) { aloudPlaying = false; $("#aloud-play").textContent = "Play"; return; }
  renderAloudCurrent();
  const u = aloudSeq[aloudIdx];
  const text = u.kind === "scene" ? "Scene. " + u.text : u.text;
  const ut = new SpeechSynthesisUtterance(text);
  if (u.char && aloudVoiceMap.has(u.char)) ut.voice = aloudVoiceMap.get(u.char);
  ut.rate = parseFloat($("#aloud-rate").value) || 1;
  ut.pitch = u.kind === "scene" ? 0.9 : 1;
  ut.onend = () => { aloudIdx++; speakNext(); };
  ut.onerror = () => { aloudIdx++; speakNext(); };
  window.speechSynthesis.speak(ut);
}
function closeAloud() {
  window.speechSynthesis.cancel(); aloudPlaying = false;
  Audio.stopSoundtrack();
  $("#aloud-overlay").classList.remove("open"); $("#aloud-overlay").setAttribute("aria-hidden","true");
}

/* =====================================================================
 * Command palette
 * =================================================================== */
function openCmdk() {
  $("#cmdk").classList.add("open"); $("#cmdk").setAttribute("aria-hidden","false");
  $("#cmdk-input").value = ""; $("#cmdk-input").focus(); renderCmdk("");
}
function closeCmdk() { if ($("#cmdk-input") === document.activeElement) document.activeElement.blur(); $("#cmdk").classList.remove("open"); $("#cmdk").setAttribute("aria-hidden","true"); }
const COMMANDS = [
  { kind: "view",   text: "Script view",      sub: "Switch to script",     run: () => setView("script") },
  { kind: "view",   text: "Beat board",       sub: "Switch to beats",      run: () => setView("beats") },
  { kind: "view",   text: "Index cards",      sub: "Switch to cards",      run: () => setView("cards") },
  { kind: "view",   text: "Bible",            sub: "Open project bible",   run: () => setView("bible") },
  { kind: "view",   text: "Story timeline",   sub: "Chronological view",   run: () => setView("timeline") },
  { kind: "view",   text: "Statistics",       sub: "Charts & analytics",   run: () => setView("stats") },
  { kind: "action", text: "Find / Replace",   sub: "⌘ F",                  run: () => $("#btn-find").click() },
  { kind: "action", text: "Sprint mode",      sub: "Word goal + timer",    run: () => $("#btn-sprint").click() },
  { kind: "action", text: "Table read",       sub: "Hear your script",     run: () => openAloud() },
  { kind: "action", text: "Typewriter mode",  sub: "Toggle focused writing", run: () => toggleTypewriter() },
  { kind: "action", text: "Voice dictation",  sub: "Speak your dialogue",  run: () => toggleDictation() },
  { kind: "action", text: "Take snapshot",    sub: "Save a version",       run: () => { openSnap(); $("#snap-name").focus(); } },
  { kind: "action", text: "Open scrap bin",   sub: "Restore cut content",  run: () => openBin() },
  { kind: "action", text: "Logline workshop", sub: "Refine your logline",  run: () => openLoglineWorkshop() },
  { kind: "action", text: "Coverage",         sub: "Generate coverage doc",run: () => generateCoverage() },
  { kind: "action", text: "Sides",            sub: "Export selected scenes",run: () => openSides() },
  { kind: "action", text: "Continuity check", sub: "Flag continuity issues", run: () => openContinuity() },
  { kind: "action", text: "Track Changes log", sub: "View every edit",        run: () => openChangesViewer() },
  { kind: "action", text: "PDF history",       sub: "All PDFs you generated", run: () => openPdfLogViewer() },
  { kind: "action", text: "Print / PDF",      sub: "⌘ P",                  run: () => printPdf(false) },
  { kind: "action", text: "Watermarked PDF",  sub: "Confidential draft",   run: () => printPdfWithWatermark() },
  { kind: "action", text: "Share link",       sub: "Self-contained HTML",  run: () => $("#btn-share").click() },
  { kind: "action", text: "Ambient sound",    sub: "Rain, fire, café…",    run: () => $("#btn-sound").click() },
  { kind: "action", text: "AI assist",        sub: "Bring-your-own-key",   run: () => $("#btn-ai").click() },
  { kind: "action", text: "Open file…",       sub: ".fountain or .fdx (⌘O)", run: () => openFromFile() },
  { kind: "action", text: "Save .fountain",   sub: "Download (⌘S)",         run: () => $("#btn-save").click() },
  { kind: "action", text: "Title page",       sub: "Edit metadata",        run: () => openTitlePage() },
  { kind: "action", text: "Toggle theme",     sub: "Manuscript / Midnight / Court", run: () => cycleTheme() },
  { kind: "action", text: "Back to projects", sub: "Dashboard",            run: () => { location.hash = "#/dashboard"; Dashboard.show(); } },
];
function renderCmdk(q) {
  const items = buildCmdkItems(q);
  $("#cmdk-list").innerHTML = items.map((it,i) => `
    <div class="cmdk-item ${i===0?'active':''}" data-i="${i}">
      <span class="ki-kind">${it.kind}</span>
      <span class="ki-text">${escapeHtml(it.text)}</span>
      <span class="ki-sub">${escapeHtml(it.sub || "")}</span>
    </div>`).join("") || `<div class="cmdk-item"><span class="ki-text muted">No matches</span></div>`;
  $$(".cmdk-item", $("#cmdk-list")).forEach((el,i) => el.addEventListener("click", () => { items[i]?.run(); closeCmdk(); }));
}
function buildCmdkItems(q) {
  const ql = q.toLowerCase().trim();
  const items = [];
  collectScenes().forEach((s,i) => items.push({
    kind: "scene", text: s.slug, sub: `Scene ${i+1} · ${s.words}w`,
    run: () => navigateToLine(s.lineIndex, null)
  }));
  analyzeCharacters().forEach(c => items.push({
    kind: "character", text: c.name, sub: `${c.cues} cues · ${c.words}w`,
    run: () => {
      const first = $$("#editor > div[data-type='character']").find(d => d.textContent.replace(/\s*\(.*\)\s*$/,"").trim().toUpperCase() === c.name);
      if (first) navigateToLine($$("#editor > div").indexOf(first), null);
    }
  }));
  COMMANDS.forEach(c => items.push(c));
  if (!ql) return items.slice(0, 60);
  return items.filter(it => (it.text + " " + (it.sub||"") + " " + it.kind).toLowerCase().includes(ql)).slice(0, 50);
}

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
    if (finalText.trim()) {
      const line = currentLine() || editor.lastElementChild;
      if (line) {
        const t = line.textContent + finalText;
        line.textContent = t;
        placeCursor(line, t.length);
        reclassifyAll(); setDirty();
      }
    }
  };
  dictation.onerror = e => { toast("Mic error: " + e.error); dictation = null; $("#btn-dictate").classList.remove("recording"); };
  dictation.onend = () => { if (dictation) { dictation.start(); } };
  dictation.start();
  $("#btn-dictate").classList.add("recording");
  toast("Listening… click mic again to stop");
}

/* =====================================================================
 * Logline workshop
 * =================================================================== */
function openLoglineWorkshop() {
  $("#ll-input").value = appState.logline || "";
  $("#modal-logline").classList.add("open");
  updateLoglineScore();
  $("#ll-input").focus();
}
function updateLoglineScore() {
  const t = $("#ll-input").value;
  const tl = t.toLowerCase();
  const tests = [
    { name: "Length 15–30 words", pass: () => {
      const w = (t.match(/\b\w+\b/g) || []).length;
      return w >= 15 && w <= 30;
    }, hint: "Aim for one tight sentence." },
    { name: "Protagonist", pass: () => /\b(a|an|the)\s+\w+\s+\w+/i.test(t), hint: "Name the protagonist with a memorable adjective." },
    { name: "Inciting incident", pass: () => /(when|after|once|now that)\b/i.test(tl), hint: "Use 'when' / 'after' to anchor the inciting incident." },
    { name: "Stakes", pass: () => /(or|before|otherwise|risk|will lose|or else|or be|or risk)\b/i.test(tl), hint: "Make the stakes explicit." },
    { name: "Irony / contradiction", pass: () => /(must|forced|despite|even though|reluctantly|secretly)\b/i.test(tl), hint: "Surprise / contradiction makes it memorable." },
    { name: "Goal verb", pass: () => /(must|tries|attempts|races|fights|escapes|hunts|chases|rescues|exposes|stops)\b/i.test(tl), hint: "What does the hero actively try to do?" },
  ];
  const passes = tests.filter(t => t.pass());
  const pct = Math.round((passes.length / tests.length) * 100);
  $("#ll-score").innerHTML = `
    <h4>Score: ${pct}/100</h4>
    <div class="ll-meter"><div style="width:${pct}%"></div></div>
    ${tests.map(c => `<div class="crit ${c.pass()?'ok':'miss'}">${c.pass()?"✓":"○"} ${c.name} <span class="muted" style="font-size:11px;margin-left:auto">${escapeHtml(c.hint)}</span></div>`).join("")}
  `;
}

/* =====================================================================
 * Coverage
 * =================================================================== */
async function generateCoverage() {
  const aiKey = Storage.getSettings().ai?.apiKey;
  $("#modal-coverage").classList.add("open");
  $("#coverage-body").textContent = "Generating coverage…";
  if (aiKey) {
    try {
      const tpl = AI.getCommands().find(c => c.id === "coverage");
      const fountain = serializeFountain(false);
      const txt = await AI.complete(tpl.prompt, { TEXT: fountain.slice(0, 30000) });
      $("#coverage-body").textContent = txt;
    } catch (e) {
      $("#coverage-body").textContent = "AI error: " + e.message + "\n\nFalling back to local coverage…\n\n" + localCoverage();
    }
  } else {
    $("#coverage-body").textContent = localCoverage();
  }
}
function localCoverage() {
  const scenes = collectScenes();
  const cast = analyzeCharacters();
  const totalWords = currentWordCount();
  const totalPages = Math.max(0, Math.ceil(linesToPages()));
  const dialogue = scenes.reduce((a,s) => a + s.dialogWords, 0);
  const dialogueRatio = totalWords ? Math.round(dialogue / totalWords * 100) : 0;

  const lines = [];
  lines.push(`TITLE: ${appState.titleMeta.title || "(untitled)"}`);
  lines.push(`AUTHOR: ${appState.titleMeta.author || "—"}`);
  lines.push("");
  lines.push("LOGLINE: " + (appState.logline || "(none set — open Logline workshop)"));
  lines.push("");
  lines.push("SYNOPSIS:");
  const synopses = scenes.map(s => synopsisAfter(s.lineIndex)).filter(Boolean);
  lines.push((synopses.length ? synopses.join(" ") : "No scene synopses set. Add synopses in Cards view or under scenes via `=`.").slice(0, 1200));
  lines.push("");
  lines.push(`SCALE: ${totalPages} pages · ~${totalPages} min · ${scenes.length} scenes · ${cast.length} speaking roles`);
  lines.push(`DIALOGUE RATIO: ${dialogueRatio}% (industry sweet spot is ~50%)`);
  lines.push("");
  lines.push("MAIN CAST:");
  cast.slice(0,8).forEach(c => lines.push(`  • ${c.name} — ${c.words} words across ${c.scenes} scenes`));
  lines.push("");
  lines.push("STRENGTHS:");
  if (cast.length >= 3) lines.push("  • Multiple speaking roles — ensemble potential.");
  if (totalPages > 60 && totalPages < 130) lines.push("  • Length is within industry expectations for the format.");
  if (scenes.length > 30) lines.push("  • Strong scene density — visual variety.");
  if (synopses.length > 5) lines.push("  • Scene-level synopses indicate clear outlining.");
  lines.push("");
  lines.push("CONCERNS:");
  if (dialogueRatio > 65) lines.push(`  • Dialogue-heavy (${dialogueRatio}%). Consider letting action carry more story.`);
  if (dialogueRatio < 30) lines.push(`  • Dialogue-light (${dialogueRatio}%). Are key beats being earned in dialogue?`);
  if (!appState.logline) lines.push("  • No logline saved — pitch readiness reduced.");
  const longScenes = scenes.filter(s => s.words > (totalWords/scenes.length) * 2.5);
  if (longScenes.length) lines.push(`  • ${longScenes.length} scene(s) significantly longer than average — risk of pacing drag.`);
  lines.push("");
  lines.push("VERDICT: Provisional CONSIDER — full coverage requires read.");
  return lines.join("\n");
}

/* =====================================================================
 * Sides export
 * =================================================================== */
function openSides() {
  const scenes = collectScenes();
  $("#sides-list").innerHTML = scenes.map((s,i) => `
    <label><input type="checkbox" data-line="${s.lineIndex}" /> <span class="slug">${i+1}. ${escapeHtml(s.slug)}</span> <span style="color:var(--muted);margin-left:auto;font-size:11px">${s.words}w · ${Array.from(s.characters).slice(0,3).join(", ")}</span></label>
  `).join("");
  $("#modal-sides").classList.add("open");
}
function generateSides() {
  const picked = $$("#sides-list input:checked").map(c => parseInt(c.dataset.line,10));
  if (picked.length === 0) return toast("Pick at least one scene");
  const actor = $("#sides-actor").value.trim();
  // Build a Fountain doc with only the selected scenes
  const lines = $$("#editor > div");
  let out = `Title: ${appState.titleMeta.title || "(untitled)"} — SIDES\n`;
  if (actor) out += `For: ${actor}\n`;
  out += `Credit: ${appState.titleMeta.credit || "Written by"}\n`;
  out += `Author: ${appState.titleMeta.author || ""}\n\n`;
  picked.forEach(idx => {
    const sceneEnd = (() => {
      for (let j = idx+1; j < lines.length; j++) if (lines[j].dataset.type === "scene") return j;
      return lines.length;
    })();
    for (let j = idx; j < sceneEnd; j++) {
      if (["note","section","synopsis"].includes(lines[j].dataset.type)) continue;
      const t = lines[j].textContent; if (!t.trim()) continue;
      out += t + "\n";
    }
    out += "\n";
  });
  downloadFile((appState.filename.replace(/\.[^.]+$/,"")) + ".sides.fountain", out, "text/plain");
  $("#modal-sides").classList.remove("open");
  toast(`Sides for ${picked.length} scene${picked.length===1?'':'s'} exported`);
}

/* =====================================================================
 * Continuity warnings
 * =================================================================== */
const CONT_TRIGGERS = {
  injured: ["injured", "wounded", "stabbed", "shot", "bleeding"],
  killed:  ["killed", "dead", "dies", "kills"],
  pregnant:["pregnant"],
  drunk:   ["drunk", "wasted", "hammered"],
  fired:   ["fired", "laid off"],
  married: ["married", "engaged"],
};
function quickContinuityCount() { return runContinuityCheck().length; }
function runContinuityCheck() {
  const lines = $$("#editor > div");
  const warnings = [];
  // For each trigger word that mentions a character, see if there's later mention of that character
  // without acknowledgment within 5 scenes.
  const chars = new Set($$("#editor > div[data-type='character']").map(d =>
    d.textContent.replace(/\s*\(.*\)\s*$/,"").trim().toUpperCase()));
  const sceneOf = i => { for (let j = i; j >= 0; j--) if (lines[j] && lines[j].dataset.type === "scene") return j; return -1; };
  const sceneIdx = new Map(); $$("#editor > div[data-type='scene']").forEach((s,i) => sceneIdx.set($$("#editor > div").indexOf(s), i));
  Object.entries(CONT_TRIGGERS).forEach(([kind, words]) => {
    lines.forEach((line, i) => {
      const t = line.textContent.toLowerCase();
      words.forEach(w => {
        if (!t.includes(w)) return;
        // Find character mentioned nearby in ALL CAPS
        const caps = line.textContent.match(/\b[A-Z][A-Z]{2,}\b/g) || [];
        caps.forEach(name => {
          if (!chars.has(name)) return;
          const ownSceneIdx = sceneOf(i);
          if (ownSceneIdx === -1) return;
          const sceneNum = sceneIdx.get(ownSceneIdx) || 0;
          // Check 5 subsequent scenes for any mention of this character or kind
          let acknowledged = false;
          const ahead = lines.slice(i + 1).slice(0, 200);
          ahead.forEach(l => {
            if (l.textContent.toUpperCase().includes(name) && !l.textContent.toLowerCase().includes(w)) {
              // Mentioned by name later — check if condition is mentioned/resolved
              if (kind === "killed" || kind === "dead") {
                if (l.dataset.type === "character" && l.textContent.toUpperCase().includes(name)) {
                  warnings.push({
                    kind, character: name, where: "scene " + (sceneNum+1),
                    msg: `${name} is described as ${kind} in scene ${sceneNum+1}, but speaks later. Intentional?`,
                    lineIdx: lines.indexOf(l)
                  });
                }
              }
            }
          });
        });
      });
    });
  });
  // Dedupe
  const seen = new Set(); return warnings.filter(w => {
    const k = w.kind + ":" + w.character + ":" + w.where;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
}
function openContinuity() {
  $("#modal-continuity").classList.add("open");
  const warnings = runContinuityCheck();
  $("#continuity-body").innerHTML = warnings.length
    ? warnings.map(w => `<div class="cont-item">
        <div>${escapeHtml(w.msg)}</div>
        <div class="cont-where">${escapeHtml(w.where)}</div>
      </div>`).join("")
    : `<div style="color:var(--muted);padding:20px;text-align:center">No continuity issues detected.</div>`;
}

/* =====================================================================
 * AI menu
 * =================================================================== */
function openAiMenu(at) {
  const m = $("#ai-menu");
  const cmds = AI.getCommands();
  m.innerHTML = cmds.map(c => `<div class="ai-menu-item" data-id="${c.id}">${escapeHtml(c.label)}</div>`).join("");
  m.style.left = (at?.x || 100) + "px";
  m.style.top = (at?.y || 100) + "px";
  m.classList.add("open");
  $$(".ai-menu-item", m).forEach(el => el.addEventListener("click", async () => {
    const id = el.dataset.id;
    closeAiMenu();
    await runAiCommand(id);
  }));
}
function closeAiMenu() { $("#ai-menu").classList.remove("open"); }
async function runAiCommand(id) {
  const cmd = AI.getCommands().find(c => c.id === id);
  if (!cmd) return;
  const line = currentLine();
  const text = line ? line.textContent : "";
  const context = line ? gatherContextAround(line, 6) : "";
  try {
    toast("AI thinking…", 8000);
    const result = await AI.complete(cmd.prompt, { TEXT: text, CONTEXT: context });
    if (!result) { toast("AI returned nothing"); return; }
    if (id === "coverage") {
      $("#modal-coverage").classList.add("open");
      $("#coverage-body").textContent = result;
      return;
    }
    if (id === "brainstorm") {
      $("#modal-coverage").classList.add("open");
      $("#coverage-body").textContent = "Brainstorm:\n\n" + result;
      return;
    }
    if (line) {
      const ok = await modalConfirm({
        title: "Apply AI suggestion?",
        body: "Replace current line with:\n\n" + result.trim().slice(0, 400),
        okText: "Replace"
      });
      if (ok) { line.textContent = result.trim(); markRevised(line); reclassifyAll(); setDirty(); }
    }
  } catch (e) { toast("AI error: " + e.message, 5000); }
}
function gatherContextAround(line, n) {
  const lines = $$("#editor > div");
  const idx = lines.indexOf(line);
  const lo = Math.max(0, idx - n); const hi = Math.min(lines.length, idx + n + 1);
  return lines.slice(lo, hi).map(l => l.textContent).join("\n");
}

/* =====================================================================
 * Share link (self-contained read-only HTML)
 * =================================================================== */
function generateShareFile() {
  const mode = $("#share-mode").value;
  const reader = $("#share-name").value.trim();
  const watermark = $("#share-watermark").value.trim();
  const html = buildSharedHtml({ mode, reader, watermark });
  const fname = (appState.filename.replace(/\.[^.]+$/,"")) + (mode === "annotate" ? ".annotated.html" : ".share.html");
  downloadFile(fname, html, "text/html");
  $("#modal-share").classList.remove("open");
  toast("Share file downloaded — email or upload anywhere");
}
function buildSharedHtml({ mode, reader, watermark }) {
  const title = appState.titleMeta.title || "Screenplay";
  const author = appState.titleMeta.author || "";
  const lines = $$("#editor > div");
  const body = lines.map(l => {
    if (["note","section","synopsis"].includes(l.dataset.type)) return "";
    const cls = "ln " + l.dataset.type;
    return `<div class="${cls}" data-key="${makeLineKey(l)}">${escapeHtml(l.textContent)}</div>`;
  }).join("\n");
  const annotateScript = mode === "annotate" ? `
    <script>
      const notes = JSON.parse(localStorage.getItem("bs-annotate-" + ${JSON.stringify(title)}) || "{}");
      function pickColor() { return ["#cf3a37","#dfa116","#4f8a3a","#3878b8","#7a55b8"][Math.floor(Math.random()*5)]; }
      function renderMarks() {
        Object.keys(notes).forEach(k => {
          const el = document.querySelector('[data-key="' + k + '"]');
          if (el && !el.querySelector('.note-marker')) {
            const m = document.createElement('span');
            m.className = 'note-marker';
            m.textContent = '✎';
            m.style.color = pickColor();
            m.style.marginLeft = '8px';
            m.style.cursor = 'pointer';
            m.onclick = () => alert(notes[k]);
            el.appendChild(m);
          }
        });
      }
      document.querySelectorAll('.ln').forEach(el => {
        el.addEventListener('click', e => {
          if (e.target.classList.contains('note-marker')) return;
          const k = el.dataset.key;
          const t = prompt('Add a note:', notes[k] || '');
          if (t === null) return;
          if (t.trim()) notes[k] = t; else delete notes[k];
          localStorage.setItem("bs-annotate-" + ${JSON.stringify(title)}, JSON.stringify(notes));
          document.querySelectorAll('.note-marker').forEach(n => n.remove());
          renderMarks();
        });
      });
      function exportNotes() {
        const out = Object.entries(notes).map(([k,v]) => '• "' + (document.querySelector('[data-key="' + k + '"]')?.textContent || '?').slice(0,80) + '"\\n  ' + v).join('\\n\\n');
        navigator.clipboard.writeText(out).then(() => alert('Notes copied to clipboard. Paste in email.'));
      }
      renderMarks();
      const exp = document.createElement('button');
      exp.textContent = '📋 Copy notes to clipboard';
      exp.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:10px 14px;background:#b3261e;color:#fff;border:0;border-radius:8px;cursor:pointer;font:inherit;';
      exp.onclick = exportNotes;
      document.body.appendChild(exp);
    </script>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: ui-monospace, "Courier Prime", "Courier New", monospace; max-width: 8.5in; margin: 40px auto; padding: 1in 1in 1in 1.5in; background: #fbf5e8; color: #1a1815; }
  .wmark { position: fixed; inset: 0; pointer-events: none; display: flex; align-items: center; justify-content: center; z-index: -1; font-family: serif; font-size: 90pt; color: rgba(0,0,0,0.06); transform: rotate(-30deg); text-transform: uppercase; letter-spacing: 0.1em; }
  .head { text-align: center; margin-bottom: 3in; padding-top: 3in; }
  .head .t { font-weight: 700; text-transform: uppercase; font-size: 14pt; margin-bottom: 2em; }
  .scene { text-transform: uppercase; font-weight: 700; margin: 1.5em 0 .5em; page-break-after: avoid; }
  .action { margin: 0 0 1em; }
  .character { text-transform: uppercase; margin: 1em 0 0 2.2in; }
  .parenthetical { margin: 0 1.6in 0 1.6in; }
  .dialogue { margin: 0 1.5in 0 1in; }
  .transition { text-transform: uppercase; text-align: right; margin: 1em 0; }
  .centered { text-align: center; margin: 1em 0; }
  .reader { position: fixed; top: 10px; right: 16px; font-family: system-ui; font-size: 11px; color: #82786a; background: #fff; padding: 4px 10px; border-radius: 9px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .note-marker { font-family: system-ui; }
  @media print { .reader, .note-marker { display: none; } }
</style></head><body>
${watermark ? `<div class="wmark">${escapeHtml(watermark)}</div>` : ""}
${reader ? `<div class="reader">For: ${escapeHtml(reader)}</div>` : ""}
<div class="head">
  <div class="t">${escapeHtml(title)}</div>
  ${author ? `<div>${escapeHtml(appState.titleMeta.credit || "Written by")}</div><div>${escapeHtml(author)}</div>` : ""}
</div>
${body}
${annotateScript}
</body></html>`;
}

/* =====================================================================
 * Fountain serialize / parse (carries bestscreen meta as JSON inline)
 * =================================================================== */
function serializeFountain(includeTitle=true) {
  let out = "";
  if (includeTitle) {
    const tp = appState.titleMeta;
    if (tp.title || tp.author) {
      if (tp.title)   out += `Title: ${tp.title}\n`;
      if (tp.credit)  out += `Credit: ${tp.credit}\n`;
      if (tp.author)  out += `Author: ${tp.author}\n`;
      if (tp.source)  out += `Source: ${tp.source}\n`;
      if (tp.date)    out += `Draft date: ${tp.date}\n`;
      if (tp.contact) out += `Contact: ${tp.contact}\n`;
      if (tp.episode) out += `Episode: ${tp.episode}\n`;
      out += "\n";
    }
  }
  const lines = $$("#editor > div"); let prevType = "";
  lines.forEach(line => {
    const t = line.textContent; const type = line.dataset.type;
    const meta = [];
    ["color","tags","beat","thread","goal","mood","date","sound","rev"].forEach(k => {
      if (line.dataset[k]) meta.push(`${k}=${(line.dataset[k]+"").replace(/\|/g," ")}`);
    });
    const metaComment = meta.length ? ` /* bs:${meta.join(";")} */` : "";
    const needsBlankBefore =
      (type === "scene" && prevType !== "" && prevType !== "scene") ||
      (type === "character" && prevType !== "" && prevType !== "scene" && prevType !== "character");
    if (needsBlankBefore && !out.endsWith("\n\n")) out += "\n";
    switch (type) {
      case "scene":
        out += (SCENE_RE.test(t.trim()) ? t.trim() : "." + t.trim()) + metaComment + "\n"; break;
      case "character":     out += t.trim() + metaComment + "\n"; break;
      case "dialogue":      out += t + "\n"; break;
      case "parenthetical": out += t.trim() + "\n"; break;
      case "transition":    out += t.trim() + "\n"; break;
      case "centered":      out += "> " + t.trim().replace(/^[><]|[><]$/g,"") + " <\n"; break;
      case "note":          out += (t.trim().startsWith("[[") ? t.trim() : `[[${t.trim()}]]`) + "\n"; break;
      case "section":       out += (t.startsWith("#") ? t : `# ${t}`) + "\n"; break;
      case "synopsis":      out += (t.startsWith("=") ? t : `= ${t}`) + "\n"; break;
      default:              out += t + "\n";
    }
    prevType = type;
  });
  return out.replace(/\n{3,}/g, "\n\n");
}

function parseFountainTitle(src) {
  const meta = { ...appState.titleMeta };
  const idx = src.indexOf("\n\n");
  if (idx === -1) return { meta, rest: src };
  const head = src.substring(0, idx);
  if (!/^[A-Za-z ]+:/.test(head)) return { meta, rest: src };
  head.split("\n").forEach(l => {
    const m = l.match(/^([A-Za-z ]+):\s*(.*)$/); if (!m) return;
    const key = m[1].toLowerCase().trim();
    if (key === "title") meta.title = m[2];
    else if (key === "credit") meta.credit = m[2];
    else if (key === "author" || key === "authors") meta.author = m[2];
    else if (key === "source") meta.source = m[2];
    else if (key === "draft date" || key === "date") meta.date = m[2];
    else if (key === "contact") meta.contact = m[2];
    else if (key === "episode") meta.episode = m[2];
  });
  return { meta, rest: src.substring(idx + 2) };
}

function loadFountain(src) {
  const { meta, rest } = parseFountainTitle(src);
  appState.titleMeta = meta;

  // Extract bestscreen meta comments
  const metaByText = new Map();
  const body = rest.replace(/^(.*?)(?:\s*\/\*\s*bs:([^*]+)\*\/)\s*$/gm, (full, line, m) => {
    metaByText.set(line, m); return line;
  }).replace(/\/\*[\s\S]*?\*\//g, "");

  const rawLines = body.split(/\r?\n/);
  const objs = rawLines.map(text => ({ text, type: null }));
  for (let i = 0; i < objs.length; i++) {
    const cur = objs[i]; const t = cur.text.trim();
    const prev = i > 0 ? objs[i-1] : { text: "" };
    const next = i+1 < objs.length ? objs[i+1] : { text: "" };
    if (!t) { cur.type = "blank"; continue; }
    if (t.startsWith("!"))                          { cur.type = "action"; cur.text = cur.text.replace(/^!/,""); continue; }
    if (t.startsWith(".") && !t.startsWith(".."))   { cur.type = "scene";  cur.text = cur.text.replace(/^\./,""); continue; }
    if (t.startsWith("@"))                          { cur.type = "character"; cur.text = cur.text.replace(/^@/,""); continue; }
    if (t.startsWith(">") && t.endsWith("<"))       { cur.type = "centered"; cur.text = t.slice(1,-1).trim(); continue; }
    if (t.startsWith(">"))                          { cur.type = "transition"; cur.text = t.replace(/^>/,"").trim(); continue; }
    if (t.startsWith("#"))                          { cur.type = "section"; continue; }
    if (t.startsWith("=") && !t.startsWith("=="))   { cur.type = "synopsis"; continue; }
    if (t.startsWith("[[") && t.endsWith("]]"))     { cur.type = "note"; continue; }
    if (SCENE_RE.test(t))                           { cur.type = "scene"; continue; }
    if (TRANS_RE.test(t) && ALLCAPS_RE.test(t))     { cur.type = "transition"; continue; }
    if (ALLCAPS_RE.test(t) && t.endsWith(":"))      { cur.type = "transition"; continue; }
    if (t.startsWith("(") && t.endsWith(")")) {
      const p = objs[i-1];
      if (p && ["character","dialogue","parenthetical"].includes(p.type)) { cur.type = "parenthetical"; continue; }
    }
    if (ALLCAPS_RE.test(t) && !t.endsWith(":") && next.text.trim() !== "" && (prev.text.trim() === "" || i === 0)) {
      const stripped = t.replace(/[.,;!?]+$/, "").trim().toUpperCase();
      if (CHAR_BLACKLIST.has(stripped) ||
          /^(END OF|ACT [A-Z]+|SCENE [A-Z0-9]+|PART [A-Z]+|CHAPTER )/i.test(stripped)) {
        cur.type = "action"; continue;
      }
      cur.type = "character"; continue;
    }
    if (prev && ["character","parenthetical","dialogue"].includes(prev.type) && prev.text.trim() !== "") {
      cur.type = "dialogue"; continue;
    }
    cur.type = "action";
  }

  editor.innerHTML = "";
  objs.forEach(o => {
    if (o.type === "blank") return;
    const d = document.createElement("div");
    d.dataset.type = o.type;
    d.dataset.forced = (o.type !== "action" && o.type !== "dialogue") ? "true" : "false";
    d.textContent = o.text.replace(/^\s+/, "");
    if (metaByText.has(o.text)) {
      metaByText.get(o.text).split(";").forEach(kv => {
        const [k,v] = kv.split("="); if (k && v) d.dataset[k.trim()] = v.trim();
      });
    }
    editor.appendChild(d);
  });
  if (editor.childNodes.length === 0) {
    const d = document.createElement("div"); d.dataset.type = "action"; d.innerHTML = "<br>";
    editor.appendChild(d);
  }
  reclassifyAll(); setSaved();
}

/* =====================================================================
 * PDF / print
 * =================================================================== */
function printPdf(watermarked=false) {
  const tp = appState.titleMeta;
  let titleHtml = "";
  if (tp.title || tp.author) {
    titleHtml = `<div class="print-title">
      <div class="pt-title">${escapeHtml(tp.title || "Untitled")}</div>
      <div class="pt-credit">${escapeHtml(tp.credit || "")}</div>
      <div class="pt-author">${escapeHtml(tp.author || "")}</div>
      ${tp.episode ? `<div class="pt-meta">${escapeHtml(tp.episode)}</div>` : ""}
      ${tp.source ? `<div class="pt-meta">${escapeHtml(tp.source)}</div>` : ""}
      ${tp.date ? `<div class="pt-meta">${escapeHtml(tp.date)}</div>` : ""}
      ${tp.contact ? `<div class="pt-foot">${escapeHtml(tp.contact)}</div>` : ""}
    </div>`;
  }
  const paper = $("#paper");
  const inserted = [];
  if (titleHtml) {
    const tpEl = document.createElement("div"); tpEl.innerHTML = titleHtml;
    paper.prepend(tpEl.firstElementChild); inserted.push(paper.firstElementChild);
  }
  // For watermarked PDF we now collect the watermark via inline modal *before*
  // entering the print flow so window.print() isn't blocked. The caller routes:
  // printPdf(false) directly prints; printPdfWithWatermark() collects text first.
  if (watermarked) {
    const wm = document.createElement("div"); wm.className = "pdf-watermark";
    wm.textContent = (typeof watermarked === "string") ? watermarked : "CONFIDENTIAL DRAFT";
    document.body.appendChild(wm); inserted.push(wm);
  }
  document.body.classList.toggle("print-scene-numbers", appState.showSceneNumbersInPdf);

  // Log PDF
  const entry = { t: Date.now(), name: appState.titleMeta.title || appState.filename,
    watermark: watermarked, version: appState.activeRevision, sceneCount: collectScenes().length,
    pageCount: Math.ceil(linesToPages()) };
  const arr = Storage.getPdfList(appState.projectId); arr.unshift(entry);
  if (arr.length > 100) arr.pop();
  Storage.setPdfList(appState.projectId, arr);
  Storage.pushPdfLog({ ...entry, projectId: appState.projectId });

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      inserted.forEach(el => el.remove());
      document.body.classList.remove("print-scene-numbers");
    }, 100);
  }, 50);
}

/* =====================================================================
 * Track Changes viewer
 * =================================================================== */
function openChangesViewer() {
  const d = $("#drawer-changes"); d.classList.add("open"); d.setAttribute("aria-hidden","false");
  renderChangesViewer();
}
function renderChangesViewer() {
  const arr = Storage.getChanges(appState.projectId);
  const body = $("#changes-body");
  if (arr.length === 0) {
    body.innerHTML = `<div class="side-empty" style="padding:30px 16px">No changes logged yet.<br><br>Edits start logging once you change an element type, rename a character, or use AI to rewrite a line.</div>`;
    return;
  }
  // Most recent first
  body.innerHTML = arr.slice().reverse().slice(0, 200).map(c => `
    <div class="scrap">
      <div class="sc-date">
        <span>${new Date(c.t).toLocaleString()}</span>
        <span style="color:var(--muted)">${escapeHtml(c.author || "you")}</span>
      </div>
      <div style="font-family:var(--font-ui);font-size:11.5px;color:var(--ink-2)">
        <b>${escapeHtml(c.type)}</b> on line ${c.lineIdx + 1}${c.value ? ` → ${escapeHtml(String(c.value).slice(0,80))}` : ""}
      </div>
    </div>
  `).join("");
  $("#changes-export").onclick = () => {
    const csv = "timestamp,author,type,lineIdx,value\n" +
      arr.map(c => `"${new Date(c.t).toISOString()}","${(c.author||"").replace(/"/g,'""')}","${c.type}",${c.lineIdx},"${String(c.value||"").replace(/"/g,'""')}"`).join("\n");
    downloadFile("changes.csv", csv, "text/csv");
  };
  $("#changes-clear").onclick = async () => {
    if (!(await modalConfirm({ title:"Clear change log?", body:"Removes all entries (script unaffected).", okText:"Clear", danger:true }))) return;
    Storage.setChanges(appState.projectId, []);
    renderChangesViewer();
  };
}

/* =====================================================================
 * PDF log viewer
 * =================================================================== */
function openPdfLogViewer() {
  const d = $("#drawer-pdfs"); d.classList.add("open"); d.setAttribute("aria-hidden","false");
  renderPdfLogViewer();
}
function renderPdfLogViewer() {
  const arr = Storage.getPdfList(appState.projectId);
  const body = $("#pdfs-body");
  if (arr.length === 0) {
    body.innerHTML = `<div class="side-empty" style="padding:30px 16px">No PDFs yet.<br><br>Press <kbd>⌘ P</kbd> to print or <kbd>⌘ ⇧ P</kbd> for a watermarked PDF — each generation is logged here.</div>`;
    return;
  }
  body.innerHTML = arr.slice(0, 100).map(p => {
    const col = REVISION_COLORS.find(r => r.id === p.version);
    return `<div class="scrap">
      <div class="sc-date">
        <span>${new Date(p.t).toLocaleString()}</span>
        <span style="display:inline-flex;gap:6px;align-items:center;color:var(--muted)">
          <span style="width:10px;height:10px;border-radius:50%;background:${col?.css || '#ccc'}"></span>
          ${escapeHtml((col?.label || "white").toLowerCase())} pages
        </span>
      </div>
      <div style="font-family:var(--font-ui);font-size:12.5px;margin-top:4px">
        <b>${escapeHtml(p.name || "Untitled")}</b>
        <span style="color:var(--muted)"> · ${p.pageCount}p · ${p.sceneCount} scenes</span>
      </div>
      ${p.watermark ? `<div style="font-size:11px;color:var(--accent);margin-top:3px">⚠ ${typeof p.watermark === "string" ? escapeHtml(p.watermark) : "Confidential watermark"}</div>` : ""}
    </div>`;
  }).join("");
}

async function printPdfWithWatermark() {
  const txt = await modalPrompt({
    title: "Watermarked PDF",
    label: "Watermark",
    placeholder: "CONFIDENTIAL DRAFT",
    defaultValue: "CONFIDENTIAL DRAFT",
    okText: "Generate PDF",
  });
  if (txt === null) return;
  printPdf(txt || "DRAFT");
}

/* =====================================================================
 * File I/O
 * =================================================================== */
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function openFromFile() { $("#file-input").value = ""; $("#file-input").click(); }

function fdxToFountain(xml) {
  // Minimal Final Draft .fdx → Fountain converter
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paras = doc.getElementsByTagName("Paragraph");
  let out = "";
  // Pull title page first
  const titleParas = doc.querySelectorAll("TitlePage Paragraph Text");
  const titleLines = Array.from(titleParas).map(t => (t.textContent || "").trim()).filter(Boolean);
  if (titleLines.length) {
    out += `Title: ${titleLines[0]}\n`;
    if (titleLines[1]) out += `Credit: ${titleLines[1]}\n`;
    if (titleLines[2]) out += `Author: ${titleLines[2]}\n`;
    out += "\n";
  }
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    // Skip title-page paragraphs (already consumed)
    if (p.closest("TitlePage")) continue;
    const type = p.getAttribute("Type") || "Action";
    const text = (p.textContent || "").trim();
    if (!text) continue;
    switch (type) {
      case "Scene Heading": out += text + "\n\n"; break;
      case "Action":        out += text + "\n\n"; break;
      case "Character":     out += text + "\n"; break;
      case "Dialogue":      out += text + "\n"; break;
      case "Parenthetical": out += text + "\n"; break;
      case "Transition":    out += text + "\n\n"; break;
      default:              out += text + "\n\n";
    }
  }
  return out;
}

function exportFdx() {
  const lines = $$("#editor > div");
  const map = { scene:"Scene Heading", action:"Action", character:"Character", dialogue:"Dialogue",
                parenthetical:"Parenthetical", transition:"Transition", centered:"Action" };
  let body = "";
  lines.forEach(line => {
    const t = (line.textContent || "").replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));
    if (!t.trim()) return;
    const fdxType = map[line.dataset.type] || "Action";
    body += `  <Paragraph Type="${fdxType}"><Text>${t}</Text></Paragraph>\n`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
<Content>
${body}</Content>
</FinalDraft>`;
  downloadFile(appState.filename.replace(/\.[^.]+$/,"") + ".fdx", xml, "application/xml");
}

/* =====================================================================
 * Wire editor UI
 * =================================================================== */
function bindEditorUI() {
  // View tabs
  $$(".view-tab").forEach(t => t.addEventListener("click", () => setView(t.dataset.view)));

  // Back
  $("#btn-back").addEventListener("click", () => {
    autosave();
    location.hash = "#/dashboard";
    Dashboard.show();
  });

  // Toolbar
  $("#btn-cmd").addEventListener("click", openCmdk);
  $("#btn-find").addEventListener("click", () => { $("#findbar").classList.add("open"); $("#find-input").focus(); });
  $("#btn-typewriter").addEventListener("click", toggleTypewriter);
  $("#btn-dictate").addEventListener("click", toggleDictation);
  $("#btn-sprint").addEventListener("click", () => $("#modal-sprint").classList.add("open"));
  $("#btn-aloud").addEventListener("click", openAloud);
  $("#btn-ai").addEventListener("click", async () => {
    if (!Storage.getSettings().ai?.apiKey) {
      const ok = await modalConfirm({
        title: "No AI key configured",
        body: "Add an API key in Settings to enable AI assist. Go to dashboard now?",
        okText: "Open Settings"
      });
      if (ok) { autosave(); location.hash = "#/dashboard"; Dashboard.show(); setTimeout(() => $("#dash-settings")?.click(), 50); }
      return;
    }
    const r = $("#btn-ai").getBoundingClientRect();
    openAiMenu({ x: r.left, y: r.bottom + 4 });
  });
  $("#btn-sound").addEventListener("click", () => {
    const d = $("#drawer-sound"); d.classList.add("open"); d.setAttribute("aria-hidden","false");
  });
  $("#btn-bin").addEventListener("click", openBin);
  $("#btn-snapshot").addEventListener("click", openSnap);
  $("#btn-share").addEventListener("click", () => $("#modal-share").classList.add("open"));
  $("#btn-open").addEventListener("click", openFromFile);
  $("#btn-save").addEventListener("click", () => {
    const text = serializeFountain(true);
    downloadFile(appState.filename || "screenplay.fountain", text, "text/plain");
    autosave(); toast("Saved");
  });
  $("#btn-print").addEventListener("click", () => printPdf(false));
  $("#btn-export-fdx").addEventListener("click", exportFdx);
  $("#btn-inspector").addEventListener("click", () => {
    const app = $("#app"); app.dataset.inspector = app.dataset.inspector === "hidden" ? "" : "hidden";
  });
  $("#btn-theme").addEventListener("click", cycleTheme);
  $("#btn-help").addEventListener("click", () => $("#modal-help").classList.add("open"));

  // Side tabs
  $$(".side-tab").forEach(t => t.addEventListener("click", () => setSidebarTab(t.dataset.tab)));

  // Doc title → title page
  $("#doc-title-name").addEventListener("click", openTitlePage);
  $("#stat-continuity").addEventListener("click", () => { if ($("#stat-continuity").classList.contains("has-warning")) openContinuity(); });

  // Editor events
  editor.addEventListener("keydown", onEditorKeydown);
  editor.addEventListener("input", onEditorInput);
  editor.addEventListener("click", e => {
    if (e.target.classList.contains("line-comment-marker")) return;
    updateStatus(); updateInspector();
    if (appState.typewriter) tightenTypewriter();
    closeCommentPopover();
  });
  editor.addEventListener("keyup", e => {
    if (/^Arrow/.test(e.key)) { updateStatus(); updateInspector(); if (appState.typewriter) tightenTypewriter(); }
  });
  editor.addEventListener("blur", () => acClose());
  editor.addEventListener("paste", e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    const sel = window.getSelection(); if (!sel.rangeCount) return;
    sel.deleteFromDocument();
    const parts = text.split(/\r?\n/);
    const line = currentLine(); if (!line) return;
    const off = getCaretOffsetInLine(line);
    const lineText = line.textContent;
    const before = lineText.substring(0, off); const after = lineText.substring(off);
    if (parts.length === 1) { line.textContent = before + parts[0] + after; placeCursor(line, (before + parts[0]).length); }
    else {
      line.textContent = before + parts[0]; let last = line;
      for (let i = 1; i < parts.length; i++) {
        const nd = document.createElement("div"); nd.dataset.type = "action"; nd.textContent = parts[i] || "";
        if (!nd.textContent) nd.innerHTML = "<br>";
        last.parentNode.insertBefore(nd, last.nextSibling); last = nd;
      }
      last.textContent = (parts[parts.length-1] || "") + after;
      placeCursor(last, (parts[parts.length-1] || "").length);
    }
    reclassifyAll(); setDirty();
  });

  // Drag to bin
  $("#btn-bin").addEventListener("dragover", e => { e.preventDefault(); $("#btn-bin").classList.add("active"); });
  $("#btn-bin").addEventListener("dragleave", () => $("#btn-bin").classList.remove("active"));
  $("#btn-bin").addEventListener("drop", e => {
    e.preventDefault(); $("#btn-bin").classList.remove("active");
    const text = e.dataTransfer.getData("text/plain");
    if (text) {
      addToBin(text);
      const sel = window.getSelection(); if (sel.rangeCount) sel.deleteFromDocument();
      reclassifyAll(); setDirty();
    }
  });

  // Findbar
  $("#find-input").addEventListener("input", findRun);
  $("#find-case").addEventListener("change", findRun);
  $("#find-word").addEventListener("change", findRun);
  $("#find-scope").addEventListener("change", findRun);
  $("#find-next").addEventListener("click", findNext);
  $("#find-prev").addEventListener("click", findPrev);
  $("#find-replace").addEventListener("click", findReplaceCurrent);
  $("#find-replace-all").addEventListener("click", findReplaceAll);
  $("#find-close").addEventListener("click", () => { $("#findbar").classList.remove("open"); clearHighlights(); findMatches = []; findIndex = -1; });
  $("#find-input").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? findPrev() : findNext(); }
    if (e.key === "Escape") { $("#find-close").click(); editor.focus(); }
  });

  // Drawers
  $$("[data-drawer-close]").forEach(b => b.addEventListener("click", () => {
    const d = b.getAttribute("data-drawer-close"); const el = $("#" + d);
    if (el.contains(document.activeElement)) document.activeElement.blur();
    el.classList.remove("open"); el.setAttribute("aria-hidden","true");
  }));
  $("#snap-take").addEventListener("click", () => takeSnapshot($("#snap-name").value.trim()));

  // Sprint modal
  $("#sprint-cancel").addEventListener("click", () => $("#modal-sprint").classList.remove("open"));
  $("#sprint-go").addEventListener("click", startSprint);
  $("#sprint-end").addEventListener("click", () => endSprint(false));

  // Title page
  $("#tp-cancel").addEventListener("click", () => $("#modal-titlepage").classList.remove("open"));
  $("#tp-save").addEventListener("click", () => {
    const tp = appState.titleMeta;
    tp.title=$("#tp-title").value; tp.credit=$("#tp-credit").value; tp.author=$("#tp-author").value;
    tp.source=$("#tp-source").value; tp.date=$("#tp-date").value; tp.contact=$("#tp-contact").value;
    tp.episode=$("#tp-episode").value;
    appState.logline = $("#tp-logline").value;
    appState.theme = $("#tp-theme").value;
    appState.premise = $("#tp-premise").value;
    $("#doc-title-name").textContent = tp.title || appState.filename || "Untitled";
    setDirty(); $("#modal-titlepage").classList.remove("open");
  });

  // Logline
  $("#ll-cancel").addEventListener("click", () => $("#modal-logline").classList.remove("open"));
  $("#ll-save").addEventListener("click", () => {
    appState.logline = $("#ll-input").value;
    setDirty(); updateInspector(); $("#modal-logline").classList.remove("open");
    toast("Logline saved");
  });
  $("#ll-input").addEventListener("input", updateLoglineScore);

  // Diff modal
  $("#diff-close").addEventListener("click", () => $("#modal-diff").classList.remove("open"));

  // Rename modal
  $("#rename-cancel").addEventListener("click", () => $("#modal-rename").classList.remove("open"));
  $("#rename-go").addEventListener("click", () => {
    const n = renameCharacter($("#rename-from").value, $("#rename-to").value);
    $("#modal-rename").classList.remove("open"); toast(`Renamed ${n}`);
  });

  // Read aloud controls
  $("#aloud-close").addEventListener("click", closeAloud);
  $("#aloud-play").addEventListener("click", aloudPlay);
  $("#aloud-prev").addEventListener("click", () => { aloudIdx = Math.max(0, aloudIdx-1); renderAloudCurrent(); });
  $("#aloud-next").addEventListener("click", () => { aloudIdx = Math.min(aloudSeq.length-1, aloudIdx+1); renderAloudCurrent(); });
  $("#aloud-rate").addEventListener("input", () => {});
  $("#aloud-scheme").addEventListener("change", assignVoices);
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = assignVoices;

  // Cmdk
  $("#cmdk-input").addEventListener("input", () => renderCmdk($("#cmdk-input").value));
  $("#cmdk-input").addEventListener("keydown", e => {
    const items = $$(".cmdk-item", $("#cmdk-list"));
    const cur = items.findIndex(it => it.classList.contains("active"));
    if (e.key === "ArrowDown") { e.preventDefault(); const n = (cur+1)%items.length; items.forEach((i,k)=>i.classList.toggle("active",k===n)); items[n]?.scrollIntoView({block:"nearest"}); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = (cur-1+items.length)%items.length; items.forEach((i,k)=>i.classList.toggle("active",k===n)); items[n]?.scrollIntoView({block:"nearest"}); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const items2 = buildCmdkItems($("#cmdk-input").value);
      const idx = $$(".cmdk-item", $("#cmdk-list")).findIndex(it => it.classList.contains("active"));
      const sel = items2[idx >= 0 ? idx : 0]; if (sel) { sel.run(); closeCmdk(); }
    } else if (e.key === "Escape") closeCmdk();
  });
  $("#cmdk").addEventListener("click", e => { if (e.target === $("#cmdk")) closeCmdk(); });

  // Help
  $("#help-close").addEventListener("click", () => $("#modal-help").classList.remove("open"));

  // Beat board
  $("#beats-add-section").addEventListener("click", async () => {
    const title = await modalPrompt({ title:"Add section", label:"Title", placeholder:"Act One", defaultValue:"Act" });
    if (!title) return;
    const d = document.createElement("div"); d.dataset.type = "section"; d.dataset.forced = "true";
    d.textContent = "# " + title; editor.prepend(d);
    reclassifyAll(); setDirty(); renderBeatBoard();
  });
  $("#beats-template-fidelity").addEventListener("click", () => {
    if (!appState.template) { toast("Set a template first (Logline / Title page)"); return; }
    setView("stats");
  });

  // AI menu close
  document.addEventListener("click", e => {
    if (!e.target.closest("#ai-menu") && !e.target.closest("#btn-ai")) closeAiMenu();
  });

  // Comment pop
  $("#cp-post").addEventListener("click", postComment);
  $("#cp-close").addEventListener("click", closeCommentPopover);

  // Ambient sounds
  $$(".amb").forEach(b => b.addEventListener("click", () => {
    const a = b.dataset.amb;
    $$(".amb").forEach(x => x.classList.toggle("active", x === b && a !== "off"));
    if (a === "off") Audio.stop(); else Audio.startNamed(a);
  }));
  $("#amb-vol").addEventListener("input", e => Audio.setVolume(parseFloat(e.target.value)));
  $("#amb-st-attach").addEventListener("click", () => {
    const sc = currentScene(); if (!sc) return toast("Place cursor in a scene first");
    const url = $("#amb-st-url").value.trim();
    const line = $$("#editor > div")[sc.lineIndex];
    if (url) line.dataset.sound = url; else delete line.dataset.sound;
    setDirty(); toast("Attached soundtrack to scene");
  });
  $("#amb-st-play").addEventListener("click", () => { const url = $("#amb-st-url").value.trim(); if (url) Audio.playSoundtrack(url); });
  $("#amb-st-clear").addEventListener("click", () => { Audio.stopSoundtrack(); $("#amb-st-url").value = ""; });

  // Share
  $("#share-cancel").addEventListener("click", () => $("#modal-share").classList.remove("open"));
  $("#share-go").addEventListener("click", generateShareFile);

  // Coverage
  $("#cov-close").addEventListener("click", () => $("#modal-coverage").classList.remove("open"));
  $("#cov-copy").addEventListener("click", () => { navigator.clipboard.writeText($("#coverage-body").textContent); toast("Copied to clipboard"); });

  // Fidelity
  $("#fid-close").addEventListener("click", () => $("#modal-fidelity").classList.remove("open"));

  // Sides
  $("#sides-cancel").addEventListener("click", () => $("#modal-sides").classList.remove("open"));
  $("#sides-go").addEventListener("click", generateSides);

  // Continuity
  $("#cont-close").addEventListener("click", () => $("#modal-continuity").classList.remove("open"));

  // Theme dash
  $("#btn-theme-dash")?.addEventListener("click", cycleTheme);

  // Settings (dashboard modal)
  $("#st-cancel")?.addEventListener("click", () => $("#modal-settings").classList.remove("open"));
  $("#st-save")?.addEventListener("click", () => {
    Storage.setSettings({
      author: $("#st-author").value,
      ai: { provider: $("#st-ai-provider").value, apiKey: $("#st-ai-key").value, model: $("#st-ai-model").value }
    });
    $("#modal-settings").classList.remove("open"); toast("Settings saved");
  });

  // New project / series
  $("#np-cancel")?.addEventListener("click", () => $("#modal-newproj").classList.remove("open"));
  $("#np-go")?.addEventListener("click", () => Dashboard.createFromModal());
  $$(".np-color").forEach(c => c.addEventListener("click", () => {
    $$(".np-color").forEach(x => x.classList.toggle("selected", x === c));
  }));
  $("#ns-cancel")?.addEventListener("click", () => $("#modal-newseries").classList.remove("open"));
  $("#ns-go")?.addEventListener("click", () => Dashboard.createSeries());

  // File input (replaces current doc; FDX auto-converted)
  $("#file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const ext = file.name.toLowerCase().split(".").pop();
    let fountain;
    try {
      fountain = ext === "fdx" ? fdxToFountain(text) : text;
    } catch (err) { toast("Couldn't parse: " + err.message); return; }
    if (appState.projectId) {
      Storage.setDoc(appState.projectId, fountain);
      loadFountain(fountain);
      // Update project name if title parsed
      if (appState.titleMeta.title) {
        Storage.updateProject(appState.projectId, { name: appState.titleMeta.title });
        $("#doc-title-name").textContent = appState.titleMeta.title;
      }
      autosave();
      toast(`Opened ${file.name}`);
    }
  });

  // Modal backdrop click
  $$(".modal-backdrop").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); }));

  window.addEventListener("beforeunload", () => autosave());
}

function bindGlobalShortcuts() {
  if (window.__bsGlobalBound) return; window.__bsGlobalBound = true;
  window.addEventListener("keydown", e => {
    const meta = isModKey(e);
    if (meta && e.key === "k" && !e.shiftKey) { e.preventDefault(); appState.projectId ? openCmdk() : null; return; }
    if (meta && e.key === "f" && !e.shiftKey) { e.preventDefault(); $("#btn-find")?.click(); return; }
    if (meta && e.shiftKey && (e.key === "F" || e.key === "f")) { e.preventDefault(); $("#btn-sprint")?.click(); return; }
    if (meta && e.shiftKey && (e.key === "R" || e.key === "r")) { e.preventDefault(); openAloud(); return; }
    if (meta && e.shiftKey && (e.key === "S" || e.key === "s")) { e.preventDefault(); openSnap(); return; }
    if (meta && e.shiftKey && (e.key === "B" || e.key === "b")) { e.preventDefault(); openBin(); return; }
    if (meta && e.shiftKey && (e.key === "H" || e.key === "h")) { e.preventDefault(); $("#btn-back")?.click(); return; }
    if (meta && e.key === "p" && !e.shiftKey) { e.preventDefault(); printPdf(false); return; }
    if (meta && e.shiftKey && (e.key === "P" || e.key === "p")) { e.preventDefault(); printPdfWithWatermark(); return; }
    if (meta && e.key === "s" && !e.shiftKey) { e.preventDefault(); autosave(); toast("Saved"); return; }
    if (meta && e.key === "o") { e.preventDefault(); openFromFile(); return; }
    if (meta && e.key === "l") { e.preventDefault(); openLoglineWorkshop(); return; }
    if (meta && e.key === "\\") { e.preventDefault(); const app = $("#app"); if (app) { app.dataset.sidebar = app.dataset.sidebar === "hidden" ? "" : "hidden"; } return; }
    if (e.key === "?" && !meta && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault(); $("#modal-help")?.classList.add("open"); return;
    }
    if (e.key === "Escape") {
      $$(".modal-backdrop.open").forEach(m => m.classList.remove("open"));
      $$(".drawer.open").forEach(d => { d.classList.remove("open"); d.setAttribute("aria-hidden","true"); });
      $("#findbar")?.classList.remove("open");
      closeCmdk(); acClose(); closeCommentPopover(); closeAiMenu();
    }
  });
}

function openTitlePage() {
  const tp = appState.titleMeta;
  $("#tp-title").value = tp.title || "";
  $("#tp-credit").value = tp.credit || "";
  $("#tp-author").value = tp.author || "";
  $("#tp-source").value = tp.source || "";
  $("#tp-date").value = tp.date || "";
  $("#tp-contact").value = tp.contact || "";
  $("#tp-episode").value = tp.episode || "";
  $("#tp-logline").value = appState.logline || "";
  $("#tp-theme").value = appState.theme || "";
  $("#tp-premise").value = appState.premise || "";
  $("#modal-titlepage").classList.add("open");
}

/* =====================================================================
 * Utility
 * =================================================================== */
function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function toast(msg, ms=2500) {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
  $("#toasts").appendChild(el); setTimeout(() => el.remove(), ms);
}

/* Inline modal helpers — replace native prompt() / confirm() with styled
   in-app modals that fit the rest of the UI. Both return Promises. */
function modalPrompt({ title, label="", placeholder="", defaultValue="", okText="OK", multiline=false }) {
  return new Promise(resolve => {
    const back = document.createElement("div");
    back.className = "modal-backdrop open";
    const field = multiline
      ? `<textarea id="__mp-input" rows="4" placeholder="${escapeHtml(placeholder)}">${escapeHtml(defaultValue)}</textarea>`
      : `<input type="text" id="__mp-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" />`;
    back.innerHTML = `<div class="modal">
      <h2>${escapeHtml(title)}</h2>
      ${label ? `<div class="form-row"><label>${escapeHtml(label)}</label>${field}</div>` : `<div style="margin:8px 0">${field}</div>`}
      <div class="actions">
        <button class="btn" id="__mp-cancel">Cancel</button>
        <button class="btn primary" id="__mp-ok">${escapeHtml(okText)}</button>
      </div>
    </div>`;
    document.body.appendChild(back);
    const input = back.querySelector("#__mp-input");
    if (!multiline) input.style.flex = "1";
    setTimeout(() => { input.focus(); input.select?.(); }, 30);
    const close = (v) => { document.activeElement?.blur(); back.remove(); resolve(v); };
    back.querySelector("#__mp-cancel").onclick = () => close(null);
    back.querySelector("#__mp-ok").onclick = () => close(input.value);
    back.onclick = e => { if (e.target === back) close(null); };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !multiline) { e.preventDefault(); close(input.value); }
      if (e.key === "Escape") { e.preventDefault(); close(null); }
    });
  });
}
function modalConfirm({ title="Confirm", body="", okText="OK", cancelText="Cancel", danger=false }) {
  return new Promise(resolve => {
    const back = document.createElement("div");
    back.className = "modal-backdrop open";
    back.innerHTML = `<div class="modal">
      <h2>${escapeHtml(title)}</h2>
      ${body ? `<p class="help" style="font-size:13px;color:var(--ink-2);line-height:1.5">${escapeHtml(body)}</p>` : ""}
      <div class="actions">
        <button class="btn" id="__mc-cancel">${escapeHtml(cancelText)}</button>
        <button class="btn ${danger?'':'primary'}" id="__mc-ok" style="${danger?'background:var(--accent);color:#fff;border-color:var(--accent)':''}">${escapeHtml(okText)}</button>
      </div>
    </div>`;
    document.body.appendChild(back);
    const ok = back.querySelector("#__mc-ok");
    setTimeout(() => ok.focus(), 30);
    const close = (v) => { document.activeElement?.blur(); back.remove(); resolve(v); };
    back.querySelector("#__mc-cancel").onclick = () => close(false);
    ok.onclick = () => close(true);
    back.onclick = e => { if (e.target === back) close(false); };
    back.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
    });
  });
}
// Expose for other modules
window.bsPrompt  = modalPrompt;
window.bsConfirm = modalConfirm;

function sampleStarter(type) {
  const starter = (type === "tv-half")
    ? `Title: New Episode\nCredit: Written by\nAuthor:\n\nCOLD OPEN\n\nFADE IN:\n\nINT. APARTMENT - DAY\n\nA joke.\n\nEND OF COLD OPEN\n\n# ACT ONE\n\nINT. APARTMENT - DAY\n\nThe real first scene.\n`
    : (type === "tv-hour")
    ? `Title: New Episode\nCredit: Written by\nAuthor:\n\nTEASER\n\nFADE IN:\n\nINT. LOCATION - NIGHT\n\nA hook.\n\nEND OF TEASER\n\n# ACT ONE\n\nINT. LOCATION - DAY\n\n`
    : (type === "stage")
    ? `Title: A New Play\nCredit: A play by\nAuthor:\n\n# ACT ONE\n\n## SCENE 1\n\n(The stage is set.)\n\n`
    : `Title: Untitled\nCredit: Written by\nAuthor:\n\nFADE IN:\n\nINT. SOMEWHERE - DAY\n\n`;
  return starter;
}

/* =====================================================================
 * Public API for Dashboard / Bible
 * =================================================================== */
window.App = {
  loadProject,
  getCastFromScript() { return analyzeCharacters().map(c => c.name); },
  getLocationsFromScript() { return scriptBreakdown().locations; },
  setView,
};

/* =====================================================================
 * Boot
 * =================================================================== */
document.addEventListener("DOMContentLoaded", boot);
