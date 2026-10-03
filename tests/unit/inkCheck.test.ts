import { describe, expect, it } from "vitest";
import { assessInk, judgeInk, type Assessment } from "../../src/features/practice/lib/inkCheck";
import type { Pt, Verdict } from "../../src/features/practice/lib/relaxed";

const verdict = (v: Partial<Verdict> = {}): Verdict => ({
  ok: false, rank: 2, score: 0.12, best: "大", bestScore: 0.12, rival: "大", rivalScore: 0.12,
  incomplete: false, clean: false, ...v,
});
const strokes = (n: number): Pt[][] => Array.from({ length: n }, () => [[0, 0], [1, 1]] as Pt[]);

/** A stand-in checker: 太 has 4 strokes, 大 3, 犬 4. `finished` lists the characters the ink looks finished as. */
const checker = (v: Verdict, finished: string[] = []) => ({
  check: () => v,
  strokeCount: (c: string) => ({ 太: 4, 大: 3, 犬: 4 } as Record<string, number>)[c] ?? 0,
  looksFinished: (_: Pt[][], c: string) => finished.includes(c),
});

const assessment = (a: Partial<Assessment> = {}): Assessment => ({
  v: verdict(), fullCount: false, overshot: false, fullMiss: false, sendAs: "", ...a,
});

describe("assessInk", () => {
  it("doesn't count a pass as a miss of any kind", () => {
    const a = assessInk(checker(verdict({ ok: true })), strokes(6), "太", true);
    expect(a).toMatchObject({ fullCount: true, overshot: false, fullMiss: false, sendAs: "" });
  });

  it("is an overshoot only two strokes past the character's count", () => {
    expect(assessInk(checker(verdict()), strokes(5), "太", false).overshot).toBe(false);
    expect(assessInk(checker(verdict()), strokes(6), "太", false).overshot).toBe(true);
  });

  it("sends a full-count miss to Google, but only with Google on", () => {
    expect(assessInk(checker(verdict()), strokes(4), "太", true)).toMatchObject({ fullMiss: true, sendAs: "count" });
    expect(assessInk(checker(verdict()), strokes(4), "太", false)).toMatchObject({ fullMiss: true, sendAs: "" });
  });

  it("sends joined-up ink the checker judges finished as the target", () => {
    expect(assessInk(checker(verdict(), ["太"]), strokes(2), "太", true)).toMatchObject({ fullMiss: true, sendAs: "shape" });
  });

  it("leaves short, unfinished ink alone", () => {
    expect(assessInk(checker(verdict()), strokes(2), "太", true)).toMatchObject({ fullMiss: false, sendAs: "" });
  });

  it("sends a finished look-alike with at least the target's strokes, but not a smaller one that may be part of it", () => {
    expect(assessInk(checker(verdict({ best: "犬" }), ["犬"]), strokes(2), "太", true).sendAs).toBe("rival");
    expect(assessInk(checker(verdict({ best: "大" }), ["大"]), strokes(2), "太", true).sendAs).toBe("");
  });
});

describe("judgeInk", () => {
  it("passes what the checker accepts, keeping its clean mark", () => {
    expect(judgeInk(assessment({ v: verdict({ ok: true, clean: true }) }), null, "太").outcome).toEqual({ kind: "pass", clean: true });
  });

  it("passes a miss Google reads as the target, never as clean", () => {
    const j = judgeInk(assessment({ overshot: true }), ["太", "犬"], "太");
    expect(j).toMatchObject({ outcome: { kind: "pass", clean: false }, rescued: true });
  });

  it("waits while the ink hasn't overshot and nobody agrees on a look-alike", () => {
    expect(judgeInk(assessment(), ["犬"], "太").outcome).toEqual({ kind: "wait" });
  });

  it("names a look-alike straight away when Google and the checker agree on it", () => {
    const j = judgeInk(assessment({ v: verdict({ best: "犬", bestScore: 0.12 }) }), ["犬"], "太");
    expect(j).toMatchObject({ outcome: { kind: "rival", char: "犬" }, agreed: "犬" });
  });

  it("names a look-alike on an overshoot only when the ink fits it well", () => {
    expect(judgeInk(assessment({ overshot: true, v: verdict({ bestScore: 0.05 }) }), null, "太").outcome).toEqual({ kind: "rival", char: "大" });
    expect(judgeInk(assessment({ overshot: true, v: verdict({ bestScore: 0.12 }) }), null, "太").outcome).toEqual({ kind: "miss" });
  });
});
