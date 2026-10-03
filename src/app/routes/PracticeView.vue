<script setup lang="ts">
/**
 * The writing card. Session data lives in the session store; this view drives
 * one character at a time and shows the graded result. Strict mode runs the
 * HanziWriter quiz, stroke by stroke; relaxed mode collects free ink on an InkPad
 * and checks the whole character at once (composables/useRelaxedInk.ts). Quiz rounds use the home
 * page's mode and are recorded. Practice picked from the library is never recorded and
 * can switch modes from the top bar without changing the home setting.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import type { Grade } from "../../types";
import type { Pt } from "../../features/practice/lib/relaxed";
import { LINES, pick } from "../../lib/momo";
import { STAMPS, noteKind } from "../../lib/srs";
import { confetti, cssVar, reduceMotion, writerColors } from "../../lib/dom";
import { speak, speechOk } from "../../lib/speech";
import { track } from "../../lib/analytics";
import { useProgressStore } from "../../stores/progress";
import { useSessionStore } from "../../features/practice/stores/session";
import { useKeydown } from "../../composables/useKeydown";
import { useMomoLine } from "../../features/practice/composables/useMomoLine";
import { useRelaxedInk } from "../../features/practice/composables/useRelaxedInk";
import { useTimers, type Timer } from "../../composables/useTimers";
import { animate, quizProgress, safely, type Writer } from "../../lib/writer";
import MomoLine from "../../features/practice/components/MomoLine.vue";
import GridSvg from "../../components/GridSvg.vue";
import HanziStage from "../../components/HanziStage.vue";
import Icon from "../../components/Icon.vue";
import InkPad from "../../features/practice/components/InkPad.vue";

const learner = useProgressStore();
const session = useSessionStore();
const router = useRouter();

const stageEl = ref<HTMLDivElement>();
const nextBtn = ref<HTMLButtonElement>();
const { line: momo, say: setMomo } = useMomoLine();
const momoLine = ref<InstanceType<typeof MomoLine>>();
const timers = useTimers();
const { later, cancel } = timers;

// Re-measure whenever the card changes width (window resize, rotation, text size), not just on resize events.
// Only width matters; fitting Momo's line can change the card's height, which must not trigger another pass.
const sheet = ref<HTMLElement>();
let sheetW = 0;
const sheetObserver = new ResizeObserver(([e]) => {
  const w = e.contentRect.width;
  if (w !== sheetW) { sheetW = w; momoLine.value?.fit(); scheduleRefit(); }
});

const cur = computed(() => session.cur);
const phase = ref<"writing" | "done">("writing");
const grade = ref<Grade>("perfect");

// Writing phase: one HanziStage, re-keyed for every character / restart.
const mountId = ref(0);
const writerSize = ref(0);
const stageBox = ref<number | null>(null);
const writerOpts = shallowRef<Record<string, unknown>>({});
let writer: Writer | null = null;

// Relaxed mode: free writing, re-checked as a whole after every pen-up until it's close enough.
const relaxed = ref(false);
const inkPad = ref<InstanceType<typeof InkPad>>();
const inkWidth = ref(8);
const charPassed = ref(false);   // also locks the ink pad until the next character replaces it
const ink = useRelaxedInk({ inkPad, writerSize, relaxed, charPassed, mountId, timers, say: setMomo, shake: shakeStage, pass: passChar });
const { rivalChar } = ink;
const rivalOpts = computed(() => ({
  width: writerSize.value, height: writerSize.value, padding: Math.round(writerSize.value * 0.07),
  showCharacter: true, showOutline: false, strokeColor: cssVar("--marker"),
}));

// Result phase: the whole word, a stamp and an optional stroke-order replay.
const finalSize = ref(0);
const finalOpts = shallowRef<Record<string, unknown>>({});
const replayHidden = ref(true);
const replayBusy = ref(false);
const stampStyle = ref<Record<string, string>>({});
let finalWriters: Writer[] = [];

let peekTimer: Timer | undefined;
function cancelPeek() { cancel(peekTimer); peekTimer = undefined; }

const dotClass = (i: number) => {
  const r = session.results[i];
  return "dot" + (r ? " " + r.grade : i === session.idx ? " now" : "");
};
const slotClass = (i: number) => {
  const f = cur.value!.filled;
  return "slot han" + (i < f ? " done" : i === f ? " now" : "");
};

// The square fills the card up to 320px. The floor is only a guard against nonsense widths:
// a floor bigger than the card is what pushed the square out of it on narrow screens.
function stageSize() {
  const avail = stageEl.value!.parentElement!.clientWidth - 36;
  return Math.max(160, Math.min(320, avail));
}

/** Shakes the writing box: that stroke or attempt was wrong. Restarts the animation if it's still running. */
function shakeStage() {
  const stage = stageEl.value;
  if (reduceMotion || !stage) return;
  stage.classList.remove("shake"); void stage.offsetWidth; stage.classList.add("shake");
}

