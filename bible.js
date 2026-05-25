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

  function open(pid) {
    projectId = pid;
    bible = Storage.getBible(pid);
    document.getElementById("view-bible").classList.add("active");
    document.querySelectorAll(".view-tab").forEach(t => t.classList.toggle("active", t.dataset.view === "bible"));
    document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === "view-bible"));
    render();
  }

  function save() { Storage.setBible(projectId, bible); }

  function render() {
    const root = document.getElementById("view-bible");
    root.innerHTML = `
      <div class="bible-toolbar">
        <div class="bible-tabs">
          <button class="bibtab active" data-tab="characters">Characters <span class="cnt">${bible.characters.length}</span></button>
          <button class="bibtab" data-tab="relationships">Relationships</button>
          <button class="bibtab" data-tab="arcs">Arcs</button>
          <button class="bibtab" data-tab="locations">Locations <span class="cnt">${bible.locations.length}</span></button>
          <button class="bibtab" data-tab="rules">World rules</button>
        </div>
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
    let c = bible.characters.find(x => x.name.toUpperCase() === name.toUpperCase());
    if (c) return c;
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
    if (bible.characters.length === 0) {
      return `<div class="bib-empty">
        <h3>No characters yet.</h3>
        <p>Click <b>+ Add</b> above, or type a character name in your script and it'll appear here when you next open the Bible.</p>
        <button class="btn primary" id="bib-import-cast">Pull from script</button>
      </div>`;
    }
    return `<div class="bib-char-grid">
      ${bible.characters.map(renderCharCard).join("")}
    </div>`;
  }
  function renderCharCard(c) {
    return `
      <div class="bib-char" data-cid="${c.id}" style="--avatar:${c.avatar}">
        <div class="bib-char-head">
          <div class="bib-avatar">${escapeHtml((c.name || "?").slice(0,2))}</div>
          <div class="bib-char-title">
            <input class="bib-name" data-field="name" value="${escapeHtml(c.name)}" />
            <input class="bib-role" data-field="role" placeholder="role / function" value="${escapeHtml(c.role)}" />
          </div>
          <button class="bib-del" data-act="delete">✕</button>
        </div>
        <div class="bib-grid">
          <label>Age <input data-field="age" value="${escapeHtml(c.age)}" /></label>
          <label>Physical <input data-field="physical" value="${escapeHtml(c.physical)}" /></label>
          <label class="span">Want (external goal) <input data-field="want" value="${escapeHtml(c.want)}" /></label>
          <label class="span">Need (internal lesson) <input data-field="need" value="${escapeHtml(c.need)}" /></label>
          <label class="span">Flaw <input data-field="flaw" value="${escapeHtml(c.flaw)}" /></label>
          <label class="span">Backstory <textarea data-field="backstory">${escapeHtml(c.backstory)}</textarea></label>
          <label class="span">Voice / how they speak <textarea data-field="voice" placeholder="Vocabulary, rhythm, sample lines">${escapeHtml(c.voice)}</textarea></label>
          <label class="span">Secrets <textarea data-field="secrets">${escapeHtml(c.secrets)}</textarea></label>
          <label class="span">Traits <input data-field="traits" placeholder="warm, suspicious, deadpan…" value="${escapeHtml(c.traits)}" /></label>
        </div>
      </div>
    `;
  }
  function wireCharacters() {
    document.querySelectorAll(".bib-char").forEach(card => {
      const cid = card.dataset.cid;
      card.querySelectorAll("[data-field]").forEach(input => {
        input.addEventListener("change", () => {
          const c = bible.characters.find(x => x.id === cid);
          if (!c) return;
          const f = input.dataset.field;
          c[f] = input.value;
          if (f === "name") c.name = c.name.toUpperCase();
          if (f === "name") {
            card.querySelector(".bib-avatar").textContent = c.name.slice(0,2);
            c.avatar = defaultAvatar(c.name);
          }
          save();
        });
      });
      card.querySelector("[data-act=delete]")?.addEventListener("click", async () => {
        const ok = await (window.bsConfirm || ((o) => Promise.resolve(confirm(o.body || o.title))))({
          title: "Delete character?", body: "Removes them from the bible. Script cues aren't affected.",
          okText: "Delete", danger: true
        });
        if (!ok) return;
        bible.characters = bible.characters.filter(x => x.id !== cid);
        save(); renderTab("characters");
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
    if (bible.characters.length < 2) {
      return `<div class="bib-empty"><h3>Add at least two characters to start mapping relationships.</h3></div>`;
    }
    if (!bible.relationships) bible.relationships = [];
    return `
      <div class="bib-rel-wrap">
        <div class="bib-rel-canvas">
          <svg id="rel-svg" viewBox="0 0 800 520" preserveAspectRatio="xMidYMid meet"></svg>
          <div class="bib-rel-hint">Drag a node to reposition · double-click to release back to auto-layout</div>
        </div>
        <div class="bib-rel-side">
          <h4>Add relationship</h4>
          <div class="rel-add">
            <select id="rel-a">${bible.characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
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
            <select id="rel-b">${bible.characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
            <button class="btn primary" id="rel-add">Add</button>
          </div>
          <h4>Existing</h4>
          <div class="rel-list">
            ${bible.relationships.length ? bible.relationships.map(r => {
              const a = bible.characters.find(x => x.id === r.a)?.name || "?";
              const b = bible.characters.find(x => x.id === r.b)?.name || "?";
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
    // Use saved positions when present (from drag); otherwise auto-layout
    const nodes = bible.characters.map((c, i) => {
      const saved = c.relPos; // { x, y } persisted from prior drag
      return {
        id: c.id, name: c.name, color: c.avatar,
        x: saved?.x ?? (w/2 + Math.cos(i / bible.characters.length * Math.PI * 2) * 200),
        y: saved?.y ?? (h/2 + Math.sin(i / bible.characters.length * Math.PI * 2) * 200),
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
        const c = bible.characters.find(x => x.id === dragging.id);
        if (c) c.relPos = { x, y };
        save();
        dragging = null;
        g.style.cursor = "grab";
        renderTab("relationships"); // re-render to update connector lines
      });
      g.addEventListener("dblclick", e => {
        const c = bible.characters.find(x => x.id === g.dataset.cid);
        if (c?.relPos) { delete c.relPos; save(); renderTab("relationships"); }
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
    if (bible.locations.length === 0) {
      return `<div class="bib-empty"><h3>No locations yet.</h3><p>Click <b>+ Add</b> to create one, or click <b>Pull from script</b> below to import every INT./EXT. slug.</p>
        <button class="btn primary" id="bib-import-locs">Pull from script</button></div>`;
    }
    return `<div class="bib-loc-grid">
      ${bible.locations.map(l => `
        <div class="bib-loc" data-lid="${l.id}">
          <input class="bib-loc-name" data-field="name" value="${escapeHtml(l.name)}" />
          <textarea data-field="desc" placeholder="Mood, geography, sensory details…">${escapeHtml(l.desc || "")}</textarea>
          <input data-field="time" placeholder="Time period / era" value="${escapeHtml(l.time || "")}" />
          <button class="bib-del" data-act="delete">✕</button>
        </div>
      `).join("")}
    </div>`;
  }
  function wireLocations() {
    document.querySelectorAll(".bib-loc").forEach(card => {
      const lid = card.dataset.lid;
      card.querySelectorAll("[data-field]").forEach(input => {
        input.addEventListener("change", () => {
          const l = bible.locations.find(x => x.id === lid);
          if (l) { l[input.dataset.field] = input.value; save(); }
        });
      });
      card.querySelector("[data-act=delete]")?.addEventListener("click", () => {
        bible.locations = bible.locations.filter(x => x.id !== lid);
        save(); renderTab("locations");
      });
    });
    document.getElementById("bib-import-locs")?.addEventListener("click", () => {
      const locs = (typeof App !== "undefined") ? App.getLocationsFromScript() : [];
      locs.forEach(name => {
        if (!bible.locations.find(l => l.name.toUpperCase() === name.toUpperCase())) {
          bible.locations.push({ id: Storage.uid(), name, desc: "", time: "" });
        }
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
  function arcToggle(c, sid, kind) {
    c.arc = (c.arc || []).filter(a => a && typeof a === "object" && typeof a.sceneId === "number");
    let e = c.arc.find(a => a.sceneId === sid);
    if (!e) { e = { sceneId: sid, w: false, n: false, f: false, c: false }; c.arc.push(e); }
    e[kind] = !e[kind];
    if (!e.w && !e.n && !e.f && !e.c) {
      c.arc = c.arc.filter(a => a.sceneId !== sid);
    }
  }

  function renderArcs() {
    if (bible.characters.length === 0) {
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
    const charBlocks = bible.characters.map(c => {
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
    bible.characters.forEach(c => {
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
        const c = bible.characters.find(x => x.id === cid);
        if (!c || Number.isNaN(sid)) return;
        arcToggle(c, sid, kind);
        save();
        // Re-render the arcs tab so counts + gap analysis update too
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
    if (tab === "relationships" && bible.characters.length < 2) {
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
  }

  // Public — used by App to pre-populate characters when script changes
  function syncCharactersFromScript(cast) {
    // Be defensive: if no projectId set yet, try to recover from the global appState
    if (!projectId && typeof appState !== "undefined" && appState.projectId) {
      projectId = appState.projectId;
    }
    if (!projectId) return;
    bible = Storage.getBible(projectId);
    cast.forEach(name => ensureCharacter(name));
  }
  function getCharacterByName(name) {
    // Fall back to fresh storage read if bible isn't loaded yet
    if (!bible) {
      const pid = (typeof appState !== "undefined" && appState.projectId) || null;
      if (!pid) return null;
      bible = Storage.getBible(pid);
      projectId = pid;
    }
    if (!bible) return null;
    return bible.characters.find(c => (c.name || "").toUpperCase() === (name || "").toUpperCase());
  }

  return { open, render, bind, syncCharactersFromScript, getCharacterByName };
})();
