/* =========================================================
   Lazy mode: checks a whole handwritten character at once, so
   joined-up (cursive) strokes still count. Pure functions: the
   stroke data is passed in, so the rules can be unit-tested.

   The pen's whole journey, including the jumps between strokes,
   becomes one path. The reference character becomes one path the
   same way, from its stroke medians in stroke order. Cursive
   writing is that reference path with some jumps inked in, so
   the two line up under dynamic time warping (DTW). The ink
   passes when the target fits it better than (or nearly as well
   as) every other character we know.
   ========================================================= */

/** Points as [x, y]. Ink is in screen space (y down); medians are Make Me a Hanzi space (y up). */
export type Pt = [number, number];
export interface CharMedians { medians: Pt[][] }

export interface Verdict {
  ok: boolean;
  rank: number;       // the target's place among all characters, 1 = best fit
  score: number;      // the target's DTW cost, lower = closer
  best: string;       // the best-fitting character
  bestScore: number;
  rival: string;      // the best-fitting character other than the target
}

const N = 64;          // points per path for the final scoring
const N_COARSE = 24;   // points per path for the first sweep over every character
const SHORTLIST = 24;  // characters re-scored at full resolution
const BAND = 0.25;     // DTW warping window, as a fraction of the path
const ANGLE_WEIGHT = 0.15;
// Acceptance, calibrated on simulated lazy writing (see tests/unit/lazy.test.ts).
const MAX_SCORE = 0.15;   // beyond this the ink is a different shape altogether
const NEAR_BEST = 1.03;   // the target may trail the best fit by this factor...
const NEAR_RANK = 3;      // ...if it is still among the top few

/** A resampled path: x, y, heading at each point, and the reference stroke it belongs to (-1 = pen in the air). */
interface Path { x: Float32Array; y: Float32Array; a: Float32Array; s: Int16Array }

function toPath(strokes: Pt[][], n: number, flipY: boolean): Path {
  const pts: { x: number; y: number; s: number }[] = [];
  strokes.forEach((st, i) => {
    if (!st.length) return;
    if (pts.length) pts.push({ ...pts[pts.length - 1], s: -1 }, { x: st[0][0], y: st[0][1], s: -1 });
    for (const [x, y] of st) pts.push({ x, y, s: i });
  });
  if (flipY) for (const p of pts) p.y = -p.y;
  // Fit into a unit box, keeping the aspect ratio, centred.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const size = Math.max(x1 - x0, y1 - y0) || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const p of pts) { p.x = (p.x - cx) / size; p.y = (p.y - cy) / size; }
  // Resample to n points evenly spaced along the path.
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  const out: Path = { x: new Float32Array(n), y: new Float32Array(n), a: new Float32Array(n), s: new Int16Array(n) };
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = total * k / (n - 1);
    while (j < pts.length - 2 && cum[j + 1] < d) j++;
    const p = pts[j], q = pts[Math.min(j + 1, pts.length - 1)];
    const r = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
    out.x[k] = p.x + (q.x - p.x) * r;
    out.y[k] = p.y + (q.y - p.y) * r;
    out.a[k] = Math.atan2(q.y - p.y, q.x - p.x);
    out.s[k] = p.s === -1 || q.s === -1 ? -1 : q.s;
  }
  return out;
}

const pointCost = (A: Path, i: number, B: Path, j: number) => {
  let da = Math.abs(A.a[i] - B.a[j]);
  if (da > Math.PI) da = 2 * Math.PI - da;
  return Math.hypot(A.x[i] - B.x[j], A.y[i] - B.y[j]) + ANGLE_WEIGHT * da;
};

/** Cumulative DTW cost table; row i, column j = cost of aligning A[0..i] with B[0..j]. */
function dtwTable(A: Path, B: Path): Float64Array {
  const n = A.x.length, m = B.x.length, w = Math.ceil(Math.max(n, m) * BAND);
  const D = new Float64Array(n * m).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const jc = Math.round(i * (m - 1) / Math.max(1, n - 1));
    for (let j = Math.max(0, jc - w); j <= Math.min(m - 1, jc + w); j++) {
      const prev = i === 0 && j === 0 ? 0 : Math.min(
        i > 0 ? D[(i - 1) * m + j] : Infinity,
        j > 0 ? D[i * m + j - 1] : Infinity,
        i > 0 && j > 0 ? D[(i - 1) * m + j - 1] : Infinity);
      D[i * m + j] = prev + pointCost(A, i, B, j);
    }
  }
  return D;
}

const dtw = (A: Path, B: Path) => dtwTable(A, B)[A.x.length * B.x.length - 1] / (A.x.length + B.x.length);

export function makeChecker(data: Record<string, CharMedians>) {
  const chars = Object.keys(data);
  const fine = new Map<string, Path>(), coarse = new Map<string, Path>();
  const ref = (c: string, n: number) => {
    const cache = n === N ? fine : coarse;
    let p = cache.get(c);
    if (!p) { p = toPath(data[c].medians, n, false); cache.set(c, p); }
    return p;
  };

  /** Scores the ink against every known character and decides whether it is `target`. */
  function check(ink: Pt[][], target: string): Verdict {
    const strokes = ink.filter(s => s.length > 0);
    if (!data[target] || !strokes.length) return { ok: false, rank: Infinity, score: Infinity, best: "", bestScore: Infinity, rival: "" };
    // Sweep every character cheaply, then score a shortlist (always including the target) properly.
    const inkCoarse = toPath(strokes, N_COARSE, true);
    const rough = chars.map(c => ({ c, d: dtw(inkCoarse, ref(c, N_COARSE)) })).sort((a, b) => a.d - b.d);
    const short = new Set(rough.slice(0, SHORTLIST).map(r => r.c)).add(target);
    const inkFine = toPath(strokes, N, true);
    const scored = [...short].map(c => ({ c, d: dtw(inkFine, ref(c, N)) })).sort((a, b) => a.d - b.d);
    const rank = scored.findIndex(r => r.c === target) + 1;
    const score = scored[rank - 1].d, bestScore = scored[0].d;
    const ok = score <= MAX_SCORE && (rank === 1 || (rank <= NEAR_RANK && score <= bestScore * NEAR_BEST));
    const rival = scored.find(r => r.c !== target)?.c ?? "";
    return { ok, rank, score, best: scored[0].c, bestScore, rival };
  }

  /** The next stroke of `target` to write, judging by how far along the reference the ink has got. */
  function nextStroke(ink: Pt[][], target: string): number {
    const strokes = ink.filter(s => s.length > 0);
    if (!data[target] || !strokes.length) return 0;
    const meds = data[target].medians;
    // Compare the ink with each prefix of the reference (first k strokes) and keep the closest.
    let bestK = 0, bestD = Infinity;
    const inkPath = toPath(strokes, N_COARSE, true);
    for (let k = 1; k <= meds.length; k++) {
      const d = dtw(inkPath, toPath(meds.slice(0, k), N_COARSE, false));
      if (d < bestD) { bestD = d; bestK = k; }
    }
    return Math.min(bestK, meds.length - 1);
  }

  /** Builds the reference paths ahead of time, a slice per call, so the first check doesn't stall. */
  function warm(budgetMs = 8): boolean {
    const t = performance.now();
    for (const c of chars) {
      if (coarse.has(c) && fine.has(c)) continue;
      ref(c, N_COARSE); ref(c, N);
      if (performance.now() - t > budgetMs) return false;
    }
    return true;
  }

  const strokeCount = (c: string) => data[c]?.medians.length ?? 0;

  return { check, nextStroke, strokeCount, warm };
}
