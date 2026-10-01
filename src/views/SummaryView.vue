<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import type { Grade, Result } from "../types";
import { STAMPS } from "../lib/srs";
import { confetti } from "../lib/dom";
import { useSessionStore } from "../stores/session";
import { useStartSession } from "../composables/useStartSession";

const session = useSessionStore();
const router = useRouter();
const startSession = useStartSession();

// Keep only the last result per word (requeued words appear twice)
const list = computed(() => {
  const last = new Map<string, Result>();
  session.results.forEach(r => { if (r) last.set(r.word.id, r); });
  return [...last.values()];
});
const perfect = computed(() => list.value.filter(r => r.grade === "perfect").length);
const allPerfect = computed(() => perfect.value === list.value.length && list.value.length > 0);
const title = computed(() => allPerfect.value ? "全对！" : perfect.value >= list.value.length / 2 ? "不错！" : "加油！");
const SUB: Record<string, string> = {
  "全对！": "All perfect. Your hand remembers more than you think.",
  "不错！": "Nicely done. The tricky ones will come back for review.",
  "加油！": "Every stroke counts. Those words will come round again soon.",
};

// Headline tally: the best grade reached plus the one just below it, skipping empty ones
const ORDER: Grade[] = ["perfect", "good", "ok", "again"];
const NAMES: Record<Grade, string> = { perfect: "perfect", good: "good", ok: "improving", again: "to retry" };
const tally = computed(() => {
  const count = (g: Grade) => list.value.filter(r => r.grade === g).length;
  const best = ORDER.findIndex(g => count(g) > 0);
  if (best < 0) return "";
  return ORDER.slice(best, best + 2).filter(g => count(g) > 0).map(g => `${count(g)} ${NAMES[g]}`).join(" · ");
});

// A short note only for words whose strokes differed from the usual order or direction
function reason(r: Result): string | null {
  if (!r.notes.length) return null;
  const chars = r.word.w.length > 1 ? " in " + [...new Set(r.notes.map(n => n.ch))].join(" ") : "";
  const order = r.notes.some(n => n.order), back = r.notes.some(n => n.backwards);
  return (order && back ? "strokes differed" : order ? "stroke order differed" : "a stroke went backwards") + chars;
}

// A round picked from the library offers the same words again and a way back to them.
const fromLibrary = computed(() => router.resolve(session.returnTo).name === "library");
const again = () => fromLibrary.value ? startSession(session.queue.slice(0, session.total)) : startSession();

onMounted(() => { if (allPerfect.value) confetti(); });
</script>

<template>
  <section id="summary">
    <div class="summary-head">
      <p class="big han" id="sum-title">{{ title }}</p>
      <p id="sum-sub">{{ tally }}. {{ SUB[title] }}</p>
    </div>
    <div class="wall" id="wall">
      <div v-for="r in list" :key="r.word.id" class="wall-item">
        <span :class="['mini-stamp', 'han', r.grade]">{{ STAMPS[r.grade].ch }}</span>
        <div><span class="w han">{{ r.word.w }}</span><small>{{ r.word.p }}</small><small v-if="reason(r)" :class="['note', r.grade]">{{ reason(r) }}</small></div>
      </div>
    </div>
    <div class="row">
      <button class="btn primary" id="again" @click="again">{{ fromLibrary ? "Practise again" : "Another round" }}</button>
      <button v-if="fromLibrary" class="btn" id="back-btn" @click="router.push(session.returnTo)">← Back to words</button>
      <button v-else class="btn" id="home-btn" @click="router.push({ name: 'home' })">Home</button>
    </div>
  </section>
</template>
