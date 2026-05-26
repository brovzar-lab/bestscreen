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
  const body = $("#coverage-body");
  body.classList.remove("ai-streaming");
  body.textContent = "Generating coverage…";
  if (aiKey) {
    try {
      const tpl = AI.getCommands().find(c => c.id === "coverage");
      const fountain = serializeFountain(false);
      body.textContent = "";
      body.classList.add("ai-streaming");
      let full = "";
      try {
        for await (const chunk of AI.stream(tpl.prompt, { TEXT: fountain.slice(0, 30000) })) {
          full += chunk;
          body.textContent = full;
        }
      } finally {
        body.classList.remove("ai-streaming");
      }
      body.innerHTML = formatCoverage(full || body.textContent);
    } catch (e) {
      body.classList.remove("ai-streaming");
      body.innerHTML = formatCoverage("AI error: " + e.message + "\n\nFalling back to local coverage…\n\n" + localCoverage());
    }
  } else {
    body.innerHTML = formatCoverage(localCoverage());
  }
}

// Parse a coverage document into themed sections. Recognized headers (LOGLINE,
// SYNOPSIS, STRENGTHS, WEAKNESSES / CONCERNS, VERDICT, MAIN CAST, SCALE,
// DIALOGUE RATIO) become styled blocks; everything else becomes a generic
// paragraph. Bullet lines (` • …`, `- …`, `* …`) get converted to <li>.
function formatCoverage(text) {
  const lines = (text || "").split("\n");
  const SECTION_RE = /^(LOGLINE|SYNOPSIS|STRENGTHS?|WEAKNESS(?:ES)?|CONCERNS?|VERDICT|MAIN CAST|CAST|SCALE|DIALOGUE RATIO|TITLE|AUTHOR)\s*:?\s*(.*)$/i;
  const BULLET_RE = /^\s*(?:[•*-]|\d+[.)])\s+(.+)$/;
  const blocks = [];
  let current = null;
  const flush = () => { if (current) { blocks.push(current); current = null; } };
  lines.forEach(raw => {
    const trimmed = raw.trim();
    const m = trimmed.match(SECTION_RE);
    if (m) {
      flush();
      const cls = m[1].toUpperCase().replace(/\s+/g, "-").toLowerCase();
      current = { kind: "section", title: m[1].toUpperCase(), cls, body: [], inline: m[2] || "" };
      return;
    }
    if (!current) current = { kind: "prose", body: [], inline: "" };
    if (trimmed === "") current.body.push({ kind: "br" });
    else if (BULLET_RE.test(trimmed)) current.body.push({ kind: "li", text: trimmed.match(BULLET_RE)[1] });
    else current.body.push({ kind: "p", text: trimmed });
  });
  flush();
  return blocks.map(b => {
    const cls = b.kind === "section" ? `cov-section cov-${b.cls}` : "cov-prose";
    const head = b.kind === "section" ? `<h4 class="cov-head">${escapeHtml(b.title)}</h4>` : "";
    const inline = b.inline ? `<p class="cov-inline">${escapeHtml(b.inline)}</p>` : "";
    // Collapse runs of <li> into <ul>
    const parts = [];
    let listOpen = false;
    b.body.forEach(item => {
      if (item.kind === "li") {
        if (!listOpen) { parts.push(`<ul class="cov-bullets">`); listOpen = true; }
        parts.push(`<li>${escapeHtml(item.text)}</li>`);
      } else {
        if (listOpen) { parts.push("</ul>"); listOpen = false; }
        if (item.kind === "p") parts.push(`<p>${escapeHtml(item.text)}</p>`);
      }
    });
    if (listOpen) parts.push("</ul>");
    return `<div class="${cls}">${head}${inline}${parts.join("")}</div>`;
  }).join("");
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
  const anonymize = $("#sides-anon").checked;
  const actorUp = (actor || "").toUpperCase().replace(/\s*\(.*\)\s*$/, "").trim();
  if (anonymize && !actorUp) {
    return toast("Type an actor / character name first to anonymize other lines");
  }
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
    // Walk the scene; when anonymizing, replace dialogue from non-focus
    // characters with "…" and keep their character cues so the actor still
    // knows when someone else is speaking. Action lines stay as-is for context.
    let currentSpeaker = null;
    for (let j = idx; j < sceneEnd; j++) {
      const type = lines[j].dataset.type;
      if (["note","section","synopsis"].includes(type)) continue;
      const t = lines[j].textContent; if (!t.trim()) continue;
      if (type === "character") {
        const speaker = t.replace(/\s*\(.*\)\s*$/, "").trim().toUpperCase();
        currentSpeaker = speaker;
        out += t + "\n";
      } else if ((type === "dialogue" || type === "parenthetical") && anonymize && currentSpeaker && currentSpeaker !== actorUp) {
        out += (type === "parenthetical" ? "(beat)" : "…") + "\n";
      } else {
        out += t + "\n";
      }
    }
    out += "\n";
  });
  downloadFile((appState.filename.replace(/\.[^.]+$/,"")) + ".sides.fountain", out, "text/plain");
  $("#modal-sides").classList.remove("open");
  toast(`Sides for ${picked.length} scene${picked.length===1?'':'s'} exported${anonymize ? " (anonymized)" : ""}`);
}

/* =====================================================================
 * Continuity warnings — entity-tracking engine (Sprint 3 / L2)
 *
 * Walk scenes in order, maintain a per-character state vector, then flag
 * cases where a character speaks/acts after being marked into a state
 * that should preclude that (dead, far away, in jail, etc.). Resolution
 * verbs (revived, gives birth, released, divorced) clear the state.
 *
 * Patterns are conservative — favoring recall over precision so the
 * writer can quickly skim a list of "did you mean to do this?" prompts.
 * Each issue has a category, a one-line description, and a jump-to-scene
 * target so triage stays cheap.
 * =================================================================== */
