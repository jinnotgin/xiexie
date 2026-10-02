<script setup lang="ts">
/**
 * The writing card. Session data lives in the session store; this view drives
 * one character at a time and shows the graded result. Strict mode runs the
 * HanziWriter quiz, stroke by stroke; relaxed mode collects free ink on an InkPad
 * and checks the whole character at once (lib/relaxed.ts). Quiz rounds use the home
 * page's mode and are recorded. Practice picked from the library is never recorded and
 * can switch modes from the top bar without changing the home setting.
 */
import posthog from "posthog-js";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import type { Grade, Mood } from "../types";
import { LINES, pick } from "../lib/momo";
import { STAMPS, gradeOf } from "../lib/srs";
import { confetti, cssVar, reduceMotion, writerColors } from "../lib/dom";
import { speak, speechOk } from "../lib/speech";
import { posthogEnabled, practiceLogger } from "../lib/posthog";
import { relaxedChecker } from "../lib/chardata";
import { useProgressStore } from "../stores/progress";
import { useSessionStore } from "../stores/session";
import { useKeydown } from "../composables/useKeydown";
import Momo from "../components/Momo.vue";
import GridSvg from "../components/GridSvg.vue";
import HanziStage from "../components/HanziStage.vue";
import Icon from "../components/Icon.vue";
import InkPad from "../components/InkPad.vue";

const app = useProgressStore();
const session = useSessionStore();
const router = useRouter();

const stageEl = ref<HTMLDivElement>();
const nextBtn = ref<HTMLButtonElement>();
// Most lines are ambient; a "nudge" (you need to change what you're doing) gets the pill and a pop-in.
// `glyph` is highlighted wherever it appears in the text. `seq` re-keys the line so each nudge pops in again.
type MomoOpts = { tone?: "nudge"; glyph?: string };
const momo = reactive<{ mood: Mood; text: string; tone: string; glyph: string; seq: number }>({ mood: "happy", text: "", tone: "", glyph: "", seq: 0 });
const setMomo = (mood: Mood, text: string, { tone, glyph = "" }: MomoOpts = {}) => {
  momo.mood = mood; momo.text = text; momo.tone = tone ?? ""; momo.glyph = glyph; momo.seq++;
};
const momoParts = computed(() => momo.glyph ? momo.text.split(momo.glyph) : [momo.text]);

const cur = computed(() => session.cur);
const phase = ref<"writing" | "done">("writing");
const grade = ref<Grade>("perfect");

// Writing phase: one HanziStage, re-keyed for every character / restart.
const mountId = ref(0);
const writerSize = ref(0);
const stageBox = ref<number | null>(null);
const writerOpts = shallowRef<Record<string, unknown>>({});
let writer: any = null;

// Relaxed mode: free writing, re-checked as a whole after every pen-up until it's close enough.
const relaxed = ref(false);
const inkPad = ref<InstanceType<typeof InkPad>>();
const inkWidth = ref(8);
let charPassed = false;
let stallLogged = false;   // one practice_relaxed_stall event per character
const rivalChar = ref("");     // the look-alike the ink matched, drawn faintly over it for a moment
const RIVAL_HOLD_MS = 1400;
const rivalOpts = computed(() => ({
  width: writerSize.value, height: writerSize.value, padding: Math.round(writerSize.value * 0.07),
  showCharacter: true, showOutline: false, strokeColor: cssVar("--marker"),
}));
let checkTimer: ReturnType<typeof setTimeout> | undefined;
const CHECK_DELAY_MS = 120;   // let the stroke paint before the check runs
const OVERSHOOT = 2;          // pen strokes past the character's own count, still no match = a miss

// Result phase: the whole word, a stamp and an optional stroke-order replay.
const finalSize = ref(0);
const finalOpts = shallowRef<Record<string, unknown>>({});
const replayHidden = ref(true);
const replayBusy = ref(false);
const stampStyle = ref<Record<string, string>>({});
let finalWriters: any[] = [];

// Timers die with the view, so nothing fires into a card that has gone.
let alive = true;
const timers = new Set<ReturnType<typeof setTimeout>>();
function later(fn: () => void, ms: number) {
  const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms);
  timers.add(t);
  return t;
}
let peekTimer: ReturnType<typeof setTimeout> | undefined;

const dotClass = (i: number) => {
  const r = session.results[i];
  return "dot" + (r ? " " + r.grade : i === session.idx ? " now" : "");
};
const slotClass = (i: number) => {
  const f = cur.value!.filled;
  return "slot han" + (i < f ? " done" : i === f ? " now" : "");
};