// The card changed width (rotation, split view, window resize): fit the square to it again once it settles.
let refitTimer: Timer | undefined;
function scheduleRefit() {
  cancel(refitTimer);
  refitTimer = later(() => { refitTimer = undefined; refit(); }, 150);
}

function refit() {
  const c = session.cur;
  if (!c || !stageEl.value) return;
  const size = stageSize();
  if (phase.value === "done") {
    if (size === finalSize.value) return;
    // The finished word is just a drawing: lay it out again. A replay in progress is dropped.
    if (replayBusy.value) { replayBusy.value = false; stampStyle.value = { animation: "none", opacity: "1" }; }
    finalWriters = [];
    layoutFinal(size);
    mountId.value++;
    return;
  }
  if (size === writerSize.value || c.done || charPassed.value) return;
  if (relaxed.value) {
    // Ink is kept, scaled to the new box. The checker normalises it, so its verdict doesn't change.
    const k = size / writerSize.value;
    const scaled = (inkPad.value?.strokes ?? []).map(st => st.map(([x, y]): Pt => [x * k, y * k]));
    mountWriter({ keepStall: true });
    if (scaled.length) nextTick(() => inkPad.value?.load(scaled));
    return;
  }
  // Strict: the quiz tracks strokes against the old size, so a character in progress starts over.
  const q = quizProgress(writer);
  if (q && !q.active) return;   // just finished; the next character mounts at the new size
  const started = !!q && q.next > 0;
  safely(() => writer?.cancelQuiz());
  cancelPeek();
  mountWriter();
  if (started) setMomo("hmm", "The screen changed size. Start this one again.", { tone: "nudge" });
}

function renderCard() {
  const again = session.beginCard();
  phase.value = "writing";
  finalWriters = [];
  stampStyle.value = {};
  setMomo("happy", again ? "Round two for this one. You've seen it, now write it." : pick(session.relaxed ? LINES.relaxedStart : LINES.start));
  mountWriter();
}