const STATE_VOCAB = {
  dead: {
    label: "Death", category: "death", persistent: true,
    signals: [
      /\b(dies|died|dying)\b/i,
      /\b(killed|murdered|slain)\b/i,
      /\bis (dead|deceased|gone)\b/i,
      /\b(shot|stabbed|beaten) to death\b/i,
      /\b(his|her|their) (corpse|body) lies\b/i,
      /\b(his|her|their) lifeless (body|form)\b/i,
      /\bbleeds out\b/i,
    ],
    resolve: [
      /\b(comes? back to life|resurrected|revived|reanimated|breathes? again|wakes? from the dead)\b/i,
      /\b(it was a dream|never actually|just imagining|hallucinated)\b/i,
    ],
  },
  injured: {
    label: "Injury", category: "injury", persistent: false,
    signals: [
      /\b(stabbed|shot|wounded|injured)\b/i,
      /\bbleeding (heavily|out|profusely)\b/i,
      /\blimps? (badly|heavily)\b/i,
    ],
    resolve: [
      /\b(heals?|healed|recovered|patched up|bandaged up|stitches? out)\b/i,
    ],
  },
  pregnant: {
    label: "Pregnancy", category: "pregnancy", persistent: true,
    signals: [/\bis pregnant\b/i, /\bexpecting\b/i, /\bwith child\b/i, /\bin labor\b/i, /\b(her|their) belly swollen\b/i],
    resolve: [/\b(gives? birth|delivered|miscarried|miscarriage|lost the baby)\b/i],
  },
  arrested: {
    label: "Law", category: "law", persistent: true,
    signals: [/\b(arrested|handcuffed|in cuffs|in custody|behind bars|in (jail|prison))\b/i],
    resolve: [/\b(released|bail|escapes?|broke out|set free|gets? out)\b/i],
  },
  married: {
    label: "Relationship", category: "relationship", persistent: true,
    signals: [/\b(marries?|married|wed|wedding)\b/i, /\b(his|her) (wife|husband|spouse)\b/i],
    resolve: [/\b(divorce[ds]?|separated|annulled|widowed)\b/i],
  },
};
const STATE_CATEGORIES = {
  death: "Death", injury: "Injury", pregnancy: "Pregnancy",
  law: "Law / arrest", relationship: "Relationship", substance: "Substance",
};

function castFromBibleAndScript() {
  const set = new Set();
  $$("#editor > div[data-type='character']").forEach(d => {
    const n = d.textContent.replace(/\s*\(.*\)\s*$/, "").trim().toUpperCase();
    if (n) set.add(n);
  });
  // Include bible characters too (covers off-screen characters discussed only in action)
  try {
    const pid = appState.projectId;
    const bible = pid ? Storage.getBible(pid) : null;
    bible?.characters?.forEach(c => c.name && set.add(c.name.toUpperCase()));
    const project = pid ? Storage.getProject(pid) : null;
    if (project?.seriesId) {
      const sBible = Storage.getSeriesBible(project.seriesId);
      sBible?.characters?.forEach(c => c.name && set.add(c.name.toUpperCase()));
    }
  } catch (e) { /* defensive */ }
  return Array.from(set);
}

function continuityScenes() {
  const lines = $$("#editor > div");
  const sceneEls = $$("#editor > div[data-type='scene']");
  return sceneEls.map((scene, i) => {
    const start = lines.indexOf(scene);
    const end = (i + 1 < sceneEls.length) ? lines.indexOf(sceneEls[i + 1]) : lines.length;
    let text = "";
    let cues = [];
    for (let j = start; j < end; j++) {
      const t = lines[j].dataset.type;
      if (t === "action" || t === "dialogue" || t === "parenthetical") text += " " + lines[j].textContent;
      else if (t === "character") {
        const name = lines[j].textContent.replace(/\s*\(.*\)\s*$/, "").trim().toUpperCase();
        if (name) cues.push(name);
        text += " " + lines[j].textContent;
      }
    }
    return { sceneNum: i + 1, slug: scene.textContent, startLine: start, endLine: end, text, cues };
  });
}

// Find character mentions in a window of text near `pos`. Returns matched names.
function charactersNear(text, pos, characters, window = 90) {
  const slice = text.slice(Math.max(0, pos - window), pos + window).toUpperCase();
  const hits = [];
  characters.forEach(name => {
    // Word-boundary match (allow trailing 's possessive)
    if (new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:'S)?\\b").test(slice)) {
      hits.push(name);
    }
  });
  return hits;
}

function detectStateChanges(scenes, characters) {
  // For each character, build [{ state, scene, kind: 'enter'|'resolve' }]
  const events = new Map(); // name → []
  const pushEvent = (name, ev) => {
    if (!events.has(name)) events.set(name, []);
    events.get(name).push(ev);
  };
  scenes.forEach(scene => {
    Object.entries(STATE_VOCAB).forEach(([state, def]) => {
      def.signals.forEach(re => {
        const reG = new RegExp(re.source, "gi");
        let m;
        while ((m = reG.exec(scene.text)) !== null) {
          const hits = charactersNear(scene.text, m.index, characters);
          hits.forEach(name => pushEvent(name, { kind: "enter", state, scene: scene.sceneNum }));
        }
      });
      (def.resolve || []).forEach(re => {
        const reG = new RegExp(re.source, "gi");
        let m;
        while ((m = reG.exec(scene.text)) !== null) {
          const hits = charactersNear(scene.text, m.index, characters);
          hits.forEach(name => pushEvent(name, { kind: "resolve", state, scene: scene.sceneNum }));
        }
      });
    });
  });
  return events;
}

function characterAppearances(scenes) {
  // Map: name → [{ sceneNum, hasCue, inAction }]
  const out = new Map();
  scenes.forEach(scene => {
    const cuesUp = new Set(scene.cues);
    const upperText = scene.text.toUpperCase();
    cuesUp.forEach(name => {
      if (!out.has(name)) out.set(name, []);
      out.get(name).push({ sceneNum: scene.sceneNum, hasCue: true, inAction: false });
    });
  });
  return out;
}