function stageSize() {
  const avail = stageEl.value!.parentElement!.clientWidth - 36;
  return Math.max(220, Math.min(320, avail));
}

function renderCard() {
  const w = session.queue[session.idx];
  session.cur = { word: w, ci: 0, filled: 0, mistakes: 0, hints: 0, revealed: false, done: false, notes: [] };
  phase.value = "writing";
  finalWriters = [];
  stampStyle.value = {};
  const again = session.requeued.has(w.id) && session.results.length > session.idx - 0 && session.idx >= session.total;
  setMomo("happy", again ? "Round two for this one. You've seen it, now write it." : pick(session.relaxed ? LINES.relaxedStart : LINES.start));
  mountWriter();
}

function mountWriter() {
  const size = stageSize();
  writerSize.value = size;
  stageBox.value = size + 4;
  relaxed.value = session.relaxed;
  charPassed = false;
  stallLogged = false;
  rivalChar.value = "";
  cancelCheck();
  inkWidth.value = Math.max(8, Math.round(size / 26));
  writerOpts.value = {
    width: size, height: size, padding: Math.round(size * 0.07),
    showCharacter: false, showOutline: false,
    drawingWidth: inkWidth.value,
    strokeAnimationSpeed: 1.1, delayBetweenStrokes: 140,
    ...writerColors(),
  };
  writer = null;
  mountId.value++;
}

function onWriterReady(w: any) {
  writer = w;
  const c = session.cur!;
  const ch = c.word.w[c.ci];
  if (relaxed.value) { warmChecker(); return; }
  w.quiz({
    showHintAfterMisses: 3, highlightOnComplete: true, leniency: 1.25,
    onMistake: (d: any) => {
      c.mistakes++;
      const stage = stageEl.value;
      if (!reduceMotion && stage) { stage.classList.remove("shake"); void stage.offsetWidth; stage.classList.add("shake"); }
      if (d && d.mistakesOnStroke >= 3) setMomo("hmm", "Watch the stroke light up, then draw it the same way.", { tone: "nudge" });
      else setMomo("hmm", pick(LINES.mistake));
    },
    onCorrectStroke: () => {
      if (c.mistakes === 0 && !c.revealed) setMomo("happy", "Good, keep going…");
    },
    onComplete: (d: any) => {
      const b = (d && d.backwards) ? d.backwards.length : 0;
      // Misplaced strokes are accepted quietly: no note, no effect on the grade
      if (!c.revealed && b) c.notes.push({ ch, order: 0, backwards: b });
      later(charDone, 380);
    },
  });
}

// Builds the checker's reference paths in small slices, so the first check is quick.
function warmChecker() {
  const step = () => { if (alive && !relaxedChecker().warm()) later(step, 16); };
  later(step, 300);
}

function cancelCheck() {
  if (checkTimer) { clearTimeout(checkTimer); timers.delete(checkTimer); checkTimer = undefined; }
}
function onInkEnd() { cancelCheck(); checkTimer = later(() => { checkTimer = undefined; checkInk(); }, CHECK_DELAY_MS); }

/**
 * Checks all the ink so far. Not close enough yet is fine: the learner keeps writing.
 * Only ink that has run well past the character without matching counts as a miss.
 */
function checkInk() {
  const c = session.cur;
  if (!c || c.done || charPassed || !inkPad.value) return;
  const ink = inkPad.value.strokes;
  const ch = c.word.w[c.ci];
  if (!ink.length) return;
  const v = relaxedChecker().check(ink, ch);
  const overshot = !v.ok && ink.length >= relaxedChecker().strokeCount(ch) + OVERSHOOT;
  if (posthogEnabled && (v.ok || overshot)) {
    posthog.capture("practice_relaxed_check", {
      accepted: v.ok, rank: v.rank, score: v.score, best_score: v.bestScore,
      ink_stroke_count: ink.length, character: ch, best_match: v.best,
    });
  }
  // A full character's worth of ink that still doesn't pass: usually a look-alike edging it out.
  // Sends the ink (rounded, thinned) so the miss can be replayed against the checker.
  if (posthogEnabled && !v.ok && !stallLogged && ink.length >= relaxedChecker().strokeCount(ch)) {
    stallLogged = true;
    posthog.capture("practice_relaxed_stall", {
      character: ch, rank: v.rank, score: v.score, best_match: v.best, best_score: v.bestScore,
      score_ratio: v.score / v.bestScore, incomplete: v.incomplete, ink_stroke_count: ink.length,
      ink: ink.map(s => s.filter((_, i) => i % Math.ceil(s.length / 16) === 0 || i === s.length - 1)
        .map(([x, y]) => [Math.round(x), Math.round(y)])),
    });
  }
  if (v.ok) return passChar();
  if (!overshot) return;
  c.mistakes++;
  const stage = stageEl.value;
  if (!reduceMotion && stage) { stage.classList.remove("shake"); void stage.offsetWidth; stage.classList.add("shake"); }
  // Name the look-alike only when the ink really is a good fit for it, and show it over the ink.
  if (v.best && v.best !== ch && v.bestScore < 0.09) {
    setMomo("wow", `That's ${v.best}, not this one.`, { tone: "nudge", glyph: v.best });
    rivalChar.value = v.best;
    const id = mountId.value;
    inkPad.value.clear(true, RIVAL_HOLD_MS).then(() => { if (mountId.value === id) rivalChar.value = ""; });
    return;
  }
  if (c.mistakes >= 3) setMomo("hmm", "Stuck? Tap Show me for a peek.", { tone: "nudge" });
  else setMomo("hmm", pick(LINES.relaxedMiss));
  inkPad.value.clear(true);
}

