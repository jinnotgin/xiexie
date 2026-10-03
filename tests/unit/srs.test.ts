import { describe, expect, it } from "vitest";
import type { Meta, ProgressRec, Word } from "../../src/types";
import { WORDS } from "../../src/data/words";
import {
  DAY, DEFAULT_META, INTERVALS, applyWritten, buildSession, dueWords, gradeOf, migrateLevels,
  nextProgress, statusOf, streakLive, todayKey,
} from "../../src/lib/srs";

const word = (w: string, l = "p1"): Word => ({ w, p: "", e: "", l, id: w });
const NOW = new Date(2026, 9, 1, 12).getTime();
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe("words data", () => {
  it("gives business words their own id", () => {
    const biz = WORDS.filter(w => w.l === "biz");
    expect(biz.length).toBeGreaterThan(0);
    expect(biz.every(w => w.id === "biz:" + w.w)).toBe(true);
    expect(WORDS.filter(w => w.l !== "biz").every(w => w.id === w.w)).toBe(true);
  });
});

describe("nextProgress (Leitner boxes)", () => {
  it("starts a new word and moves it up a box on perfect", () => {
    const p = nextProgress(undefined, "人", "perfect", NOW);
    expect(p).toMatchObject({ id: "人", box: 1, seen: 1, perfect: 1, last: "perfect", due: NOW + INTERVALS[1] });
  });
  it("caps the box at 6", () => {
    const p = nextProgress({ id: "人", box: 6, due: 0, seen: 9, perfect: 9 }, "人", "perfect", NOW);
    expect(p.box).toBe(6);
    expect(p.due).toBe(NOW + 32 * DAY);
  });
  it("good keeps the box but at least 1, ok drops to 1, again drops to 0", () => {
    const prev: ProgressRec = { id: "人", box: 3, due: 0, seen: 3, perfect: 2 };
    expect(nextProgress(prev, "人", "good", NOW).box).toBe(3);
    expect(nextProgress({ ...prev, box: 0 }, "人", "good", NOW).box).toBe(1);
    expect(nextProgress(prev, "人", "ok", NOW).box).toBe(1);
    const again = nextProgress(prev, "人", "again", NOW);
    expect(again.box).toBe(0);
    expect(again.due).toBe(NOW);
  });
  it("does not mutate the previous record", () => {
    const prev: ProgressRec = { id: "人", box: 2, due: 0, seen: 2, perfect: 1 };
    nextProgress(prev, "人", "perfect", NOW);
    expect(prev).toEqual({ id: "人", box: 2, due: 0, seen: 2, perfect: 1 });
  });
});

describe("status and due words", () => {
  const progress = new Map<string, ProgressRec>([
    ["一", { id: "一", box: 4, due: NOW - 1, seen: 5, perfect: 5 }],
    ["二", { id: "二", box: 1, due: NOW + DAY, seen: 1, perfect: 1 }],
    ["三", { id: "三", box: 0, due: NOW - DAY, seen: 1, perfect: 0 }],
  ]);
  const words = [word("一"), word("二"), word("三"), word("四"), word("五", "p2")];
  it("classifies new / learning / mastered", () => {
    expect(statusOf(progress, "一")).toBe("mastered");
    expect(statusOf(progress, "二")).toBe("learning");
    expect(statusOf(progress, "四")).toBe("new");
  });
  it("masters a word only after two perfects beyond box 1", () => {
    const p = new Map<string, ProgressRec>();
    for (const g of ["good", "perfect"] as const) p.set("人", nextProgress(p.get("人"), "人", g, NOW));
    expect(statusOf(p, "人")).toBe("learning");
    p.set("人", nextProgress(p.get("人"), "人", "perfect", NOW));
    expect(statusOf(p, "人")).toBe("mastered");
  });
  it("lists only seen words whose due time has passed, within the levels", () => {
    expect(dueWords(words, progress, ["p1"], NOW).map(w => w.w)).toEqual(["一", "三"]);
    expect(dueWords(words, progress, ["p2"], NOW)).toEqual([]);
  });
});

