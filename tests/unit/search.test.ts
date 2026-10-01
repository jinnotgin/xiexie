import { describe, expect, it } from "vitest";
import type { Word } from "../../src/types";
import { foldPinyin, searchWords } from "../../src/lib/search";

const word = (w: string, p: string, e: string): Word => ({ w, p, e, l: "p1", id: w });
const WORDS = [word("好", "hǎo", "good"), word("你好", "nǐ hǎo", "hello"), word("女", "nǚ", "female"), word("好看", "hǎo kàn", "good-looking")];
const ids = (q: string) => searchWords(WORDS, q).map(w => w.w);

describe("foldPinyin", () => {
  it("drops tones and spaces, and reads v as ü", () => {
    expect(foldPinyin("Nǐ Hǎo")).toBe("nihao");
    expect(foldPinyin("nǚ")).toBe(foldPinyin("nv"));
  });
});

describe("searchWords", () => {
  it("returns nothing for an empty query", () => expect(ids("  ")).toEqual([]));
  it("finds characters inside words, exact match first", () => expect(ids("好")).toEqual(["好", "你好", "好看"]));
  it("matches pinyin without tones or spaces", () => expect(ids("nihao")).toEqual(["你好"]));
  it("matches the start of the pinyin, exact match first", () => expect(ids("hao")).toEqual(["好", "好看"]));
  it("matches ü typed as v", () => expect(ids("nv")).toEqual(["女"]));
  it("matches English", () => expect(ids("Good")).toEqual(["好", "好看"]));
});
