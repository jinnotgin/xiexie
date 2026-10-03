import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useProgressStore } from "../../src/stores/progress";
import { writtenThisWeek } from "../../src/lib/srs";

describe("progress store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("wipe starts a fresh profile, with nothing left over from the old one", async () => {
    const learner = useProgressStore();
    await learner.load();   // no IndexedDB here: Store answers from memory
    await learner.record({ w: "大", p: "dà", e: "big", l: "p1", id: "大" }, "perfect");
    learner.meta.levels = ["p3"];
    expect(writtenThisWeek(learner.meta)).toBe(1);

    await learner.wipe();
    expect(learner.progress.size).toBe(0);
    expect(learner.meta).toMatchObject({ streak: 0, written: 0, levels: ["p1"], relaxed: false });
    expect(learner.meta.week).toBeUndefined();
    expect(writtenThisWeek(learner.meta)).toBe(0);
    expect(learner.meta.sync).toMatchObject({ uid: null, epoch: null });
  });

  it("wipe can link the fresh profile to an account", async () => {
    const learner = useProgressStore();
    await learner.load();
    await learner.wipe({ uid: "u1", epoch: "e1" });
    expect(learner.meta.sync).toMatchObject({ uid: "u1", epoch: "e1" });
  });
});
