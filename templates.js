"use strict";
/* =============================================================================
 * BESTSCREEN STORY TEMPLATES
 *
 * Each template defines beats as percentage of total runtime (0.0–1.0).
 * The Beat-Board ghost cards are placed at the expected page locations; the
 * Fidelity panel compares your real beats against the template's targets.
 * ============================================================================= */

const Templates = {
  list: [
    {
      id: "stc",
      name: "Save the Cat (Blake Snyder)",
      pages: 110,
      beats: [
        { id: "open",   name: "Opening Image",       at: 0.01, desc: "First impression: tone, mood, type, scope." },
        { id: "setup",  name: "Setup",               at: 0.05, desc: "Establish hero, world, and what's missing." },
        { id: "theme",  name: "Theme Stated",        at: 0.05, desc: "Someone (usually not the hero) hints at the story's theme." },
        { id: "catalyst", name: "Catalyst",          at: 0.10, desc: "Life-changing event hits the hero." },
        { id: "debate", name: "Debate",              at: 0.15, desc: "Hero hesitates. Can they / should they?" },
        { id: "break1", name: "Break Into Two",      at: 0.22, desc: "Hero accepts the call. Enters the upside-down world." },
        { id: "bstory", name: "B Story",             at: 0.25, desc: "New character or relationship — often the love interest / theme keeper." },
        { id: "fun",    name: "Fun and Games",       at: 0.30, desc: "Promise of the premise. Why the audience came." },
        { id: "midpoint", name: "Midpoint",          at: 0.50, desc: "False victory or false defeat. Stakes raised." },
        { id: "badguys", name: "Bad Guys Close In",  at: 0.55, desc: "External & internal pressure mounts." },
        { id: "alllost", name: "All Is Lost",        at: 0.75, desc: "The worst moment. Death (literal or symbolic)." },
        { id: "dark",   name: "Dark Night of Soul",  at: 0.80, desc: "Hero reflects. Hopeless. Until…" },
        { id: "break2", name: "Break Into Three",    at: 0.85, desc: "Solution! A & B stories collide. New plan." },
        { id: "finale", name: "Finale",              at: 0.90, desc: "Hero proves their lesson. Climax." },
        { id: "close",  name: "Final Image",         at: 0.99, desc: "Mirror of opening. Shows the change." },
      ],
    },
    {
      id: "hero",
      name: "Hero's Journey (Campbell / Vogler)",
      pages: 110,
      beats: [
        { id: "ordinary",  name: "Ordinary World",   at: 0.02, desc: "Hero's normal life, before the adventure." },
        { id: "call",      name: "Call to Adventure", at: 0.10, desc: "Disturbance breaks the status quo." },
        { id: "refuse",    name: "Refusal",          at: 0.15, desc: "Fear, doubt, reluctance to leave." },
        { id: "mentor",    name: "Meeting the Mentor", at: 0.20, desc: "Wisdom, tools, training, encouragement." },
        { id: "cross",     name: "Crossing the Threshold", at: 0.25, desc: "Commits to the adventure. New world." },
        { id: "tests",     name: "Tests, Allies, Enemies", at: 0.35, desc: "Learns the rules of the new world." },
        { id: "approach",  name: "Approach to the Inmost Cave", at: 0.50, desc: "Preparation for the central ordeal." },
        { id: "ordeal",    name: "The Ordeal",       at: 0.60, desc: "Crisis. Death and rebirth." },
        { id: "reward",    name: "Reward",           at: 0.70, desc: "Seizes the prize from the ordeal." },
        { id: "road",      name: "The Road Back",    at: 0.80, desc: "Recommit to journey. Chase / consequences." },
        { id: "resurrect", name: "Resurrection",     at: 0.90, desc: "Final test. Hero is reborn." },
        { id: "elixir",    name: "Return with Elixir", at: 0.97, desc: "Comes home transformed, with a gift." },
      ],
    },
    {
      id: "act3",
      name: "Three-Act Structure",
      pages: 110,
      beats: [
        { id: "open",   name: "Opening",         at: 0.01, desc: "Establish world and protagonist." },
        { id: "incite", name: "Inciting Incident", at: 0.12, desc: "The thing that gets the story going." },
        { id: "lock1",  name: "Plot Point I",    at: 0.25, desc: "Hero commits to Act II goal." },
        { id: "mid",    name: "Midpoint",        at: 0.50, desc: "Reversal or escalation." },
        { id: "lock2",  name: "Plot Point II",   at: 0.75, desc: "Lowest point / final push." },
        { id: "climax", name: "Climax",          at: 0.90, desc: "The final confrontation." },
        { id: "res",    name: "Resolution",      at: 0.97, desc: "New normal." },
      ],
    },
    {
      id: "circle",
      name: "Story Circle (Dan Harmon)",
      pages: 110,
      beats: [
        { id: "you",    name: "1. You — A character in a zone of comfort", at: 0.02 },
        { id: "need",   name: "2. Need — But they want something",         at: 0.12 },
        { id: "go",     name: "3. Go — They enter an unfamiliar situation", at: 0.25 },
        { id: "search", name: "4. Search — Adapt to it",                    at: 0.40 },
        { id: "find",   name: "5. Find — Find what they wanted",            at: 0.50 },
        { id: "take",   name: "6. Take — Pay a heavy price for it",         at: 0.70 },
        { id: "return", name: "7. Return — Go back to their familiar situation", at: 0.85 },
        { id: "change", name: "8. Change — Having changed",                 at: 0.97 },
      ],
    },
    {
      id: "fivept",
      name: "Five-Point Outline (TV)",
      pages: 55,
      beats: [
        { id: "hook",   name: "Hook / Teaser",    at: 0.02, desc: "Grab them in the first 60 seconds." },
        { id: "act1",   name: "Act One: Status Quo Broken", at: 0.20 },
        { id: "act2",   name: "Act Two: Pursue the Goal",  at: 0.45 },
        { id: "act3",   name: "Act Three: Reversal",       at: 0.70 },
        { id: "tag",    name: "Tag / Resolution",          at: 0.95 },
      ],
    },
  ],

  get(id) { return this.list.find(t => t.id === id); },

  // For each beat at percentage `at`, derive expected page.
  expectedPagesFor(template, totalPages) {
    if (!template) return [];
    return template.beats.map(b => ({ ...b, expectedPage: Math.max(1, Math.round(b.at * totalPages)) }));
  },

  // Compare user's actual scene positions to template beats. Returns
  // [{ beat, expectedPage, actualPage|null, deviation, label }]
  fidelityAnalysis(template, scenes, totalPages) {
    if (!template) return [];
    return template.beats.map(b => {
      const expected = Math.round(b.at * totalPages);
      // Find scene whose synopsis or note mentions this beat by id
      const sc = scenes.find(s => (s.beatTag || "").toLowerCase() === b.id ||
                                   (s.beatTag || "").toLowerCase() === b.name.toLowerCase());
      const actual = sc ? sc.pageAt : null;
      const dev = (actual && expected) ? actual - expected : null;
      return { beat: b, expectedPage: expected, actualPage: actual, deviation: dev };
    });
  },
};
