/* =========================================================
   Relaxed mode: checks a whole handwritten character at once, so
   joined-up (cursive) strokes still count. Pure functions: the
   stroke data is passed in, so the rules can be unit-tested.

   Stroke order and direction don't matter. For each candidate
   character the ink's strokes are first put into that character's
   order and turned to run its way (canonicalised). Then the pen's
   whole journey, including the jumps between strokes, becomes one
   path, and so does the reference, from its stroke medians.
   Cursive writing is the reference path with some jumps inked in,
   so the two line up under dynamic time warping (DTW). The ink
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
const SPLIT_STEP = 0.025;             // corner detection works on points this far apart (unit box)
const SPLIT_SPAN = 2;                 // ...comparing the heading this many points before and after
const SPLIT_TURN = Math.PI * 0.3;     // a turn sharper than 54° splits the stroke
// Acceptance, calibrated on simulated relaxed writing (see tests/unit/relaxed.test.ts).
const MAX_SCORE = 0.15;   // beyond this the ink is a different shape altogether
const NEAR_BEST = 1.03;   // the target may trail the best fit by this factor...
const NEAR_RANK = 3;      // ...if it is still among the top few

/** A resampled path: x, y, heading at each point, and the reference stroke it belongs to (-1 = pen in the air). */
interface Path { x: Float32Array; y: Float32Array; a: Float32Array; s: Int16Array }

/** Fits strokes into a unit box centred on 0, keeping the aspect ratio, y up. Idempotent. */
function normalize(strokes: Pt[][], flipY: boolean): Pt[][] {
  const flipped = flipY ? strokes.map(s => s.map(([x, y]): Pt => [x, -y])) : strokes;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of flipped) for (const [x, y] of s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const size = Math.max(x1 - x0, y1 - y0) || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return flipped.map(s => s.map(([x, y]): Pt => [(x - cx) / size, (y - cy) / size]));
}

function toPath(strokes: Pt[][], n: number, flipY: boolean): Path {
  const pts: { x: number; y: number; s: number }[] = [];
  normalize(strokes, flipY).forEach((st, i) => {
    if (!st.length) return;
    if (pts.length) pts.push({ ...pts[pts.length - 1], s: -1 }, { x: st[0][0], y: st[0][1], s: -1 });
    for (const [x, y] of st) pts.push({ x, y, s: i });
  });
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
  const dx = A.x[i] - B.x[j], dy = A.y[i] - B.y[j];
  return Math.sqrt(dx * dx + dy * dy) + ANGLE_WEIGHT * da;
};

let table = new Float64Array(N * N);

/** Cumulative DTW cost table; row i, column j = cost of aligning A[0..i] with B[0..j]. Reused between calls. */
function dtwTable(A: Path, B: Path): Float64Array {
  const n = A.x.length, m = B.x.length, w = Math.ceil(Math.max(n, m) * BAND);
  if (table.length < n * m) table = new Float64Array(n * m);
  const D = table;
  D.fill(Infinity, 0, n * m);
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

/**
 * A quick order- and direction-free distance for the first sweep: each inked point is
 * matched to the nearest inked point of the other path with a similar heading (either
 * way round), both ways. Pen-up jumps are left out.
 */
function chamfer(A: Path, B: Path): number {
  const half = (P: Path, Q: Path) => {
    let sum = 0, n = 0;
    for (let i = 0; i < P.x.length; i++) {
      if (P.s[i] < 0) continue;
      let best = Infinity;
      for (let j = 0; j < Q.x.length; j++) {
        if (Q.s[j] < 0) continue;
        let da = Math.abs(P.a[i] - Q.a[j]) % Math.PI;
        if (da > Math.PI / 2) da = Math.PI - da;
        const dx = P.x[i] - Q.x[j], dy = P.y[i] - Q.y[j];
        const c = Math.sqrt(dx * dx + dy * dy) + ANGLE_WEIGHT * da;
        if (c < best) best = c;
      }
      sum += best; n++;
    }
    return n ? sum / n : Infinity;
  };
  return (half(A, B) + half(B, A)) / 2;
}

/**
 * Splits normalised strokes at sharp corners, so a joined-up stroke (an L drawn for the left
 * side and the bottom of 西) can be put back as the separate strokes it stands for. A turning
 * stroke that really is one stroke just gets rejoined, as its pieces sort next to each other.
 */
function splitCorners(strokes: Pt[][]): Pt[][] {
  const out: Pt[][] = [];
  for (const st of strokes) {
    // Simplify to points at least SPLIT_STEP apart, so jitter doesn't read as a corner.
    const pts: Pt[] = [st[0]];
    for (const p of st) if (Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) >= SPLIT_STEP) pts.push(p);
    const w = SPLIT_SPAN;
    if (pts.length < 2 * w + 1) { out.push(st); continue; }
    // How sharply the stroke turns at each point, judged over w points either side, so a
    // rounded corner (fast writing) counts as much as a crisp one.
    const turn = pts.map((p, i) => {
      if (i < w || i >= pts.length - w) return 0;
      const a = Math.atan2(p[1] - pts[i - w][1], p[0] - pts[i - w][0]);
      const b = Math.atan2(pts[i + w][1] - p[1], pts[i + w][0] - p[0]);
      const t = Math.abs(a - b);
      return t > Math.PI ? 2 * Math.PI - t : t;
    });
    // Split at the sharpest point of each turn.
    let start = 0;
    for (let i = w; i < pts.length - w; i++) {
      if (turn[i] <= SPLIT_TURN || turn[i] < turn[i - 1] || turn[i] < turn[i + 1] || i - start < w) continue;
      out.push(pts.slice(start, i + 1));
      start = i;
    }
    out.push(pts.slice(start));
  }
  return out;
}