function runContinuityCheck() {
  const scenes = continuityScenes();
  if (scenes.length < 2) return [];
  const characters = castFromBibleAndScript();
  if (characters.length === 0) return [];
  const events = detectStateChanges(scenes, characters);
  const appearances = characterAppearances(scenes);
  const issues = [];

  events.forEach((evs, character) => {
    // Walk events in order; track open states + resolved scene
    const openState = {}; // state → { firstScene, resolvedScene? }
    evs.forEach(ev => {
      if (ev.kind === "enter") {
        if (!openState[ev.state]) openState[ev.state] = { firstScene: ev.scene };
      } else if (ev.kind === "resolve" && openState[ev.state]) {
        openState[ev.state].resolvedScene = ev.scene;
      }
    });
    Object.entries(openState).forEach(([state, info]) => {
      const def = STATE_VOCAB[state];
      if (!def.persistent) return; // only persistent states trigger continuity issues
      const apps = (appearances.get(character) || []).filter(a => a.sceneNum > info.firstScene);
      const cutoff = info.resolvedScene || Infinity;
      const offending = apps.filter(a => a.sceneNum < cutoff);
      if (state === "dead") {
        offending.forEach(a => {
          issues.push({
            character, state, category: def.category, label: def.label,
            firstScene: info.firstScene, jumpScene: a.sceneNum,
            msg: `${character} is described as dead in scene ${info.firstScene}, but speaks in scene ${a.sceneNum}.`,
          });
        });
      } else if (state === "pregnant" && offending.length > 0) {
        // Flag once: pregnancy goes unresolved through last appearance
        const last = offending[offending.length - 1];
        if (last.sceneNum - info.firstScene >= 10) {
          issues.push({
            character, state, category: def.category, label: def.label,
            firstScene: info.firstScene, jumpScene: last.sceneNum,
            msg: `${character} is pregnant in scene ${info.firstScene}, but no birth or resolution shown through scene ${last.sceneNum}.`,
          });
        }
      } else if (state === "arrested" && offending.length > 0) {
        const a = offending[0];
        if (a.sceneNum > info.firstScene + 1) {
          issues.push({
            character, state, category: def.category, label: def.label,
            firstScene: info.firstScene, jumpScene: a.sceneNum,
            msg: `${character} is arrested in scene ${info.firstScene}; speaks freely in scene ${a.sceneNum} — was the release shown?`,
          });
        }
      } else if (state === "married") {
        // We only flag this if a SECOND marriage event happens without a divorce in between
        const enterEvents = evs.filter(e => e.kind === "enter" && e.state === "married").map(e => e.scene);
        const resolveEvents = evs.filter(e => e.kind === "resolve" && e.state === "married").map(e => e.scene);
        if (enterEvents.length >= 2) {
          const [first, ...rest] = enterEvents;
          rest.forEach(secondScene => {
            const divorceBetween = resolveEvents.some(r => r > first && r < secondScene);
            if (!divorceBetween) {
              issues.push({
                character, state, category: def.category, label: def.label,
                firstScene: first, jumpScene: secondScene,
                msg: `${character} marries in scene ${first} and again in scene ${secondScene} — no separation shown between.`,
              });
            }
          });
        }
      }
    });
  });

  // Dedupe identical messages
  const seen = new Set();
  return issues.filter(it => {
    if (seen.has(it.msg)) return false;
    seen.add(it.msg);
    return true;
  });
}
// Cache the count for 2s — updateStatus() calls this on every keystroke,
// and runContinuityCheck() does O(scenes × signals × characters) regex work
// which is fine to run once a second but pointless to run 30×/second.
let _quickContCache = { count: 0, t: 0 };
function quickContinuityCount() {
  const now = Date.now();
  if (now - _quickContCache.t < 2000) return _quickContCache.count;
  try { _quickContCache.count = runContinuityCheck().length; }
  catch { _quickContCache.count = 0; }
  _quickContCache.t = now;
  return _quickContCache.count;
}
function openContinuity() {
  $("#modal-continuity").classList.add("open");
  const issues = runContinuityCheck();
  const body = $("#continuity-body");
  if (issues.length === 0) {
    body.innerHTML = `<div class="cont-empty">
      <div style="font-size:32px;margin-bottom:6px">✓</div>
      <div>No continuity issues detected.</div>
      <div class="cont-hint">The engine watches for: dead-then-speaks, pregnancy-with-no-resolution, arrested-then-free, double-marriage without a divorce shown.</div>
    </div>`;
    return;
  }
  // Group by category
  const grouped = new Map();
  issues.forEach(it => {
    if (!grouped.has(it.category)) grouped.set(it.category, []);
    grouped.get(it.category).push(it);
  });
  body.innerHTML = `
    <div class="cont-meta">${issues.length} possible issue${issues.length === 1 ? "" : "s"} — heuristic, double-check before acting.</div>
    ${Array.from(grouped.entries()).map(([cat, list]) => `
      <div class="cont-group">
        <h4 class="cont-group-head">${escapeHtml(STATE_CATEGORIES[cat] || cat)} <span class="cont-count">${list.length}</span></h4>
        <div class="cont-list">
          ${list.map(it => `
            <div class="cont-item" data-jump="${it.jumpScene}">
              <div class="cont-msg">${escapeHtml(it.msg)}</div>
              <button class="btn cont-jump" data-jump="${it.jumpScene}">Jump to scene ${it.jumpScene}</button>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("")}
  `;
  body.querySelectorAll(".cont-jump").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetScene = parseInt(btn.dataset.jump, 10);
      $("#modal-continuity").classList.remove("open");
      const sceneEls = $$("#editor > div[data-type='scene']");
      const target = sceneEls[targetScene - 1];
      if (!target) return;
      const lineIdx = $$("#editor > div").indexOf(target);
      navigateToLine(lineIdx, null);
    });
  });
}

/* =====================================================================
 * AI everywhere (Sprint 5) — context gatherer + per-target helpers
 *
 * Every AI affordance in the app routes through gatherProjectContext() so
 * the model sees the whole project: title, logline, theme, template, cast
 * (with bible details), locations, scene list, and the full Fountain
 * script (truncated to ~30k chars to stay under typical token budgets).
 *
 * Each sparkle button calls aiInlineFill() with a target-specific prompt;
 * the helper streams the response into a small ghost overlay anchored to
 * the target element, then writes the chosen text back on accept.
 * =================================================================== */
