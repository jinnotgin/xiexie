/* =========================================================
   Relaxed mode's rules for one check of the ink so far: when
   to ask Google for a second opinion, and what the verdicts
   add up to (pass, keep writing, a miss, or a named 别字).
   Pure functions: the checker and Google's reply are passed
   in, so the rules can be unit-tested without a browser.
   ========================================================= */
import type { Pt, Verdict, makeChecker } from "./relaxed";
import { agreedRival } from "./handwriting";

type Checker = Pick<ReturnType<typeof makeChecker>, "check" | "looksFinished" | "strokeCount">;

const OVERSHOOT = 2;     // pen strokes past the character's own count, still no match = a miss
const RIVAL_FIT = 0.09;  // a look-alike is named on its own only when the ink fits it this well

/** Why the ink is worth sending to Google, or "" when it isn't. */
export type SendAs = "" | "count" | "shape" | "rival";

export interface Assessment {
  v: Verdict;
  fullCount: boolean;  // at least the character's stroke count of ink
  overshot: boolean;   // well past it, and still no match
  fullMiss: boolean;   // a whole attempt that didn't pass: wiping it is starting over
  sendAs: SendAs;
}

/**
 * The local checker's view of the ink. Google autocorrects (it reads most characters a stroke
 * short as the character), so ink is only sent with at least the character's stroke count, or
 * when it's joined-up writing the checker judges complete, as the target or as the look-alike it
 * fits best. That look-alike must have at least the target's strokes: a smaller one may be part
 * of it (相 on the way to 想).
 */
export function assessInk(checker: Checker, ink: Pt[][], ch: string, googleOn: boolean): Assessment {
  const v = checker.check(ink, ch);
  const need = checker.strokeCount(ch);
  const fullCount = ink.length >= need;
  const overshot = !v.ok && ink.length >= need + OVERSHOOT;
  const finished = !v.ok && (fullCount || checker.looksFinished(ink, ch, v.score));
  const finishedRival = googleOn && !v.ok && !finished && v.best !== ch
    && checker.strokeCount(v.best) >= need && checker.looksFinished(ink, v.best, v.bestScore);
  const fullMiss = finished || finishedRival;
  const sendAs: SendAs = !googleOn || !fullMiss ? "" : fullCount ? "count" : finished ? "shape" : "rival";
  return { v, fullCount, overshot, fullMiss, sendAs };
}

export type Outcome =
  | { kind: "pass"; clean: boolean }  // clean: full marks; otherwise it only just made it, or needed Google
  | { kind: "wait" }                  // not close enough yet: the learner keeps writing
  | { kind: "rival"; char: string }   // a miss that is clearly another character, named to the learner
  | { kind: "miss" };

export interface Judgement {
  outcome: Outcome;
  rescued: boolean;  // Google read the target where the checker didn't
  agreed: string;    // the look-alike both Google and the checker read, or ""
}

/**
 * What a check adds up to, given Google's reading (null when it wasn't asked or can't say).
 * Google reading the target passes a miss; the local checker stays the judge otherwise.
 * Only ink that has run well past the character counts as a miss, unless Google and the checker
 * both read the same other character: that 别字 is named straight away.
 */
export function judgeInk(a: Assessment, google: string[] | null, ch: string): Judgement {
  const { v } = a;
  const rescued = !!google && google[0] === ch;
  if (v.ok || rescued) return { outcome: { kind: "pass", clean: v.clean }, rescued, agreed: "" };
  const agreed = agreedRival(google, v, ch);
  if (!a.overshot && !agreed) return { outcome: { kind: "wait" }, rescued, agreed };
  // Name the look-alike only when the ink really is a good fit for it, or Google reads it too.
  const named = agreed || (v.best && v.best !== ch && v.bestScore < RIVAL_FIT);
  return { outcome: named ? { kind: "rival", char: v.best } : { kind: "miss" }, rescued, agreed };
}