function undoInk() {
  if (charPassed || !inkPad.value?.undo()) return;
  // What's left may now be close enough (an extra stray stroke was in the way).
  onInkEnd();
}

function clearInk() {
  if (charPassed) return;
  cancelCheck();
  inkPad.value?.clear();
}

function passChar() {
  const c = session.cur!;
  charPassed = true;
  if (c.mistakes === 0 && !c.revealed) setMomo("happy", "Got it!");
  inkPad.value?.clear(true);
  try { writer.showCharacter({ duration: 300 }); } catch (e) {}
  later(charDone, 650);
}

/** Switches this round's mode. A character in progress starts over in the new mode; finished ones stay. */
function setMode(v: boolean) {
  if (session.relaxed === v) return;
  session.relaxed = v;
  const c = session.cur;
  if (!c || c.done || phase.value !== "writing" || charPassed) return;   // takes effect from the next character
  if (posthogEnabled) posthog.capture("practice_mode_switched", { mode: v ? "relaxed" : "strict" });
  if (writer) { try { writer.cancelQuiz(); } catch (e) {} }
  if (peekTimer) { clearTimeout(peekTimer); timers.delete(peekTimer); peekTimer = undefined; }
  setMomo("happy", pick(v ? LINES.relaxedStart : LINES.start));
  mountWriter();
}

function charDone() {
  const c = session.cur!;
  if (c.done) return;
  c.filled = c.ci + 1;
  c.ci++;
  if (c.ci < c.word.w.length) {
    if (c.revealed) setMomo("happy", "Next character. From memory if you can!");
    mountWriter();
  } else finishWord();
}

async function finishWord(skipped = false) {
  const c = session.cur!;
  c.done = true;
  if (writer) { try { writer.cancelQuiz(); } catch (e) {} }
  if (skipped) { c.revealed = true; c.filled = [...c.word.w].length; }
  // A word only comes back once per round: peeking on its second try counts as "ok", not another "again".
  const secondTry = session.requeued.has(c.word.id);
  let g = gradeOf(c);
  if (g === "again" && secondTry && !skipped) g = "ok";
  session.results[session.idx] = { word: c.word, grade: g, notes: c.notes };
  if (posthogEnabled) {
    posthog.capture("practice_word_completed", {
      grade: g,
      character_count: [...c.word.w].length,
      mistake_count: c.mistakes,
      hint_count: c.hints,
      was_revealed: c.revealed,
      was_skipped: skipped,
      mode: relaxed.value ? "relaxed" : "strict",
      counts_progress: session.counts,
    });
  }
  if (session.counts) await app.record(c.word, g);
  if (!alive) return;

  // Show the whole word in the box with a stamp.
  const size = stageSize();
  const n = c.word.w.length;
  const cell = n === 1 ? size : Math.floor(Math.min(size * 0.92 / n, size * 0.5));
  finalSize.value = size;
  finalOpts.value = {
    width: cell, height: cell, padding: Math.round(cell * 0.07), showOutline: true,
    strokeAnimationSpeed: 1, delayBetweenStrokes: 220, ...writerColors(), outlineColor: cssVar("--grid"),
  };
  grade.value = g;
  phase.value = "done";

  // One friendly sentence instead of a stats box.
  let noteLine: string | null = null;
  if (c.notes.length && g === "good") {
    const chars = c.notes.map(n => n.ch).join(" and ");
    const anyOrder = c.notes.some(n => n.order), anyBack = c.notes.some(n => n.backwards);
    noteLine = anyOrder && anyBack ? `Correct! The strokes in ${chars} went a bit differently from usual.`
      : anyOrder ? `Correct! Only the stroke order in ${chars} was different.`
      : `Correct! A stroke in ${chars} went the other way.`;
  }
  setMomo(g === "perfect" ? "wow" : g === "again" ? "hmm" : "happy", noteLine || pick(relaxed.value && g === "perfect" ? LINES.relaxedPerfect : LINES[g]));
  // Offer the usual stroke order when a stroke went its own way, and always after free writing.
  replayHidden.value = !c.notes.length && !relaxed.value;
  if (g === "perfect") confetti();
  if (g === "again" && !session.requeued.has(c.word.id)) { session.requeued.add(c.word.id); session.queue.push(c.word); }
  await nextTick();
  nextBtn.value?.focus({ preventScroll: true });
}

