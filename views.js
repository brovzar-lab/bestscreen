"use strict";
/* views.js — beat board, cards corkboard, stats dashboard (with SVG charts), story timeline. */

// Selection set shared between Beat Board and Cards view. Tracks scene line
// indices so checking a card in one view persists when switching to the
// other. Bulk-AI fill operates on this set.
const _selectedScenes = new Set();

function _renderMultiSelectToolbar(scopeId) {
  const n = _selectedScenes.size;
  return `
    <div class="bs-multitools" id="${scopeId}">
      <span class="bs-multi-count">${n} scene${n===1?'':'s'} selected</span>
      <button class="btn small" data-act="select-all">Select all</button>
      <button class="btn small" data-act="clear-sel" ${n===0?'disabled':''}>Clear</button>
      <button class="btn primary small" data-act="ai-bulk" ${n===0?'disabled':''}>✨ AI fill ${n ? '('+n+')' : 'selected'}</button>
    </div>
  `;
}
function _wireMultiSelectToolbar(scope, opts) {
  scope.querySelector('[data-act="select-all"]')?.addEventListener("click", () => {
    opts.allLineIdxs().forEach(i => _selectedScenes.add(i));
    opts.rerender();
  });
  scope.querySelector('[data-act="clear-sel"]')?.addEventListener("click", () => {
    _selectedScenes.clear();
    opts.rerender();
  });
  scope.querySelector('[data-act="ai-bulk"]')?.addEventListener("click", () => {
    if (typeof aiFillBeatSynopsesBulk !== "function") return;
    aiFillBeatSynopsesBulk(Array.from(_selectedScenes));
  });
}
function _updateToolbarCount(scope) {
  if (!scope) return;
  const n = _selectedScenes.size;
  scope.querySelector(".bs-multi-count").textContent = `${n} scene${n===1?'':'s'} selected`;
  const clearBtn = scope.querySelector('[data-act="clear-sel"]');
  const aiBtn    = scope.querySelector('[data-act="ai-bulk"]');
  if (clearBtn) clearBtn.disabled = n === 0;
  if (aiBtn) { aiBtn.disabled = n === 0; aiBtn.textContent = `✨ AI fill ${n ? '('+n+')' : 'selected'}`; }
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
      cur.scenes.push({
        lineIndex: i,
        slug: l.textContent.replace(/^\./,"").trim(),
        beatColor: l.dataset.color || "",          // visual color tag
        beatTag:   l.dataset.beat || "",           // template-beat id (e.g. "catalyst")
      });
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

  // Prepend the multi-select toolbar (shared with Cards view via _selectedScenes)
  const toolbarHtml = _renderMultiSelectToolbar("bs-toolbar-beats");
  html = toolbarHtml + html;

  // When a template is active, build a beat-tag selector so users can assign
  // scenes to template beats. The selector includes "— none —" plus all beats.
  const template = appState.template ? Templates.get(appState.template) : null;
  const tagOptions = template
    ? `<option value="">— no beat tag —</option>` +
      template.beats.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("")
    : "";

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
          const beatName = template ? (template.beats.find(b => b.id === s.beatTag)?.name) : null;
          const isSelected = _selectedScenes.has(s.lineIndex);
          return `<div class="beat-card beat-${color}${isSelected?' bc-multi-selected':''}" draggable="true" data-line="${s.lineIndex}">
            <div class="bc-card-head">
              <label class="bc-multi" title="Select for bulk AI"><input type="checkbox" class="bc-select" data-line="${s.lineIndex}" ${isSelected?'checked':''} /></label>
              <div class="bc-colors">${["red","amber","green","blue","violet","gray"].map(c => `<div class="bc-color ${color===c?'selected':''}" data-color="${c}" style="background:${beatColorCSS(c)}" title="${c}"></div>`).join("")}</div>
              <button class="bc-ai" data-line="${s.lineIndex}" title="AI: fill in this scene's synopsis based on the script + ${beatName ? "the " + beatName + " beat" : "context"}">✨</button>
              <button class="bc-zoom" data-zoom="${s.lineIndex}" title="Scene Zoom (BMOC analyze + rewrite)">🔍</button>
            </div>
            <div class="bc-slug">${escapeHtml(s.slug)}</div>
            <textarea class="bc-syn" data-line="${s.lineIndex}" placeholder="Beat / synopsis…">${escapeHtml(syn)}</textarea>
            ${template ? `<select class="bc-tag" data-line="${s.lineIndex}" title="Assign template beat">${tagOptions.replace(`value="${s.beatTag}"`, `value="${s.beatTag}" selected`)}</select>` : ""}
            <div class="bc-foot"><span>${stats.words} words</span><span>${stats.characters.size} char</span>${beatName ? `<span class="bc-beat-tag">${escapeHtml(beatName)}</span>` : ""}</div>
          </div>`;
        }).join("")}
      </div>
    </div>
  `).join("");
  board.innerHTML = html;

  // Wire
  // Wire the multi-select toolbar
  const toolbar = $("#bs-toolbar-beats", board);
  if (toolbar) _wireMultiSelectToolbar(toolbar, {
    allLineIdxs: () => Array.from(board.querySelectorAll(".beat-card[data-line]")).map(c => parseInt(c.dataset.line, 10)),
    rerender: renderBeatBoard,
  });
  // Per-card checkboxes
  $$(".bc-select", board).forEach(cb => cb.addEventListener("change", e => {
    e.stopPropagation();
    const idx = parseInt(cb.dataset.line, 10);
    if (cb.checked) _selectedScenes.add(idx); else _selectedScenes.delete(idx);
    cb.closest(".beat-card")?.classList.toggle("bc-multi-selected", cb.checked);
    _updateToolbarCount(toolbar);
  }));

  $$(".beat-card", board).forEach(card => {
    card.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", card.dataset.line); card.classList.add("dragging"); });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dblclick", () => navigateToLine(parseInt(card.dataset.line,10), null));
    $$(".bc-color", card).forEach(d => d.addEventListener("click", e => {
      e.stopPropagation();
      const lineIdx = parseInt(card.dataset.line, 10);
      const line = $$("#editor > div")[lineIdx];
      if (line) line.dataset.color = d.dataset.color;
      setDirty(); renderBeatBoard();
    }));
    const tagSel = card.querySelector(".bc-tag");
    if (tagSel) tagSel.addEventListener("change", e => {
      e.stopPropagation();
      const lineIdx = parseInt(card.dataset.line, 10);
      const line = $$("#editor > div")[lineIdx];
      if (line) {
        if (tagSel.value) line.dataset.beat = tagSel.value;
        else delete line.dataset.beat;
      }
      setDirty(); renderBeatBoard();
    });
    const aiBtn = card.querySelector(".bc-ai");
    if (aiBtn) aiBtn.addEventListener("click", async e => {
      e.stopPropagation();
      await aiFillBeatSynopsis(parseInt(card.dataset.line, 10));
    });
    const zoomBtn = card.querySelector(".bc-zoom");
    if (zoomBtn) zoomBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (window.SceneZoom) window.SceneZoom.open(parseInt(zoomBtn.dataset.zoom, 10));
    });
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
  const toolbarHtml = `<div class="cards-toolbar-wrap" style="grid-column:1/-1">${_renderMultiSelectToolbar("bs-toolbar-cards")}</div>`;
  root.innerHTML = toolbarHtml + scenes.map((s,i) => {
    const isSelected = _selectedScenes.has(s.lineIndex);
    return `
    <div class="idx-card card-item${isSelected?' ic-multi-selected':''}" draggable="true" data-line="${s.lineIndex}">
      <div class="ic-head">
        <label class="ic-multi" title="Select for bulk AI"><input type="checkbox" class="ic-select" data-line="${s.lineIndex}" ${isSelected?'checked':''} /></label>
        <div class="ic-num">${i+1}.</div>
        <button class="ic-ai" data-line="${s.lineIndex}" title="AI: fill synopsis from script context">✨</button>
        <button class="ic-zoom" data-zoom="${s.lineIndex}" title="Scene Zoom (BMOC analyze + rewrite)">🔍</button>
      </div>
      <div class="ic-slug">${escapeHtml(s.slug)}</div>
      <textarea class="ic-syn" data-line="${s.lineIndex}" placeholder="What happens?">${escapeHtml(synopsisAfter(s.lineIndex))}</textarea>
      <div class="ic-foot"><span>${s.words} w · ${s.characters.size} char</span><span>${Array.from(s.characters).slice(0,3).join(", ")}</span></div>
    </div>`;
  }).join("");
  const cardsToolbar = $("#bs-toolbar-cards");
  if (cardsToolbar) _wireMultiSelectToolbar(cardsToolbar, {
    allLineIdxs: () => Array.from(root.querySelectorAll(".idx-card[data-line]")).map(c => parseInt(c.dataset.line, 10)),
    rerender: renderCards,
  });
  $$(".ic-select", root).forEach(cb => cb.addEventListener("change", e => {
    e.stopPropagation();
    const idx = parseInt(cb.dataset.line, 10);
    if (cb.checked) _selectedScenes.add(idx); else _selectedScenes.delete(idx);
    cb.closest(".idx-card")?.classList.toggle("ic-multi-selected", cb.checked);
    _updateToolbarCount(cardsToolbar);
  }));
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
    const aiBtn = card.querySelector(".ic-ai");
    if (aiBtn) aiBtn.addEventListener("click", async e => {
      e.stopPropagation();
      await aiFillBeatSynopsis(parseInt(card.dataset.line, 10));
    });
    const zoomBtn = card.querySelector(".ic-zoom");
    if (zoomBtn) zoomBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (window.SceneZoom) window.SceneZoom.open(parseInt(zoomBtn.dataset.zoom, 10));
    });
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
      <h3>Plot threads — timeline</h3>
      <div class="sc-sub">Each row is one plot thread; each column is one scene in script order. A filled cell means that thread is on-screen in that scene. Use the Inspector to tag scenes with threads.</div>
      ${svgPlotThreadRibbon(scenes)}
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

function svgPlotThreadRibbon(scenes) {
  if (scenes.length === 0) return `<div class="muted">No scenes yet.</div>`;
  const tagged = scenes.some(s => s.threadIds && s.threadIds.length);
  if (!tagged) return `<div class="muted" style="padding:16px 0">No threads tagged yet. Click a scene → Inspector → Plot threads to tag.</div>`;

  const w = 900, rowH = 28, pad = 100, gap = 6;
  const h = PLOT_THREADS.length * rowH + 30;
  const cellW = Math.max(4, (w - pad - 16) / scenes.length);

  let svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMin meet" style="height:${h}px">`;
  // Row backgrounds + labels
  PLOT_THREADS.forEach((thread, ri) => {
    const y = ri * rowH + 16;
    svg += `<rect x="${pad}" y="${y - rowH/2 + 4}" width="${w - pad - 16}" height="${rowH - 8}" fill="var(--line-2)" opacity="0.25" rx="3"/>`;
    svg += `<text x="${pad - 10}" y="${y + 4}" text-anchor="end" font-family="var(--font-screen)" font-size="11" font-weight="700" fill="${thread.css}">${thread.label}</text>`;
  });
  // Cells
  PLOT_THREADS.forEach((thread, ri) => {
    const y = ri * rowH + 16;
    // Collect runs of consecutive scenes with this thread, so we can draw connectors
    let runStart = null;
    scenes.forEach((s, ci) => {
      const present = (s.threadIds || []).includes(thread.id);
      const x = pad + ci * cellW;
      if (present) {
        if (runStart === null) runStart = ci;
        svg += `<rect x="${x + 1}" y="${y - rowH/2 + 8}" width="${Math.max(2, cellW - 2)}" height="${rowH - 16}" fill="${thread.css}" rx="2">`;
        svg += `<title>Scene ${ci+1}: ${escapeHtml(s.slug)}</title></rect>`;
      } else if (runStart !== null) {
        // Draw a thin connector line back to runStart so the thread "weaves"
        const startX = pad + runStart * cellW + cellW/2;
        const endX = pad + (ci - 1) * cellW + cellW/2;
        if (endX > startX) {
          svg += `<line x1="${startX}" y1="${y}" x2="${endX}" y2="${y}" stroke="${thread.css}" stroke-width="2" opacity="0.6"/>`;
        }
        runStart = null;
      }
    });
    if (runStart !== null) {
      const startX = pad + runStart * cellW + cellW/2;
      const endX = pad + (scenes.length - 1) * cellW + cellW/2;
      if (endX > startX) {
        svg += `<line x1="${startX}" y1="${y}" x2="${endX}" y2="${y}" stroke="${thread.css}" stroke-width="2" opacity="0.6"/>`;
      }
    }
  });
  // X-axis scene labels
  scenes.forEach((s, ci) => {
    if ((ci+1) % 5 === 0 || ci === 0 || ci === scenes.length - 1) {
      const x = pad + ci * cellW + cellW/2;
      svg += `<text x="${x}" y="${h - 6}" text-anchor="middle" font-size="9" fill="var(--muted)">${ci+1}</text>`;
    }
  });
  svg += `</svg>`;
  return svg;
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

