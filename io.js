"use strict";
/* io.js — share link generator, Fountain serialize/parse (with bs:meta), watermarked PDF print, change log viewer, PDF log viewer, file I/O (open/save/import .fountain & .fdx). */

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
      const proofMeta = (typeof Storage !== "undefined" && appState.projectId) ? Storage.getMeta(appState.projectId) : null;
      const proofLang = (proofMeta && proofMeta.language) || "en";
      out += "bs:lang=" + proofLang + "\n";
      if (typeof Storage !== "undefined" && appState.projectId) {
        const dictRec = Storage.getProofDict(appState.projectId);
        if (dictRec && dictRec.words && dictRec.words.length) {
          out += "bs:dict=" + dictRec.words.join(",") + "\n";
        }
      }
      out += "\n";
    }
  }
  const lines = $$("#editor > div"); let prevType = "";
  lines.forEach(line => {
    // Dual-pair: serialize left half normally, then right half with ^ on the character cue
    if (line.classList.contains("dual-pair")) {
      const halves = Array.from(line.children);
      halves.forEach((half, hi) => {
        Array.from(half.children).forEach((il, ii) => {
          const t = il.textContent;
          const type = il.dataset.type;
          if (type === "character" && hi === 1 && ii === 0) {
            out += t.trim() + " ^\n";
          } else if (type === "character") {
            out += t.trim() + "\n";
          } else if (type === "parenthetical") {
            out += t.trim() + "\n";
          } else {
            out += t + "\n";
          }
        });
        if (hi === 0) out += "\n"; // blank line between blocks inside fountain
      });
      prevType = "dialogue";
      return;
    }
    const t = line.textContent; const type = line.dataset.type;
    const meta = [];
    ["color","tags","beat","thread","goal","mood","date","sound","rev","sceneNum"].forEach(k => {
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
    if (l.startsWith("bs:lang=")) {
      const lang = l.slice("bs:lang=".length).trim();
      if (lang === "en" || lang === "es") {
        const existingMeta = Storage.getMeta(appState.projectId) || {};
        Storage.setMeta(appState.projectId, { ...existingMeta, language: lang });
      }
      return;
    }
    if (l.startsWith("bs:dict=")) {
      const words = l.slice("bs:dict=".length).split(",").map(w => w.trim()).filter(Boolean);
      if (words.length) {
        const cur = Storage.getProofDict(appState.projectId) || { words: [], ignored: [] };
        const merged = Array.from(new Set([...cur.words, ...words]));
        Storage.setProofDict(appState.projectId, { ...cur, words: merged });
      }
      return;
    }
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
  const objs = rawLines.map(text => ({ text, type: null, dualRight: false }));
  // First, strip Fountain dual-dialogue marker (^ at end of character cue) so
  // the line is recognized as a normal character cue by the classifier below.
  for (let k = 0; k < objs.length; k++) {
    const tk = objs[k].text.trim();
    if (/\^\s*$/.test(tk)) {
      // It must look like a character cue (ALL CAPS, short) — otherwise leave it.
      const candidate = tk.replace(/\s*\^\s*$/, "").trim();
      if (ALLCAPS_RE.test(candidate) && !candidate.endsWith(":") && candidate.length > 0) {
        objs[k].text = objs[k].text.replace(/\s*\^\s*$/, "");
        objs[k].dualRight = true;
      }
    }
  }
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
  // First pass: append all lines. Track which character cues are "dual" (end in ^).
  const dualRightCharIdx = new Set();
  objs.forEach(o => {
    if (o.type === "blank") return;
    const d = document.createElement("div");
    d.dataset.type = o.type;
    d.dataset.forced = (o.type !== "action" && o.type !== "dialogue") ? "true" : "false";
    let text = o.text.replace(/^\s+/, "");
    if (o.type === "character" && o.dualRight) {
      dualRightCharIdx.add(editor.children.length);
    }
    d.textContent = text;
    if (metaByText.has(o.text)) {
      metaByText.get(o.text).split(";").forEach(kv => {
        const [k,v] = kv.split("="); if (k && v) d.dataset[k.trim()] = v.trim();
      });
    }
    editor.appendChild(d);
  });
  // Second pass: for each "right" character cue, find the preceding character block
  // and wrap both into a .dual-pair. Process in reverse so indices stay stable.
  Array.from(dualRightCharIdx).sort((a,b) => b - a).forEach(rightIdx => {
    const kids = Array.from(editor.children);
    const rightChar = kids[rightIdx];
    if (!rightChar || rightChar.dataset.type !== "character") return;
    // Right block extends through dialog/parenthetical
    const rightBlock = [rightChar];
    for (let j = rightIdx + 1; j < kids.length; j++) {
      if (["dialogue","parenthetical"].includes(kids[j].dataset.type)) rightBlock.push(kids[j]);
      else break;
    }
    // Walk back for left character cue
    let i = rightIdx - 1;
    while (i >= 0 && kids[i].dataset.type !== "character") i--;
    if (i < 0) return;
    const leftChar = kids[i];
    const leftBlock = [leftChar];
    for (let j = i + 1; j < rightIdx; j++) {
      if (["dialogue","parenthetical"].includes(kids[j].dataset.type)) leftBlock.push(kids[j]);
    }
    // Build wrapper and move
    const wrap = document.createElement("div");
    wrap.className = "dual-pair";
    const leftCol = document.createElement("div");
    const rightCol = document.createElement("div");
    wrap.appendChild(leftCol); wrap.appendChild(rightCol);
    editor.insertBefore(wrap, leftChar);
    leftBlock.forEach(n => leftCol.appendChild(n));
    rightBlock.forEach(n => rightCol.appendChild(n));
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
/* Inject (MORE) / CHARACTER (CONT'D) at every page break that lands inside
   a dialogue block. Uses the same per-element line-math as applyPageBreaks()
   so the split matches the visible pagination. Returns a list of inserted
   nodes so the caller can remove them after print. */
function injectMoreContd() {
  const inserted = [];
  const all = $$("#editor > div");
  // Compute running page position per line using the same constants used by
  // applyPageBreaks() (PAGE_W / PAGE_SPACING / LINES_PER_PAGE in panels.js).
  let used = 0;
  let nextThreshold = LINES_PER_PAGE;
  const positions = []; // {line, endUsed, page}
  let pageNum = 1;
  for (const d of all) {
    const type = d.dataset.type;
    if (["note","section","synopsis"].includes(type)) { positions.push({line:d, endUsed:used, page:pageNum, skip:true}); continue; }
    const t = (d.textContent || "").trim();
    if (!t) { positions.push({line:d, endUsed:used, page:pageNum, skip:true}); continue; }
    const w = PAGE_W[type] || 60;
    const wrapped = Math.max(1, Math.ceil(t.length / w));
    const before = used;
    used += wrapped + (PAGE_SPACING[type] || 0);
    let endsPage = false;
    while (used >= nextThreshold) {
      endsPage = true;
      pageNum++;
      nextThreshold += LINES_PER_PAGE;
    }
    positions.push({ line: d, startUsed: before, endUsed: used, page: pageNum - (endsPage ? 1 : 0), endsPage });
  }
  // Walk: for each line that ends a page, look at the next non-skip sibling.
  // If we are inside a dialogue block (current is dialogue/parenthetical AND
  // next is dialogue/parenthetical, OR current is character with no dialogue
  // shown yet), inject (MORE) after current and CHAR (CONT'D) before next.
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]; if (!p.endsPage) continue;
    let nextIdx = i + 1;
    while (nextIdx < positions.length && positions[nextIdx].skip) nextIdx++;
    const cur = p.line;
    const next = nextIdx < positions.length ? positions[nextIdx].line : null;
    if (!next) continue;
    const curType = cur.dataset.type;
    const nextType = next.dataset.type;
    const inDialogue = (curType === "dialogue" || curType === "parenthetical") && (nextType === "dialogue" || nextType === "parenthetical");
    if (!inDialogue) continue;
    // Walk backwards to find the character cue this dialogue belongs to.
    let charLine = null;
    for (let k = i; k >= 0; k--) {
      if (positions[k].line.dataset.type === "character") { charLine = positions[k].line; break; }
      const t = positions[k].line.dataset.type;
      if (t === "scene" || t === "transition" || t === "action") break;
    }
    if (!charLine) continue;
    const baseName = (charLine.textContent || "").replace(/\s*\(CONT'D\)\s*$/i, "").trim();
    // Inject (MORE) after cur (centered/parenthetical-style indent)
    const more = document.createElement("div");
    more.dataset.type = "parenthetical";
    more.dataset.printInjected = "true";
    more.textContent = "(MORE)";
    cur.parentNode.insertBefore(more, cur.nextSibling);
    inserted.push(more);
    // Inject CHAR (CONT'D) before next
    const contd = document.createElement("div");
    contd.dataset.type = "character";
    contd.dataset.printInjected = "true";
    contd.textContent = baseName + " (CONT'D)";
    next.parentNode.insertBefore(contd, next);
    inserted.push(contd);
  }
  return inserted;
}

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

  // Industry-standard MORE/CONT'D pagination — inject just before print and
  // remove after, so the writer's source DOM never carries these markers.
  const moreInserted = injectMoreContd();

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
      moreInserted.forEach(el => el.remove());
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