function gatherProjectContext({ scriptChars = 30000 } = {}) {
  const tm = appState.titleMeta || {};
  const project = appState.projectId ? Storage.getProject(appState.projectId) : null;
  const bible   = appState.projectId ? Storage.getBible(appState.projectId) : { characters: [], locations: [], rules: [] };
  const seriesBible = (project?.seriesId) ? Storage.getSeriesBible(project.seriesId) : null;
  const allBibleChars = [...(seriesBible?.characters || []), ...(bible.characters || [])];
  const allBibleLocs  = [...(seriesBible?.locations  || []), ...(bible.locations  || [])];
  const cast = analyzeCharacters();
  const scenes = collectScenes();
  let script;
  try { script = serializeFountain(false); }
  catch { script = $$("#editor > div").map(d => d.textContent).join("\n"); }
  const trunc = script.length > scriptChars
    ? script.slice(0, scriptChars) + "\n\n[…script truncated for context budget — earlier scenes shown above…]"
    : script;
  const out = [];
  out.push("=== PROJECT META ===");
  out.push(`Title: ${tm.title || "(untitled)"}`);
  out.push(`Type: ${project?.type || "feature"}`);
  if (project?.episode) out.push(`Episode: ${project.episode}`);
  if (project?.seriesId) {
    const s = Storage.getSeries(project.seriesId);
    if (s) out.push(`Series: ${s.name}`);
  }
  out.push(`Logline: ${appState.logline || "(none set)"}`);
  if (appState.premise) out.push(`Premise: ${appState.premise}`);
  if (appState.theme)   out.push(`Theme: ${appState.theme}`);
  if (appState.template) {
    const t = Templates.get(appState.template);
    if (t) out.push(`Story template: ${t.name} (${t.beats.length} beats)`);
  }
  out.push("");
  out.push(`=== CHARACTERS — ${allBibleChars.length} in bible, ${cast.length} speaking ===`);
  allBibleChars.forEach(c => {
    const bits = [];
    if (c.role) bits.push(`role: ${c.role}`);
    if (c.age)  bits.push(`age: ${c.age}`);
    if (c.want) bits.push(`want: ${c.want}`);
    if (c.need) bits.push(`need: ${c.need}`);
    if (c.flaw) bits.push(`flaw: ${c.flaw}`);
    out.push(`- ${c.name}${bits.length ? " — " + bits.join("; ") : ""}`);
  });
  if (allBibleChars.length === 0) {
    cast.slice(0, 12).forEach(c => out.push(`- ${c.name} (${c.words} dialogue words across ${c.scenes} scenes)`));
  }
  out.push("");
  if (allBibleLocs.length > 0) {
    out.push("=== LOCATIONS ===");
    allBibleLocs.forEach(l => out.push(`- ${l.name}${l.desc ? ": " + l.desc.slice(0, 120) : ""}`));
    out.push("");
  }
  out.push(`=== SCENES (${scenes.length}) ===`);
  scenes.forEach((s, i) => {
    const syn = synopsisAfter(s.lineIndex);
    out.push(`${i + 1}. ${s.slug}${s.beatTag ? " [beat: " + s.beatTag + "]" : ""}${syn ? " — " + syn.slice(0, 120) : ""}`);
  });
  out.push("");
  out.push("=== SCREENPLAY (Fountain) ===");
  out.push(trunc);
  return out.join("\n");
}

// Small floating overlay anchored to an arbitrary element. Streams text in,
// then asks the user to accept/cancel. Returns the accepted text (or null).
async function aiInlineFill({ anchor, label, prompt, vars }) {
  if (!AI.isConfigured()) {
    toast("No API key. Fill config.local.js or open Settings.", 4000);
    return null;
  }
  const host = document.createElement("div");
  host.className = "ai-ghost";
  host.innerHTML = `
    <div class="ai-ghost-head">
      <span class="ai-ghost-tag">${escapeHtml(label || "AI")}</span>
      <span class="ai-ghost-status">streaming…</span>
    </div>
    <div class="ai-ghost-body"></div>
    <div class="ai-ghost-actions">
      <button class="btn ai-ghost-cancel">Cancel</button>
      <button class="btn primary ai-ghost-accept" disabled>Use this</button>
    </div>`;
  document.body.appendChild(host);
  host.style.position = "fixed";
  const rect = anchor?.getBoundingClientRect?.() || { left: 100, bottom: 120 };
  host.style.left = Math.min(window.innerWidth - 480, Math.max(20, rect.left)) + "px";
  host.style.top  = Math.min(window.innerHeight - 200, rect.bottom + 6) + "px";
  host.style.zIndex = 95;

  const body   = host.querySelector(".ai-ghost-body");
  const status = host.querySelector(".ai-ghost-status");
  const accept = host.querySelector(".ai-ghost-accept");
  const cancel = host.querySelector(".ai-ghost-cancel");

  let resolve;
  const decision = new Promise(r => { resolve = r; });
  accept.addEventListener("click", () => resolve(true));
  cancel.addEventListener("click", () => resolve(false));
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); resolve(false); } };
  document.addEventListener("keydown", onKey);

  let full = "";
  try {
    for await (const chunk of AI.stream(prompt, vars || {})) {
      full += chunk;
      body.textContent = full;
    }
  } catch (e) {
    status.textContent = "error";
    body.textContent = "AI error: " + e.message;
    accept.disabled = true;
    const cleanup = () => { document.removeEventListener("keydown", onKey); host.remove(); };
    setTimeout(cleanup, 4000);
    return null;
  }
  const cleaned = full.trim();
  if (!cleaned) {
    document.removeEventListener("keydown", onKey);
    host.remove();
    toast("AI returned nothing");
    return null;
  }
  status.textContent = "ready — accept or cancel";
  accept.disabled = false;
  const ok = await decision;
  document.removeEventListener("keydown", onKey);
  host.remove();
  return ok ? cleaned : null;
}

// Fill in a synopsis for the scene starting at lineIdx. Called from both the
// Beat Board and the Cards view sparkle buttons — same prompt + same write
// target (synopsisAfter).
async function aiFillBeatSynopsis(lineIdx) {
  const sceneLine = $$("#editor > div")[lineIdx];
  if (!sceneLine) return;
  const slug = sceneLine.textContent.replace(/^\./, "").trim();
  const beatTag = sceneLine.dataset.beat || "";
  const template = appState.template ? Templates.get(appState.template) : null;
  const beat = template?.beats.find(b => b.id === beatTag);
  const beatHint = beat
    ? `This scene is tagged as the **${beat.name}** beat in the ${template.name} structure. The expected role for this beat is: ${beat.desc || "(none)"}`
    : `This scene has no beat tag yet — propose a synopsis that fits where it sits in the overall arc.`;
  const promptTemplate = `You are helping a screenwriter outline a scene. Below is the full project context, including the script so far.

Write ONE or TWO sentences (no more) of a SCENE SYNOPSIS for the scene whose slug is:

    ${slug}

${beatHint}

Keep it concrete (who does what, what changes), present-tense, no quotation marks, no commentary. Output ONLY the synopsis text.

PROJECT:
{CONTEXT}`;
  const card = document.querySelector(`.beat-card[data-line="${lineIdx}"], .card-item[data-line="${lineIdx}"]`);
  const result = await aiInlineFill({
    anchor: card,
    label: beat ? `AI · ${beat.name}` : "AI · synopsis",
    prompt: promptTemplate,
    vars: { CONTEXT: gatherProjectContext() },
  });
  if (!result) return;
  setSynopsisAfter(lineIdx, result);
  setDirty();
  if (appState.view === "beats") renderBeatBoard();
  else if (appState.view === "cards") renderCards();
}

