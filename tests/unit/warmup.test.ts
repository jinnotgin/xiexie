import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { CharMedians } from "../../src/features/practice/lib/relaxed";
import { DEMO, joinedUp, progressAt, timeline } from "../../src/features/practice/lib/warmup";

const DATA: Record<string, CharMedians> = JSON.parse(gunzipSync(readFileSync("src/data/chardata.json.gz")).toString());
const MEDS = DATA[DEMO.ch].medians;

describe("warm-up demo", () => {
  it("writes 起 in seven pen strokes for ten", () => {
    expect(MEDS).toHaveLength(10);
    const pen = joinedUp(MEDS);
    expect(pen).toHaveLength(7);
    // The long 竖 starts where stroke 2 starts and ends where stroke 4 ends.
    expect(pen[2][0]).toEqual(MEDS[1][0]);
    expect(pen[2].at(-1)).toEqual(MEDS[3].at(-1));
    // 己 is one stroke from the start of 横折 to the end of 竖弯钩.
    expect(pen[6][0]).toEqual(MEDS[7][0]);
    expect(pen[6].at(-1)).toEqual(MEDS[9].at(-1));
    // ...and never doubles back on itself: right, down, left, down, right, up.
    const turns = pen[6].slice(1).map((p, i) => {
      const dx = p[0] - pen[6][i][0], dy = p[1] - pen[6][i][1];
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "U" : "D");
    }).filter((d, i, a) => d !== a[i - 1]).join("");
    expect(turns).toBe("RDLDRU");
  });

  it("times strokes one after another, with the pen lifted between", () => {
    const { spans, total } = timeline([300, 600], 1, 100);
    expect(spans).toEqual([[0, 300], [400, 1000]]);
    expect(total).toBe(1000);
    expect(progressAt(spans, 350)).toEqual([1, 0]);
    expect(progressAt(spans, 700)[1]).toBeCloseTo(0.5);
  });
});
