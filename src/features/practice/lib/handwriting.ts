/* =========================================================
   Google handwriting: a second opinion for relaxed mode.
   Sends the ink to the handwriting endpoint behind Google
   Input Tools / Translate and returns the characters it reads.
   Unofficial and undocumented, so it can change or vanish:
   every failure (offline, timeout, odd reply) is null, which
   callers treat as "no opinion". The ink leaves the device,
   so it is off unless VITE_GOOGLE_HANDWRITING is "1".
   ========================================================= */
import type { Pt } from "./relaxed";

export const googleHandwriting = import.meta.env.VITE_GOOGLE_HANDWRITING === "1";

const URL = "https://inputtools.google.com/request?ime=handwriting&app=xiexie";
const TIMEOUT_MS = 1500;
const MAX_POINTS = 32;   // per stroke; the recognizer doesn't need every coalesced pointer event
const HAN = /^\p{Script=Han}$/u;

/** Ink as the endpoint takes it: per stroke, [xs, ys], thinned and rounded. */
export function toRequestInk(ink: Pt[][]): number[][][] {
  return ink.filter(s => s.length).map(s => {
    const step = Math.ceil(s.length / MAX_POINTS);
    const pts = s.filter((_, i) => i % step === 0 || i === s.length - 1);
    return [pts.map(p => Math.round(p[0])), pts.map(p => Math.round(p[1]))];
  });
}

/** The single Han characters in a reply, best first. Null if the reply isn't a success. */
export function parseCandidates(reply: unknown): string[] | null {
  if (!Array.isArray(reply) || reply[0] !== "SUCCESS") return null;
  const list: unknown = reply[1]?.[0]?.[1];
  return Array.isArray(list) ? list.filter((c): c is string => typeof c === "string" && HAN.test(c)) : null;
}

/** What Google reads in the ink (screen pixels, `size` square), best first; null when it can't say. */
export async function recognize(ink: Pt[][], size: number): Promise<string[] | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, {
      method: "POST",
      // It only parses a JSON body; the CORS preflight this costs is cached for 15 minutes.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        options: "enable_pre_space",
        requests: [{
          writing_guide: { writing_area_width: Math.round(size), writing_area_height: Math.round(size) },
          max_num_results: 10, language: "zh_CN", ink: toRequestInk(ink),
        }],
      }),
      signal: ctl.signal,
    });
    return res.ok ? parseCandidates(await res.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const AGREED_FIT = 0.15;   // relaxed's MAX_SCORE: the ink is at least a plausible shape for the rival

/**
 * The other character the ink was written as, when the local checker's best fit and Google's
 * first reading agree on it; "" otherwise. Two independent readings agreeing is what lets a
 * 别字 be named as soon as the ink looks finished, rather than after it overshoots.
 */
export function agreedRival(google: string[] | null, v: { best: string; bestScore: number }, target: string): string {
  const g = google?.[0];
  return g && g !== target && g === v.best && v.bestScore <= AGREED_FIT ? g : "";
}
