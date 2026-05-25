"use strict";
/* features.js — find/replace, snapshots, scrap bin, sprint mode, read-aloud, command palette, logline workshop, coverage generator, sides export, continuity warnings, AI menu. */

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
  // Capture selection details BEFORE any await (DOM range survives but its anchors
  // can be invalidated by re-render, so snapshot text + offsets up front).
  const sel = window.getSelection();
  const selText = sel ? sel.toString() : "";
  let selRange = null;
  if (line && selText && sel.rangeCount) {
    const r = sel.getRangeAt(0);
    if (line.contains(r.startContainer) && line.contains(r.endContainer)) {
      // Compute string offsets relative to the line's full text
      const before = document.createRange();
      before.selectNodeContents(line);
      before.setEnd(r.startContainer, r.startOffset);
      const startOff = before.toString().length;
      selRange = { startOff, endOff: startOff + selText.length };
    }
  }
  const targetText = selText || (line ? line.textContent : "");
  const context = line ? gatherContextAround(line, 6) : "";
  try {
    toast(selText ? "AI rewriting selection…" : "AI thinking…", 8000);
    const result = await AI.complete(cmd.prompt, { TEXT: targetText, CONTEXT: context });
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
    if (!line) return;
    const cleaned = result.trim();
    const preview = (selText ? "Replace selection:\n\n" + selText + "\n\n→\n\n" : "Replace current line:\n\n") + cleaned.slice(0, 400);
    const ok = await modalConfirm({ title: "Apply AI suggestion?", body: preview, okText: "Replace" });
    if (!ok) return;
    if (selRange && selText) {
      const t = line.textContent;
      line.textContent = t.substring(0, selRange.startOff) + cleaned + t.substring(selRange.endOff);
    } else {
      line.textContent = cleaned;
    }
    markRevised(line); reclassifyAll(); setDirty();
  } catch (e) { toast("AI error: " + e.message, 5000); }
}
function gatherContextAround(line, n) {
  const lines = $$("#editor > div");
  const idx = lines.indexOf(line);
  const lo = Math.max(0, idx - n); const hi = Math.min(lines.length, idx + n + 1);
  return lines.slice(lo, hi).map(l => l.textContent).join("\n");
}

