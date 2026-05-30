"use strict";
/* panels.js — status bar, sidebar (scenes/cast/comments/threads), sentiment & pace overlays, comments (anchor/popover/markers), lightweight change log, inspector panel. */

/* ---- Panel toggle helpers (used by menubar.js) ---- */
function toggleSidebar() {
  const app = $("#app");
  if (app) app.dataset.sidebar = app.dataset.sidebar === "hidden" ? "" : "hidden";
}
function toggleInspector() {
  const app = $("#app");
  if (app) app.dataset.inspector = app.dataset.inspector === "hidden" ? "" : "hidden";
}

/* =====================================================================
 * Status, scenes, characters
 * =================================================================== */
function currentWordCount() {
  return $$("#editor > div").reduce((acc,d) => acc + (d.textContent.match(/\b[\w']+\b/g) || []).length, 0);
}
function updateStatus() {
  const line = currentLine();
  const stType = $("#stat-type");
  const type = line ? (line.dataset.type || "action") : "action";
  if (stType) {
    stType.textContent = prettyType(type);
    stType.dataset.type = type;
  }
  const words = currentWordCount();
  const pages = Math.max(0, Math.ceil(linesToPages()));
  const scenes = $$("#editor > div[data-type='scene']").length;
  $("#stat-pages").textContent = `${pages} ${pages===1?"page":"pages"}`;
  $("#stat-pages").parentElement.title = `Estimated using industry standard ≈ 54 lines per page (12pt Courier, single-spaced). Counts each element type with its real wrap width and vertical spacing. ${words} words ÷ ~220 words/page ≈ ${Math.max(1, Math.round(words/220))}.`;
  $("#stat-runtime").textContent = `~${pages} min`;
  $("#stat-runtime").parentElement.title = `Hollywood rule of thumb: 1 page ≈ 1 minute of screen time. Action-heavy scripts run slightly faster, dialogue-heavy scripts slower.`;
  $("#stat-words").textContent = `${words.toLocaleString()} words`;
  $("#stat-words").parentElement.title = `Total spoken + action words across the screenplay (excludes notes, section headings, synopses).`;
  $("#stat-scenes").textContent = `${scenes} ${scenes===1?"scene":"scenes"}`;
  $("#stat-scenes").parentElement.title = `Number of INT./EXT. scene headings.`;
  $("#stat-today").parentElement.title = `Words you've added today across this project. Resets at midnight local time. Across all projects: see the streak heatmap on the dashboard.`;
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
// Per-element layout constants — reused by both linesToPages() and
// applyPageBreaks() so the page-break math always matches the page count.
const PAGE_W = { scene:60, action:60, character:32, dialogue:35, parenthetical:25, transition:60, centered:60 };
const PAGE_SPACING = { scene:2, action:1, character:0.5, dialogue:0, parenthetical:0, transition:1.5, centered:1 };
const LINES_PER_PAGE = 54;

function linesToPages() {
  let total = 0;
  $$("#editor > div").forEach(d => {
    const type = d.dataset.type;
    if (["note","section","synopsis"].includes(type)) return;
    const t = (d.textContent || "").trim();
    if (!t) return;
    const w = PAGE_W[type] || 60;
    const wrapped = Math.max(1, Math.ceil(t.length / w));
    total += wrapped + (PAGE_SPACING[type] || 0);
  });
  const pages = total / LINES_PER_PAGE;
  return total > 0 ? Math.max(pages, 0.5) : 0;
}

// Mark lines that end a page with data-page-end="<N>". The CSS uses that
// attribute to render a "PAGE N — PAGE N+1" divider below the line.
function applyPageBreaks() {
  const editor = document.getElementById("editor");
  if (!editor) return;
  const all = $$("#editor > div");
  // Clear any prior markers first so toggling off cleans up cleanly.
  all.forEach(d => { d.removeAttribute("data-page-end"); d.removeAttribute("data-page-start"); });
  if (!appState.showPageBreaks && !appState.pageView) return;
  let used = 0;
  let nextThreshold = LINES_PER_PAGE;
  let pageNum = 1;
  let needsPageStart = true; // First content line starts page 1
  all.forEach(d => {
    const type = d.dataset.type;
    if (["note","section","synopsis"].includes(type)) return;
    const t = (d.textContent || "").trim();
    if (!t) return;
    // Mark the start of a new page
    if (needsPageStart) {
      d.setAttribute("data-page-start", String(pageNum));
      needsPageStart = false;
    }
    const w = PAGE_W[type] || 60;
    const wrapped = Math.max(1, Math.ceil(t.length / w));
    used += wrapped + (PAGE_SPACING[type] || 0);
    while (used >= nextThreshold) {
      d.setAttribute("data-page-end", String(pageNum));
      pageNum++;
      nextThreshold += LINES_PER_PAGE;
      needsPageStart = true;
    }
  });
}

function togglePageView(force) {
  const on = force !== undefined ? force : !appState.pageView;
  appState.pageView = on;
  document.body.dataset.pageview = on ? "true" : "";
  // Page View implies page breaks; ensure they are calculated
  if (on) appState.showPageBreaks = true;
  document.body.dataset.pagebreaks = appState.showPageBreaks ? "true" : "";
  applyPageBreaks();
  setDirty();
  // Update the toolbar button state
  const btn = document.getElementById("btn-pageview");
  if (btn) btn.classList.toggle("active", on);
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
    body.innerHTML = `<div class="side-empty"><b>No scenes yet</b><br><br>Start writing in the editor — type <kbd>INT.</kbd> or <kbd>EXT.</kbd> to create your first scene heading. Scenes will appear here as a navigable list.</div>`;
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
    el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("drag-over"); });
    el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
    el.addEventListener("drop", e => {
      e.preventDefault(); el.classList.remove("drag-over");
      const from = parseInt(e.dataTransfer.getData("text/plain"),10);
      const to = parseInt(el.dataset.line,10);
      if (from !== to) {
        moveScene(from, to);
        toast("Scene moved · ⌘Z to undo isn't supported yet — drag back to revert");
      }
    });
  });
}
function pad(n, w) { return String(n).padStart(w, "0"); }
function renderCastSidebar(body) {
  const cast = analyzeCharacters();
  if (cast.length === 0) { body.innerHTML = `<div class="side-empty"><b>No characters yet</b><br><br>Characters appear here automatically when you write dialogue cues — type a CHARACTER NAME in ALL CAPS, then write their dialogue on the next line.</div>`; return; }
  const max = Math.max(1, ...cast.map(c => c.words));
  body.innerHTML = cast.map(c => `
    <div class="cast-item" data-name="${escapeHtml(c.name)}" title="Click to jump · right-click for rename / bible">
      <div class="ci-name">${escapeHtml(c.name)}</div>
      <div class="ci-meta">${c.cues} cues · ${c.words} words · ${c.scenes} scenes</div>
      <div class="ci-bar"><div class="ci-fill" style="width:${(c.words/max*100).toFixed(0)}%"></div></div>
    </div>`).join("");
  $$(".cast-item", body).forEach(el => {
    el.addEventListener("click", () => {
      const name = el.dataset.name;
      const first = $$("#editor > div[data-type='character']").find(d =>
        d.textContent.replace(/\s*\(.*\)\s*$/,"").trim().toUpperCase() === name);
      if (first) navigateToLine($$("#editor > div").indexOf(first), null);
    });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showCastContextMenu(e.clientX, e.clientY, el.dataset.name);
    });
  });
}