describe("buildSession", () => {
  it("for a new learner picks the first 10 new words of the level", () => {
    const s = buildSession(WORDS, new Map(), ["p1"], 10, seeded());
    const firstTen = WORDS.filter(w => w.l === "p1").slice(0, 10).map(w => w.id).sort();
    expect(s.map(w => w.id).sort()).toEqual(firstTen);
  });
  it("puts at most 60% due reviews in, oldest first", () => {
    const p1 = WORDS.filter(w => w.l === "p1");
    const progress = new Map<string, ProgressRec>(
      p1.slice(0, 20).map((w, i) => [w.id, { id: w.id, box: 1, due: NOW - (i + 1) * 1000, seen: 1, perfect: 0 }]));
    const s = buildSession(WORDS, progress, ["p1"], 10, seeded(), NOW);
    const ids = new Set(s.map(w => w.id));
    expect(s).toHaveLength(10);
    // The 6 most overdue are p1[19]..p1[14].
    for (const w of p1.slice(14, 20)) expect(ids.has(w.id)).toBe(true);
    expect(s.filter(w => progress.has(w.id))).toHaveLength(6);
  });
  it("fills from already-seen words when nothing is new", () => {
    const words = [word("一"), word("二")];
    const progress = new Map<string, ProgressRec>(words.map(w => [w.id, { id: w.id, box: 2, due: NOW + DAY, seen: 1, perfect: 1 }]));
    expect(buildSession(words, progress, ["p1"], 10, seeded(), NOW)).toHaveLength(2);
  });
});

describe("gradeOf", () => {
  const c = { word: word("你好"), mistakes: 0, hints: 0, shaky: 0, revealed: false, notes: [] as { ch: string; order: number; backwards: number }[] };
  it("grades perfect, good, ok and again", () => {
    expect(gradeOf(c)).toBe("perfect");
    expect(gradeOf({ ...c, notes: [{ ch: "你", order: 1, backwards: 0 }] })).toBe("good");
    expect(gradeOf({ ...c, mistakes: 4 })).toBe("good");      // up to 2 per character
    expect(gradeOf({ ...c, shaky: 1 })).toBe("good");         // relaxed: only just passed, or started over
    expect(gradeOf({ ...c, mistakes: 5 })).toBe("ok");
    expect(gradeOf({ ...c, hints: 1 })).toBe("ok");
    expect(gradeOf({ ...c, revealed: true })).toBe("again");
  });
});

describe("streak and written count", () => {
  const fresh = (): Meta => ({ ...DEFAULT_META, levels: ["p1"] });
  it("starts a streak at 1 and counts characters", () => {
    const m = applyWritten(fresh(), word("你好"), NOW);
    expect(m).toMatchObject({ streak: 1, lastDay: todayKey(new Date(NOW)), written: 2 });
  });
  it("extends the streak on consecutive days, resets after a gap, and holds within a day", () => {
    const yesterday = { ...fresh(), streak: 4, lastDay: todayKey(new Date(NOW - DAY)) };
    expect(applyWritten(yesterday, word("人"), NOW).streak).toBe(5);
    const stale = { ...fresh(), streak: 4, lastDay: todayKey(new Date(NOW - 3 * DAY)) };
    expect(applyWritten(stale, word("人"), NOW).streak).toBe(1);
    const today = { ...fresh(), streak: 4, lastDay: todayKey(new Date(NOW)) };
    expect(applyWritten(today, word("人"), NOW).streak).toBe(4);
  });
  it("shows the streak only while it is alive", () => {
    expect(streakLive({ ...fresh(), lastDay: todayKey(new Date(NOW - DAY)) }, NOW)).toBe(true);
    expect(streakLive({ ...fresh(), lastDay: todayKey(new Date(NOW - 2 * DAY)) }, NOW)).toBe(false);
  });
});

describe("migrateLevels", () => {
  it("maps old ids, drops unknown ones and never returns empty", () => {
    expect(migrateLevels(["p12", "jc"])).toEqual(["p1", "p2", "biz"]);
    expect(migrateLevels(["p1", "p12"])).toEqual(["p1", "p2"]);
    expect(migrateLevels(["nope"])).toEqual(["p1"]);
  });
});
