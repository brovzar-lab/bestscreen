"use strict";
/* =============================================================================
 * BESTSCREEN STORAGE — multi-project data layer
 *
 * One root index in localStorage + per-project keys. Everything is JSON.
 * No IndexedDB dance; localStorage is plenty for screenplays.
 *
 *   bestscreen.v3.index            → { projects: [...], series: [...], settings, streak, pdfLog, lastOpenedId }
 *   bestscreen.v3.p.<id>.doc       → Fountain text
 *   bestscreen.v3.p.<id>.meta      → { titleMeta, beatSections, template, logline, theme, premise, projectColor, mood?, dailyBaselines{} }
 *   bestscreen.v3.p.<id>.bible     → { characters: [...], locations: [...], rules: [...] }
 *   bestscreen.v3.p.<id>.snaps     → [{ id, name, t, doc, words, pages }]
 *   bestscreen.v3.p.<id>.comments  → [{ id, lineKey, author, text, resolved, t }]
 *   bestscreen.v3.p.<id>.changes   → [{ t, type, lineIdx, before, after, author }]
 *   bestscreen.v3.p.<id>.bin       → [{ t, text }]
 *   bestscreen.v3.p.<id>.pdfs      → [{ t, name, watermark, version, sceneCount, pageCount }]
 *   bestscreen.v3.p.<id>.proofdict → Proofcheck custom dict — { words, ignored }
 * ============================================================================= */