/* Right-click on a cast row → rename throughout script (cues + action
   mentions + Bible) or jump to Bible card. */
function showCastContextMenu(x, y, name) {
  const existing = document.querySelector(".sz-ctxmenu"); if (existing) existing.remove();
  const menu = document.createElement("div");
  menu.className = "sz-ctxmenu";
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:var(--paper);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow-2);padding:4px;z-index:200;min-width:200px;font-size:12.5px`;
  const items = [
    { label: "Open in Bible", run: () => {
        setView("bible");
        setTimeout(() => {
          const cards = $$(".bib-char");
          const target = cards.find(c => c.querySelector(".bib-name")?.value?.toUpperCase() === name);
          target?.scrollIntoView({ behavior: "smooth", block: "center" });
          target?.classList.add("nav-target");
          setTimeout(() => target?.classList.remove("nav-target"), 1200);
        }, 200);
      }},
    { label: "Rename throughout…", run: () => renameCharacterFlow(name) },
    { label: "Jump to first cue", run: () => {
        const first = $$("#editor > div[data-type='character']").find(d =>
          d.textContent.replace(/\s*\(.*\)\s*$/,"").trim().toUpperCase() === name);
        if (first) navigateToLine($$("#editor > div").indexOf(first), null);
      }},
  ];
  menu.innerHTML = items.map((it,i) => `<div class="sz-mi" data-i="${i}" style="padding:6px 10px;border-radius:5px;cursor:pointer">${escapeHtml(it.label)}</div>`).join("");
  document.body.appendChild(menu);
  $$(".sz-mi", menu).forEach(el => {
    el.addEventListener("mouseenter", () => el.style.background = "var(--hl)");
    el.addEventListener("mouseleave", () => el.style.background = "transparent");
    el.addEventListener("click", () => { items[parseInt(el.dataset.i,10)].run(); menu.remove(); });
  });
  const closer = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", closer); } };
  setTimeout(() => document.addEventListener("click", closer), 0);
}

async function renameCharacterFlow(oldName) {
  const fresh = await (window.bsPrompt ? window.bsPrompt({
    title: "Rename character",
    label: `Rename "${oldName}" everywhere`,
    placeholder: "NEW NAME",
    defaultValue: oldName,
    okText: "Rename",
  }) : Promise.resolve(prompt(`Rename ${oldName} to:`, oldName)));
  if (!fresh) return;
  const newName = fresh.trim().toUpperCase();
  if (!newName || newName === oldName) return;
  let cueCount = 0, mentionCount = 0;
  $$("#editor > div").forEach(d => {
    const t = d.textContent || "";
    if (d.dataset.type === "character") {
      // Compare against the bare name (strip any trailing parens like (V.O.) or (CONT'D))
      const bare = t.replace(/\s*\(.*\)\s*$/, "").trim().toUpperCase();
      if (bare === oldName) {
        const suffix = t.match(/\s*\(.*\)\s*$/);
        d.textContent = newName + (suffix ? suffix[0] : "");
        cueCount++;
        markRevised(d);
      }
    } else if (d.dataset.type === "action" || d.dataset.type === "dialogue" || d.dataset.type === "parenthetical") {
      // Replace whole-word ALL-CAPS mentions in body text. Use word boundaries.
      const re = new RegExp("\\b" + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
      if (re.test(t)) {
        d.textContent = t.replace(re, newName);
        mentionCount += (t.match(re) || []).length;
        markRevised(d);
      }
    }
  });
  // Bible character entry — Bible.renameCharacter writes through to the
  // live store (episode + series if applicable).
  if (window.Bible?.renameCharacter) Bible.renameCharacter(oldName, newName);
  reclassifyAll(); setDirty(); updateSidebar();
  toast(`Renamed ${oldName} → ${newName} · ${cueCount} cue${cueCount===1?"":"s"}${mentionCount?`, ${mentionCount} mention${mentionCount===1?"":"s"}`:""}`);
}
function renderCommentsSidebar(body) {
  const comments = Storage.getComments(appState.projectId);
  if (comments.length === 0) {
    body.innerHTML = `<div class="side-empty">No notes.<br><br>Press <kbd>⌘ ;</kbd> on any line to add a comment.</div>`;
    return;
  }
  body.innerHTML = comments.map(c => {
    const line = !c.orphaned ? getLineByKey(c.lineKey) : null;
    const preview = c.orphaned
      ? "line not found — edit may have removed it"
      : (line?.textContent?.slice(0,40) || "(missing line)");
    return `
    <div class="note-item note-sidebar-item ${c.orphaned ? "orphaned" : ""}" data-line-key="${escapeHtml(c.lineKey)}" data-cid="${escapeHtml(c.id)}">
      <div class="ns-line">${c.orphaned ? `<span class="ns-orphan" title="Comment anchor lost — the surrounding lines changed. Click to delete.">⚠</span> ` : ""}${escapeHtml(preview)}</div>
      <div style="font-family:var(--font-ui);font-size:11.5px;margin-top:4px">${escapeHtml(c.text)}</div>
    </div>`;
  }).join("");
  $$(".note-sidebar-item", body).forEach(el => el.addEventListener("click", async () => {
    if (el.classList.contains("orphaned")) {
      const ok = await (window.bsConfirm || ((o) => Promise.resolve(confirm(o.body || o.title))))({
        title: "Delete orphaned comment?",
        body: "This comment's anchor line was edited or removed. Delete it?",
        okText: "Delete", danger: true,
      });
      if (!ok) return;
      const arr = Storage.getComments(appState.projectId).filter(c => c.id !== el.dataset.cid);
      Storage.setComments(appState.projectId, arr);
      updateSidebar();
      applyCommentMarkers();
      return;
    }
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

// Hybrid line fingerprint: key = `${idx}:${thisHash}:${ctxHash}` where
// thisHash is the line's own text and ctxHash is the surrounding (prev+next)
// context. Either matching is enough to re-anchor — so editing the commented
// line OR its neighbors no longer orphans the comment, and a small ±10 window
// recovers from line moves.
const REANCHOR_RANGE = 10;
function lineContext(line) {
  const prev = line && line.previousElementSibling ? line.previousElementSibling.textContent : "";
  const next = line && line.nextElementSibling ? line.nextElementSibling.textContent : "";
  return prev + "|||" + next;
}
function makeLineKey(line) {
  const lines = $$("#editor > div");
  return `${lines.indexOf(line)}:${shortHash(line.textContent)}:${shortHash(lineContext(line))}`;
}
function getLineByKey(key) {
  if (!key) return null;
  const lines = $$("#editor > div");
  const parts = key.split(":");
  const idx = parseInt(parts[0], 10);
  const thisHash = parts[1];
  const ctxHash = parts[2]; // undefined for legacy 2-part keys
  const matchScore = (line) => {
    if (!line) return 0;
    const t = shortHash(line.textContent);
    const c = shortHash(lineContext(line));
    return (t === thisHash ? 2 : 0) + (ctxHash && c === ctxHash ? 1 : 0);
  };
  if (lines[idx] && matchScore(lines[idx]) > 0) return lines[idx];
  let best = null, bestScore = 0;
  for (let r = 1; r <= REANCHOR_RANGE; r++) {
    [lines[idx - r], lines[idx + r]].forEach(l => {
      const s = matchScore(l);
      if (s > bestScore) { best = l; bestScore = s; }
    });
  }
  if (best) return best;
  return lines.find(l => shortHash(l.textContent) === thisHash) || null;
}
function shortHash(s) {
  let h = 0; for (const c of (s||"")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}
function reanchorComments() {
  if (!appState.projectId) return;
  const comments = Storage.getComments(appState.projectId);
  let mutated = false;
  comments.forEach(c => {
    const line = getLineByKey(c.lineKey);
    if (line) {
      const fresh = makeLineKey(line);
      if (fresh !== c.lineKey) { c.lineKey = fresh; mutated = true; }
      if (c.orphaned) { c.orphaned = false; mutated = true; }
    } else if (!c.orphaned) {
      c.orphaned = true; mutated = true;
    }
  });
  if (mutated) Storage.setComments(appState.projectId, comments);
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
  // Strip existing markers BEFORE re-anchoring, otherwise the 💬 emoji bleeds
  // into the fingerprint hash and every comment re-anchors against ghost text.
  $$("#editor > div").forEach(d => {
    const m = d.querySelector(".line-comment-marker");
    if (m) m.remove();
  });
  reanchorComments();
  const comments = Storage.getComments(appState.projectId);
  const byKey = new Map();
  comments.filter(c => !c.orphaned).forEach(c => byKey.set(c.lineKey, (byKey.get(c.lineKey) || 0) + 1));
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
        <dt>Template</dt><dd><select id="ins-template-sel" class="ins-template-sel">
          <option value="">— No template —</option>
          ${Templates.list.map(t => `<option value="${t.id}" ${appState.template === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}
        </select></dd>
        <dt>Logline</dt><dd style="white-space:normal">${escapeHtml(appState.logline) || "<i style='color:var(--muted)'>none</i>"}</dd>
        <dt>Theme</dt><dd>${escapeHtml(appState.theme) || "—"}</dd>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn small" id="ins-logline">Open logline workshop</button>
        <button class="btn small" id="ins-titlepage">Title page…</button>
      </div>
    </div>
    <div class="ins-section">
      <h4>Overlays</h4>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0"><input type="checkbox" id="opt-pace" ${appState.paceMode?"checked":""}/> Pace heatmap on script</label>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0"><input type="checkbox" id="opt-pageview" ${appState.pageView?"checked":""}/> Page View (discrete pages)</label>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0"><input type="checkbox" id="opt-pagebreaks" ${appState.showPageBreaks?"checked":""}/> Show page breaks in editor</label>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0"><input type="checkbox" id="opt-typewriter" ${appState.typewriter?"checked":""}/> Typewriter mode</label>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0"><input type="checkbox" id="opt-smart-typo" ${appState.smartTypo?"checked":""}/> Smart typography</label>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0"><input type="checkbox" id="opt-scene-num" ${appState.showSceneNumbersInPdf?"checked":""}/> Scene numbers in PDF</label>
      <label style="display:flex;gap:6px;font-size:12px;margin:4px 0;align-items:flex-start" title="Production mode: locks current scene numbers so inserted scenes become 12A, 12B, etc. Industry-standard for shooting scripts.">
        <input type="checkbox" id="opt-prod-locked" ${appState.prodLocked?"checked":""}/>
        <span>Lock scene numbers (production)<br><span style="color:var(--muted);font-size:11px">New scenes get 12A · 12B suffixes</span></span>
      </label>
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
    const revColor = REVISION_COLORS.find(r => r.id === d.dataset.rev);
    if (revColor) $("#rev-badge").style.background = revColor.css;
    updateInspector(); setDirty();
  }));
  $("#opt-pace")?.addEventListener("change", e => {
    appState.paceMode = e.target.checked;
    document.body.dataset.pace = appState.paceMode ? "true" : "";
  });
  $("#opt-pageview")?.addEventListener("change", e => {
    togglePageView(e.target.checked);
    updateInspector(); // refresh checkbox states since pageView implies pageBreaks
  });
  $("#opt-pagebreaks")?.addEventListener("change", e => {
    appState.showPageBreaks = e.target.checked;
    document.body.dataset.pagebreaks = appState.showPageBreaks ? "true" : "";
    applyPageBreaks();
  });
  $("#opt-typewriter")?.addEventListener("change", e => { setTypewriter(e.target.checked); });
  $("#opt-smart-typo")?.addEventListener("change", e => { appState.smartTypo = e.target.checked; setDirty(); });
  $("#opt-scene-num")?.addEventListener("change", e => { appState.showSceneNumbersInPdf = e.target.checked; setDirty(); });
  $("#opt-prod-locked")?.addEventListener("change", e => {
    if (e.target.checked) lockSceneNumbers(); else unlockSceneNumbers();
    reclassifyAll();
  });
  $("#ins-logline")?.addEventListener("click", openLoglineWorkshop);
  $("#ins-titlepage")?.addEventListener("click", openTitlePage);
  $("#ins-template-sel")?.addEventListener("change", e => {
    appState.template = e.target.value || null;
    setDirty();
    updateInspector();
    if (appState.view === "beats") renderBeatBoard();
  });

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

