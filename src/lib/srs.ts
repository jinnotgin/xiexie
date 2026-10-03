/* =========================================================
   Spaced repetition (simple Leitner boxes) and grading.
   Pure functions: progress and meta are passed in, so the
   rules can be unit-tested without a browser.
   ========================================================= */
import type { CardState, Counts, Grade, Meta, ProgressRec, Status, StrokeNote, Word } from "../types";
import { LEVEL_MIGRATION, LEVELS } from "../data/levels";

export const DAY = 86400000;
export const INTERVALS = [0, 1, 2, 4, 8, 16, 32].map(d => d * DAY);
export const MASTERED_BOX = 3;
export const DEFAULT_META: Meta = { streak: 0, lastDay: null, levels: ["p1"], relaxed: false, written: 0 };

export type ProgressMap = Map<string, ProgressRec>;

export function todayKey(d = new Date()) { return d.toLocaleDateString("en-CA"); }

/** The Monday a week starts on, in local time, as a day key. */
export function weekKey(d = new Date()) {
  return todayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7));
}

/** Adds n characters to a counter (in place), starting this week's count afresh on a new week. */
export function addWritten(c: Counts, n: number, now = Date.now()) {
  const w = weekKey(new Date(now));
  if (c.week !== w) { c.week = w; c.weekWritten = 0; }
  c.weekWritten = (c.weekWritten || 0) + n;
  c.written += n;
  return c;
}

/** Characters written this week by a counter, 0 if its count is from an earlier week. */
export const writtenThisWeek = (c: Counts, now = Date.now()) =>
  c.week === weekKey(new Date(now)) ? c.weekWritten || 0 : 0;

export function statusOf(progress: ProgressMap, id: string): Status {
  const p = progress.get(id);
  if (!p || !p.seen) return "new";
  return p.box >= MASTERED_BOX ? "mastered" : "learning";
}

export function dueWords(words: Word[], progress: ProgressMap, levels: string[], now = Date.now()) {
  return words.filter(w => levels.includes(w.l)).filter(w => {
    const p = progress.get(w.id); return p && p.seen && p.due <= now;
  });
}

export function shuffle<T>(a: T[], rand: () => number = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Up to 60% due reviews (oldest first), topped up with new words, then anything else. */
export function buildSession(words: Word[], progress: ProgressMap, levels: string[], n = 10, rand: () => number = Math.random, now = Date.now()) {
  const pool = words.filter(w => levels.includes(w.l));
  const due = dueWords(words, progress, levels, now).sort((a, b) => progress.get(a.id)!.due - progress.get(b.id)!.due);
  const picked = due.slice(0, Math.ceil(n * 0.6));
  const fresh = pool.filter(w => statusOf(progress, w.id) === "new");
  for (const w of fresh) { if (picked.length >= n) break; picked.push(w); }
  if (picked.length < n) {
    const rest = shuffle(pool.filter(w => !picked.includes(w)), rand);
    for (const w of rest) { if (picked.length >= n) break; picked.push(w); }
  }
  return shuffle(picked, rand);
}

/** The progress record after writing a word with the given grade. */
export function nextProgress(prev: ProgressRec | undefined, wordId: string, grade: Grade, now = Date.now()): ProgressRec {
  const p: ProgressRec = prev ? { ...prev } : { id: wordId, box: 0, due: now, seen: 0, perfect: 0 };
  p.seen += 1;
  if (grade === "perfect") { p.box = Math.min(6, p.box + 1); p.perfect += 1; }
  else if (grade === "good") { p.box = Math.max(1, p.box); }
  else if (grade === "ok") { p.box = 1; }
  else { p.box = 0; }
  p.due = now + INTERVALS[p.box];
  p.last = grade; p.updatedAt = now;
  return p;
}

/** Updates streak and characters-written on meta (in place) after a word is written. */
export function applyWritten(meta: Meta, word: Word, now = Date.now()) {
  const t = todayKey(new Date(now));
  if (meta.lastDay !== t) {
    const y = todayKey(new Date(now - DAY));
    meta.streak = meta.lastDay === y ? meta.streak + 1 : 1;
    meta.lastDay = t;
  }
  addWritten(meta, word.w.length, now);
  return meta;
}

export function streakLive(meta: Meta, now = Date.now()) {
  return meta.lastDay === todayKey(new Date(now)) || meta.lastDay === todayKey(new Date(now - DAY));
}

/** Maps old level ids to new ones and drops unknown ones; never returns an empty list. */
export function migrateLevels(levels: string[]) {
  const valid = new Set(LEVELS.map(l => l.id));
  const out = [...new Set(levels.flatMap(id => LEVEL_MIGRATION[id] || [id]))].filter(id => valid.has(id));
  return out.length ? out : ["p1"];
}

export function gradeOf(c: Pick<CardState, "revealed" | "word" | "mistakes" | "hints" | "notes" | "shaky">): Grade {
  if (c.revealed) return "again";
  const n = c.word.w.length;
  if (c.mistakes === 0 && c.hints === 0 && !c.notes.length && !c.shaky) return "perfect";
  if (c.hints === 0 && c.mistakes <= n * 2) return "good";   // includes "correct, but order/direction differs"
  return "ok";
}

/** How a correctly written word's strokes went their own way, or null if they didn't. */
export function noteKind(notes: StrokeNote[]): "both" | "order" | "backwards" | null {
  if (!notes.length) return null;
  const order = notes.some(n => n.order), back = notes.some(n => n.backwards);
  return order && back ? "both" : order ? "order" : "backwards";
}

export const STAMPS: Record<Grade, { ch: string; label: string }> = {
  perfect: { ch: "优", label: "Excellent" },
  good:    { ch: "好", label: "Good" },
  ok:      { ch: "进", label: "Improving" },
  again:   { ch: "再", label: "Once more" },
};

