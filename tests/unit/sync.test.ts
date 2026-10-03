import { describe, expect, it } from "vitest";
import type { Meta, ProgressRec, SyncState } from "../../src/types";
import { DEFAULT_META } from "../../src/lib/srs";
import {
  applyPatch, decodeRec, emptyCloud, encodeRec, freshSync, linkAction, mergeStreak, normalizeCloud,
  pullChanges, pushPatch, type CloudDoc,
} from "../../src/lib/sync";

const rec = (id: string, updatedAt: number, seen = 1, box = 1): ProgressRec =>
  ({ id, box, due: updatedAt + 1000, seen, perfect: 0, last: "good", updatedAt });
const map = (...rs: ProgressRec[]) => new Map(rs.map(r => [r.id, r]));
const meta = (m: Partial<Meta> = {}): Meta => ({ ...DEFAULT_META, ...m });
const sync = (s: Partial<SyncState> = {}): SyncState => ({ ...freshSync(), contrib: "me", uid: "u1", epoch: "e1", ...s });
const cloud = (c: Partial<CloudDoc> = {}): CloudDoc => ({ ...emptyCloud("e1"), ...c });

/** One full sync round, as the account store does it: push, then pull against the result. */
function round(progress: Map<string, ProgressRec>, m: Meta, s: SyncState, c: CloudDoc | null, now = Date.now()) {
  const patch = pushPatch(progress, m, s, c);
  const after = applyPatch(c, patch, s.epoch!);
  return { patch, after, pull: pullChanges(progress, m, s, after, now) };
}

describe("progress records", () => {
  it("round-trip through the cloud string format", () => {
    const r = rec("biz:合同", 1234, 3, 2);
    expect(decodeRec(r.id, encodeRec(r))).toEqual(r);
    const noLast = { id: "人", box: 0, due: 5, seen: 1, perfect: 0, updatedAt: 9 };
    expect(decodeRec("人", encodeRec(noLast))).toEqual(noLast);
  });
  it("ignores garbage", () => expect(decodeRec("人", "x,y")).toBeNull());
});

describe("mergeStreak", () => {
  it("joins a fresh streak today onto a run that ended yesterday on another device", () => {
    expect(mergeStreak({ streak: 1, lastDay: "2026-10-01" }, { streak: 10, lastDay: "2026-09-30" }))
      .toEqual({ streak: 11, lastDay: "2026-10-01" });
  });
  it("does not double-count the same days", () => {
    expect(mergeStreak({ streak: 5, lastDay: "2026-10-01" }, { streak: 5, lastDay: "2026-10-01" }))
      .toEqual({ streak: 5, lastDay: "2026-10-01" });
    expect(mergeStreak({ streak: 3, lastDay: "2026-10-01" }, { streak: 10, lastDay: "2026-10-01" }).streak).toBe(10);
  });
  it("keeps only the later run when there is a gap", () => {
    expect(mergeStreak({ streak: 2, lastDay: "2026-10-01" }, { streak: 10, lastDay: "2026-09-20" }))
      .toEqual({ streak: 2, lastDay: "2026-10-01" });
  });
  it("crosses month and year ends", () => {
    expect(mergeStreak({ streak: 1, lastDay: "2027-01-01" }, { streak: 2, lastDay: "2026-12-31" }).streak).toBe(3);
  });
  it("handles empty sides", () => {
    expect(mergeStreak({ streak: 0, lastDay: null }, { streak: 4, lastDay: "2026-10-01" })).toEqual({ streak: 4, lastDay: "2026-10-01" });
    expect(mergeStreak({ streak: 0, lastDay: null }, { streak: 0, lastDay: null })).toEqual({ streak: 0, lastDay: null });
  });
});

describe("linkAction", () => {
  const guest = sync({ uid: null, epoch: null });
  const used = cloud({ progress: { 人: encodeRec(rec("人", 1)) }, counters: { a: { written: 1 } } });
  it("asks only when a never-linked device and the account both have progress", () => {
    expect(linkAction(guest, "u1", used, false)).toBe("ask");
    expect(linkAction(guest, "u1", used, true)).toBe("merge");   // empty device: just take the account's
    expect(linkAction(guest, "u1", null, false)).toBe("merge");  // new account: upload this device's
    expect(linkAction(guest, "u1", cloud(), false)).toBe("merge");
  });
  it("syncs quietly on a device already linked to this account", () => {
    expect(linkAction(sync(), "u1", used, false)).toBe("merge");
    expect(linkAction(sync(), "u1", null, false)).toBe("merge"); // doc vanished: rebuild it from this device
  });
  it("drops this device's copy after a reset elsewhere, or when it belongs to another account", () => {
    expect(linkAction(sync(), "u1", { ...used, epoch: "e2" }, false)).toBe("adopt");
    expect(linkAction(sync({ uid: "someone-else" }), "u1", used, false)).toBe("adopt");
  });
});

