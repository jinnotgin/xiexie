import { describe, expect, it } from "vitest";
import { parseCandidates, toRequestInk } from "../../src/lib/handwriting";
import type { Pt } from "../../src/lib/relaxed";

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
