import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore } from "../../src/features/practice/stores/session";
import type { Word } from "../../src/types";

const word = (w: string): Word => ({ w, p: "", e: "", l: "p1", id: w });

describe("session store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const round = (...ws: string[]) => {
    const s = useSessionStore();
    s.start(ws.map(word), "/", { relaxed: false, counts: true });
    return s;
  };

  it("grades a clean card perfect and moves on", () => {
    const s = round("大", "小");
    expect(s.beginCard()).toBe(false);
    expect(s.finishCard()).toBe("perfect");
    expect(s.completedCount).toBe(1);
    expect(s.advance()).toBe(true);
    s.beginCard();
    s.finishCard();
    expect(s.advance()).toBe(false);
    expect(s.queue).toHaveLength(2);
  });

  it("queues a failed word once more at the end of the round", () => {
    const s = round("大", "小");
    s.beginCard();
    s.cur!.revealed = true;
    expect(s.finishCard()).toBe("again");
    expect(s.queue.map(w => w.w)).toEqual(["大", "小", "大"]);
    s.advance(); s.beginCard(); s.finishCard();
    expect(s.advance()).toBe(true);
    expect(s.beginCard()).toBe(true);   // the requeued word's second go
  });

  it("counts peeking on the second go as ok, and doesn't queue the word a third time", () => {
    const s = round("大");
    s.beginCard(); s.cur!.revealed = true; s.finishCard();
    s.advance(); s.beginCard(); s.cur!.revealed = true;
    expect(s.finishCard()).toBe("ok");
    expect(s.queue).toHaveLength(2);
  });

  it("marks a skipped word as revealed and filled in, and still fails it on the second go", () => {
    const s = round("大小");
    s.beginCard();
    expect(s.finishCard(true)).toBe("again");
    expect(s.cur).toMatchObject({ done: true, revealed: true, filled: 2 });
    s.advance(); s.beginCard();
    expect(s.finishCard(true)).toBe("again");
    expect(s.queue).toHaveLength(2);
  });
});
