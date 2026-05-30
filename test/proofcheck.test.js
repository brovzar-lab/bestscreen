import { describe, it, expect } from "vitest";

// ---------- Unit under test: damerauLevenshtein ----------
// Since proofcheck.js is a browser IIFE, we extract the pure function for testing.
// This is a copy of the algorithm from proofcheck.js — if the original changes,
// update this copy. (A future refactor should export these as ES modules.)

function damerauLevenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  let prevPrev = new Array(bl + 1);
  let prev = new Array(bl + 1);
  let cur = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i-1) === b.charCodeAt(j-1) ? 0 : 1;
      cur[j] = Math.min(
        cur[j-1] + 1,
        prev[j] + 1,
        prev[j-1] + cost,
      );
      if (i > 1 && j > 1
          && a.charCodeAt(i-1) === b.charCodeAt(j-2)
          && a.charCodeAt(i-2) === b.charCodeAt(j-1)) {
        cur[j] = Math.min(cur[j], prevPrev[j-2] + 1);
      }
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    [prevPrev, prev, cur] = [prev, cur, prevPrev];
  }
  return prev[bl];
}

// ---------- Tests ----------

describe("damerauLevenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(damerauLevenshtein("hello", "hello", 3)).toBe(0);
  });

  it("returns string length for empty vs non-empty", () => {
    expect(damerauLevenshtein("", "abc", 5)).toBe(3);
    expect(damerauLevenshtein("abc", "", 5)).toBe(3);
  });

  it("detects single substitution", () => {
    expect(damerauLevenshtein("cat", "car", 2)).toBe(1);
  });

  it("detects single insertion", () => {
    expect(damerauLevenshtein("cat", "cats", 2)).toBe(1);
  });

  it("detects single deletion", () => {
    expect(damerauLevenshtein("cats", "cat", 2)).toBe(1);
  });

  it("detects transposition (Damerau extension)", () => {
    // "ab" → "ba" should be distance 1 (transposition), not 2 (sub+sub)
    expect(damerauLevenshtein("ab", "ba", 2)).toBe(1);
    expect(damerauLevenshtein("teh", "the", 2)).toBe(1);
  });

  it("early-exits when length difference exceeds max", () => {
    expect(damerauLevenshtein("a", "abcdef", 2)).toBe(3); // max+1
  });

  it("handles common typos", () => {
    expect(damerauLevenshtein("recieve", "receive", 2)).toBe(1); // transposition
    expect(damerauLevenshtein("definately", "definitely", 3)).toBe(1);
  });

  it("handles case-sensitive comparison", () => {
    // The function compares char codes directly — 'A' !== 'a'
    expect(damerauLevenshtein("Hello", "hello", 2)).toBe(1);
  });
});

describe("suggestionsFor (algorithm properties)", () => {
  // We can't call the full suggestionsFor without a loaded dict,
  // but we can verify the distance function satisfies key properties:

  it("is symmetric", () => {
    const pairs = [["kitten", "sitting"], ["abc", "def"], ["foo", "oof"]];
    pairs.forEach(([a, b]) => {
      expect(damerauLevenshtein(a, b, 10)).toBe(damerauLevenshtein(b, a, 10));
    });
  });

  it("satisfies triangle inequality", () => {
    const d_ab = damerauLevenshtein("abc", "abd", 10);
    const d_bc = damerauLevenshtein("abd", "aef", 10);
    const d_ac = damerauLevenshtein("abc", "aef", 10);
    expect(d_ac).toBeLessThanOrEqual(d_ab + d_bc);
  });
});
