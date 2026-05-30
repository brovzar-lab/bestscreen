import { describe, it, expect, beforeEach } from "vitest";

// ---------- localStorage mock ----------
function createMockStorage() {
  const store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] || null,
    _store: store,
  };
}

// ---------- Minimal Storage module recreation ----------
// Extracted from storage.js — tests the core CRUD logic without the browser.

function createStorage(ls) {
  const K = "bestscreen.v3";
  const KEY_INDEX = K + ".index";
  const proj = (id) => K + ".p." + id;

  const DEFAULT_INDEX = {
    projects: [],
    series: [],
    settings: { smartTypo: true, sceneNumbersInPdf: true, theme: "manuscript", author: "", ai: { provider: "anthropic", apiKey: "", model: "" } },
    streak: {},
    pdfLog: [],
    lastOpenedId: null,
  };

  function readIndex() {
    try {
      const raw = ls.getItem(KEY_INDEX);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_INDEX));
      const obj = JSON.parse(raw);
      return { ...JSON.parse(JSON.stringify(DEFAULT_INDEX)), ...obj,
               settings: { ...DEFAULT_INDEX.settings, ...(obj.settings || {}) } };
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_INDEX));
    }
  }

  function writeIndex(idx) {
    ls.setItem(KEY_INDEX, JSON.stringify(idx));
  }

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    }
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  function getSettings() { return readIndex().settings; }
  function setSettings(patch) {
    const idx = readIndex();
    idx.settings = { ...idx.settings, ...patch };
    writeIndex(idx);
  }

  function _write(id, suffix, value) {
    ls.setItem(proj(id) + "." + suffix,
      typeof value === "string" ? value : JSON.stringify(value));
  }
  function _read(id, suffix, defVal) {
    try {
      const raw = ls.getItem(proj(id) + "." + suffix);
      if (!raw) return defVal;
      return JSON.parse(raw);
    } catch (e) { return defVal; }
  }
  function _readRaw(id, suffix) {
    return ls.getItem(proj(id) + "." + suffix) || "";
  }

  const getDoc = id => _readRaw(id, "doc");
  const setDoc = (id, txt) => _write(id, "doc", txt);
  const getMeta = id => _read(id, "meta", {});
  const setMeta = (id, m) => _write(id, "meta", m);

  function createProject({ name, type = "feature" }) {
    const idx = readIndex();
    const id = uid();
    idx.projects.unshift({ id, name, type, lastModified: Date.now(), lastOpened: Date.now() });
    writeIndex(idx);
    setDoc(id, "");
    setMeta(id, { titleMeta: { title: name } });
    return id;
  }

  function getProject(id) {
    return readIndex().projects.find(p => p.id === id) || null;
  }

  function deleteProject(id) {
    const idx = readIndex();
    idx.projects = idx.projects.filter(p => p.id !== id);
    writeIndex(idx);
    ["doc", "meta"].forEach(suffix => ls.removeItem(proj(id) + "." + suffix));
  }

  return { readIndex, writeIndex, uid, getSettings, setSettings,
           getDoc, setDoc, getMeta, setMeta,
           createProject, getProject, deleteProject };
}

// ---------- Tests ----------

describe("Storage — Index CRUD", () => {
  let ls, S;

  beforeEach(() => {
    ls = createMockStorage();
    S = createStorage(ls);
  });

  it("returns default index when nothing is stored", () => {
    const idx = S.readIndex();
    expect(idx.projects).toEqual([]);
    expect(idx.series).toEqual([]);
    expect(idx.settings.theme).toBe("manuscript");
  });

  it("persists and reads back index", () => {
    const idx = S.readIndex();
    idx.lastOpenedId = "test123";
    S.writeIndex(idx);
    const idx2 = S.readIndex();
    expect(idx2.lastOpenedId).toBe("test123");
  });

  it("merges missing keys with defaults on read", () => {
    ls.setItem("bestscreen.v3.index", JSON.stringify({ projects: [{ id: "x" }] }));
    const idx = S.readIndex();
    expect(idx.projects).toHaveLength(1);
    expect(idx.settings).toBeDefined();
    expect(idx.settings.theme).toBe("manuscript");
  });
});

describe("Storage — Project lifecycle", () => {
  let ls, S;

  beforeEach(() => {
    ls = createMockStorage();
    S = createStorage(ls);
  });

  it("creates a project with unique ID", () => {
    const id = S.createProject({ name: "Test Script" });
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(5);
  });

  it("getProject returns the created project", () => {
    const id = S.createProject({ name: "My Film" });
    const p = S.getProject(id);
    expect(p).not.toBeNull();
    expect(p.name).toBe("My Film");
    expect(p.type).toBe("feature");
  });

  it("deleteProject removes project from index and storage", () => {
    const id = S.createProject({ name: "To Delete" });
    S.setDoc(id, "Some script content");
    expect(S.getDoc(id)).toBe("Some script content");

    S.deleteProject(id);
    expect(S.getProject(id)).toBeNull();
    expect(S.getDoc(id)).toBe("");
  });

  it("creates multiple projects with unique IDs", () => {
    const ids = new Set();
    for (let i = 0; i < 20; i++) {
      ids.add(S.createProject({ name: `Project ${i}` }));
    }
    expect(ids.size).toBe(20);
  });
});

describe("Storage — Doc read/write", () => {
  let ls, S;

  beforeEach(() => {
    ls = createMockStorage();
    S = createStorage(ls);
  });

  it("stores and retrieves Fountain text", () => {
    const id = S.createProject({ name: "Script" });
    const fountain = "Title: My Script\nCredit: Written by\n\nFADE IN:\n\nINT. ROOM - DAY\n\nHello world.\n";
    S.setDoc(id, fountain);
    expect(S.getDoc(id)).toBe(fountain);
  });

  it("returns empty string for missing doc", () => {
    expect(S.getDoc("nonexistent")).toBe("");
  });

  it("round-trips meta objects", () => {
    const id = S.createProject({ name: "Meta Test" });
    const meta = { titleMeta: { title: "Meta Test", author: "Jane" }, logline: "A test." };
    S.setMeta(id, meta);
    expect(S.getMeta(id)).toEqual(meta);
  });
});

describe("Storage — Settings", () => {
  let ls, S;

  beforeEach(() => {
    ls = createMockStorage();
    S = createStorage(ls);
  });

  it("returns default settings initially", () => {
    const s = S.getSettings();
    expect(s.theme).toBe("manuscript");
    expect(s.ai.provider).toBe("anthropic");
  });

  it("patches settings without overwriting other keys", () => {
    S.setSettings({ author: "John" });
    const s = S.getSettings();
    expect(s.author).toBe("John");
    expect(s.theme).toBe("manuscript"); // preserved
  });

  it("updates AI settings", () => {
    S.setSettings({ ai: { provider: "openai", apiKey: "sk-test", model: "gpt-4o" } });
    const s = S.getSettings();
    expect(s.ai.provider).toBe("openai");
    expect(s.ai.apiKey).toBe("sk-test");
  });
});

describe("Storage — uid()", () => {
  let S;

  beforeEach(() => {
    S = createStorage(createMockStorage());
  });

  it("generates non-empty string IDs", () => {
    const id = S.uid();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(5);
  });

  it("generates unique IDs", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(S.uid());
    expect(ids.size).toBe(100);
  });
});