const Storage = (() => {
  const K = "bestscreen.v3";
  const KEY_INDEX = K + ".index";
  const proj = (id) => K + ".p." + id;
  const ser  = (id) => K + ".s." + id;

  const DEFAULT_INDEX = {
    projects: [],   // [{ id, name, type, seriesId?, episode?, coverColor, pinned, lastModified, lastOpened, tagline?, status?: 'idea'|'outline'|'drafting'|'rewriting'|'polishing'|'final' }]
    series:   [],   // [{ id, name, type, coverColor, sharedBibleId?: id }]
    settings: {
      smartTypo: true,
      sceneNumbersInPdf: true,
      theme: "manuscript",
      author: "",
      ai: { provider: "anthropic", apiKey: "", model: "" },
    },
    streak: {},      // { "YYYY-MM-DD": wordsAdded }
    pdfLog: [],      // global PDF generation history (also per-project below)
    lastOpenedId: null,
  };

  function readIndex() {
    try {
      const raw = localStorage.getItem(KEY_INDEX);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_INDEX));
      const obj = JSON.parse(raw);
      // Ensure all top-level keys exist
      return { ...JSON.parse(JSON.stringify(DEFAULT_INDEX)), ...obj,
               settings: { ...DEFAULT_INDEX.settings, ...(obj.settings || {}) } };
    } catch (e) {
      console.warn("Index read failed", e);
      return JSON.parse(JSON.stringify(DEFAULT_INDEX));
    }
  }
  function writeIndex(idx) {
    try {
      localStorage.setItem(KEY_INDEX, JSON.stringify(idx));
      checkQuota();
    }
    catch (e) {
      console.warn("Index write failed", e);
      if (typeof toast === "function") toast("⚠️ Save failed — storage may be full. Export your project.");
    }
  }

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    }
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  // ---------- Index helpers ----------
  function listProjects() { return readIndex().projects.slice(); }
  function listSeries()   { return readIndex().series.slice(); }
  function getSettings()  { return readIndex().settings; }
  function setSettings(patch) {
    const idx = readIndex();
    idx.settings = { ...idx.settings, ...patch };
    writeIndex(idx);
  }
  function getStreak() { return readIndex().streak; }
  function bumpStreak(words) {
    const idx = readIndex();
    const k = new Date().toISOString().slice(0,10);
    idx.streak[k] = (idx.streak[k] || 0) + words;
    writeIndex(idx);
  }
  function pdfLog() { return readIndex().pdfLog; }
  function pushPdfLog(entry) {
    const idx = readIndex();
    idx.pdfLog.unshift(entry);
    if (idx.pdfLog.length > 200) idx.pdfLog.length = 200;
    writeIndex(idx);
  }
  function setLastOpened(id) {
    const idx = readIndex();
    idx.lastOpenedId = id;
    const p = idx.projects.find(x => x.id === id);
    if (p) p.lastOpened = Date.now();
    writeIndex(idx);
  }
  function getLastOpened() { return readIndex().lastOpenedId; }

  // ---------- Projects ----------
  function createProject({ name, type="feature", seriesId=null, episode=null, template=null, logline="", coverColor="#b3261e" }) {
    const idx = readIndex();
    const id = uid();
    const now = Date.now();
    idx.projects.unshift({
      id, name, type, seriesId, episode, coverColor,
      pinned: false, status: "idea",
      lastModified: now, lastOpened: now,
      tagline: logline,
    });
    writeIndex(idx);
    // Initialize storage for this project
    setDoc(id, defaultStarter(type));
    setMeta(id, {
      titleMeta: { title: name, credit: "Written by", author: idx.settings.author || "", source: "", date: new Date().toISOString().slice(0,10), contact: "", episode: episode ? `Ep ${episode}` : "" },
      beatSections: [],
      template,
      logline,
      premise: "",
      theme: "",
      projectColor: coverColor,
      activeRevision: "white",
      dailyBaselines: {},
      language: "en",
    });
    setBible(id, { characters: [], locations: [], rules: [] });
    setSnaps(id, []);
    setComments(id, []);
    setChanges(id, []);
    setBin(id, []);
    setPdfList(id, []);
    return id;
  }
  function updateProject(id, patch) {
    const idx = readIndex();
    const p = idx.projects.find(x => x.id === id);
    if (!p) return null;
    Object.assign(p, patch);
    p.lastModified = Date.now();
    writeIndex(idx);
    return p;
  }
  function deleteProject(id) {
    const idx = readIndex();
    idx.projects = idx.projects.filter(p => p.id !== id);
    if (idx.lastOpenedId === id) idx.lastOpenedId = null;
    writeIndex(idx);
    // Drop sub-keys
    ["doc","meta","bible","snaps","comments","changes","bin","pdfs","proofdict"].forEach(suffix => {
      localStorage.removeItem(proj(id) + "." + suffix);
    });
  }
  function getProject(id) {
    return readIndex().projects.find(p => p.id === id) || null;
  }

  // ---------- Series ----------
  function createSeries({ name, type="tv-hour", coverColor="#7a55b8" }) {
    const idx = readIndex();
    const id = uid();
    idx.series.unshift({ id, name, type, coverColor });
    writeIndex(idx);
    return id;
  }
  function deleteSeries(id) {
    const idx = readIndex();
    idx.series = idx.series.filter(s => s.id !== id);
    // Detach projects
    idx.projects.forEach(p => { if (p.seriesId === id) p.seriesId = null; });
    writeIndex(idx);
    // Drop the shared bible too — episodes keep their local bibles
    localStorage.removeItem(ser(id) + ".bible");
  }
  function getSeriesBible(seriesId) {
    if (!seriesId) return null;
    try {
      const raw = localStorage.getItem(ser(seriesId) + ".bible");
      if (!raw) return { characters: [], locations: [], rules: [], relationships: [] };
      const obj = JSON.parse(raw);
      return {
        characters: obj.characters || [],
        locations: obj.locations || [],
        rules: obj.rules || [],
        relationships: obj.relationships || [],
      };
    } catch (e) { return { characters: [], locations: [], rules: [], relationships: [] }; }
  }
  function setSeriesBible(seriesId, bible) {
    if (!seriesId) return;
    try { localStorage.setItem(ser(seriesId) + ".bible", JSON.stringify(bible)); }
    catch (e) { console.warn("series bible write failed", e); }
  }
  function getSeries(id) {
    return readIndex().series.find(s => s.id === id) || null;
  }
  function updateSeries(id, patch) {
    const idx = readIndex();
    const s = idx.series.find(x => x.id === id);
    if (!s) return null;
    Object.assign(s, patch);
    writeIndex(idx);
    return s;
  }
  function listProjectsBySeries(seriesId) {
    if (!seriesId) return [];
    return readIndex().projects.filter(p => p.seriesId === seriesId);
  }

  // ---------- Per-project getters/setters ----------
  function _read(id, suffix, defVal) {
    try {
      const raw = localStorage.getItem(proj(id) + "." + suffix);
      if (!raw) return defVal;
      return JSON.parse(raw);
    } catch (e) { return defVal; }
  }
  function _readRaw(id, suffix) {
    return localStorage.getItem(proj(id) + "." + suffix) || "";
  }
  function _write(id, suffix, value) {
    try {
      localStorage.setItem(proj(id) + "." + suffix,
        typeof value === "string" ? value : JSON.stringify(value));
    } catch (e) {
      console.warn(`write ${suffix} failed`, e);
      if (typeof toast === "function") toast("⚠️ Save failed — storage may be full. Export your project.");
    }
  }

  const getDoc      = id => _readRaw(id, "doc");
  const setDoc      = (id, txt) => _write(id, "doc", txt);
  const getMeta     = id => _read(id, "meta", {});
  const setMeta     = (id, m) => _write(id, "meta", m);
  const getBible    = id => _read(id, "bible", { characters: [], locations: [], rules: [] });
  const setBible    = (id, b) => _write(id, "bible", b);
  const getProofDict = id => _read(id, "proofdict", { words: [], ignored: [] });
  const setProofDict = (id, dict) => _write(id, "proofdict", dict);
  const getSnaps    = id => _read(id, "snaps", []);
  const setSnaps    = (id, s) => _write(id, "snaps", s);
  const getComments = id => _read(id, "comments", []);
  const setComments = (id, c) => _write(id, "comments", c);
  const getChanges  = id => _read(id, "changes", []);
  const setChanges  = (id, c) => _write(id, "changes", c);
  const getBin      = id => _read(id, "bin", []);
  const setBin      = (id, b) => _write(id, "bin", b);
  const getPdfList  = id => _read(id, "pdfs", []);
  const setPdfList  = (id, p) => _write(id, "pdfs", p);

  // ---------- Export / import (whole-project backup) ----------
  function exportProject(id) {
    return {
      version: 3,
      project: getProject(id),
      doc: getDoc(id),
      meta: getMeta(id),
      bible: getBible(id),
      snaps: getSnaps(id),
      comments: getComments(id),
      changes: getChanges(id),
      pdfs: getPdfList(id),
      proofdict: getProofDict(id),
    };
  }
  function importProject(bundle) {
    if (!bundle || !bundle.project) throw new Error("Not a Bestscreen project bundle");
    const idx = readIndex();
    const p = { ...bundle.project, id: uid(), lastOpened: Date.now(), lastModified: Date.now() };
    idx.projects.unshift(p);
    writeIndex(idx);
    setDoc(p.id, bundle.doc || "");
    setMeta(p.id, bundle.meta || {});
    setBible(p.id, bundle.bible || { characters: [], locations: [], rules: [] });
    setSnaps(p.id, bundle.snaps || []);
    setComments(p.id, bundle.comments || []);
    setChanges(p.id, bundle.changes || []);
    setPdfList(p.id, bundle.pdfs || []);
    setProofDict(p.id, bundle.proofdict || { words: [], ignored: [] });
    return p.id;
  }

  // ---------- Cross-project search ----------
  function search(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) return [];
    const results = [];
    listProjects().forEach(p => {
      // Match against title
      if ((p.name || "").toLowerCase().includes(q) || (p.tagline || "").toLowerCase().includes(q)) {
        results.push({ kind: "project", projectId: p.id, project: p, snippet: p.tagline || p.name });
      }
      const doc = getDoc(p.id);
      if (doc) {
        const lines = doc.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(q)) {
            results.push({ kind: "line", projectId: p.id, project: p, lineNo: i+1, snippet: lines[i].trim().slice(0, 120) });
            if (results.length > 200) break;
          }
        }
      }
    });
    return results;
  }

  // ---------- Default content per template ----------
  function defaultStarter(type) {
    switch (type) {
      case "tv-hour":   return `Title: New Episode\nCredit: Written by\nAuthor:\n\nCOLD OPEN\n\nFADE IN:\n\nINT. LOCATION - DAY\n\nA hook.\n\nEND OF COLD OPEN\n\n# ACT ONE\n\nINT. LOCATION - DAY\n\n`;
      case "tv-half":   return `Title: New Episode\nCredit: Written by\nAuthor:\n\nCOLD OPEN\n\nFADE IN:\n\nINT. LIVING ROOM - DAY\n\nA joke.\n\nEND OF COLD OPEN\n\n# ACT ONE\n\nINT. LIVING ROOM - DAY\n\n`;
      case "short":     return `Title: Short Film\nCredit: Written by\nAuthor:\n\nFADE IN:\n\nINT. ROOM - DAY\n\nOne idea.\n\nFADE OUT.\n`;
      case "stage":     return `Title: New Play\nCredit: A play in two acts by\nAuthor:\n\n# ACT ONE\n\n## SCENE 1\n\n(Stage description.)\n\n`;
      case "comic":     return `Title: Issue #1\nCredit: Written by\nAuthor:\n\n# PAGE ONE\n\n## Panel 1\n\nDescription of the panel.\n\n`;
      case "feature":
      default:          return `Title: Untitled\nCredit: Written by\nAuthor:\n\nFADE IN:\n\nINT. SOMEWHERE - DAY\n\n`;
    }
  }

  // ---------- Storage quota monitoring ----------
  let _lastQuotaCheck = 0;
  function checkQuota() {
    const now = Date.now();
    if (now - _lastQuotaCheck < 30000) return; // throttle: check at most every 30s
    _lastQuotaCheck = now;
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("bestscreen.")) {
          total += key.length + (localStorage.getItem(key) || "").length;
        }
      }
      const totalMB = (total * 2) / (1024 * 1024); // UTF-16 = 2 bytes/char
      if (totalMB > 3.5) { // ~70% of 5MB
        if (typeof toast === "function") {
          toast("⚠️ Storage is getting full (" + totalMB.toFixed(1) + " MB). Export or delete old projects.");
        }
      }
    } catch (e) { /* silent */ }
  }

  return {
    // index
    readIndex, writeIndex,
    getSettings, setSettings,
    getStreak, bumpStreak,
    pdfLog, pushPdfLog,
    setLastOpened, getLastOpened,
    // projects
    listProjects, getProject, createProject, updateProject, deleteProject,
    // series
    listSeries, createSeries, deleteSeries, getSeries, updateSeries,
    listProjectsBySeries, getSeriesBible, setSeriesBible,
    // per-project
    getDoc, setDoc, getMeta, setMeta, getBible, setBible, getProofDict, setProofDict,
    getSnaps, setSnaps, getComments, setComments,
    getChanges, setChanges, getBin, setBin,
    getPdfList, setPdfList,
    // bulk
    exportProject, importProject, search,
    // utility
    uid,
  };
})();