async function replay() {
  const c = session.cur;
  if (!c || !finalWriters.length) return;
  stampStyle.value = { animation: "none", opacity: "0.15" };
  replayBusy.value = true;
  // Replay the characters that had notes first; if none had notes, replay them all.
  const withNotes = new Set(c.notes.map(n => n.ch));
  const targets = finalWriters.filter((_, i) => !withNotes.size || withNotes.has(c.word.w[i]));
  for (const w of targets) { try { w.hideCharacter(); } catch (e) {} }
  for (const w of targets) { await new Promise(res => w.animateCharacter({ onComplete: res })); }
  if (!alive) return;
  stampStyle.value = { animation: "none", opacity: "1" };
  replayBusy.value = false;
}

function next() {
  session.idx++;
  if (session.idx >= session.queue.length) {
    if (posthogEnabled) {
      const completedCardCount = session.results.filter(Boolean).length;
      posthog.capture("practice_session_completed", {
        initial_word_count: session.total,
        completed_card_count: completedCardCount,
        requeued_word_count: session.requeued.size,
      });
      practiceLogger.info("practice session completed", {
        event: "practice_session_completed",
        initial_word_count: session.total,
        completed_card_count: completedCardCount,
        requeued_word_count: session.requeued.size,
      });
    }
    router.replace({ name: "summary" });
  }
  else renderCard();
}

function hint() {
  const c = session.cur;
  if (!writer || !c || c.done) return;
  // Hint: trace just the next stroke to write, once, then it fades.
  const q = writer._quiz;
  if (!q || !q._isActive) return;
  const n = q._currentStrokeIndex;
  if (n == null || n >= q._character.strokes.length) return;
  c.hints++;
  if (posthogEnabled) posthog.capture("practice_hint_requested", { hint_count: c.hints });
  setMomo("happy", "Here's the next stroke. Watch where it starts and which way it goes.");
  try { writer.highlightStroke(n); } catch (e) {}
}

function showMe() {
  const c = session.cur;
  if (!writer || !c || c.done) return;
  if (!c.revealed && posthogEnabled) posthog.capture("practice_word_revealed");
  c.revealed = true;
  // Show me: flash the whole character, keep the strokes already written.
  const w = writer;
  setMomo("happy", "Here's the whole character. Take a good look…");
  if (peekTimer) clearTimeout(peekTimer);
  w.showOutline();
  peekTimer = later(() => {
    if (w !== writer || c.done) return;
    try { w.hideOutline(); } catch (e) {}
    setMomo("happy", "Now finish it from memory.");
  }, 2500);
}

function skip() {
  if (!session.cur || session.cur.done) return;
  if (posthogEnabled) posthog.capture("practice_word_skipped");
  finishWord(true);
}

function quit() {
  if (posthogEnabled) {
    const completedCardCount = session.results.filter(Boolean).length;
    posthog.capture("practice_session_abandoned", {
      initial_word_count: session.total,
      completed_card_count: completedCardCount,
    });
    practiceLogger.info("practice session abandoned", {
      event: "practice_session_abandoned",
      initial_word_count: session.total,
      completed_card_count: completedCardCount,
    });
  }
  if (writer) try { writer.cancelQuiz(); } catch (e) {}
  if (session.results.some(Boolean)) router.replace({ name: "summary" });
  else router.replace(session.returnTo);
}

useKeydown(e => {
  if (e.key === "Enter" && phase.value === "done") { e.preventDefault(); next(); }
});

onMounted(renderCard);
onBeforeUnmount(() => { alive = false; timers.forEach(clearTimeout); timers.clear(); });
</script>

