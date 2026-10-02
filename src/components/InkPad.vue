<script setup lang="ts">
/**
 * A transparent drawing layer for relaxed mode: collects the learner's ink as
 * strokes of [x, y] points (screen pixels, y down) and draws it. It does no
 * checking itself; it reports each pen-down and pen-up to the parent.
 */
import { ref } from "vue";
import type { Pt } from "../lib/relaxed";

defineProps<{ size: number; width: number }>();
const emit = defineEmits<{ start: []; end: [] }>();

const strokes = ref<Pt[][]>([]);
const fading = ref(false);
const held = ref(false);
const svg = ref<SVGSVGElement>();
let active: number | null = null;

const at = (e: PointerEvent): Pt => {
  const r = svg.value!.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

function down(e: PointerEvent) {
  if (active !== null || fading.value) return;
  active = e.pointerId;
  svg.value!.setPointerCapture(e.pointerId);
  strokes.value.push([at(e)]);
  emit("start");
}
function move(e: PointerEvent) {
  if (e.pointerId !== active) return;
  // Coalesced events keep fast strokes smooth on phones.
  const evs = e.getCoalescedEvents?.() ?? [e];
  strokes.value[strokes.value.length - 1].push(...(evs.length ? evs : [e]).map(at));
}
function up(e: PointerEvent) {
  if (e.pointerId !== active) return;
  active = null;
  emit("end");
}

const d = (s: Pt[]) => s.length === 1 ? `M${s[0][0]} ${s[0][1]}h0.1` : "M" + s.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L");

/** Removes all ink, optionally fading it out first. `hold` keeps it dimmed (and locked) that long before the fade. */
function clear(fade = false, hold = 0): Promise<void> {
  if (!fade) { strokes.value = []; return Promise.resolve(); }
  fading.value = true;
  held.value = hold > 0;
  return new Promise(res => setTimeout(() => {
    held.value = false;
    setTimeout(() => { strokes.value = []; fading.value = false; res(); }, 260);
  }, hold));
}

/** Removes the last stroke. Returns false when there was nothing to undo. */
function undo(): boolean {
  if (active !== null || fading.value || !strokes.value.length) return false;
  strokes.value.pop();
  return true;
}

defineExpose({ strokes, clear, undo });
</script>

<template>
  <svg ref="svg" class="ink" :class="{ fading: fading && !held, held }" :width="size" :height="size"
    @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <path v-for="(s, i) in strokes" :key="i" :d="d(s)" :stroke-width="width" />
  </svg>
</template>
