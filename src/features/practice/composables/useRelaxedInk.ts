import { ref, type Ref } from "vue";
import { LINES, pick } from "../../../lib/momo";
import { track } from "../../../lib/analytics";
import { relaxedChecker } from "../lib/checker";
import { googleHandwriting, recognize } from "../lib/handwriting";
import { assessInk, judgeInk } from "../lib/inkCheck";
import { useSessionStore } from "../stores/session";
import type { Say } from "./useMomoLine";
import type { Timer, Timers } from "../../../composables/useTimers";
import type InkPad from "../components/InkPad.vue";

const CHECK_DELAY_MS = 120;   // let the stroke paint before the check runs
const RIVAL_HOLD_MS = 1400;   // how long a named look-alike stays drawn over the ink

interface Options {
  inkPad: Ref<InstanceType<typeof InkPad> | undefined>;
  writerSize: Ref<number>;
  relaxed: Ref<boolean>;      // false once the round switches to strict: a late check is dropped
  charPassed: Ref<boolean>;
  mountId: Ref<number>;       // bumped on every remount, so a look-alike's fade can tell it's stale
  timers: Timers;
  say: Say;
  shake: () => void;
  pass: (clean: boolean) => void;
}

/**
 * Relaxed mode's writing loop: free ink on an InkPad, re-checked as a whole after every pen-up
 * until it's close enough (rules in lib/inkCheck.ts). Reports a pass through `pass`, and handles
 * misses, named look-alikes, undo and clear itself.
 */
export function useRelaxedInk(o: Options) {
  const session = useSessionStore();
  const { later, cancel } = o.timers;

  const rivalChar = ref("");   // the look-alike the ink matched, drawn faintly over it for a moment
  let checkTimer: Timer | undefined;
  let checkSeq = 0;            // bumped by every check and pen-down, so a late Google reply for older ink is dropped
  let fullMiss = false;        // the ink on the pad is a whole attempt that didn't pass: wiping it is starting over
  let stallLogged = false;     // one practice_relaxed_stall event per character

  function cancelCheck() {
    checkSeq++;
    cancel(checkTimer);
    checkTimer = undefined;
  }
  function onInkEnd() {
    cancelCheck();
    checkTimer = later(() => { checkTimer = undefined; checkInk(); }, CHECK_DELAY_MS);
  }

  /** A fresh pad for a new character (or the same one at a new size, keeping `stallLogged`). */
  function reset({ keepStall = false } = {}) {
    cancelCheck();
    rivalChar.value = "";
    fullMiss = false;
    if (!keepStall) stallLogged = false;
  }

  /** Builds the checker's reference paths in small slices, so the first check is quick. */
  function warm() {
    const step = () => { if (!relaxedChecker().warm()) later(step, 16); };
    later(step, 300);
  }

  /** Checks all the ink so far, asking Google first when the rules say to. */
  async function checkInk() {
    const c = session.cur;
    const pad = o.inkPad.value;
    if (!c || c.done || o.charPassed.value || !pad) return;
    const ink = pad.strokes;
    const ch = c.word.w[c.ci];
    if (!ink.length) return;
    const seq = ++checkSeq;
    const a = assessInk(relaxedChecker(), ink, ch, googleHandwriting);
    fullMiss = a.fullMiss;
    let google: string[] | null = null;
    if (a.sendAs) {
      google = await recognize(ink, o.writerSize.value);
      // Newer ink has its own check; a remounted pad, a mode switch or a finished character drops this one.
      if (!o.timers.alive() || seq !== checkSeq || c !== session.cur || c.done || o.charPassed.value || !o.relaxed.value || o.inkPad.value !== pad) return;
    }
    const { outcome, rescued, agreed } = judgeInk(a, google, ch);
    const { v } = a;
    const ok = outcome.kind === "pass";
    const googleProps = googleHandwriting ? { google_sent_as: a.sendAs, google_asked: google !== null, google_top: google?.[0] ?? "", google_rescued: rescued, google_agreed: agreed } : {};
    if (outcome.kind !== "wait") {
      track("practice_relaxed_check", {
        accepted: ok, clean: v.clean, rank: v.rank, score: v.score, best_score: v.bestScore, rival_score: v.rivalScore,
        ink_stroke_count: ink.length, character: ch, best_match: v.best, ...googleProps,
      });
    }
    // A full character's worth of ink that still doesn't pass: usually a look-alike edging it out.
    // Sends the ink (rounded, thinned) so the miss can be replayed against the checker.
    if (!ok && !stallLogged && a.fullCount) {
      stallLogged = true;
      track("practice_relaxed_stall", {
        character: ch, rank: v.rank, score: v.score, best_match: v.best, best_score: v.bestScore,
        score_ratio: v.score / v.bestScore, incomplete: v.incomplete, ink_stroke_count: ink.length, ...googleProps,
        ink: ink.map(s => s.filter((_, i) => i % Math.ceil(s.length / 16) === 0 || i === s.length - 1)
          .map(([x, y]) => [Math.round(x), Math.round(y)])),
      });
    }
    switch (outcome.kind) {
      case "wait": return;
      case "pass":
        // Only a clean pass keeps full marks; one that only just made it, or needed Google, is a wobble.
        if (!outcome.clean) c.shaky++;
        fullMiss = false;
        return o.pass(outcome.clean);
    }
    c.mistakes++;
    fullMiss = false;   // the pad clears itself, and the miss already counts
    o.shake();
    if (outcome.kind === "rival") {
      // Show the look-alike over the ink for a moment.
      o.say("wow", `Looks like ${outcome.char}, not this one.`, { tone: "nudge", glyph: outcome.char });
      rivalChar.value = outcome.char;
      const id = o.mountId.value;
      pad.clear(true, RIVAL_HOLD_MS).then(() => { if (o.mountId.value === id) rivalChar.value = ""; });
      return;
    }
    if (c.mistakes >= 3) o.say("hmm", "Stuck? Tap Show me for a peek.", { tone: "nudge" });
    else o.say("hmm", pick(LINES.relaxedMiss));
    pad.clear(true);
  }

  /** Wiping out a whole attempt that didn't pass is starting the character over: no full marks. */
  function wipedAttempt() {
    if (fullMiss && session.cur) session.cur.shaky++;
    fullMiss = false;
  }

  function undo() {
    if (o.charPassed.value || !o.inkPad.value?.undo()) return;
    wipedAttempt();
    // What's left may now be close enough (an extra stray stroke was in the way).
    onInkEnd();
  }

  function clear() {
    if (o.charPassed.value) return;
    cancelCheck();
    wipedAttempt();
    o.inkPad.value?.clear();
  }

  return { rivalChar, onInkStart: cancelCheck, onInkEnd, reset, warm, undo, clear };
}
