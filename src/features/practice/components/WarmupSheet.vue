<script setup lang="ts">
/**
 * The first-round warm-up: 起 written two ways, side by side and on a loop. Stroke by stroke
 * draws the textbook's ten strokes in order; Relaxed writes it the everyday way, seven pen
 * strokes with some joined up. The learner taps the one that looks like them, then starts
 * their first round in that mode. Emits the mode picked, or close (Escape: decide later).
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { Pt } from "../lib/relaxed";
import { DEMO, joinedUp, lengthOf, progressAt, smoothPath, timeline } from "../lib/warmup";
import { charData } from "../../../lib/chardata";
import { reduceMotion } from "../../../lib/dom";
import { track } from "../../../lib/analytics";
import { useKeydown } from "../../../composables/useKeydown";

const emit = defineEmits<{ choose: [strict: boolean]; close: [] }>();

const data = charData()[DEMO.ch] as { strokes: string[]; medians: Pt[][] };
const pen = joinedUp(data.medians);
const medianPath = (s: Pt[]) => "M" + s.map(p => p.join(" ")).join("L");
const uid = Math.random().toString(36).slice(2, 8);

// Stroke by stroke: each outline clips a fat line run along its median, as HanziWriter animates it.
const STRICT = timeline(data.medians.map(lengthOf), 1.2, 230);
// Relaxed: a quicker pen, barely lifted between strokes.
const LOOSE = timeline(pen.map(lengthOf), 1.45, 130);
const HOLD = 1800;
const PERIOD = Math.max(STRICT.total, LOOSE.total) + HOLD;

const sweeps = ref<SVGPathElement[]>([]);
const fills = ref<SVGPathElement[]>([]);
const inks = ref<SVGPathElement[]>([]);
const nib = ref<SVGCircleElement>();
const strictAt = ref(0);   // strokes started so far, for the counters
const looseAt = ref(0);

let raf = 0, t0 = 0, sweepLen: number[] = [], inkLen: number[] = [];

function draw(t: number) {
  const ps = progressAt(STRICT.spans, t), pl = progressAt(LOOSE.spans, t);
  sweeps.value.forEach((m, i) => {
    m.style.visibility = ps[i] > 0 && ps[i] < 1 ? "visible" : "hidden";
    m.style.strokeDashoffset = String(sweepLen[i] * (1 - ps[i]));
    fills.value[i].style.visibility = ps[i] >= 1 ? "visible" : "hidden";
  });
  let tip: DOMPoint | null = null;
  inks.value.forEach((p, i) => {
    p.style.visibility = pl[i] > 0 ? "visible" : "hidden";
    p.style.strokeDashoffset = String(inkLen[i] * (1 - pl[i]));
    if (pl[i] > 0 && pl[i] < 1) tip = p.getPointAtLength(inkLen[i] * pl[i]);
  });
  const n = nib.value, at = tip as DOMPoint | null;
  if (n) {
    n.style.visibility = at ? "visible" : "hidden";
    if (at) { n.setAttribute("cx", String(at.x)); n.setAttribute("cy", String(at.y)); }
  }
  strictAt.value = ps.filter(p => p > 0).length;
  looseAt.value = pl.filter(p => p > 0).length;
}

function frame(now: number) {
  if (!t0) t0 = now;
  draw((now - t0) % PERIOD);
  raf = requestAnimationFrame(frame);
}

const shownAt = Date.now();
onMounted(() => {
  sweepLen = sweeps.value.map(p => p.getTotalLength());
  inkLen = inks.value.map(p => p.getTotalLength());
  sweeps.value.forEach((p, i) => { p.style.strokeDasharray = `${sweepLen[i]} ${sweepLen[i] + 400}`; });
  inks.value.forEach((p, i) => { p.style.strokeDasharray = `${inkLen[i]} ${inkLen[i] + 100}`; });
  if (reduceMotion) draw(PERIOD - 1);
  else raf = requestAnimationFrame(frame);
});
onBeforeUnmount(() => cancelAnimationFrame(raf));

useKeydown(e => { if (e.key === "Escape") { e.preventDefault(); emit("close"); } });

const picked = ref<"strict" | "relaxed" | null>(null);
const total = data.medians.length;
const strictCount = computed(() => strictAt.value === total ? `${total} strokes` : strictAt.value ? `Stroke ${strictAt.value} of ${total}` : "");
const looseCount = computed(() => looseAt.value === pen.length ? `${pen.length} pen strokes` : looseAt.value ? `Pen stroke ${looseAt.value}` : "");

const NOTES = {
  strict: "Write stroke by stroke, in textbook order. It's the best way to learn.",
  relaxed: "Write the way you want, with joined-up strokes and all.",
};

const seconds = () => Math.round((Date.now() - shownAt) / 1000);
function start() {
  if (!picked.value) return;
  track("onboarding_warmup", { chosen: picked.value, seconds: seconds() });
  emit("choose", picked.value === "strict");
}
</script>

<template>
  <div class="modal warmup" role="dialog" aria-modal="true" aria-labelledby="warmup-title">
    <div class="sheet">
      <button class="wu-close" aria-label="Close" @click="emit('close')">✕</button>
      <h2 id="warmup-title">How do you like to write?</h2>
      <p class="wu-lead">No wrong answer. Pick what feels right.</p>

      <div class="wu-cards" role="group" aria-label="Writing style">
        <button class="wu-card" :aria-pressed="picked === 'strict'" @click="picked = 'strict'">
          <svg viewBox="0 0 1024 1024" aria-hidden="true">
            <g class="wu-grid"><line x1="0" y1="0" x2="1024" y2="1024" /><line x1="1024" y1="0" x2="0" y2="1024" /><line x1="512" y1="0" x2="512" y2="1024" /><line x1="0" y1="512" x2="1024" y2="512" /></g>
            <g transform="translate(0, 900) scale(1, -1)">
              <template v-for="(d, i) in data.strokes" :key="i">
                <clipPath :id="`wu${uid}-${i}`"><path :d="d" /></clipPath>
                <path ref="sweeps" class="wu-sweep" :d="medianPath(data.medians[i])" :clip-path="`url(#wu${uid}-${i})`" />
                <path ref="fills" class="wu-fill" :d="d" />
              </template>
            </g>
          </svg>
          <span class="wu-count">{{ strictCount }}&nbsp;</span>
          <strong>Stroke by stroke</strong>
        </button>

        <button class="wu-card" :aria-pressed="picked === 'relaxed'" @click="picked = 'relaxed'">
          <svg viewBox="0 0 1024 1024" aria-hidden="true">
            <g class="wu-grid"><line x1="0" y1="0" x2="1024" y2="1024" /><line x1="1024" y1="0" x2="0" y2="1024" /><line x1="512" y1="0" x2="512" y2="1024" /><line x1="0" y1="512" x2="1024" y2="512" /></g>
            <g transform="translate(0, 900) scale(1, -1)">
              <path v-for="(s, i) in pen" :key="i" ref="inks" class="wu-ink" :d="smoothPath(s)" />
              <circle ref="nib" class="wu-nib" r="30" />
            </g>
          </svg>
          <span class="wu-count">{{ looseCount }}&nbsp;</span>
          <strong>Relaxed</strong>
        </button>
      </div>

      <div class="wu-go" :class="{ shown: picked }">
        <p>{{ picked ? NOTES[picked] : "Pick one to start your first round." }}</p>
        <button class="btn primary" :disabled="!picked" @click="start">{{ picked === "relaxed" ? "Start in Relaxed" : picked ? "Start stroke by stroke" : "Start" }}</button>
      </div>
      <p class="tip wu-tip">You can switch any time on the home screen.</p>
    </div>
  </div>
</template>
