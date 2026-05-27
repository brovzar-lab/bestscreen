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
  showPageBreaks: false,
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
  if (typeof SceneZoom !== "undefined") SceneZoom.bind();

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
  appState.showPageBreaks = !!meta.showPageBreaks;
  document.body.dataset.pagebreaks = appState.showPageBreaks ? "true" : "";
  appState.filename = (project?.name || "untitled") + ".fountain";

  // Daily counters
  loadTodayCount();

  // Bind editor-shell events once
  if (!appState._bound) { bindEditorUI(); bindSidebarResize(); appState._bound = true; }

  loadFountain(doc || sampleStarter(project?.type));

  // Bind Bible to this project so character hover popovers work before Bible view is opened
  if (typeof Bible !== "undefined" && Bible.bind) Bible.bind(id);

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
      showPageBreaks: appState.showPageBreaks,
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
  attachCharHover();
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
  $("#ll-ai")?.addEventListener("click", e => { e.preventDefault(); aiGenerateLogline(); });

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
  $("#amb-st-clear").addEventListener("click", () => { Audio.stopSoundtrack(); $("#amb-st-url").value = ""; updateSoundtrackStatus(""); });
  $("#amb-st-url").addEventListener("input", e => updateSoundtrackStatus(e.target.value));

  // Share
  $("#share-cancel").addEventListener("click", () => $("#modal-share").classList.remove("open"));
  $("#share-go").addEventListener("click", generateShareFile);

  // Coverage
  $("#cov-close").addEventListener("click", () => $("#modal-coverage").classList.remove("open"));
  $("#cov-copy").addEventListener("click", () => { navigator.clipboard.writeText($("#coverage-body").textContent); toast("Copied to clipboard"); });
  $("#cov-save").addEventListener("click", () => {
    const fname = ((appState.titleMeta.title || "untitled").replace(/[^A-Za-z0-9_-]+/g, "_")) + "_coverage.txt";
    downloadFile(fname, $("#coverage-body").textContent, "text/plain");
  });

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

    // Extract title for either path
    const m = fountain.match(/^Title:\s*(.+)$/m);
    const title = m ? m[1].trim() : file.name.replace(/\.[^.]+$/, "");

    // If there's an active project, ask whether to replace or open as a new
    // project. Default to "Open as new" to match the dashboard import flow
    // and avoid accidentally overwriting work.
    if (appState.projectId) {
      const choice = await new Promise(resolve => {
        const back = document.createElement("div");
        back.className = "modal-backdrop open";
        back.innerHTML = `<div class="modal">
          <h2>Open ${escapeHtml(file.name)}?</h2>
          <p class="help" style="font-size:13px;color:var(--ink-2);line-height:1.5">
            Found <b>${escapeHtml(title)}</b> in this file.
            Open it as a new project, or replace this project's script with it?
          </p>
          <div class="actions">
            <button class="btn" id="__open-cancel">Cancel</button>
            <button class="btn" id="__open-replace">Replace current</button>
            <button class="btn primary" id="__open-new">Open as new project</button>
          </div>
        </div>`;
        document.body.appendChild(back);
        const close = (v) => { back.remove(); resolve(v); };
        back.querySelector("#__open-cancel").onclick = () => close("cancel");
        back.querySelector("#__open-replace").onclick = () => close("replace");
        back.querySelector("#__open-new").onclick = () => close("new");
        back.onclick = ev => { if (ev.target === back) close("cancel"); };
      });
      if (choice === "cancel") return;
      if (choice === "new") {
        const id = Storage.createProject({
          name: title, type: "feature", template: null,
          logline: "", coverColor: "#3878b8",
        });
        Storage.setDoc(id, fountain);
        Storage.updateProject(id, { name: title, lastModified: Date.now() });
        toast(`Created "${title}"`);
        loadProject(id);
        return;
      }
      // choice === "replace"
      Storage.setDoc(appState.projectId, fountain);
      loadFountain(fountain);
      if (appState.titleMeta.title) {
        Storage.updateProject(appState.projectId, { name: appState.titleMeta.title });
        $("#doc-title-name").textContent = appState.titleMeta.title;
      }
      autosave();
      toast(`Replaced with ${file.name}`);
      return;
    }
    // No active project — create one from the file
    const id = Storage.createProject({
      name: title, type: "feature", template: null,
      logline: "", coverColor: "#3878b8",
    });
    Storage.setDoc(id, fountain);
    Storage.updateProject(id, { name: title, lastModified: Date.now() });
    toast(`Created "${title}"`);
    loadProject(id);
  });

  // Modal backdrop click
  $$(".modal-backdrop").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); }));

  window.addEventListener("beforeunload", () => autosave());
}

function bindSidebarResize() {
  const sidebar = $("#sidebar");
  const app = document.querySelector(".app");
  if (!sidebar || !app) return;
  // Apply saved width on first load
  const saved = parseInt(Storage.getSettings().sidebarWidth, 10);
  if (saved && saved >= 180 && saved <= 600) {
    app.style.setProperty("--sidebar-w", saved + "px");
  }
  let handle = sidebar.querySelector(".sidebar-resize");
  if (!handle) {
    handle = document.createElement("div");
    handle.className = "sidebar-resize";
    handle.title = "Drag to resize the scene list";
    sidebar.appendChild(handle);
  }
  let dragging = false, startX = 0, startW = 0;
  handle.addEventListener("pointerdown", e => {
    dragging = true; startX = e.clientX;
    startW = sidebar.getBoundingClientRect().width;
    handle.classList.add("dragging");
    app.classList.add("resizing");
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  });
  handle.addEventListener("pointermove", e => {
    if (!dragging) return;
    const w = Math.max(180, Math.min(600, startW + (e.clientX - startX)));
    app.style.setProperty("--sidebar-w", w + "px");
  });
  const finish = (e) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
    app.classList.remove("resizing");
    document.body.style.cursor = "";
    const w = Math.round(sidebar.getBoundingClientRect().width);
    Storage.setSettings({ sidebarWidth: w });
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
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
  getScenesFromScript() { return collectScenes().map(s => ({ sceneId: s.lineIndex, slug: s.slug })); },
  setView,
};

/* =====================================================================
 * Boot
 * =================================================================== */
document.addEventListener("DOMContentLoaded", boot);