/** Mounts a fresh writer (and ink pad) for the current character at the current size. */
function mountWriter({ keepStall = false } = {}) {
  const size = stageSize();
  writerSize.value = size;
  stageBox.value = size + 4;
  relaxed.value = session.relaxed;
  charPassed.value = false;
  ink.reset({ keepStall });
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

function onWriterReady(w: Writer) {
  writer = w;
  const c = session.cur!;
  const ch = c.word.w[c.ci];
  if (relaxed.value) { ink.warm(); return; }
  w.quiz({
    showHintAfterMisses: 3, highlightOnComplete: true, leniency: 1.25,
    onMistake: d => {
      c.mistakes++;
      shakeStage();
      if (d.mistakesOnStroke >= 3) setMomo("hmm", "Watch the stroke light up, then draw it the same way.", { tone: "nudge" });
      else setMomo("hmm", pick(LINES.mistake));
    },
    onCorrectStroke: () => {
      if (c.mistakes === 0 && !c.revealed) setMomo("happy", "Good, keep going…");
    },
    onComplete: d => {
      const b = d.backwards?.length ?? 0;
      // Misplaced strokes are accepted quietly: no note, no effect on the grade
      if (!c.revealed && b) c.notes.push({ ch, order: 0, backwards: b });
      later(charDone, 380);
    },
  });
}

function passChar(clean = true) {
  const c = session.cur!;
  charPassed.value = true;
  if (!clean) setMomo("happy", "Close enough, that passes. Neater next time.");
  else if (c.mistakes === 0 && !c.revealed) setMomo("happy", "Got it!");
  inkPad.value?.clear(true);
  safely(() => writer?.showCharacter({ duration: 300 }));
  later(charDone, 650);
}

/** Switches this round's mode. A character in progress starts over in the new mode; finished ones stay. */
function setMode(v: boolean) {
  if (session.relaxed === v) return;
  session.relaxed = v;
  const c = session.cur;
  if (!c || c.done || phase.value !== "writing" || charPassed.value) return;   // takes effect from the next character
  track("practice_mode_switched", { mode: v ? "relaxed" : "strict" });
  safely(() => writer?.cancelQuiz());
  cancelPeek();
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
  safely(() => writer?.cancelQuiz());
  const g = session.finishCard(skipped);
  track("practice_word_completed", {
    grade: g,
    character_count: [...c.word.w].length,
    mistake_count: c.mistakes,
    hint_count: c.hints,
    shaky_count: c.shaky,
    was_revealed: c.revealed,
    was_skipped: skipped,
    mode: relaxed.value ? "relaxed" : "strict",
    counts_progress: session.counts,
  });
  if (session.counts) await learner.record(c.word, g);
  if (!timers.alive()) return;

  // Show the whole word in the box with a stamp.
  layoutFinal(stageSize());
  grade.value = g;
  phase.value = "done";

  // One friendly sentence instead of a stats box.
  const kind = g === "good" ? noteKind(c.notes) : null;
  const chars = c.notes.map(n => n.ch).join(" and ");
  const noteLine = kind && {
    both: `Correct! The strokes in ${chars} went a bit differently from usual.`,
    order: `Correct! Only the stroke order in ${chars} was different.`,
    backwards: `Correct! A stroke in ${chars} went the other way.`,
  }[kind];
  setMomo(g === "perfect" ? "wow" : g === "again" ? "hmm" : "happy", noteLine || pick(relaxed.value && g === "perfect" ? LINES.relaxedPerfect : LINES[g]));
  // Offer the usual stroke order when a stroke went its own way, and always after free writing.
  replayHidden.value = !c.notes.length && !relaxed.value;
  if (g === "perfect") confetti();
  await nextTick();
  nextBtn.value?.focus({ preventScroll: true });
}

function layoutFinal(size: number) {
  const n = session.cur!.word.w.length;
  const cell = n === 1 ? size : Math.floor(Math.min(size * 0.92 / n, size * 0.5));
  finalSize.value = size;
  finalOpts.value = {
    width: cell, height: cell, padding: Math.round(cell * 0.07), showOutline: true,
    strokeAnimationSpeed: 1, delayBetweenStrokes: 220, ...writerColors(), outlineColor: cssVar("--grid"),
  };
}

async function replay() {
  const c = session.cur;
  if (!c || !finalWriters.length) return;
  stampStyle.value = { animation: "none", opacity: "0.15" };
  replayBusy.value = true;
  // Replay the characters that had notes first; if none had notes, replay them all.
  const withNotes = new Set(c.notes.map(n => n.ch));
  const targets = finalWriters.filter((_, i) => !withNotes.size || withNotes.has(c.word.w[i]));
  for (const w of targets) safely(() => w.hideCharacter());
  for (const w of targets) await animate(w);
  if (!timers.alive()) return;
  stampStyle.value = { animation: "none", opacity: "1" };
  replayBusy.value = false;
}

function next() {
  if (session.advance()) return renderCard();
  track("practice_session_completed", {
    initial_word_count: session.total,
    completed_card_count: session.completedCount,
    requeued_word_count: session.requeued.size,
  });
  router.replace({ name: "summary" });
}

function hint() {
  const c = session.cur;
  if (!writer || !c || c.done) return;
  // Hint: trace just the next stroke to write, once, then it fades.
  const q = quizProgress(writer);
  if (!q?.active || q.next >= q.strokes) return;
  c.hints++;
  track("practice_hint_requested", { hint_count: c.hints });
  setMomo("happy", "Here's the next stroke. Watch where it starts and which way it goes.");
  safely(() => writer?.highlightStroke(q.next));
}

function showMe() {
  const c = session.cur;
  if (!writer || !c || c.done) return;
  if (!c.revealed) track("practice_word_revealed");
  c.revealed = true;
  // Show me: flash the whole character, keep the strokes already written.
  const w = writer;
  setMomo("happy", "Here's the whole character. Take a good look…");
  cancelPeek();
  w.showOutline();
  peekTimer = later(() => {
    if (w !== writer || c.done) return;
    safely(() => w.hideOutline());
    setMomo("happy", "Now finish it from memory.");
  }, 2500);
}

function skip() {
  if (!session.cur || session.cur.done) return;
  track("practice_word_skipped");
  finishWord(true);
}

function quit() {
  track("practice_session_abandoned", {
    initial_word_count: session.total,
    completed_card_count: session.completedCount,
  });
  safely(() => writer?.cancelQuiz());
  if (session.completedCount) router.replace({ name: "summary" });
  else router.replace(session.returnTo);
}

useKeydown(e => {
  if (e.key === "Enter" && phase.value === "done") { e.preventDefault(); next(); }
});

onMounted(() => { renderCard(); if (sheet.value) sheetObserver.observe(sheet.value); });
onBeforeUnmount(() => sheetObserver.disconnect());
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
    <div class="sheet" ref="sheet">
      <div class="prompt-py"><span id="p-py">{{ cur?.word.p }}</span><button class="speak" id="p-speak" aria-label="Hear it" :hidden="!speechOk" @click="cur && speak(cur.word.w)"><Icon name="speaker" /></button></div>
      <p class="prompt-en" id="p-en">{{ cur?.word.e }}</p>
      <div class="slots" id="slots" :hidden="!cur || cur.word.w.length === 1">
        <template v-if="cur"><span v-for="(ch, i) in [...cur.word.w]" :key="i" :class="slotClass(i)">{{ i < cur.filled ? ch : "？" }}</span></template>
      </div>
      <div class="stage" id="stage" ref="stageEl" :style="stageBox ? { width: stageBox + 'px', height: stageBox + 'px' } : undefined">
        <HanziStage v-if="cur && phase === 'writing' && writerSize" :key="mountId" :char="cur.word.w[cur.ci] ?? ''"
          :size="writerSize" :options="writerOpts" @ready="onWriterReady" />
        <InkPad v-if="cur && phase === 'writing' && writerSize && relaxed" :key="'ink' + mountId" ref="inkPad" :locked="charPassed"
          :size="writerSize" :width="Math.max(6, Math.round(inkWidth * 0.75))" @start="ink.onInkStart" @end="ink.onInkEnd" />
        <template v-else-if="cur && phase === 'done'">
          <GridSvg :size="finalSize" />
          <div class="final-word">
            <HanziStage v-for="(ch, i) in [...cur.word.w]" :key="mountId + ':' + i" :grid="false" :char="ch"
              :options="finalOpts" @ready="(w: Writer) => (finalWriters[i] = w)" />
          </div>
          <div :class="['stamp', grade]" :style="stampStyle"><span class="han">{{ STAMPS[grade].ch }}</span><small>{{ STAMPS[grade].label }}</small></div>
        </template>
        <Transition name="rival">
          <div v-if="rivalChar && phase === 'writing'" :key="rivalChar + mountId" class="rival-ghost">
            <HanziStage :grid="false" :char="rivalChar" :options="rivalOpts" />
          </div>
        </Transition>
      </div>
      <MomoLine ref="momoLine" :key="momo.seq" :line="momo" />
      <div class="actions" id="actions" :class="{ split: relaxed }" :hidden="phase === 'done'">
        <div v-if="relaxed" class="btn-set" id="ink-actions">
          <button class="btn small icon-btn" id="undo" aria-label="Undo" title="Undo" @click="ink.undo"><Icon name="undo" /><span class="lbl">Undo</span></button>
          <button class="btn small icon-btn" id="clear" aria-label="Clear" title="Clear" @click="ink.clear"><Icon name="clear" /><span class="lbl">Clear</span></button>
        </div>
        <div class="btn-set">
          <button v-if="!relaxed" class="btn small" id="hint" @click="hint">Hint</button>
          <button class="btn small" id="showme" @click="showMe">Show me</button>
          <button class="btn small ghost" id="skip" @click="skip">Skip</button>
        </div>
      </div>
      <div class="actions" id="next-wrap" :hidden="phase !== 'done'">
        <button class="btn small" id="replay" :hidden="replayHidden" :disabled="replayBusy" @click="replay">{{ relaxed ? "▶ Watch it written" : "▶ See the usual order" }}</button>
        <button class="btn primary" id="next" ref="nextBtn" @click="next">Next</button>
      </div>
    </div>
    <p v-if="!session.counts" class="tip practice-note" id="practice-note">Practice round: this won't change your progress.</p>
    <p class="tip" id="tip">{{ relaxed ? "Draw with a finger, stylus or mouse." : "Write with a finger, stylus or mouse." }}</p>
  </section>
</template>
