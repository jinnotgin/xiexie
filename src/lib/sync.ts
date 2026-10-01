/* =========================================================
   Cloud sync rules. Pure functions, like srs.ts: local state
   and the cloud document go in, changes come out. Firebase
   itself lives in cloud.ts, the wiring in stores/account.ts.

   Cloud document users/{uid}:
     epoch     changes on "Reset progress", so other devices
               drop their copy instead of re-uploading it
     progress  { wordId: "box,due,seen,perfect,last,updatedAt" }
               one string per word keeps all 3,000+ words under
               Firestore's per-document index limit; newest wins
     counters  { contribId: { written } }, one entry per
               device. Totals are the sum, so two devices never
               overwrite each other's count, and a guest's adds
               to the account's when they first sign in
     streak    { streak, lastDay }, merged as day ranges
     settings  { levels, relaxed, at }, newest wins
   ========================================================= */
import type { Counts, Grade, Meta, ProgressRec, SyncState } from "../types";
import { DAY, migrateLevels, type ProgressMap } from "./srs";

export interface Streak { streak: number; lastDay: string | null }
export interface Settings { levels: string[]; relaxed: boolean; at: number }
export interface CloudDoc {
  epoch: string;
  progress: Record<string, string>;
  counters: Record<string, Counts>;
  streak: Streak;
  settings: Settings | null;
}
export type CloudPatch = Partial<CloudDoc>;

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

export const freshSync = (own: Counts = { written: 0 }): SyncState =>
  ({ uid: null, epoch: null, contrib: newId(), own: { ...own }, others: { written: 0 }, settingsAt: 0 });

export const emptyCloud = (epoch: string): CloudDoc =>
  ({ epoch, progress: {}, counters: {}, streak: { streak: 0, lastDay: null }, settings: null });

/** Fills in anything missing or malformed in a document read from Firestore. */
export function normalizeCloud(d: any): CloudDoc {
  const obj = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, any>;
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  const counters: Record<string, Counts> = {};
  for (const [k, c] of Object.entries(obj(d?.counters))) counters[k] = { written: num(c?.written) };
  const s = d?.settings;
  return {
    epoch: typeof d?.epoch === "string" ? d.epoch : "",
    progress: Object.fromEntries(Object.entries(obj(d?.progress)).filter(([, v]) => typeof v === "string")),
    counters,
    streak: { streak: num(d?.streak?.streak), lastDay: typeof d?.streak?.lastDay === "string" ? d.streak.lastDay : null },
    settings: s && Array.isArray(s.levels) ? { levels: s.levels, relaxed: !!s.relaxed, at: num(s.at) } : null,
  };
}

/* ---------- Progress records ---------- */

export const encodeRec = (p: ProgressRec) => [p.box, p.due, p.seen, p.perfect, p.last || "", p.updatedAt || 0].join(",");

export function decodeRec(id: string, s: string): ProgressRec | null {
  const [box, due, seen, perfect, last, at] = s.split(",");
  const nums = [box, due, seen, perfect, at].map(Number);
  if (nums.some(n => !isFinite(n))) return null;
  const rec: ProgressRec = { id, box: nums[0], due: nums[1], seen: nums[2], perfect: nums[3], updatedAt: nums[4] };
  if (last) rec.last = last as Grade;
  return rec;
}

/** > 0 when a is newer than b: last written wins, more practice breaks a tie. */
export const compareRec = (a: ProgressRec, b: ProgressRec) => (a.updatedAt || 0) - (b.updatedAt || 0) || a.seen - b.seen;

/* ---------- Streak ---------- */

const dayNo = (key: string) => { const [y, m, d] = key.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };

/**
 * A streak of n ending on lastDay means every day in [lastDay - n + 1, lastDay] was practised.
 * If two such ranges overlap or touch, the union is one longer streak; otherwise the later one counts.
 */
export function mergeStreak(a: Streak, b: Streak): Streak {
  if (!a.lastDay || a.streak <= 0) return b.lastDay ? { ...b } : { streak: 0, lastDay: null };
  if (!b.lastDay || b.streak <= 0) return { ...a };
  const [late, early] = a.lastDay >= b.lastDay ? [a, b] : [b, a];
  const lateEnd = dayNo(late.lastDay!), lateStart = lateEnd - late.streak + 1;
  const earlyEnd = dayNo(early.lastDay!), earlyStart = earlyEnd - early.streak + 1;
  if (earlyEnd < lateStart - 1) return { ...late };
  return { streak: lateEnd - Math.min(lateStart, earlyStart) + 1, lastDay: late.lastDay };
}

const sameStreak = (a: Streak, b: Streak) => a.streak === b.streak && a.lastDay === b.lastDay;

/* ---------- Linking a device to an account ---------- */