// Bulk-fill synopses for a set of selected scenes in a single API call.
// Output is a JSON object keyed by line index; we parse it and write each
// synopsis back via setSynopsisAfter(). Robust to stray text around the JSON.
async function aiFillBeatSynopsesBulk(lineIdxs) {
  if (!Array.isArray(lineIdxs) || lineIdxs.length === 0) {
    toast("Select at least one scene first");
    return;
  }
  if (!AI.isConfigured()) {
    toast("No API key. Fill config.local.js or open Settings.", 4000);
    return;
  }
  const lines = $$("#editor > div");
  const template = appState.template ? Templates.get(appState.template) : null;
  // Use sequence numbers (1..N) for the JSON keys — line indices are large
  // and the model sometimes hallucinates similar-looking numbers. We map
  // sequence → real lineIdx ourselves when writing back.
  const targets = lineIdxs
    .filter(idx => lines[idx]?.dataset.type === "scene")
    .map((idx, i) => {
      const l = lines[idx];
      const slug = l.textContent.replace(/^\./, "").trim();
      const beat = template?.beats.find(b => b.id === l.dataset.beat);
      return { seq: i + 1, idx, slug, beat };
    });
  if (targets.length === 0) return;
  const targetsBlock = targets.map(t =>
    `${t.seq}. ${t.slug}` + (t.beat ? ` [beat: ${t.beat.name} — ${t.beat.desc || "(role TBD)"}]` : "")
  ).join("\n");
  const promptTemplate = `For EACH of the scenes below, write a 1-2 sentence SCENE SYNOPSIS (present tense, concrete, no quotes, no commentary, no "Here is" preamble). If a scene has a beat tag, honor that role.

Output VALID JSON ONLY — a single object mapping the EXACT scene number (as a STRING, "1" through "${targets.length}") to its synopsis. The keys MUST be exactly "1", "2", … "${targets.length}" and nothing else. Example for 2 scenes:
{"1":"Marcus and Ella collide in the diner — she sees the bruise.","2":"Marcus finally names the killer."}

SCENES:
${targetsBlock}

PROJECT CONTEXT:
{CONTEXT}`;
  const anchor = document.querySelector('.bs-multitools [data-act="ai-bulk"]') || document.body;
  const raw = await aiInlineFill({
    anchor,
    label: `AI · ${targets.length} synopses`,
    prompt: promptTemplate,
    vars: { CONTEXT: gatherProjectContext() },
  });
  if (!raw) return;
  // Find the JSON object in the response. AI sometimes wraps it in prose
  // or code fences — extract the outermost {...} block.
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed = null;
  if (match) {
    try { parsed = JSON.parse(match[0]); } catch {}
  }
  if (!parsed || typeof parsed !== "object") {
    toast("AI returned unparseable output — synopses not written");
    return;
  }
  // setSynopsisAfter() inserts a new line and runs reclassifyAll, which shifts
  // every subsequent line index. Write in REVERSE document order so earlier
  // insertions don't invalidate later targets.
  const writes = Object.entries(parsed)
    .map(([k, v]) => {
      const seq = parseInt(k, 10);
      const target = targets.find(t => t.seq === seq);
      if (!target || typeof v !== "string" || !v.trim()) return null;
      return { idx: target.idx, value: v.trim() };
    })
    .filter(Boolean)
    .sort((a, b) => b.idx - a.idx);
  let count = 0;
  writes.forEach(({ idx, value }) => { setSynopsisAfter(idx, value); count++; });
  setDirty();
  if (appState.view === "beats") renderBeatBoard();
  else if (appState.view === "cards") renderCards();
  toast(`Filled ${count} of ${targets.length} synopses`);
}

// Generate a logline candidate based on the full project context.
async function aiGenerateLogline() {
  const promptTemplate = `Write ONE line of LOGLINE for this screenplay. It must follow the standard structure:
[PROTAGONIST] (description) MUST [GOAL] OR [STAKES] when/because [TRIGGER].

Make it concrete, specific, and under 35 words. Output ONLY the logline — no preamble, no quotes, no commentary.

PROJECT:
{CONTEXT}`;
  const anchor = $("#ll-input") || $("#ll-ai") || $("#modal-logline");
  const result = await aiInlineFill({
    anchor,
    label: "AI · logline",
    prompt: promptTemplate,
    vars: { CONTEXT: gatherProjectContext() },
  });
  if (!result) return;
  appState.logline = result;
  const meta = Storage.getMeta(appState.projectId) || {};
  meta.logline = result;
  Storage.setMeta(appState.projectId, meta);
  setDirty();
  const input = $("#ll-input");
  if (input) input.value = result;
  if (typeof updateLoglineScore === "function") updateLoglineScore();
  toast("Logline updated");
}