/**
 * Puts normalised ink strokes into the reference's order and direction. Each ink point is
 * matched to the nearest reference point of similar heading (either way round); a stroke
 * sorts by where along the reference its points land, and is reversed if they land backwards.
 */
function canonicalize(ink: Pt[][], ref: Path): Pt[][] {
  const where = (p: Pt, q: Pt) => {
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    let best = 0, bestC = Infinity;
    for (let j = 0; j < ref.x.length; j++) {
      if (ref.s[j] < 0) continue;
      let da = Math.abs(a - ref.a[j]) % Math.PI;
      if (da > Math.PI / 2) da = Math.PI - da;
      const dx = p[0] - ref.x[j], dy = p[1] - ref.y[j];
      const c = Math.sqrt(dx * dx + dy * dy) + ANGLE_WEIGHT * da;
      if (c < bestC) { bestC = c; best = j; }
    }
    return best;
  };
  return ink.map(st => {
    // Sample the stroke at up to 12 segments; a dot (one point) just uses its position.
    const step = Math.max(1, Math.floor(st.length / 12));
    const ks: number[] = [];
    for (let i = 0; i + step < st.length; i += step) ks.push(where(st[i], st[i + step]));
    if (!ks.length) ks.push(where(st[0], st[0]));
    const sorted = [...ks].sort((a, b) => a - b);
    // Least-squares slope of reference position against point order: negative = drawn backwards.
    const mean = ks.reduce((a, b) => a + b, 0) / ks.length, mid = (ks.length - 1) / 2;
    let slope = 0;
    ks.forEach((k, i) => { slope += (i - mid) * (k - mean); });
    return { st: slope < 0 ? [...st].reverse() : st, key: sorted[sorted.length >> 1] };
  }).sort((a, b) => a.key - b.key).map(o => o.st);
}

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
    // Each candidate is scored on the ink as written and on the ink put into its own stroke
    // order, keeping the better: joined-up writing follows the usual order and lines up as
    // written, while strokes written in another order or direction line up once sorted.
    const norm = normalize(strokes, true), pieces = splitCorners(norm);
    const asWritten = toPath(norm, N, false), asWrittenCoarse = toPath(norm, N_COARSE, false);
    const fit = (c: string) => {
      const r = ref(c, N);
      return Math.min(dtw(asWritten, r), dtw(toPath(canonicalize(pieces, r), N, false), r));
    };
    // Sweep every character cheaply (as written, and order-free), then score a shortlist properly.
    const top = (d: (r: Path) => number) =>
      chars.map(c => ({ c, d: d(ref(c, N_COARSE)) })).sort((a, b) => a.d - b.d).slice(0, SHORTLIST).map(r => r.c);
    const short = new Set([...top(r => dtw(asWrittenCoarse, r)), ...top(r => chamfer(asWrittenCoarse, r)), target]);
    const scored = [...short].map(c => ({ c, d: fit(c) })).sort((a, b) => a.d - b.d);
    const rank = scored.findIndex(r => r.c === target) + 1;
    const score = scored[rank - 1].d, bestScore = scored[0].d;
    const ok = score <= MAX_SCORE && (rank === 1 || (rank <= NEAR_RANK && score <= bestScore * NEAR_BEST));
    const rival = scored.find(r => r.c !== target)?.c ?? "";
    return { ok, rank, score, best: scored[0].c, bestScore, rival };
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

  return { check, strokeCount, warm };
}
