"use strict";
/* =============================================================================
 * BESTSCREEN BIBLE
 *
 * Per-project (or series-shared) story document. Two main components:
 *
 *   - Character cards: backstory, voice, want / need / flaw, traits, secrets.
 *   - Relationships: typed edges (love / hates / family / mentor / rival),
 *     visualized as a tiny force-directed graph in SVG.
 *   - Locations & World rules: free-form fields.
 *
 * Bible data lives at Storage.getBible(projectId). For series-shared bibles
 * we use the series ID's first project as the canonical bible (simple model).
 * ============================================================================= */

const Bible = (() => {
  let projectId = null;
  let bible = null;
  let seriesId = null;
  let seriesBible = null;  // null when the project isn't part of a series

  function open(pid) {
    projectId = pid;
    bible = Storage.getBible(pid);
    const project = Storage.getProject(pid);
    seriesId = project?.seriesId || null;
    seriesBible = seriesId ? Storage.getSeriesBible(seriesId) : null;
    document.getElementById("view-bible").classList.add("active");
    document.querySelectorAll(".view-tab").forEach(t => t.classList.toggle("active", t.dataset.view === "bible"));
    document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === "view-bible"));
    render();
  }

  function save() { Storage.setBible(projectId, bible); }
  function saveSeries() { if (seriesId && seriesBible) Storage.setSeriesBible(seriesId, seriesBible); }
  function saveStore(source) { if (source === "series") saveSeries(); else save(); }
  function hasSeries() { return !!seriesBible; }

  // Returns characters merged across the series bible and this episode's bible.
  // Each returned entry is a shallow copy with a `_source` tag — mutations on
  // the copy will not propagate; use findCharacter() to mutate the live record.
  function allCharacters() {
    if (!seriesBible) return (bible.characters || []).map(c => ({ ...c, _source: "episode" }));
    const out = (seriesBible.characters || []).map(c => ({ ...c, _source: "series" }));
    (bible.characters || []).forEach(c => {
      const idx = out.findIndex(x => x.id === c.id || x.name.toUpperCase() === c.name.toUpperCase());
      const tagged = { ...c, _source: "episode" };
      if (idx >= 0) out[idx] = tagged; else out.push(tagged);
    });
    return out;
  }
  function allLocations() {
    if (!seriesBible) return (bible.locations || []).map(l => ({ ...l, _source: "episode" }));
    const out = (seriesBible.locations || []).map(l => ({ ...l, _source: "series" }));
    (bible.locations || []).forEach(l => {
      const idx = out.findIndex(x => x.id === l.id || x.name.toUpperCase() === l.name.toUpperCase());
      const tagged = { ...l, _source: "episode" };
      if (idx >= 0) out[idx] = tagged; else out.push(tagged);
    });
    return out;
  }
  function findCharacter(id) {
    let c = (bible.characters || []).find(x => x.id === id);
    if (c) return { char: c, source: "episode" };
    if (seriesBible) {
      c = (seriesBible.characters || []).find(x => x.id === id);
      if (c) return { char: c, source: "series" };
    }
    return null;
  }
  function findLocation(id) {
    let l = (bible.locations || []).find(x => x.id === id);
    if (l) return { loc: l, source: "episode" };
    if (seriesBible) {
      l = (seriesBible.locations || []).find(x => x.id === id);
      if (l) return { loc: l, source: "series" };
    }
    return null;
  }
  function promoteCharacter(id) {
    if (!seriesBible) return false;
    const idx = bible.characters.findIndex(x => x.id === id);
    if (idx < 0) return false;
    const c = bible.characters[idx];
    const dupIdx = seriesBible.characters.findIndex(x => x.name.toUpperCase() === c.name.toUpperCase() && x.id !== c.id);
    if (dupIdx >= 0) seriesBible.characters[dupIdx] = c; else seriesBible.characters.push(c);
    bible.characters.splice(idx, 1);
    save(); saveSeries();
    return true;
  }
  function demoteCharacter(id) {
    if (!seriesBible) return false;
    const idx = seriesBible.characters.findIndex(x => x.id === id);
    if (idx < 0) return false;
    const c = seriesBible.characters[idx];
    const dupIdx = bible.characters.findIndex(x => x.name.toUpperCase() === c.name.toUpperCase() && x.id !== c.id);
    if (dupIdx >= 0) bible.characters[dupIdx] = c; else bible.characters.push(c);
    seriesBible.characters.splice(idx, 1);
    save(); saveSeries();
    return true;
  }
  function promoteLocation(id) {
    if (!seriesBible) return false;
    const idx = bible.locations.findIndex(x => x.id === id);
    if (idx < 0) return false;
    const l = bible.locations[idx];
    const dupIdx = seriesBible.locations.findIndex(x => x.name.toUpperCase() === l.name.toUpperCase() && x.id !== l.id);
    if (dupIdx >= 0) seriesBible.locations[dupIdx] = l; else seriesBible.locations.push(l);
    bible.locations.splice(idx, 1);
    save(); saveSeries();
    return true;
  }
  function demoteLocation(id) {
    if (!seriesBible) return false;
    const idx = seriesBible.locations.findIndex(x => x.id === id);
    if (idx < 0) return false;
    const l = seriesBible.locations[idx];
    const dupIdx = bible.locations.findIndex(x => x.name.toUpperCase() === l.name.toUpperCase() && x.id !== l.id);
    if (dupIdx >= 0) bible.locations[dupIdx] = l; else bible.locations.push(l);
    seriesBible.locations.splice(idx, 1);
    save(); saveSeries();
    return true;
  }

  function render() {
    const root = document.getElementById("view-bible");
    const seriesInfo = seriesId ? Storage.getSeries(seriesId) : null;
    const seriesLabel = seriesInfo
      ? `<span class="bib-series-label" title="This project is part of a series — entries marked Series are shared across every episode.">📚 ${escapeHtml(seriesInfo.name)}</span>`
      : "";
    root.innerHTML = `
      <div class="bible-toolbar">
        <div class="bible-tabs">
          <button class="bibtab active" data-tab="characters">Characters <span class="cnt">${allCharacters().length}</span></button>
          <button class="bibtab" data-tab="relationships">Relationships</button>
          <button class="bibtab" data-tab="arcs">Arcs</button>
          <button class="bibtab" data-tab="locations">Locations <span class="cnt">${allLocations().length}</span></button>
          <button class="bibtab" data-tab="rules">World rules</button>
        </div>
        ${seriesLabel}
        <div class="grow"></div>
        <button class="btn primary" id="bib-add">+ Add</button>
      </div>
      <div class="bible-body" id="bible-body"></div>
    `;
    document.querySelectorAll(".bibtab").forEach(b => b.addEventListener("click", () => {
      document.querySelectorAll(".bibtab").forEach(x => x.classList.toggle("active", x === b));
      renderTab(b.dataset.tab);
    }));
    document.getElementById("bib-add").addEventListener("click", () => {
      const tab = document.querySelector(".bibtab.active").dataset.tab;
      addEntry(tab);
    });
    renderTab("characters");
  }

  function renderTab(tab) {
    const body = document.getElementById("bible-body");
    if (tab === "characters") body.innerHTML = renderCharacters();
    else if (tab === "relationships") body.innerHTML = renderRelationships();
    else if (tab === "arcs") body.innerHTML = renderArcs();
    else if (tab === "locations") body.innerHTML = renderLocations();
    else if (tab === "rules") body.innerHTML = renderRules();
    wireCharacters();
    wireArcs();
    wireLocations();
    wireRules();
    const addBtn = document.getElementById("bib-add");
    if (addBtn) addBtn.style.display = (tab === "arcs") ? "none" : "";
    if (tab === "relationships") setTimeout(drawRelationshipGraph, 50);
  }

  // ---------- Characters ----------
  function ensureCharacter(name) {
    const nameUp = (name || "").toUpperCase();
    let c = bible.characters.find(x => x.name.toUpperCase() === nameUp);
    if (c) return c;
    if (seriesBible) {
      c = seriesBible.characters.find(x => x.name.toUpperCase() === nameUp);
      if (c) return c;
    }
    c = makeCharacter(name);
    bible.characters.push(c);
    save();
    return c;
  }
  function makeCharacter(name) {
    return {
      id: Storage.uid(),
      name: (name || "New Character").toUpperCase(),
      role: "",
      age: "",
      physical: "",
      backstory: "",
      voice: "",
      want: "",
      need: "",
      flaw: "",
      traits: "",
      secrets: "",
      arc: [],  // [{ scene: 0, kind: "want|need|flaw|change", note: "" }]
      avatar: defaultAvatar(name),
    };
  }
  function defaultAvatar(name) {
    const palette = ["#cf3a37","#dfa116","#4f8a3a","#3878b8","#7a55b8","#b88b3a","#36989d","#c2486d"];
    let h = 0;
    for (const c of (name || "?")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  }

  function renderCharacters() {
    const chars = allCharacters();
    if (chars.length === 0) {
      return `<div class="bib-empty">
        <h3>No characters yet.</h3>
        <p>Click <b>+ Add</b> above, or type a character name in your script and it'll appear here when you next open the Bible.</p>
        <button class="btn primary" id="bib-import-cast">Pull from script</button>
      </div>`;
    }
    const sortedChars = chars.slice().sort((a, b) => {
      if (a._source !== b._source) return a._source === "series" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return `<div class="bib-char-grid">
      ${sortedChars.map(renderCharCard).join("")}
    </div>`;
  }
  function renderCharCard(c) {
    const badge = hasSeries() ? `<span class="bib-source-badge bib-source-${c._source}" title="${c._source === "series" ? "Lives in the series bible — visible in every episode" : "Local to this episode only"}">${c._source === "series" ? "Series" : "Episode"}</span>` : "";
    const promoteBtn = !hasSeries() ? "" :
      c._source === "episode"
        ? `<button class="bib-promote" data-act="promote" title="Move to series bible — share across all episodes">↑ to series</button>`
        : `<button class="bib-promote" data-act="demote" title="Move out of series bible — keep local to this episode">↓ to episode</button>`;
    return `
      <div class="bib-char" data-cid="${c.id}" data-source="${c._source}" style="--avatar:${c.avatar}">
        <div class="bib-char-head">
          <div class="bib-avatar">${escapeHtml((c.name || "?").slice(0,2))}</div>
          <div class="bib-char-title">
            <input class="bib-name" data-field="name" value="${escapeHtml(c.name)}" />
            <input class="bib-role" data-field="role" placeholder="role / function" value="${escapeHtml(c.role)}" />
            <div class="bib-char-meta">${badge}${promoteBtn}</div>
          </div>
          <button class="bib-del" data-act="delete">✕</button>
        </div>
        <div class="bib-grid">
          <label>Age <span class="lab-row"><input data-field="age" value="${escapeHtml(c.age)}" /><button class="bib-ai" data-ai-field="age" title="AI: infer age from script">✨</button></span></label>
          <label>Physical <span class="lab-row"><input data-field="physical" value="${escapeHtml(c.physical)}" /><button class="bib-ai" data-ai-field="physical" title="AI: write physical description">✨</button></span></label>
          <label class="span">Want (external goal) <span class="lab-row"><input data-field="want" value="${escapeHtml(c.want)}" /><button class="bib-ai" data-ai-field="want" title="AI: propose what they want">✨</button></span></label>
          <label class="span">Need (internal lesson) <span class="lab-row"><input data-field="need" value="${escapeHtml(c.need)}" /><button class="bib-ai" data-ai-field="need" title="AI: propose what they need">✨</button></span></label>
          <label class="span">Flaw <span class="lab-row"><input data-field="flaw" value="${escapeHtml(c.flaw)}" /><button class="bib-ai" data-ai-field="flaw" title="AI: propose their flaw">✨</button></span></label>
          <label class="span">Backstory <span class="lab-row"><textarea data-field="backstory">${escapeHtml(c.backstory)}</textarea><button class="bib-ai" data-ai-field="backstory" title="AI: write backstory">✨</button></span></label>
          <label class="span">Voice / how they speak <span class="lab-row"><textarea data-field="voice" placeholder="Vocabulary, rhythm, sample lines">${escapeHtml(c.voice)}</textarea><button class="bib-ai" data-ai-field="voice" title="AI: describe their voice">✨</button></span></label>
          <label class="span">Secrets <span class="lab-row"><textarea data-field="secrets">${escapeHtml(c.secrets)}</textarea><button class="bib-ai" data-ai-field="secrets" title="AI: propose a secret">✨</button></span></label>
          <label class="span">Traits <span class="lab-row"><input data-field="traits" placeholder="warm, suspicious, deadpan…" value="${escapeHtml(c.traits)}" /><button class="bib-ai" data-ai-field="traits" title="AI: list traits">✨</button></span></label>
        </div>
      </div>
    `;
  }
  function wireCharacters() {
    const confirmFn = window.bsConfirm || ((o) => Promise.resolve(confirm(o.body || o.title)));
    document.querySelectorAll(".bib-char").forEach(card => {
      const cid = card.dataset.cid;
      card.querySelectorAll("[data-field]").forEach(input => {
        input.addEventListener("change", () => {
          const found = findCharacter(cid);
          if (!found) return;
          const f = input.dataset.field;
          found.char[f] = input.value;
          if (f === "name") {
            found.char.name = (found.char.name || "").toUpperCase();
            card.querySelector(".bib-avatar").textContent = found.char.name.slice(0, 2);
            found.char.avatar = defaultAvatar(found.char.name);
          }
          saveStore(found.source);
        });
      });
      card.querySelector("[data-act=delete]")?.addEventListener("click", async () => {
        const found = findCharacter(cid);
        if (!found) return;
        const inSeries = found.source === "series";
        const ok = await confirmFn({
          title: "Delete character?",
          body: inSeries
            ? `Removes ${found.char.name} from the SERIES bible — every episode loses access to this character. Script cues aren't affected.`
            : "Removes them from this episode's bible. Script cues aren't affected.",
          okText: "Delete", danger: true,
        });
        if (!ok) return;
        if (inSeries) {
          seriesBible.characters = seriesBible.characters.filter(x => x.id !== cid);
          saveSeries();
        } else {
          bible.characters = bible.characters.filter(x => x.id !== cid);
          save();
        }
        renderTab("characters");
      });
      card.querySelector("[data-act=promote]")?.addEventListener("click", async () => {
        const c = bible.characters.find(x => x.id === cid);
        if (!c || !seriesBible) return;
        const dup = seriesBible.characters.find(x => x.name.toUpperCase() === c.name.toUpperCase() && x.id !== c.id);
        if (dup) {
          const ok = await confirmFn({
            title: `${c.name} already exists in the series bible`,
            body: `Replace the series version with this episode's values? The current series fields will be overwritten.`,
            okText: "Replace series version", danger: true,
          });
          if (!ok) return;
        }
        promoteCharacter(cid);
        renderTab("characters");
      });
      card.querySelector("[data-act=demote]")?.addEventListener("click", async () => {
        const c = seriesBible?.characters.find(x => x.id === cid);
        if (!c) return;
        const ok = await confirmFn({
          title: `Demote ${c.name} to episode only?`,
          body: `Other episodes in this series will lose access to this character.`,
          okText: "Demote", danger: false,
        });
        if (!ok) return;
        demoteCharacter(cid);
        renderTab("characters");
      });
      // AI sparkle buttons — one per bible field. Use the global helper so
      // every field call carries the full project context (script + bible).
      card.querySelectorAll(".bib-ai[data-ai-field]").forEach(btn => {
        btn.addEventListener("click", async e => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof aiFillCharacterField !== "function") return;
          await aiFillCharacterField(cid, btn.dataset.aiField, btn);
        });
      });
    });
    document.getElementById("bib-import-cast")?.addEventListener("click", () => {
      const cast = (typeof App !== "undefined") ? App.getCastFromScript() : [];
      cast.forEach(name => ensureCharacter(name));
      renderTab("characters");
    });
  }

  // ---------- Relationships ----------
  function renderRelationships() {
    const chars = allCharacters();
    if (chars.length < 2) {
      return `<div class="bib-empty"><h3>Add at least two characters to start mapping relationships.</h3></div>`;
    }
    if (!bible.relationships) bible.relationships = [];
    const charsByName = (n) => chars.find(x => x.id === n) || null;
    return `
      <div class="bib-rel-wrap">
        <div class="bib-rel-canvas">
          <svg id="rel-svg" viewBox="0 0 800 520" preserveAspectRatio="xMidYMid meet"></svg>
          <div class="bib-rel-hint">Drag a node to reposition · double-click to release back to auto-layout</div>
        </div>
        <div class="bib-rel-side">
          <h4>Add relationship</h4>
          <div class="rel-add">
            <select id="rel-a">${chars.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
            <select id="rel-kind">
              <option value="loves">loves</option>
              <option value="married">married to</option>
              <option value="family">family</option>
              <option value="friend">friend</option>
              <option value="rival">rival</option>
              <option value="hates">hates</option>
              <option value="mentor">mentor of</option>
              <option value="boss">boss of</option>
            </select>
            <select id="rel-b">${chars.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
            <button class="btn primary" id="rel-add">Add</button>
          </div>
          <h4>Existing</h4>
          <div class="rel-list">
            ${bible.relationships.length ? bible.relationships.map(r => {
              const a = charsByName(r.a)?.name || "?";
              const b = charsByName(r.b)?.name || "?";
              return `<div class="rel-row"><b>${escapeHtml(a)}</b> ${r.kind} <b>${escapeHtml(b)}</b><button class="rel-del" data-rid="${r.id}">✕</button></div>`;
            }).join("") : `<div class="muted">None yet.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function drawRelationshipGraph() {
    const svg = document.getElementById("rel-svg");
    if (!svg) return;
    const w = 800, h = 520;
    // Use saved positions when present (from drag); otherwise auto-layout.
    // The graph spans both series + episode characters via allCharacters().
    const allChars = allCharacters();
    const nodes = allChars.map((c, i) => {
      const saved = c.relPos; // { x, y } persisted from prior drag
      return {
        id: c.id, name: c.name, color: c.avatar,
        x: saved?.x ?? (w/2 + Math.cos(i / allChars.length * Math.PI * 2) * 200),
        y: saved?.y ?? (h/2 + Math.sin(i / allChars.length * Math.PI * 2) * 200),
        vx: 0, vy: 0,
        pinned: !!saved,
      };
    });
    const links = (bible.relationships || []).map(r => ({ ...r,
      sourceNode: nodes.find(n => n.id === r.a),
      targetNode: nodes.find(n => n.id === r.b),
    })).filter(l => l.sourceNode && l.targetNode);

    // Simple physics: 200 iterations of repulsion + spring
    const REP = 9000, LINK = 0.04, DAMP = 0.78, REST = 130;
    for (let it = 0; it < 250; it++) {
      // repel
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx*dx + dy*dy + 0.1;
          const f = REP / d2;
          const dist = Math.sqrt(d2);
          dx /= dist; dy /= dist;
          a.vx -= dx*f*0.01; a.vy -= dy*f*0.01;
          b.vx += dx*f*0.01; b.vy += dy*f*0.01;
        }
      }
      // spring
      links.forEach(l => {
        const a = l.sourceNode, b = l.targetNode;
        let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx*dx + dy*dy) + 0.01;
        const f = (dist - REST) * LINK;
        dx /= dist; dy /= dist;
        a.vx += dx*f; a.vy += dy*f;
        b.vx -= dx*f; b.vy -= dy*f;
      });
      // integrate (pinned nodes don't move during the auto-layout)
      nodes.forEach(n => {
        if (n.pinned) { n.vx = 0; n.vy = 0; return; }
        n.vx *= DAMP; n.vy *= DAMP;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(60, Math.min(w-60, n.x));
        n.y = Math.max(40, Math.min(h-40, n.y));
      });
    }

    // Draw
    const kindColor = {
      loves: "#cf3a37", married: "#b3261e", family: "#7a55b8",
      friend: "#3878b8", rival: "#dfa116", hates: "#5a1816",
      mentor: "#4f8a3a", boss: "#888"
    };
    let svgContent = "";
    links.forEach(l => {
      const a = l.sourceNode, b = l.targetNode;
      svgContent += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${kindColor[l.kind]||"#888"}" stroke-width="2" opacity="0.6"/>`;
      const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
      svgContent += `<text x="${mx}" y="${my-4}" text-anchor="middle" font-size="10" fill="${kindColor[l.kind]||"#888"}" font-family="var(--font-ui)">${l.kind}</text>`;
    });
    nodes.forEach(n => {
      svgContent += `<g class="rel-node" data-cid="${n.id}" style="cursor:grab">`;
      svgContent += `<circle cx="${n.x}" cy="${n.y}" r="28" fill="${n.color}" stroke="${n.pinned ? '#000' : 'rgba(0,0,0,.2)'}" stroke-width="${n.pinned ? 2.5 : 2}"/>`;
      svgContent += `<text x="${n.x}" y="${n.y+4}" text-anchor="middle" font-family="var(--font-screen)" font-size="11" font-weight="700" fill="white" pointer-events="none">${escapeHtml(n.name.slice(0,2))}</text>`;
      svgContent += `<text x="${n.x}" y="${n.y+44}" text-anchor="middle" font-family="var(--font-screen)" font-size="10" fill="var(--ink-2)" pointer-events="none">${escapeHtml(n.name.slice(0,12))}</text>`;
      svgContent += `</g>`;
    });
    svg.innerHTML = svgContent;

    // Drag support: click + drag any node to reposition; double-click to unpin.
    let dragging = null;
    const svgPoint = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    svg.querySelectorAll(".rel-node").forEach(g => {
      g.addEventListener("pointerdown", e => {
        e.preventDefault();
        dragging = { id: g.dataset.cid, g };
        g.setPointerCapture(e.pointerId);
        g.style.cursor = "grabbing";
      });
      g.addEventListener("pointermove", e => {
        if (!dragging || dragging.id !== g.dataset.cid) return;
        const p = svgPoint(e);
        const circle = g.querySelector("circle");
        const txt1 = g.querySelectorAll("text")[0];
        const txt2 = g.querySelectorAll("text")[1];
        const x = Math.max(60, Math.min(w-60, p.x));
        const y = Math.max(40, Math.min(h-40, p.y));
        circle.setAttribute("cx", x); circle.setAttribute("cy", y);
        circle.setAttribute("stroke", "#000"); circle.setAttribute("stroke-width", 2.5);
        txt1.setAttribute("x", x); txt1.setAttribute("y", y + 4);
        txt2.setAttribute("x", x); txt2.setAttribute("y", y + 44);
        // Move connected lines live
        bible.relationships?.forEach((r, i) => {
          if (r.a !== g.dataset.cid && r.b !== g.dataset.cid) return;
          const lines = svg.querySelectorAll("line");
          const labels = svg.querySelectorAll("text:not([font-size='11']):not([font-size='10'])");
          // We can't easily index — simpler: just re-render at drop, not during drag
        });
      });
      g.addEventListener("pointerup", e => {
        if (!dragging || dragging.id !== g.dataset.cid) return;
        const circle = g.querySelector("circle");
        const x = parseFloat(circle.getAttribute("cx"));
        const y = parseFloat(circle.getAttribute("cy"));
        const found = findCharacter(dragging.id);
        if (found) { found.char.relPos = { x, y }; saveStore(found.source); }
        dragging = null;
        g.style.cursor = "grab";
        renderTab("relationships"); // re-render to update connector lines
      });
      g.addEventListener("dblclick", e => {
        const found = findCharacter(g.dataset.cid);
        if (found?.char.relPos) { delete found.char.relPos; saveStore(found.source); renderTab("relationships"); }
      });
    });

    // Wire
    document.getElementById("rel-add")?.addEventListener("click", () => {
      const a = document.getElementById("rel-a").value;
      const b = document.getElementById("rel-b").value;
      const kind = document.getElementById("rel-kind").value;
      if (a === b) return;
      bible.relationships = bible.relationships || [];
      bible.relationships.push({ id: Storage.uid(), a, b, kind });
      save(); renderTab("relationships");
    });
    document.querySelectorAll(".rel-del").forEach(b => b.addEventListener("click", () => {
      bible.relationships = (bible.relationships || []).filter(r => r.id !== b.dataset.rid);
      save(); renderTab("relationships");
    }));
  }

  // ---------- Locations ----------
  function renderLocations() {
    const locs = allLocations();
    if (locs.length === 0) {
      return `<div class="bib-empty"><h3>No locations yet.</h3><p>Click <b>+ Add</b> to create one, or click <b>Pull from script</b> below to import every INT./EXT. slug.</p>
        <button class="btn primary" id="bib-import-locs">Pull from script</button></div>`;
    }
    const sorted = locs.slice().sort((a, b) => {
      if (a._source !== b._source) return a._source === "series" ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });
    return `<div class="bib-loc-grid">
      ${sorted.map(l => {
        const badge = hasSeries() ? `<span class="bib-source-badge bib-source-${l._source}" title="${l._source === "series" ? "Lives in the series bible" : "Local to this episode only"}">${l._source === "series" ? "Series" : "Episode"}</span>` : "";
        const promote = !hasSeries() ? "" :
          l._source === "episode"
            ? `<button class="bib-promote" data-act="promote-loc" title="Promote to series — share across all episodes">↑ to series</button>`
            : `<button class="bib-promote" data-act="demote-loc" title="Make this location local to this episode">↓ to episode</button>`;
        return `
        <div class="bib-loc" data-lid="${l.id}" data-source="${l._source}">
          <div class="bib-loc-top">
            <input class="bib-loc-name" data-field="name" value="${escapeHtml(l.name)}" />
            <div class="bib-char-meta">${badge}${promote}</div>
          </div>
          <textarea data-field="desc" placeholder="Mood, geography, sensory details…">${escapeHtml(l.desc || "")}</textarea>
          <input data-field="time" placeholder="Time period / era" value="${escapeHtml(l.time || "")}" />
          <button class="bib-del" data-act="delete">✕</button>
        </div>
      `;}).join("")}
    </div>`;
  }
  function wireLocations() {
    const confirmFn = window.bsConfirm || ((o) => Promise.resolve(confirm(o.body || o.title)));
    document.querySelectorAll(".bib-loc").forEach(card => {
      const lid = card.dataset.lid;
      card.querySelectorAll("[data-field]").forEach(input => {
        input.addEventListener("change", () => {
          const found = findLocation(lid);
          if (!found) return;
          found.loc[input.dataset.field] = input.value;
          saveStore(found.source);
        });
      });
      card.querySelector("[data-act=delete]")?.addEventListener("click", async () => {
        const found = findLocation(lid);
        if (!found) return;
        if (found.source === "series") {
          const ok = await confirmFn({
            title: "Delete from series bible?",
            body: `Removes ${found.loc.name} from the series bible — every episode loses this location.`,
            okText: "Delete", danger: true,
          });
          if (!ok) return;
          seriesBible.locations = seriesBible.locations.filter(x => x.id !== lid);
          saveSeries();
        } else {
          bible.locations = bible.locations.filter(x => x.id !== lid);
          save();
        }
        renderTab("locations");
      });
      card.querySelector("[data-act=promote-loc]")?.addEventListener("click", async () => {
        const l = bible.locations.find(x => x.id === lid);
        if (!l || !seriesBible) return;
        const dup = seriesBible.locations.find(x => x.name.toUpperCase() === l.name.toUpperCase() && x.id !== l.id);
        if (dup) {
          const ok = await confirmFn({
            title: `${l.name} already exists in the series bible`,
            body: `Replace the series version with this episode's values?`,
            okText: "Replace series version", danger: true,
          });
          if (!ok) return;
        }
        promoteLocation(lid);
        renderTab("locations");
      });
      card.querySelector("[data-act=demote-loc]")?.addEventListener("click", async () => {
        const l = seriesBible?.locations.find(x => x.id === lid);
        if (!l) return;
        const ok = await confirmFn({
          title: `Demote ${l.name} to episode only?`,
          body: `Other episodes in this series will lose access.`,
          okText: "Demote", danger: false,
        });
        if (!ok) return;
        demoteLocation(lid);
        renderTab("locations");
      });
    });
    document.getElementById("bib-import-locs")?.addEventListener("click", () => {
      const names = (typeof App !== "undefined") ? App.getLocationsFromScript() : [];
      names.forEach(name => {
        const dup = bible.locations.find(l => l.name.toUpperCase() === name.toUpperCase())
                 || (seriesBible?.locations.find(l => l.name.toUpperCase() === name.toUpperCase()));
        if (!dup) bible.locations.push({ id: Storage.uid(), name, desc: "", time: "" });
      });
      save(); renderTab("locations");
    });
  }

  // ---------- World rules ----------
  function renderRules() {
    if (!bible.rules) bible.rules = [];
    return `
      <div class="bib-rules">
        <div class="bib-rule-list">
          ${bible.rules.map(r => `
            <div class="bib-rule" data-rid="${r.id}">
              <input class="rule-name" data-field="name" value="${escapeHtml(r.name)}" placeholder="Rule title (e.g. 'Magic costs blood')" />
              <textarea data-field="desc" placeholder="What does this rule mean? Where does it break?">${escapeHtml(r.desc || "")}</textarea>
              <button class="bib-del" data-act="delete">✕</button>
            </div>
          `).join("")}
        </div>
        <button class="btn primary" id="bib-add-rule">+ Add rule</button>
      </div>
    `;
  }
  function wireRules() {
    document.getElementById("bib-add-rule")?.addEventListener("click", () => {
      bible.rules = bible.rules || [];
      bible.rules.push({ id: Storage.uid(), name: "", desc: "" });
      save(); renderTab("rules");
    });
    document.querySelectorAll(".bib-rule").forEach(card => {
      const rid = card.dataset.rid;
      card.querySelectorAll("[data-field]").forEach(input => {
        input.addEventListener("change", () => {
          const r = bible.rules.find(x => x.id === rid);
          if (r) { r[input.dataset.field] = input.value; save(); }
        });
      });
      card.querySelector("[data-act=delete]")?.addEventListener("click", () => {
        bible.rules = bible.rules.filter(x => x.id !== rid);
        save(); renderTab("rules");
      });
    });
  }

  // ---------- Arcs ----------
  // Each character carries `arc: [{ sceneId, w, n, f, c }]` where sceneId is the
  // scene heading's line index in the editor and w/n/f/c are booleans (Want / Need /
  // Flaw / Change). Old shape `{ scene, kind, note }` is silently ignored.
  const ARC_KINDS = [
    { id: "w", label: "Want",   title: "External goal — what they're chasing" },
    { id: "n", label: "Need",   title: "Internal lesson — what they actually require" },
    { id: "f", label: "Flaw",   title: "The thing standing in their own way" },
    { id: "c", label: "Change", title: "The moment of transformation" },
  ];
  const ARC_GAP_THRESHOLD = 5;

  function arcEntry(c, sid) {
    return (c.arc || []).find(a => a && typeof a === "object" && a.sceneId === sid) || null;
  }
  function arcGet(c, sid, kind) {
    const e = arcEntry(c, sid);
    return !!(e && e[kind]);
  }
  // Mutates the LIVE character record (either episode or series bible) and
  // persists the appropriate store. `c` may be a spread copy from
  // allCharacters() — we look up by id to find the source-of-truth record.
  function arcToggle(c, sid, kind) {
    const found = findCharacter(c.id);
    if (!found) return;
    const live = found.char;
    live.arc = (live.arc || []).filter(a => a && typeof a === "object" && typeof a.sceneId === "number");
    let e = live.arc.find(a => a.sceneId === sid);
    if (!e) { e = { sceneId: sid, w: false, n: false, f: false, c: false }; live.arc.push(e); }
    e[kind] = !e[kind];
    if (!e.w && !e.n && !e.f && !e.c) {
      live.arc = live.arc.filter(a => a.sceneId !== sid);
    }
    saveStore(found.source);
  }

  function renderArcs() {
    const chars = allCharacters();
    if (chars.length === 0) {
      return `<div class="bib-empty"><h3>No characters yet.</h3>
        <p>Add characters first — every character gets a Want / Need / Flaw / Change row across all scenes.</p></div>`;
    }
    const scenes = (typeof App !== "undefined" && App.getScenesFromScript) ? App.getScenesFromScript() : [];
    if (scenes.length === 0) {
      return `<div class="bib-empty"><h3>No scenes in the script yet.</h3>
        <p>Write at least one scene heading (e.g. <code>INT. KITCHEN - DAY</code>) and reopen the Arcs tab.</p></div>`;
    }
    const headRow = `
      <div class="arc-row arc-head">
        <div class="arc-name-col"></div>
        <div class="arc-kind-col"></div>
        <div class="arc-cells">
          ${scenes.map((s, i) => `<div class="arc-col-head" title="${escapeHtml(s.slug)}">${i + 1}</div>`).join("")}
        </div>
        <div class="arc-count-col">marked</div>
      </div>
    `;
    const charBlocks = chars.map(c => {
      const rows = ARC_KINDS.map((k, ki) => {
        const marked = scenes.filter(s => arcGet(c, s.sceneId, k.id)).length;
        const cells = scenes.map(s => {
          const on = arcGet(c, s.sceneId, k.id);
          return `<button class="arc-cell ${on ? "on" : ""}" data-cid="${c.id}" data-sid="${s.sceneId}" data-kind="${k.id}" title="${escapeHtml(k.title)} — ${escapeHtml(s.slug)}"></button>`;
        }).join("");
        return `
          <div class="arc-row arc-kind-row${ki === 0 ? " arc-first" : ""}${ki === ARC_KINDS.length - 1 ? " arc-last" : ""}">
            <div class="arc-name-col">${ki === 0 ? `<div class="arc-name" style="--avatar:${c.avatar}">${escapeHtml(c.name)}</div>` : ""}</div>
            <div class="arc-kind-col" title="${escapeHtml(k.title)}"><span class="arc-kind-letter">${k.id.toUpperCase()}</span><span class="arc-kind-label">${escapeHtml(k.label)}</span></div>
            <div class="arc-cells">${cells}</div>
            <div class="arc-count-col">${marked}/${scenes.length}</div>
          </div>
        `;
      }).join("");
      return `<div class="arc-char-block" data-cid="${c.id}">${rows}</div>`;
    }).join("");
    const gaps = arcGapAnalysis(scenes);
    return `
      <div class="arc-wrap">
        <div class="arc-legend">
          <span>Click a cell to mark <b>Want / Need / Flaw / Change</b> for that character × scene.</span>
          <span class="arc-legend-key">
            <span class="arc-cell on" aria-hidden="true"></span> marked
            <span class="arc-cell" aria-hidden="true"></span> empty
          </span>
        </div>
        <div class="arc-grid">
          ${headRow}
          ${charBlocks}
        </div>
        <div class="arc-gap-analysis">
          <h4>Gap analysis</h4>
          ${gaps.length
            ? `<ul>${gaps.map(g => `<li>${g}</li>`).join("")}</ul>`
            : `<p class="muted">Every character has at least one Want, Need, Flaw, and Change marked — and no large gaps.</p>`}
        </div>
      </div>
    `;
  }

  function arcGapAnalysis(scenes) {
    if (scenes.length === 0) return [];
    const out = [];
    allCharacters().forEach(c => {
      ARC_KINDS.forEach(k => {
        const marks = scenes.map((s, i) => arcGet(c, s.sceneId, k.id) ? i : -1).filter(i => i >= 0);
        if (marks.length === 0) {
          out.push(`<b>${escapeHtml(c.name)}</b>'s <b>${k.label}</b> is never marked.`);
          return;
        }
        // First and last mark distances
        if (marks[0] >= ARC_GAP_THRESHOLD) {
          out.push(`<b>${escapeHtml(c.name)}</b>'s <b>${k.label}</b> first appears at scene ${marks[0] + 1} — late entry.`);
        }
        if (scenes.length - 1 - marks[marks.length - 1] >= ARC_GAP_THRESHOLD) {
          out.push(`<b>${escapeHtml(c.name)}</b>'s <b>${k.label}</b> drops out after scene ${marks[marks.length - 1] + 1} — no payoff.`);
        }
        // Internal runs
        for (let i = 1; i < marks.length; i++) {
          const gap = marks[i] - marks[i - 1] - 1;
          if (gap >= ARC_GAP_THRESHOLD) {
            out.push(`<b>${escapeHtml(c.name)}</b>'s <b>${k.label}</b> goes quiet between scene ${marks[i - 1] + 1} and ${marks[i] + 1} (${gap} scenes).`);
          }
        }
      });
    });
    return out;
  }

  function wireArcs() {
    document.querySelectorAll(".arc-cell[data-cid]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cid = btn.dataset.cid;
        const sid = parseInt(btn.dataset.sid, 10);
        const kind = btn.dataset.kind;
        if (Number.isNaN(sid)) return;
        // arcToggle locates the live record across episode/series stores
        // and saves the correct one.
        arcToggle({ id: cid }, sid, kind);
        renderTab("arcs");
      });
    });
  }

  // ---------- Add (generic) ----------
  async function addEntry(tab) {
    const ask = window.bsPrompt || ((o) => Promise.resolve(prompt(o.title, o.defaultValue || "")));
    if (tab === "characters") {
      const name = await ask({ title:"Add character", label:"Name", placeholder:"e.g. JESSICA" });
      if (!name) return;
      bible.characters.push(makeCharacter(name));
      save(); renderTab("characters");
    }
    if (tab === "locations") {
      const name = await ask({ title:"Add location", label:"Name", placeholder:"e.g. THE DINER" });
      if (!name) return;
      bible.locations.push({ id: Storage.uid(), name, desc: "", time: "" });
      save(); renderTab("locations");
    }
    if (tab === "rules") {
      bible.rules = bible.rules || [];
      bible.rules.push({ id: Storage.uid(), name: "", desc: "" });
      save(); renderTab("rules");
    }
    if (tab === "relationships" && allCharacters().length < 2) {
      const c = window.bsConfirm || ((o) => Promise.resolve(confirm(o.body || o.title)));
      await c({ title:"Need more characters", body:"Add at least two characters before mapping relationships.", okText:"OK", cancelText:"" });
    }
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  // Allow the app to bind the active project id without opening the view
  function bind(pid) {
    projectId = pid;
    bible = Storage.getBible(pid);
    const project = Storage.getProject(pid);
    seriesId = project?.seriesId || null;
    seriesBible = seriesId ? Storage.getSeriesBible(seriesId) : null;
  }

  // Public — used by App to pre-populate characters when script changes
  function syncCharactersFromScript(cast) {
    // Be defensive: if no projectId set yet, try to recover from the global appState
    if (!projectId && typeof appState !== "undefined" && appState.projectId) {
      projectId = appState.projectId;
    }
    if (!projectId) return;
    bible = Storage.getBible(projectId);
    const project = Storage.getProject(projectId);
    seriesId = project?.seriesId || null;
    seriesBible = seriesId ? Storage.getSeriesBible(seriesId) : null;
    cast.forEach(name => ensureCharacter(name));
  }
  function getCharacterByName(name) {
    if (!bible) {
      const pid = (typeof appState !== "undefined" && appState.projectId) || null;
      if (!pid) return null;
      bind(pid);
    }
    if (!bible) return null;
    const nameUp = (name || "").toUpperCase();
    const local = bible.characters.find(c => (c.name || "").toUpperCase() === nameUp);
    if (local) return local;
    if (seriesBible) {
      return seriesBible.characters.find(c => (c.name || "").toUpperCase() === nameUp) || null;
    }
    return null;
  }

  return { open, render, bind, syncCharactersFromScript, getCharacterByName };
})();