// Fill in a character bible field (want/need/flaw/backstory/voice/traits).
// Uses the current script + project context.
async function aiFillCharacterField(charId, field, anchor) {
  // Resolve character across episode + series bible
  const pid = appState.projectId;
  if (!pid) return;
  const project = Storage.getProject(pid);
  const epBible = Storage.getBible(pid);
  const sBible = project?.seriesId ? Storage.getSeriesBible(project.seriesId) : null;
  let source = "episode";
  let c = epBible.characters.find(x => x.id === charId);
  if (!c && sBible) { c = sBible.characters.find(x => x.id === charId); source = "series"; }
  if (!c) { toast("Character not found"); return; }
  const FIELD_PROMPTS = {
    want:     `Write ONE sentence describing what ${c.name} WANTS (their external, conscious goal — the thing they're chasing). Concrete, specific. Output ONLY the sentence.`,
    need:     `Write ONE sentence describing what ${c.name} NEEDS (their internal lesson — the thing they must learn or accept). Different from what they want. Output ONLY the sentence.`,
    flaw:     `Write ONE sentence describing ${c.name}'s FLAW — the trait or behavior that gets in their own way. Concrete. Output ONLY the sentence.`,
    backstory:`Write a SHORT backstory for ${c.name} (3-5 sentences) — formative events that explain who they are now. Output ONLY the backstory.`,
    voice:    `Describe ${c.name}'s VOICE in 2-3 sentences: vocabulary, rhythm, what they avoid saying, a sample line or two. Output ONLY the description.`,
    traits:   `List 3-5 vivid TRAITS for ${c.name}, comma-separated (e.g. "warm, evasive, deadpan, hyper-observant"). Output ONLY the list, no preamble.`,
    secrets:  `Describe a meaningful SECRET ${c.name} carries — something that complicates their relationships. 1-2 sentences. Output ONLY the secret.`,
    role:     `Write ${c.name}'s ROLE in this story in 3-6 words (e.g. "Protagonist", "Reluctant mentor", "Antagonist's enforcer"). Output ONLY the role.`,
    physical: `Describe ${c.name}'s physical presence in 1-2 sentences — what makes them recognizable on screen. Output ONLY the description.`,
    age:      `Estimate ${c.name}'s AGE based on the script context. Output ONLY a number or range like "30s" or "42".`,
  };
  const fieldPrompt = FIELD_PROMPTS[field];
  if (!fieldPrompt) { toast("AI not available for this field"); return; }
  const promptTemplate = `${fieldPrompt}

If the script and existing bible give you signals, use them — stay consistent with what's already there. Otherwise, propose something that fits the story's tone and genre.

PROJECT:
{CONTEXT}

EXISTING BIBLE FOR ${c.name}:
${JSON.stringify({ role: c.role, age: c.age, want: c.want, need: c.need, flaw: c.flaw, traits: c.traits, voice: c.voice, secrets: c.secrets, backstory: c.backstory }, null, 2)}`;
  const result = await aiInlineFill({
    anchor,
    label: `AI · ${field}`,
    prompt: promptTemplate,
    vars: { CONTEXT: gatherProjectContext() },
  });
  if (!result) return;
  c[field] = result;
  if (source === "series") Storage.setSeriesBible(project.seriesId, sBible);
  else Storage.setBible(pid, epBible);
  // Refresh bible view if it's open so the user sees the new value
  if (appState.view === "bible" && typeof Bible !== "undefined" && Bible.render) {
    Bible.open(pid);
  }
  toast(`Filled ${c.name}'s ${field}`);
}