<template>
  <section id="practice">
    <div class="topbar">
      <button class="btn ghost small" id="quit" aria-label="End session" @click="quit">✕ End</button>
      <!-- The dots are left empty (but keep their column) for a one-word round: there's no progress to show. -->
      <div class="dots" id="dots"><template v-if="session.total > 1"><span v-for="(_, i) in session.queue" :key="i" :class="dotClass(i)"></span></template></div>
      <div v-if="!session.counts" class="seg mode-switch" id="mode-switch" role="group" aria-label="Writing mode for this round">
        <button id="round-strict" :aria-pressed="!session.relaxed" @click="setMode(false)">Strict</button>
        <button id="round-relaxed" :aria-pressed="session.relaxed" @click="setMode(true)">Relaxed</button>
      </div>
    </div>
    <div class="sheet">
      <div class="prompt-py"><span id="p-py">{{ cur?.word.p }}</span><button class="speak" id="p-speak" aria-label="Hear it" :hidden="!speechOk" @click="cur && speak(cur.word.w)"><Icon name="speaker" /></button></div>
      <p class="prompt-en" id="p-en">{{ cur?.word.e }}</p>
      <div class="slots" id="slots" :hidden="!cur || cur.word.w.length === 1">
        <template v-if="cur"><span v-for="(ch, i) in [...cur.word.w]" :key="i" :class="slotClass(i)">{{ i < cur.filled ? ch : "？" }}</span></template>
      </div>
      <div class="stage" id="stage" ref="stageEl" :style="stageBox ? { width: stageBox + 'px', height: stageBox + 'px' } : undefined">
        <HanziStage v-if="cur && phase === 'writing' && writerSize" :key="mountId" :char="cur.word.w[cur.ci] ?? ''"
          :size="writerSize" :options="writerOpts" @ready="onWriterReady" />
        <InkPad v-if="cur && phase === 'writing' && writerSize && relaxed" :key="'ink' + mountId" ref="inkPad"
          :size="writerSize" :width="Math.max(6, Math.round(inkWidth * 0.75))" @start="cancelCheck" @end="onInkEnd" />
        <template v-else-if="cur && phase === 'done'">
          <GridSvg :size="finalSize" />
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
            <HanziStage v-for="(ch, i) in [...cur.word.w]" :key="mountId + ':' + i" :grid="false" :char="ch"
              :options="finalOpts" @ready="(w: any) => (finalWriters[i] = w)" />
          </div>
          <div :class="['stamp', grade]" :style="stampStyle"><span class="han">{{ STAMPS[grade].ch }}</span><small>{{ STAMPS[grade].label }}</small></div>
        </template>
        <Transition name="rival">
          <div v-if="rivalChar && phase === 'writing'" :key="rivalChar + mountId" class="rival-ghost">
            <HanziStage :grid="false" :char="rivalChar" :options="rivalOpts" />
          </div>
        </Transition>
      </div>
      <div class="momo-line" :class="momo.tone" :key="momo.seq">
        <Momo id="momo-small" :mood="momo.mood" />
        <span id="momo-say" role="status">
          <template v-for="(part, i) in momoParts" :key="i"><b v-if="i" class="momo-glyph">{{ momo.glyph }}</b>{{ part }}</template>
        </span>
      </div>
      <div class="actions" id="actions" :hidden="phase === 'done'">
        <div v-if="relaxed" class="btn-set" id="ink-actions">
          <button class="btn small" id="undo" @click="undoInk"><Icon name="undo" />Undo</button>
          <button class="btn small" id="clear" @click="clearInk"><Icon name="clear" />Clear</button>
        </div>
        <div class="btn-set">
          <button v-if="!relaxed" class="btn small" id="hint" @click="hint">Hint</button>
          <button class="btn small" id="showme" @click="showMe">Show me</button>
          <button class="btn small" id="skip" @click="skip">Skip</button>
        </div>
      </div>
      <div class="actions" id="next-wrap" :hidden="phase !== 'done'">
        <button class="btn small" id="replay" :hidden="replayHidden" :disabled="replayBusy" @click="replay">{{ relaxed ? "▶ Watch it written" : "▶ See the usual order" }}</button>
        <button class="btn primary" id="next" ref="nextBtn" @click="next">Next</button>
      </div>
    </div>
    <p v-if="!session.counts" class="tip practice-note" id="practice-note">Practice round: this won't change your progress.</p>
    <p class="tip" id="tip">{{ relaxed ? "Write it your way, joined-up strokes are fine. It fills in once it's close enough." : "Write with a finger, stylus or mouse." }}</p>
  </section>
</template>