describe("sync round", () => {
  it("uploads everything to a new account, with the epoch", () => {
    const m = meta({ written: 7, streak: 2, lastDay: "2026-10-01" });
    const s = sync({ own: { written: 7 }, settingsAt: 0 });
    const { patch, pull } = round(map(rec("人", 100)), m, s, null);
    expect(patch).toMatchObject({ epoch: "e1", counters: { me: { written: 7 } }, streak: { streak: 2, lastDay: "2026-10-01" } });
    expect(Object.keys(patch!.progress!)).toEqual(["人"]);
    expect(patch!.settings).toMatchObject({ levels: ["p1"], at: 0 });
    expect(pull.save).toEqual([]);
    expect(pull.meta).toMatchObject({ written: 7 });
  });

  it("keeps the newer record of each word in both directions", () => {
    const local = map(rec("人", 200, 3), rec("大", 100, 1));
    const c = cloud({ progress: { 人: encodeRec(rec("人", 150, 9)), 大: encodeRec(rec("大", 300, 2)), 小: encodeRec(rec("小", 50)) } });
    const { patch, pull } = round(local, meta(), sync(), c);
    expect(Object.keys(patch!.progress!)).toEqual(["人"]);
    expect(pull.save.map(r => r.id).sort()).toEqual(["大", "小"]);
    expect(pull.save.find(r => r.id === "大")!.updatedAt).toBe(300);
  });

  it("adds counts from every device instead of overwriting it (guest merging into an account)", () => {
    const c = cloud({ counters: { phone: { written: 40 }, tablet: { written: 9 } } });
    const s = sync({ own: { written: 3 } });
    const { patch, pull } = round(new Map(), meta({ written: 3 }), s, c);
    expect(patch!.counters).toEqual({ me: { written: 3 } });
    expect(pull.meta).toMatchObject({ written: 52 });
    expect(pull.sync.others).toMatchObject({ written: 49 });
  });

  it("counts this week across devices, leaving out counts from earlier weeks", () => {
    const now = new Date(2026, 9, 3, 12).getTime();   // Saturday; the week began Monday 2026-09-28
    const c = cloud({ counters: {
      phone: { written: 40, week: "2026-09-28", weekWritten: 12 },
      tablet: { written: 9, week: "2026-09-21", weekWritten: 9 },
    } });
    const s = sync({ own: { written: 5, week: "2026-09-28", weekWritten: 5 } });
    const { patch, pull } = round(new Map(), meta({ written: 5 }), s, c, now);
    expect(patch!.counters).toEqual({ me: { written: 5, week: "2026-09-28", weekWritten: 5 } });
    expect(pull.meta).toMatchObject({ written: 54, week: "2026-09-28", weekWritten: 17 });
  });

  it("starts the week at 0 when this device's own count is from last week", () => {
    const now = new Date(2026, 9, 5, 9).getTime();    // Monday 2026-10-05
    const s = sync({ own: { written: 5, week: "2026-09-28", weekWritten: 5 } });
    expect(round(new Map(), meta({ written: 5 }), s, cloud(), now).pull.meta).toMatchObject({ week: "2026-10-05", weekWritten: 0 });
  });

  it("is idempotent: syncing twice writes nothing the second time", () => {
    const local = map(rec("人", 200));
    const m = meta({ written: 1, streak: 1, lastDay: "2026-10-01" });
    const s = sync({ own: { written: 1 }, settingsAt: 5 });
    const first = round(local, m, s, cloud());
    const m2 = { ...m, ...first.pull.meta };
    expect(pushPatch(local, m2, first.pull.sync, first.after)).toBeNull();
  });

  it("never lowers this device's counter, even if the cloud has seen more (e.g. another tab)", () => {
    const c = cloud({ counters: { me: { written: 8 } } });
    const { patch, pull } = round(new Map(), meta({ written: 5 }), sync({ own: { written: 5 } }), c);
    expect(patch?.counters).toBeUndefined();
    expect(pull.sync.own).toEqual({ written: 8 });
  });

  it("takes newer settings from either side", () => {
    const c = cloud({ settings: { levels: ["p3"], relaxed: true, at: 200 } });
    const older = round(new Map(), meta(), sync({ settingsAt: 100 }), c);
    expect(older.patch).toBeNull();
    expect(older.pull.meta).toMatchObject({ levels: ["p3"], relaxed: true });
    const newer = round(new Map(), meta({ levels: ["p5"] }), sync({ settingsAt: 300 }), c);
    expect(newer.patch!.settings).toEqual({ levels: ["p5"], relaxed: false, at: 300 });
    expect(newer.pull.meta.levels).toBeUndefined();
  });

  it("migrates old level ids coming from the cloud", () => {
    const c = cloud({ settings: { levels: ["p12"], relaxed: false, at: 9 } });
    expect(round(new Map(), meta(), sync(), c).pull.meta.levels).toEqual(["p1"]);
  });

  it("merges streaks across devices", () => {
    const c = cloud({ streak: { streak: 10, lastDay: "2026-09-30" } });
    const { patch, pull } = round(new Map(), meta({ streak: 1, lastDay: "2026-10-01" }), sync(), c);
    expect(patch!.streak).toEqual({ streak: 11, lastDay: "2026-10-01" });
    expect(pull.meta).toMatchObject({ streak: 11, lastDay: "2026-10-01" });
  });
});

describe("normalizeCloud", () => {
  it("survives missing and malformed fields", () => {
    expect(normalizeCloud(undefined)).toEqual({ ...emptyCloud(""), epoch: "" });
    const c = normalizeCloud({ epoch: "e", progress: { 人: 3, 大: "1,2,3,4,,5" }, counters: { a: { xp: "x" } }, settings: { levels: "p1" } });
    expect(c.progress).toEqual({ 大: "1,2,3,4,,5" });
    expect(c.counters).toEqual({ a: { written: 0 } });
    expect(normalizeCloud({ counters: { a: { written: 3, week: "2026-09-28", weekWritten: "x" } } }).counters)
      .toEqual({ a: { written: 3, week: "2026-09-28", weekWritten: 0 } });
    expect(c.settings).toBeNull();
  });
});