export type LinkAction =
  | "merge"   // combine this device's progress with the account's (or the account is new, or this device is empty)
  | "adopt"   // drop this device's copy and take the account's
  | "ask";    // both have progress and this device was never linked: let the learner choose

export function linkAction(sync: SyncState, uid: string, cloud: CloudDoc | null, localEmpty: boolean): LinkAction {
  if (sync.uid === uid) return !cloud || cloud.epoch === sync.epoch ? "merge" : "adopt"; // reset on another device
  if (sync.uid) return "adopt";                    // this copy belongs to a different account
  if (!cloud || cloudEmpty(cloud) || localEmpty) return "merge";
  return "ask";
}

export const cloudEmpty = (c: CloudDoc) => !Object.keys(c.progress).length && !sumCounts(c.counters).written;

export function sumCounts(counters: Record<string, Counts>, except?: string): Counts {
  const t = { written: 0 };
  for (const [k, c] of Object.entries(counters)) if (k !== except) t.written += c.written;
  return t;
}

/* ---------- Syncing ---------- */

/** What to merge into the cloud document so it has everything this device has. Null when it already does. */
export function pushPatch(progress: ProgressMap, meta: Meta, sync: SyncState, cloud: CloudDoc | null): CloudPatch | null {
  const base = cloud || emptyCloud(sync.epoch!);
  const patch: CloudPatch = {};

  const recs: Record<string, string> = {};
  for (const [id, l] of progress) {
    const c = base.progress[id] && decodeRec(id, base.progress[id]);
    if (!c || compareRec(l, c) > 0) recs[id] = encodeRec(l);
  }
  if (Object.keys(recs).length) patch.progress = recs;

  const mine = base.counters[sync.contrib];
  if (sync.own.written > (mine?.written || 0)) {
    patch.counters = { [sync.contrib]: { written: sync.own.written } };
  }

  const streak = mergeStreak({ streak: meta.streak, lastDay: meta.lastDay }, base.streak);
  if (!sameStreak(streak, base.streak)) patch.streak = streak;

  if (sync.settingsAt > (base.settings?.at ?? -1)) patch.settings = { levels: [...meta.levels], relaxed: meta.relaxed, at: sync.settingsAt };

  if (!cloud) patch.epoch = sync.epoch!;
  return Object.keys(patch).length ? patch : null;
}

/** The cloud document after a merge write of `patch`, as Firestore would store it. */
export function applyPatch(cloud: CloudDoc | null, patch: CloudPatch | null, epoch: string): CloudDoc {
  const c = cloud || emptyCloud(epoch);
  if (!patch) return c;
  return {
    epoch: patch.epoch ?? c.epoch,
    progress: { ...c.progress, ...patch.progress },
    counters: { ...c.counters, ...patch.counters },
    streak: patch.streak ?? c.streak,
    settings: patch.settings ?? c.settings,
  };
}

export interface Pull {
  save: ProgressRec[];   // records where the cloud is newer than this device
  meta: Pick<Meta, "written" | "streak" | "lastDay"> & Partial<Pick<Meta, "levels" | "relaxed">>;
  sync: SyncState;
}

/**
 * Brings the cloud's state into this device's. Safe to run against local state that moved on
 * since the cloud was read (it only takes what is newer), so it is applied after the write commits.
 */
export function pullChanges(progress: ProgressMap, meta: Meta, sync: SyncState, cloud: CloudDoc): Pull {
  const save: ProgressRec[] = [];
  for (const [id, s] of Object.entries(cloud.progress)) {
    const c = decodeRec(id, s), l = progress.get(id);
    if (c && (!l || compareRec(c, l) > 0)) save.push(c);
  }
  const mine = cloud.counters[sync.contrib];
  const own = { written: Math.max(sync.own.written, mine?.written || 0) };
  const others = sumCounts(cloud.counters, sync.contrib);
  const streak = mergeStreak({ streak: meta.streak, lastDay: meta.lastDay }, cloud.streak);
  const out: Pull = {
    save,
    meta: { written: own.written + others.written, streak: streak.streak, lastDay: streak.lastDay },
    sync: { ...sync, own, others, epoch: cloud.epoch },
  };
  if (cloud.settings && cloud.settings.at > sync.settingsAt) {
    out.meta.levels = migrateLevels(cloud.settings.levels).slice(0, 1);
    out.meta.relaxed = cloud.settings.relaxed;
    out.sync.settingsAt = cloud.settings.at;
  }
  return out;
}

/** Headline numbers for the "which progress do you want to keep?" prompt. */
export const summarizeLocal = (progress: ProgressMap, meta: Meta) =>
  ({ words: [...progress.values()].filter(p => p.seen).length });
export const summarizeCloud = (c: CloudDoc) =>
  ({ words: Object.values(c.progress).filter(s => Number(s.split(",")[2]) > 0).length });
