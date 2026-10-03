<script setup lang="ts">
/**
 * Momo and one line of speech, centred under the practice card. Re-key it with the line's `seq`
 * so each new line pops in fresh. Call `fit()` when the card changes width.
 */
import { computed, onMounted, ref } from "vue";
import type { MomoLineState } from "../composables/useMomoLine";
import Momo from "../../../components/Momo.vue";

const props = defineProps<{ line: MomoLineState }>();

const parts = computed(() => props.line.glyph ? props.line.text.split(props.line.glyph) : [props.line.text]);

// A wrapped line's box stays at its max-width, so Momo + text would sit left of center.
// Find the narrowest width that keeps the same number of lines (and lets no word overflow) and use it,
// so the pair centers whether it wraps or not. Only the box's size is compared: Range rects for wrapped
// text differ between browsers (Safari's can run to the box's edge), box sizes don't. offset* and
// scroll* are layout pixels, so a nudge's pop-in scale doesn't skew them.
const say = ref<HTMLElement>();
function fit() {
  const el = say.value;
  if (!el) return;
  el.style.width = "";
  if (!el.offsetWidth) return;   // not laid out (hidden or detached): nothing to measure, so don't squeeze it
  const height = el.offsetHeight;
  // offsetWidth is rounded; +1 so the start width never cuts a fraction off a line that just fits.
  let lo = 0, hi = el.offsetWidth + 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    el.style.width = `${mid}px`;
    if (el.offsetHeight > height || el.scrollWidth > el.clientWidth) lo = mid; else hi = mid;
  }
  el.style.width = `${hi}px`;
}

onMounted(() => { fit(); document.fonts?.ready.then(fit); });
defineExpose({ fit });
</script>

<template>
  <div class="momo-line" :class="line.tone">
    <Momo id="momo-small" :mood="line.mood" />
    <span id="momo-say" ref="say" role="status">
      <template v-for="(part, i) in parts" :key="i"><b v-if="i" class="momo-glyph">{{ line.glyph }}</b>{{ part }}</template>
    </span>
  </div>
</template>
