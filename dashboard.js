"use strict";
/* =============================================================================
 * BESTSCREEN PROJECT DASHBOARD
 *
 * The landing screen. Renders project & series cards, handles creation flow
 * (with template + logline), search, pin, archive. Calls openProject(id) to
 * launch into the editor.
 * ============================================================================= */

const Dashboard = (() => {

  function show() {
    document.getElementById("dashboard").style.display = "block";
    document.getElementById("editor-shell").style.display = "none";
    render();
  }
  function hide() {
    document.getElementById("dashboard").style.display = "none";
    document.getElementById("editor-shell").style.display = "";
  }

  function render() {
    const idx = Storage.readIndex();
    const projects = idx.projects;
    const series = idx.series;
    const root = document.getElementById("dashboard-body");
    const settings = idx.settings;

    const pinned = projects.filter(p => p.pinned);
    const others = projects.filter(p => !p.pinned)
      .sort((a,b) => (b.lastOpened || 0) - (a.lastOpened || 0));

    root.innerHTML = `
      <div class="dash-hero">
        <div>
          <h1>Welcome back${settings.author ? `, ${escapeHtml(settings.author.split(" ")[0])}` : ""}.</h1>
          <p class="muted">${projects.length === 0
            ? "Start your first screenplay below."
            : `${projects.length} project${projects.length===1?'':'s'} · ${series.length} series · ${todayCount()} words written today.`}</p>
        </div>
        <div class="dash-hero-actions">
          <button class="btn primary" id="dash-new"><svg class="ic"><use href="#i-plus"/></svg> New screenplay</button>
          <button class="btn" id="dash-new-series">+ Series</button>
          <button class="btn" id="dash-import">Import…</button>
          <button class="btn ghost" id="dash-settings"><svg class="ic"><use href="#i-help"/></svg> Settings</button>
        </div>
      </div>

      <div class="dash-search">
        <svg class="ic"><use href="#i-find"/></svg>
        <input id="dash-search-input" placeholder="Search across all projects…" />
        <span class="hint">Searches titles, loglines, and every line of every script.</span>
      </div>
      <div class="dash-search-results" id="dash-search-results"></div>

      ${series.length ? `
        <h2 class="dash-section">Series</h2>
        <div class="dash-series-row">
          ${series.map(s => renderSeriesCard(s, projects)).join("")}
        </div>
      ` : ""}

      ${pinned.length ? `
        <h2 class="dash-section">Pinned</h2>
        <div class="dash-grid">${pinned.map(renderProjectCard).join("")}</div>
      ` : ""}

      <h2 class="dash-section">${pinned.length ? "All projects" : "Your projects"}</h2>
      ${others.length === 0 && pinned.length === 0
        ? renderEmptyState()
        : `<div class="dash-grid">${others.map(renderProjectCard).join("")}</div>`}

      <div class="dash-streak-card">
        <h3>Writing streak</h3>
        <div class="dash-streak">${renderStreakHeatmap()}</div>
      </div>
    `;
    wire();
  }

  function renderProjectCard(p) {
    const subtitle = p.tagline ? escapeHtml(p.tagline) :
                     p.episode ? `Ep. ${escapeHtml(String(p.episode))}` :
                     `${TYPE_LABELS[p.type] || "Screenplay"}`;
    const pinIcon = p.pinned ? "★" : "☆";
    const status = p.status ? statusBadge(p.status) : "";
    const editedAgo = relTime(p.lastOpened || p.lastModified || 0);
    return `
      <div class="dash-card" data-id="${p.id}" style="--cover:${p.coverColor || '#b3261e'}">
        <button class="dash-pin" data-act="pin" data-id="${p.id}" title="${p.pinned?'Unpin':'Pin'}">${pinIcon}</button>
        <div class="dash-cover">
          <div class="dash-cover-letter">${escapeHtml((p.name || "?").slice(0,2).toUpperCase())}</div>
          ${status}
        </div>
        <div class="dash-card-body">
          <div class="dash-card-title">${escapeHtml(p.name || "Untitled")}</div>
          <div class="dash-card-sub">${subtitle}</div>
          <div class="dash-card-meta">
            <span>${editedAgo}</span>
          </div>
        </div>
        <div class="dash-card-actions">
          <button data-act="open"   data-id="${p.id}">Open</button>
          <button data-act="rename" data-id="${p.id}">Rename</button>
          <button data-act="export" data-id="${p.id}">Export</button>
          <button data-act="delete" data-id="${p.id}" class="danger">Delete</button>
        </div>
      </div>
    `;
  }

  function renderSeriesCard(s, projects) {
    const eps = projects.filter(p => p.seriesId === s.id)
                         .sort((a,b) => (a.episode||0) - (b.episode||0));
    const sBible = Storage.getSeriesBible ? Storage.getSeriesBible(s.id) : null;
    const sharedCount = (sBible?.characters?.length || 0) + (sBible?.locations?.length || 0);
    const sharedLine = sharedCount > 0
      ? `<div class="dash-series-shared" title="Shared in this series' bible">📚 ${sBible.characters.length} character${sBible.characters.length===1?'':'s'} · ${sBible.locations.length} location${sBible.locations.length===1?'':'s'} shared</div>`
      : "";
    return `
      <div class="dash-series" data-sid="${s.id}" style="--cover:${s.coverColor}">
        <div class="dash-series-head">
          <div class="dash-series-title">${escapeHtml(s.name)}</div>
          <div class="dash-series-sub">${TYPE_LABELS[s.type] || ""} · ${eps.length} episode${eps.length===1?'':'s'}</div>
          ${sharedLine}
        </div>
        <div class="dash-series-eps">
          ${eps.map(e => `
            <div class="dash-ep" data-id="${e.id}">
              <span class="dash-ep-num">${e.episode || "—"}</span>
              <span class="dash-ep-name">${escapeHtml(e.name)}</span>
            </div>
          `).join("")}
          <button class="dash-ep dash-ep-add" data-add-ep="${s.id}">+ Add episode</button>
        </div>
      </div>
    `;
  }

  function renderEmptyState() {
    return `
      <div class="dash-empty">
        <div class="dash-empty-art">✎</div>
        <h3>Your screenwriting studio is ready.</h3>
        <p style="margin-bottom:18px">Click <b>New screenplay</b> above to begin, then follow the natural flow:</p>
        <div class="dash-guide-steps">
          <div class="dash-guide-step"><span class="dash-guide-num">1</span><div><b>Write</b><br>Start in the Script tab. Type <kbd>INT.</kbd> or <kbd>EXT.</kbd> for scene headings, then write dialogue and action.</div></div>
          <div class="dash-guide-step"><span class="dash-guide-num">2</span><div><b>Structure</b><br>Switch to the Beat Board to see your scenes as cards. Drag them to restructure your story.</div></div>
          <div class="dash-guide-step"><span class="dash-guide-num">3</span><div><b>Characters</b><br>Open the Bible tab to flesh out backstories, relationships, and world rules.</div></div>
          <div class="dash-guide-step"><span class="dash-guide-num">4</span><div><b>Polish</b><br>Use Stats for pacing analysis, AI assist for rewrites, and Page View for final layout.</div></div>
        </div>
      </div>
    `;
  }

  function renderStreakHeatmap() {
    const streak = Storage.getStreak();
    const today = new Date();
    const cells = [];
    const totalDays = 105; // 15 columns × 7 rows
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0,10);
      const v = streak[k] || 0;
      const lvl = v === 0 ? 0 : v < 100 ? 1 : v < 500 ? 2 : v < 1000 ? 3 : 4;
      cells.push(`<div class="streak-cell streak-l${lvl}" title="${k}: ${v} words"></div>`);
    }
    return `<div class="streak-grid">${cells.join("")}</div>
      <div class="streak-legend">
        <span>Less</span>
        <span class="streak-cell streak-l0"></span>
        <span class="streak-cell streak-l1"></span>
        <span class="streak-cell streak-l2"></span>
        <span class="streak-cell streak-l3"></span>
        <span class="streak-cell streak-l4"></span>
        <span>More</span>
      </div>`;
  }

  function todayCount() {
    const k = new Date().toISOString().slice(0,10);
    return (Storage.getStreak()[k] || 0).toLocaleString();
  }

  // ------------ Wire handlers ------------
  function wire() {
    document.getElementById("dash-new")?.addEventListener("click", openCreateModal);
    document.getElementById("dash-new-series")?.addEventListener("click", openSeriesModal);
    document.getElementById("dash-import")?.addEventListener("click", importBundle);
    document.getElementById("dash-settings")?.addEventListener("click", openSettings);

    // Search
    const si = document.getElementById("dash-search-input");
    let searchTimer;
    si?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(si.value), 120);
    });

    // Cards
    document.querySelectorAll(".dash-card").forEach(card => {
      card.addEventListener("click", e => {
        if (e.target.closest("[data-act]")) return;
        const id = card.dataset.id;
        if (id) openProject(id);
      });
    });
    document.querySelectorAll("[data-act]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const act = btn.dataset.act;
        const id  = btn.dataset.id;
        if (act === "open")   openProject(id);
        if (act === "pin")    togglePin(id);
        if (act === "rename") renameProject(id);
        if (act === "export") exportProject(id);
        if (act === "delete") deleteProject(id);
      });
    });
    // Series episodes
    document.querySelectorAll(".dash-ep[data-id]").forEach(el => {
      el.addEventListener("click", () => openProject(el.dataset.id));
    });
    document.querySelectorAll("[data-add-ep]").forEach(btn => {
      btn.addEventListener("click", () => addEpisode(btn.dataset.addEp));
    });
  }

  function runSearch(q) {
    const root = document.getElementById("dash-search-results");
    if (!q || q.length < 2) { root.innerHTML = ""; return; }
    const res = Storage.search(q);
    if (res.length === 0) {
      root.innerHTML = `<div class="dash-search-empty">No matches.</div>`;
      return;
    }
    // Group by project
    const byProj = new Map();
    res.forEach(r => {
      if (!byProj.has(r.projectId)) byProj.set(r.projectId, []);
      byProj.get(r.projectId).push(r);
    });
    let html = "";
    byProj.forEach((rows, pid) => {
      const p = rows[0].project;
      html += `<div class="dash-result"><div class="dash-result-head">
        <div class="dash-result-title">${escapeHtml(p.name)}</div>
        <button class="btn small" data-open-result="${pid}">Open</button>
      </div>`;
      rows.slice(0,8).forEach(r => {
        html += `<div class="dash-result-line" data-open-result-line="${pid}|${r.lineNo||0}">
          ${r.lineNo ? `<span class="dash-line-no">${r.lineNo}</span>` : `<span class="dash-line-no">★</span>`}
          <span class="dash-line-text">${escapeHtml(r.snippet)}</span>
        </div>`;
      });
      if (rows.length > 8) html += `<div class="dash-result-more">+ ${rows.length-8} more matches</div>`;
      html += `</div>`;
    });
    root.innerHTML = html;
    root.querySelectorAll("[data-open-result]").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      openProject(b.dataset.openResult);
    }));
    root.querySelectorAll("[data-open-result-line]").forEach(el => el.addEventListener("click", () => {
      const [pid, ln] = el.dataset.openResultLine.split("|");
      openProject(pid, { lineNo: parseInt(ln,10) });
    }));
  }

  // ------------ Create / open / manage ------------

  function openCreateModal() {
    const m = document.getElementById("modal-newproj");
    m.classList.add("open");
    // Reset
    document.getElementById("np-name").value = "";
    document.getElementById("np-logline").value = "";
    document.getElementById("np-type").value = "feature";
    document.getElementById("np-template").value = "";
    document.getElementById("np-series").value = "";
    populateSeriesSelect();
    populateTemplateOptions();
    document.getElementById("np-name").focus();
  }

  function populateSeriesSelect() {
    const sel = document.getElementById("np-series");
    const series = Storage.listSeries();
    sel.innerHTML = `<option value="">— Standalone —</option>` +
      series.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  }
  function populateTemplateOptions() {
    const sel = document.getElementById("np-template");
    sel.innerHTML = `<option value="">— No template (blank) —</option>` +
      Templates.list.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  }

  function createFromModal() {
    const name = document.getElementById("np-name").value.trim() || "Untitled";
    const type = document.getElementById("np-type").value;
    const tmpl = document.getElementById("np-template").value;
    const log  = document.getElementById("np-logline").value.trim();
    const sid  = document.getElementById("np-series").value || null;
    const color = document.querySelector(".np-color.selected")?.dataset.color || "#b3261e";
    let episode = null;
    if (sid) {
      const eps = Storage.listProjects().filter(p => p.seriesId === sid);
      episode = eps.length + 1;
    }
    const id = Storage.createProject({
      name, type, seriesId: sid, episode, template: tmpl || null,
      logline: log, coverColor: color
    });
    // If template chosen, seed beatSections in meta as ghost beats
    if (tmpl) {
      const t = Templates.get(tmpl);
      const meta = Storage.getMeta(id);
      meta.template = tmpl;
      meta.beatTargets = t.beats.map(b => ({ id: b.id, name: b.name, at: b.at, desc: b.desc || "" }));
      Storage.setMeta(id, meta);
    }
    document.getElementById("modal-newproj").classList.remove("open");
    openProject(id);
  }

  function openSeriesModal() {
    const m = document.getElementById("modal-newseries");
    m.classList.add("open");
    document.getElementById("ns-name").value = "";
    document.getElementById("ns-name").focus();
  }
  function createSeries() {
    const name = document.getElementById("ns-name").value.trim();
    const type = document.getElementById("ns-type").value;
    if (!name) return;
    Storage.createSeries({ name, type });
    document.getElementById("modal-newseries").classList.remove("open");
    render();
  }

  async function addEpisode(seriesId) {
    const eps = Storage.listProjects().filter(p => p.seriesId === seriesId);
    const name = await (window.bsPrompt || promptFallback)({
      title: `Add episode ${eps.length+1}`, label: "Title",
      placeholder: "Pilot", defaultValue: `Episode ${eps.length+1}`
    });
    if (!name) return;
    const s = Storage.listSeries().find(x => x.id === seriesId);
    const id = Storage.createProject({
      name, type: s.type, seriesId, episode: eps.length+1,
      coverColor: s.coverColor
    });
    openProject(id);
  }
  // Fallback so dashboard doesn't break if loaded before app.js (defensive)
  function promptFallback(opts) { return Promise.resolve(prompt(opts.title, opts.defaultValue || "")); }
  function confirmFallback(opts) { return Promise.resolve(confirm(opts.body || opts.title || "OK?")); }

  function openProject(id, opts={}) {
    Storage.setLastOpened(id);
    hide();
    window.location.hash = "#/p/" + id;
    if (typeof App !== "undefined") App.loadProject(id, opts);
  }

  function togglePin(id) {
    const p = Storage.getProject(id);
    if (p) Storage.updateProject(id, { pinned: !p.pinned });
    render();
  }

  async function renameProject(id) {
    const p = Storage.getProject(id);
    if (!p) return;
    const name = await (window.bsPrompt || promptFallback)({
      title: "Rename project", label: "Title", defaultValue: p.name
    });
    if (!name) return;
    Storage.updateProject(id, { name });
    const m = Storage.getMeta(id);
    m.titleMeta = m.titleMeta || {};
    m.titleMeta.title = name;
    Storage.setMeta(id, m);
    render();
  }

  async function deleteProject(id) {
    const p = Storage.getProject(id);
    if (!p) return;
    const ok = await (window.bsConfirm || confirmFallback)({
      title: `Delete "${p.name}"?`,
      body: "This can't be undone. Use Export first if you want a backup.",
      okText: "Delete forever", danger: true
    });
    if (!ok) return;
    Storage.deleteProject(id);
    render();
  }

  function exportProject(id) {
    const bundle = Storage.exportProject(id);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (bundle.project.name || "project") + ".bestscreen.json";
    a.click();
  }

  function importBundle() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,.bestscreen,.bestscreen.json,.fountain,.spmd,.txt,.fdx";
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const txt = await f.text();
        const ext = f.name.toLowerCase().split(".").pop();

        // 1. Bestscreen project bundle (json)
        if (ext === "json" || f.name.endsWith(".bestscreen.json")) {
          const data = JSON.parse(txt);
          if (data.project && data.doc !== undefined) {
            const id = Storage.importProject(data);
            render();
            if (await (window.bsConfirm || confirmFallback)({ title:`Imported "${data.project.name}"`, body:"Open now?", okText:"Open" })) openProject(id);
            return;
          }
          // Otherwise fall through and treat as raw text
        }

        // 2. Final Draft .fdx — convert to Fountain
        let fountain = txt;
        if (ext === "fdx" || /^\s*<\?xml/.test(txt)) {
          fountain = fdxToFountainStandalone(txt);
        }

        // 3. Raw Fountain / text — create a new project from it
        const title = extractTitleFromFountain(fountain) || stripExtension(f.name);
        const id = Storage.createProject({
          name: title, type: "feature", template: null,
          logline: "", coverColor: pickCoverColor()
        });
        Storage.setDoc(id, fountain);
        // Update project name if the doc had a title
        Storage.updateProject(id, { name: title, lastModified: Date.now() });
        render();
        if (await (window.bsConfirm || confirmFallback)({ title:`Imported "${title}"`, body:"Open now?", okText:"Open" })) openProject(id);
      } catch (e) {
        await (window.bsConfirm || confirmFallback)({ title:"Import failed", body: e.message, okText:"OK", cancelText:"" });
      }
    };
    inp.click();
  }

  function extractTitleFromFountain(src) {
    const m = src.match(/^Title:\s*(.+)$/m);
    return m ? m[1].trim() : null;
  }
  function stripExtension(name) { return name.replace(/\.[^.]+$/, ""); }
  function pickCoverColor() {
    const colors = ["#b3261e","#dfa116","#4f8a3a","#3878b8","#7a55b8","#36989d","#c2486d","#3a3a3a"];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Standalone FDX→Fountain so dashboard.js doesn't depend on app.js being loaded
  function fdxToFountainStandalone(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    let out = "";

    // ---- Title page (structured) ----
    const titlePage = doc.querySelector("TitlePage");
    if (titlePage) {
      const tpParas = titlePage.querySelectorAll("Content > Paragraph");
      const tpMap = {};
      tpParas.forEach(p => {
        const type = (p.getAttribute("Type") || "").trim();
        const texts = Array.from(p.querySelectorAll("Text"));
        const val = texts.map(t => (t.textContent || "").trim()).filter(Boolean).join(" ");
        if (!val) return;
        if (!tpMap[type]) tpMap[type] = val;
      });
      if (tpMap["Title"] || tpMap[""])   out += `Title: ${tpMap["Title"] || tpMap[""]}\n`;
      if (tpMap["Credit"])              out += `Credit: ${tpMap["Credit"]}\n`;
      if (tpMap["Author"])              out += `Author: ${tpMap["Author"]}\n`;
      if (tpMap["Source"])              out += `Source: ${tpMap["Source"]}\n`;
      if (tpMap["Draft date"])          out += `Draft date: ${tpMap["Draft date"]}\n`;
      if (tpMap["Contact"])             out += `Contact: ${tpMap["Contact"]}\n`;
      if (!out) {
        const rawTexts = Array.from(titlePage.querySelectorAll("Paragraph Text"))
          .map(t => (t.textContent || "").trim()).filter(Boolean);
        if (rawTexts.length) {
          out += `Title: ${rawTexts[0]}\n`;
          if (rawTexts[1]) out += `Credit: ${rawTexts[1]}\n`;
          if (rawTexts[2]) out += `Author: ${rawTexts[2]}\n`;
        }
      }
      if (out) out += "\n";
    }

    // Helper: extract text from a Paragraph
    function paraText(p) {
      const texts = Array.from(p.querySelectorAll(":scope > Text"));
      if (texts.length === 0) return (p.textContent || "").trim();
      return texts.map(t => (t.textContent || "")).join("").trim();
    }
    function stripContd(name) {
      return name.replace(/\s*\(CONT'?D\)\s*$/i, "").trim();
    }

    const content = doc.querySelector("FinalDraft > Content");
    if (!content) return out;
    const topChildren = Array.from(content.children);
    let prevType = "";

    for (let ci = 0; ci < topChildren.length; ci++) {
      const node = topChildren[ci];

      if (node.tagName === "DualDialogue") {
        const ddParas = Array.from(node.querySelectorAll("Paragraph"));
        let charCount = 0;
        for (let di = 0; di < ddParas.length; di++) {
          const p = ddParas[di];
          if (p.closest("TitlePage")) continue;
          const type = p.getAttribute("Type") || "Action";
          let text = paraText(p);
          if (!text && type !== "Action") continue;
          if (type === "Character") {
            charCount++;
            text = stripContd(text);
            if (prevType && prevType !== "blank" && !out.endsWith("\n\n")) out += "\n";
            out += charCount === 2 ? text + " ^\n" : text + "\n";
            prevType = "Character";
          } else if (type === "Dialogue") {
            if (/^\(MORE\)$/i.test(text.trim())) continue;
            out += text + "\n"; prevType = "Dialogue";
          } else if (type === "Parenthetical") {
            out += text + "\n"; prevType = "Parenthetical";
          } else {
            out += text + "\n\n"; prevType = type;
          }
        }
        if (!out.endsWith("\n\n")) out += "\n";
        continue;
      }

      if (node.tagName !== "Paragraph") continue;
      const p = node;
      if (p.closest("TitlePage")) continue;
      const type = p.getAttribute("Type") || "Action";
      let text = paraText(p);

      if (!text) {
        if (prevType !== "blank" && !out.endsWith("\n\n")) out += "\n";
        prevType = "blank"; continue;
      }
      if (/^\(MORE\)$/i.test(text.trim())) continue;

      switch (type) {
        case "Scene Heading":
          if (prevType && prevType !== "blank" && !out.endsWith("\n\n")) out += "\n";
          out += text + "\n\n"; break;
        case "Action":        out += text + "\n\n"; break;
        case "Character":
          text = stripContd(text);
          if (prevType && prevType !== "blank" && !out.endsWith("\n\n")) out += "\n";
          out += text + "\n"; break;
        case "Dialogue":      out += text + "\n"; break;
        case "Parenthetical": out += text + "\n"; break;
        case "Transition":
          if (prevType && prevType !== "blank" && !out.endsWith("\n\n")) out += "\n";
          out += text + "\n\n"; break;
        default:              out += text + "\n\n";
      }
      prevType = type;
    }
    return out.replace(/\n{3,}/g, "\n\n");
  }

  function openSettings() {
    const m = document.getElementById("modal-settings");
    const s = Storage.getSettings();
    document.getElementById("st-author").value = s.author || "";
    document.getElementById("st-ai-key").value = s.ai?.apiKey || "";
    document.getElementById("st-ai-provider").value = s.ai?.provider || "anthropic";
    document.getElementById("st-ai-model").value = s.ai?.model || "";
    m.classList.add("open");
  }

  // ------------ Utility ------------
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }
  function relTime(ts) {
    if (!ts) return "never opened";
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s/60) + "m ago";
    if (s < 86400) return Math.floor(s/3600) + "h ago";
    if (s < 86400*7) return Math.floor(s/86400) + "d ago";
    return new Date(ts).toLocaleDateString();
  }
  function statusBadge(s) {
    const labels = { idea:"Idea", outline:"Outlining", drafting:"Drafting", rewriting:"Rewriting", polishing:"Polishing", final:"Final" };
    return `<span class="dash-status dash-status-${s}">${labels[s] || s}</span>`;
  }

  const TYPE_LABELS = {
    "feature":   "Feature film",
    "tv-hour":   "1-hour TV",
    "tv-half":   "Half-hour TV",
    "short":     "Short film",
    "stage":     "Stage play",
    "comic":     "Comic / graphic novel",
    "radio":     "Radio play",
    "game":      "Game narrative",
  };

  return { show, hide, render, openProject, createFromModal, createSeries };
})();
