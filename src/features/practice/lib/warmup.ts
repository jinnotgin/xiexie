/* =========================================================
   The first-round warm-up: two ways of writing 起 play side by
   side, the textbook's stroke by stroke and a joined-up hand,
   and the new learner picks the one that looks like them.
   Pure functions, so the demo can be unit-tested.
   ========================================================= */
import type { Pt } from "./relaxed";

export const DEMO = { ch: "起" };

/**
 * The pen strokes of 起 written the everyday way, from its ten textbook medians:
 * 走 as 横, 横, one 竖 run all the way down (strokes 2 and 4 as one), 横, 撇, 捺,
 * then all of 己 without lifting the pen: right, down, back left along the middle 横,
 * down, right and up. Seven pen strokes for ten.
 */
export function joinedUp(m: Pt[][]): Pt[][] {
  if (m.length !== 10) return m;
  // 己: 横折 down to the middle, the middle 横 drawn right to left, then 竖弯钩 from below its entry.
  const ji: Pt[] = [...m[7].slice(0, 6), [776, 520], [770, 470], [700, 466], [630, 460], ...m[9].slice(3)];
  return [m[0], m[2], [...m[1].slice(0, -1), ...m[3].slice(2)], m[4], m[5], m[6], ji];
}

/** Length of a polyline. */
export const lengthOf = (s: Pt[]) => s.reduce((a, p, i) => i ? a + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : a, 0);

/**
 * When each stroke is drawn, in ms: at `speed` units a ms, with `lift` ms between strokes
 * (the pen in the air). Returns each stroke's [start, end] and the total.
 */
export function timeline(lengths: number[], speed: number, lift: number) {
  let t = 0;
  const spans = lengths.map(l => {
    const span: [number, number] = [t, t + Math.max(120, l / speed)];
    t = span[1] + lift;
    return span;
  });
  return { spans, total: t - lift };
}

/** How far through each stroke the pen is at time t (0 = not started, 1 = done), eased. */
export function progressAt(spans: [number, number][], t: number): number[] {
  return spans.map(([a, b]) => {
    const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return (1 - Math.cos(Math.PI * x)) / 2;
  });
}

/** Catmull-Rom curve through the points, as an SVG path: a pen line rather than a polyline. */
export function smoothPath(P: Pt[]): string {
  let d = `M${P[0][0]} ${P[0][1]}`;
  for (let i = 1; i < P.length; i++) {
    const p0 = P[i - 2] || P[i - 1], p1 = P[i - 1], p2 = P[i], p3 = P[i + 1] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  return d;
}