// Fill the ENTIRE character profile in one go. Two modes:
//   "auto"      — single batched call using project context only
//   "interview" — AI generates 3 tailored questions, user answers, then a
//                 second call uses those answers + context to fill everything.
async function aiFillCharacterAll(charId, mode = "auto") {
  if (!AI.isConfigured()) { toast("No API key"); return; }
  const pid = appState.projectId;
  if (!pid) return;
  const project = Storage.getProject(pid);
  const epBible = Storage.getBible(pid);
  const sBible = project?.seriesId ? Storage.getSeriesBible(project.seriesId) : null;
  let source = "episode";
  let c = epBible.characters.find(x => x.id === charId);
  if (!c && sBible) { c = sBible.characters.find(x => x.id === charId); source = "series"; }
  if (!c) { toast("Character not found"); return; }

  let extraContext = "";
  if (mode === "interview") {
    const answers = await runCharacterInterview(c);
    if (!answers) return; // user cancelled
    if (Object.keys(answers).length > 0) {
      extraContext = "\n\nWRITER'S NOTES (treat these as authoritative — match them):\n" +
        Object.entries(answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n");
    }
  }

  const prompt = `Fill out a complete character profile for ${c.name}. Output VALID JSON ONLY with these EXACT keys (omit any you can't reasonably propose):
{
  "role":      "3-6 word descriptor of their function in the story",
  "age":       "number or range like '30s' or '42'",
  "physical":  "1-2 sentences of recognizable physical presence",
  "want":      "ONE sentence: their external conscious goal",
  "need":      "ONE sentence: their internal lesson — different from want",
  "flaw":      "ONE sentence: the trait/behavior that gets in their own way",
  "backstory": "3-5 sentences of formative events",
  "voice":     "2-3 sentences on vocabulary, rhythm, what they avoid saying",
  "traits":    "3-5 vivid traits, comma-separated",
  "secrets":   "1-2 sentences on a secret they carry"
}

Preserve any existing values that are clearly strong — only replace if your version is meaningfully better.

EXISTING VALUES FOR ${c.name}:
${JSON.stringify({ role: c.role, age: c.age, physical: c.physical, want: c.want, need: c.need, flaw: c.flaw, backstory: c.backstory, voice: c.voice, traits: c.traits, secrets: c.secrets }, null, 2)}

PROJECT:
{CONTEXT}${extraContext}`;

  const card = document.querySelector(`.bib-char[data-cid="${charId}"]`);
  const raw = await aiInlineFill({
    anchor: card,
    label: `AI · fill all (${c.name})`,
    prompt,
    vars: { CONTEXT: gatherProjectContext() },
  });
  if (!raw) return;
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed = null;
  if (match) { try { parsed = JSON.parse(match[0]); } catch {} }
  if (!parsed || typeof parsed !== "object") { toast("Couldn't parse AI response"); return; }

  const VALID_KEYS = ["role","age","physical","want","need","flaw","backstory","voice","traits","secrets"];
  let count = 0;
  VALID_KEYS.forEach(k => {
    const v = parsed[k];
    if (typeof v === "string" && v.trim()) { c[k] = v.trim(); count++; }
    else if (typeof v === "number" && k === "age") { c.age = String(v); count++; }
  });
  if (source === "series") Storage.setSeriesBible(project.seriesId, sBible);
  else Storage.setBible(pid, epBible);
  if (appState.view === "bible" && typeof Bible !== "undefined" && Bible.open) Bible.open(pid);
  toast(`Filled ${count} fields for ${c.name}`);
}

// Modal-driven interview: ask AI for 3 questions tailored to the character,
// collect answers, return them as { [questionText]: answer }.
async function runCharacterInterview(c) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop open";
  modal.innerHTML = `<div class="modal" style="max-width:560px">
    <h2>Interview: ${escapeHtml(c.name)}</h2>
    <p class="help" id="iv-help" style="font-size:13px;color:var(--ink-2);line-height:1.5">Generating questions…</p>
    <div id="iv-form"></div>
    <div class="actions">
      <button class="btn" id="iv-cancel">Cancel</button>
      <button class="btn primary" id="iv-go" disabled>Use these answers →</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  const questionPrompt = `Suggest 3 SHORT, specific questions that would help a screenwriter develop ${c.name} more fully. Address the writer directly (e.g. "What's the worst thing X has ever done and gotten away with?"). Skip generic questions.

Output VALID JSON ONLY — an array of 3 strings. Example:
["What does X think nobody knows about them?","When did X first lie to themselves?","Who in the script does X most fear becoming?"]

PROJECT:
{CONTEXT}`;
  let questions = [];
  try {
    let raw = "";
    for await (const chunk of AI.stream(questionPrompt, { CONTEXT: gatherProjectContext() })) raw += chunk;
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) questions = JSON.parse(m[0]).filter(q => typeof q === "string" && q.trim());
  } catch (e) {
    modal.querySelector("#iv-help").textContent = "AI error: " + e.message;
  }
  if (questions.length === 0) {
    modal.querySelector("#iv-help").textContent = "Couldn't generate questions. Cancel and try again, or use Automatic mode.";
    return await new Promise(resolve => {
      modal.querySelector("#iv-cancel").onclick = () => { modal.remove(); resolve(null); };
    });
  }
  modal.querySelector("#iv-help").textContent = "Answer in whatever depth you like — leave blank to skip. Your answers seed the next AI call.";
  modal.querySelector("#iv-form").innerHTML = questions.map((q, i) => `
    <div class="iv-q">
      <label>${escapeHtml(q)}</label>
      <textarea id="iv-q${i}" rows="2"></textarea>
    </div>
  `).join("");
  modal.querySelector("#iv-go").disabled = false;
  setTimeout(() => modal.querySelector("#iv-q0")?.focus(), 30);
  return await new Promise(resolve => {
    modal.querySelector("#iv-cancel").onclick = () => { modal.remove(); resolve(null); };
    modal.querySelector("#iv-go").onclick = () => {
      const answers = {};
      questions.forEach((q, i) => {
        const v = modal.querySelector("#iv-q" + i).value.trim();
        if (v) answers[q] = v;
      });
      modal.remove();
      resolve(answers);
    };
  });
}

// Ask AI to fill in Want/Need/Flaw/Change marks for every character × scene.
// Uses sequence numbers for scenes and character IDs (short opaque strings),
// then maps back to (charId, lineIdx) for Bible.bulkSetArcs.
async function aiFillArcsBulk() {
  if (!AI.isConfigured()) { toast("No API key"); return; }
  if (!appState.projectId) return;
  const project = Storage.getProject(appState.projectId);
  const epBible = Storage.getBible(appState.projectId);
  const sBible = project?.seriesId ? Storage.getSeriesBible(project.seriesId) : null;
  const chars = [...(sBible?.characters || []), ...(epBible.characters || [])];
  if (chars.length === 0) { toast("Add at least one character to the Bible first"); return; }
  const scenes = collectScenes();
  if (scenes.length === 0) { toast("Add at least one scene to the script first"); return; }

  const charBlock = chars.map(c => {
    const bits = [c.want && "want: "+c.want, c.need && "need: "+c.need, c.flaw && "flaw: "+c.flaw].filter(Boolean);
    return `- id "${c.id}": ${c.name}${bits.length ? " — " + bits.join("; ") : ""}`;
  }).join("\n");
  const sceneBlock = scenes.map((s, i) => `${i+1}. ${s.slug}`).join("\n");

  const prompt = `For each character, decide which scenes demonstrate their WANT (w), NEED (n), FLAW (f), or CHANGE moment (c). Only mark a scene if there's clear textual evidence — favor precision over recall.

Output VALID JSON ONLY with this shape:
{
  "<characterId>": {
    "<sceneSequenceNumber>": { "w": true|false, "n": true|false, "f": true|false, "c": true|false }
  }
}
Use the EXACT character ids from the list below (e.g. "${chars[0].id}") and EXACT scene sequence numbers (e.g. "1", "2", … "${scenes.length}"). Omit characters or scenes with no marks. Omit flags that are false.

CHARACTERS:
${charBlock}

SCENES:
${sceneBlock}

PROJECT:
{CONTEXT}`;

  const anchor = document.querySelector(".arc-grid") || document.body;
  const raw = await aiInlineFill({
    anchor,
    label: `AI · arcs (${chars.length} characters)`,
    prompt,
    vars: { CONTEXT: gatherProjectContext() },
  });
  if (!raw) return;
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed = null;
  if (match) { try { parsed = JSON.parse(match[0]); } catch {} }
  if (!parsed || typeof parsed !== "object") { toast("Couldn't parse arc suggestions"); return; }

  // Translate scene sequence numbers → actual lineIdx
  const seqToLine = (seqStr) => {
    const seq = parseInt(seqStr, 10);
    return (seq >= 1 && seq <= scenes.length) ? scenes[seq - 1].lineIndex : null;
  };
  // Build the bulkSetArcs payload
  const payload = {};
  Object.entries(parsed).forEach(([cid, sceneMap]) => {
    if (!chars.find(c => c.id === cid)) return;
    const inner = {};
    Object.entries(sceneMap || {}).forEach(([sid, flags]) => {
      const lineIdx = seqToLine(sid);
      if (lineIdx == null) return;
      if (!flags || typeof flags !== "object") return;
      const cleaned = {};
      ["w","n","f","c"].forEach(k => { if (flags[k] === true) cleaned[k] = true; });
      if (Object.keys(cleaned).length > 0) inner[lineIdx] = cleaned;
    });
    if (Object.keys(inner).length > 0) payload[cid] = inner;
  });

  const writes = Bible.bulkSetArcs(payload);
  toast(`Added ${writes} arc mark${writes===1?'':'s'}`);
  // Re-render the Arcs tab
  Bible.open(appState.projectId);
}

// Ask AI to suggest character-to-character relationships based on the script.
// Output: [{ a: "<charId>", b: "<charId>", kind: "loves"|"married"|... }]
async function aiSuggestRelationships() {
  if (!AI.isConfigured()) { toast("No API key"); return; }
  if (!appState.projectId) return;
  const project = Storage.getProject(appState.projectId);
  const epBible = Storage.getBible(appState.projectId);
  const sBible = project?.seriesId ? Storage.getSeriesBible(project.seriesId) : null;
  const chars = [...(sBible?.characters || []), ...(epBible.characters || [])];
  if (chars.length < 2) { toast("Add at least 2 characters first"); return; }
  const existing = (epBible.relationships || []).map(r => {
    const a = chars.find(x => x.id === r.a)?.name || r.a;
    const b = chars.find(x => x.id === r.b)?.name || r.b;
    return `${a} ${r.kind} ${b}`;
  }).join("\n") || "(none yet)";

  const charBlock = chars.map(c => `- id "${c.id}": ${c.name}`).join("\n");
  const prompt = `Propose relationships between the characters below based on the script. Output VALID JSON ONLY — an array of edges:
[
  { "a": "<characterId>", "b": "<characterId>", "kind": "loves" | "married" | "family" | "friend" | "rival" | "hates" | "mentor" | "boss" }
]

Only suggest relationships with clear textual evidence. Don't repeat existing ones. Skip self-edges.

CHARACTERS:
${charBlock}

EXISTING RELATIONSHIPS (already in the map):
${existing}

PROJECT:
{CONTEXT}`;

  const anchor = document.querySelector(".bib-rel-canvas") || document.body;
  const raw = await aiInlineFill({
    anchor,
    label: "AI · relationships",
    prompt,
    vars: { CONTEXT: gatherProjectContext() },
  });
  if (!raw) return;
  const match = raw.match(/\[[\s\S]*\]/);
  let parsed = null;
  if (match) { try { parsed = JSON.parse(match[0]); } catch {} }
  if (!Array.isArray(parsed)) { toast("Couldn't parse relationship suggestions"); return; }

  // Filter to valid edges
  const valid = parsed.filter(r =>
    r && chars.find(c => c.id === r.a) && chars.find(c => c.id === r.b) && r.a !== r.b && typeof r.kind === "string"
  );
  if (valid.length === 0) { toast("AI suggested 0 valid relationships"); return; }
  const added = Bible.bulkAddRelationships(valid);
  toast(`Added ${added} relationship${added===1?'':'s'}`);
  Bible.open(appState.projectId);
}

// Show a tiny modal asking "Automatic or Interview?" — returns the choice.
async function promptCharacterFillMode(charName) {
  return await new Promise(resolve => {
    const back = document.createElement("div");
    back.className = "modal-backdrop open";
    back.innerHTML = `<div class="modal">
      <h2>Fill ${escapeHtml(charName)} with AI</h2>
      <p class="help" style="font-size:13px;color:var(--ink-2);line-height:1.5">Choose how you want AI to fill out every field:</p>
      <div class="actions" style="flex-wrap:wrap">
        <button class="btn" id="cfm-cancel">Cancel</button>
        <button class="btn" id="cfm-auto">Automatic <span class="muted" style="font-size:11px;margin-left:4px">— just go</span></button>
        <button class="btn primary" id="cfm-interview">Interview me first <span style="font-size:11px;margin-left:4px;opacity:.85">— better results</span></button>
      </div>
    </div>`;
    document.body.appendChild(back);
    const close = v => { back.remove(); resolve(v); };
    back.querySelector("#cfm-cancel").onclick = () => close(null);
    back.querySelector("#cfm-auto").onclick = () => close("auto");
    back.querySelector("#cfm-interview").onclick = () => close("interview");
    back.onclick = e => { if (e.target === back) close(null); };
  });
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
    // Stream for the long-form commands (coverage/brainstorm) — they're the slowest
    // and have a dedicated modal that comfortably holds partial output.
    if (id === "coverage" || id === "brainstorm") {
      $("#modal-coverage").classList.add("open");
      const body = $("#coverage-body");
      body.textContent = "";
      body.classList.add("ai-streaming");
      let full = "";
      try {
        for await (const chunk of AI.stream(cmd.prompt, { TEXT: targetText, CONTEXT: context })) {
          full += chunk;
          body.textContent = full;
        }
      } finally {
        body.classList.remove("ai-streaming");
      }
      if (!full) body.textContent = "AI returned nothing.";
      else if (id === "coverage") body.innerHTML = formatCoverage(full);
      // brainstorm leaves the raw text alone — it's a short numbered list
      return;
    }
    // For line/selection rewrites, build a floating ghost overlay below the
    // target line and stream into it. The user accepts/rejects when streaming
    // completes (or via Esc to cancel).
    const ghost = renderAiGhostOverlay(line, selText);
    let full = "";
    try {
      for await (const chunk of AI.stream(cmd.prompt, { TEXT: targetText, CONTEXT: context })) {
        full += chunk;
        ghost.body.textContent = full;
      }
    } catch (e) {
      ghost.host.remove();
      throw e;
    }
    const cleaned = full.trim();
    if (!cleaned) { ghost.host.remove(); toast("AI returned nothing"); return; }
    const ok = await ghost.awaitDecision();
    ghost.host.remove();
    if (!ok || !line) return;
    if (selRange && selText) {
      const t = line.textContent;
      line.textContent = t.substring(0, selRange.startOff) + cleaned + t.substring(selRange.endOff);
    } else {
      line.textContent = cleaned;
    }
    markRevised(line); reclassifyAll(); setDirty();
  } catch (e) { toast("AI error: " + e.message, 5000); }
}

function renderAiGhostOverlay(line, selText) {
  const host = document.createElement("div");
  host.className = "ai-ghost";
  host.innerHTML = `
    <div class="ai-ghost-head">
      <span class="ai-ghost-tag">AI ${selText ? "selection rewrite" : "line rewrite"}</span>
      <span class="ai-ghost-status">streaming…</span>
    </div>
    <div class="ai-ghost-body"></div>
    <div class="ai-ghost-actions">
      <button class="btn ai-ghost-cancel">Cancel</button>
      <button class="btn primary ai-ghost-accept" disabled>Accept</button>
    </div>
  `;
  document.body.appendChild(host);
  const rect = line ? line.getBoundingClientRect() : { left: 100, bottom: 200 };
  host.style.position = "fixed";
  host.style.left = Math.max(20, rect.left) + "px";
  host.style.top  = (rect.bottom + 6) + "px";
  host.style.zIndex = 95;

  const body = host.querySelector(".ai-ghost-body");
  const status = host.querySelector(".ai-ghost-status");
  const accept = host.querySelector(".ai-ghost-accept");
  const cancel = host.querySelector(".ai-ghost-cancel");

  // Returns Promise<bool> resolving once streaming finishes AND the user has
  // chosen accept/cancel. The caller flips status off when the stream ends.
  let resolve;
  const decision = new Promise(r => { resolve = r; });
  const onAccept = () => resolve(true);
  const onCancel = () => resolve(false);
  accept.addEventListener("click", onAccept);
  cancel.addEventListener("click", onCancel);
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); resolve(false); } };
  document.addEventListener("keydown", onKey);
  decision.finally(() => document.removeEventListener("keydown", onKey));

  return {
    host, body,
    awaitDecision: () => { status.textContent = "ready — accept or cancel"; accept.disabled = false; return decision; },
  };
}
function gatherContextAround(line, n) {
  const lines = $$("#editor > div");
  const idx = lines.indexOf(line);
  const lo = Math.max(0, idx - n); const hi = Math.min(lines.length, idx + n + 1);
  return lines.slice(lo, hi).map(l => l.textContent).join("\n");
}

