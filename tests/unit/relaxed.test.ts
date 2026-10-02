import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { type CharMedians, type Pt, makeChecker } from "../../src/lib/relaxed";

const DATA: Record<string, CharMedians> = JSON.parse(gunzipSync(readFileSync("src/data/chardata.json.gz")).toString());
const checker = makeChecker(DATA);

// Reference medians as screen-space ink (y down), the way the InkPad records it.
const asInk = (meds: Pt[][]): Pt[][] => meds.map(s => s.map(([x, y]): Pt => [x / 3, (900 - y) / 3]));
// Joined-up writing: every stroke runs straight on into the next without lifting the pen.
const joined = (meds: Pt[][]): Pt[][] => [asInk(meds).flat()];

// 字 written fast in 4 pen strokes instead of 6, traced from a real phone screenshot.
const CURSIVE_ZI: Pt[][] = [
  [[368, 770], [380, 782], [480, 792]],
  [[215, 857], [190, 870], [178, 890], [165, 960], [155, 1050], [165, 1055], [220, 1010], [340, 925], [490, 852], [600, 830], [665, 828], [715, 832], [790, 865]],
  [[270, 1158], [290, 1130], [410, 1060], [600, 982], [530, 1085], [470, 1190], [455, 1250], [458, 1290], [470, 1310], [520, 1340], [500, 1370], [410, 1430], [300, 1485]],
  [[210, 1403], [380, 1440], [520, 1475], [725, 1540]],
];

// 西 from a phone, with the left side and bottom joined into one L before the inner strokes
// (standard order puts the bottom last). Five pen strokes for six.
const XI = {
  top: [[148, 95], [230, 88], [312, 80]] as Pt[],
  pie: [[190, 112], [187, 160], [160, 195]] as Pt[],
  inR: [[235, 112], [238, 185], [272, 188]] as Pt[],
  leftBottom: [[110, 155], [130, 195], [150, 237], [240, 238], [330, 240]] as Pt[],
  hengZhe: [[110, 155], [215, 152], [320, 150], [323, 195], [325, 240]] as Pt[],
};

describe("relaxed checker", () => {
  it("accepts real cursive writing with joined strokes", () => {
    const v = checker.check(CURSIVE_ZI, "字");
    expect(v.ok).toBe(true);
    expect(v.rank).toBe(1);
  });

  it("does not accept the same ink as a look-alike", () => {
    expect(checker.check(CURSIVE_ZI, "交").ok).toBe(false);
    expect(checker.check(CURSIVE_ZI, "学").ok).toBe(false);
  });

  it("accepts neat stroke-by-stroke writing", () => {
    for (const c of "你好我们学字中国爱写") expect(checker.check(asInk(DATA[c].medians), c).ok, c).toBe(true);
  });

  it("accepts a whole character written without lifting the pen", () => {
    for (const c of "你我字是") expect(checker.check(joined(DATA[c].medians), c).ok, c).toBe(true);
  });

  it("ignores stroke order", () => {
    const { top, pie, inR, leftBottom, hengZhe } = XI;
    expect(checker.check([top, leftBottom, hengZhe, pie, inR], "西").ok).toBe(true);
    expect(checker.check([pie, inR, hengZhe, leftBottom, top], "西").ok).toBe(true);
    // a whole character's strokes reversed in order
    for (const c of "你我国写") expect(checker.check(asInk([...DATA[c].medians].reverse()), c).ok, c).toBe(true);
  });

  it("ignores stroke direction", () => {
    for (const c of "你我国写西") expect(checker.check(asInk(DATA[c].medians.map(s => [...s].reverse())), c).ok, c).toBe(true);
  });

  it("waits for the rest of the character", () => {
    // 宀 alone, and 亻 alone, are not yet 字 or 你
    expect(checker.check(asInk(DATA["字"].medians.slice(0, 3)), "字").ok).toBe(false);
    expect(checker.check(asInk(DATA["你"].medians.slice(0, 2)), "你").ok).toBe(false);
  });

  it("waits for the last stroke, even when nothing else fits better", () => {
    // each of these used to pass with its last stroke still to write
    for (const c of "的家因象石云昨全加共响苦") {
      const v = checker.check(asInk(DATA[c].medians.slice(0, -1)), c);
      expect(v.ok, c).toBe(false);
      expect(v.incomplete, c).toBe(true);
    }
  });

  it("rejects scribbles and empty ink", () => {
    const zigzag: Pt[][] = [Array.from({ length: 20 }, (_, i): Pt => [i * 15, i % 2 ? 0 : 200])];
    expect(checker.check(zigzag, "字").ok).toBe(false);
    expect(checker.check([], "字").ok).toBe(false);
    expect(checker.check(asInk(DATA["字"].medians), "not a character").ok).toBe(false);
  });

  it("knows each character's stroke count", () => {
    expect(checker.strokeCount("字")).toBe(6);
    expect(checker.strokeCount("not a character")).toBe(0);
  });
});
