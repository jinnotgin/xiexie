import { describe, expect, it } from "vitest";
import { agreedRival, parseCandidates, toRequestInk } from "../../src/features/practice/lib/handwriting";
import type { Pt } from "../../src/features/practice/lib/relaxed";

describe("toRequestInk", () => {
  it("turns strokes into rounded [xs, ys] pairs and drops empty strokes", () => {
    expect(toRequestInk([[[1.4, 2.6], [3.5, 4]], []])).toEqual([[[1, 4], [3, 4]]]);
  });

  it("thins long strokes but keeps their ends", () => {
    const long: Pt[] = Array.from({ length: 200 }, (_, i) => [i, 0]);
    const [[xs]] = toRequestInk([long]);
    expect(xs.length).toBeLessThanOrEqual(33);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(199);
  });
});

describe("parseCandidates", () => {
  it("keeps single Han characters, best first", () => {
    const reply = ["SUCCESS", [["id", ["十", "+", "t", "十一", "千"], [], {}]]];
    expect(parseCandidates(reply)).toEqual(["十", "千"]);
  });

  it("is null for failures and odd replies", () => {
    expect(parseCandidates(["FAILED_TO_PARSE_REQUEST_BODY"])).toBeNull();
    expect(parseCandidates({})).toBeNull();
    expect(parseCandidates(["SUCCESS", []])).toBeNull();
  });
});

describe("agreedRival", () => {
  const v = { best: "再", bestScore: 0.07 };
  it("names the other character both readings agree on", () => {
    expect(agreedRival(["再", "在"], v, "在")).toBe("再");
  });

  it("is empty when they disagree, Google can't say, or the reading is the target", () => {
    expect(agreedRival(["在", "再"], v, "在")).toBe("");
    expect(agreedRival(["册"], v, "在")).toBe("");
    expect(agreedRival(null, v, "在")).toBe("");
    expect(agreedRival([], v, "在")).toBe("");
    expect(agreedRival(["在"], { best: "在", bestScore: 0.05 }, "在")).toBe("");
  });

  it("is empty when the ink is no plausible shape for the rival", () => {
    expect(agreedRival(["再"], { best: "再", bestScore: 0.3 }, "在")).toBe("");
  });
});
