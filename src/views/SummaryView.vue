<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import type { Result } from "../types";
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

onMounted(() => { if (allPerfect.value) confetti(); });
</script>

<template>
  <section id="summary">
    <div class="summary-head">
      <p class="big han" id="sum-title">{{ title }}</p>
      <p id="sum-sub">{{ perfect }} of {{ list.length }} perfect. {{ SUB[title] }}</p>
    </div>
    <div class="wall" id="wall">
      <div v-for="r in list" :key="r.word.id" class="wall-item">
        <span :class="['mini-stamp', 'han', r.grade]">{{ STAMPS[r.grade].ch }}</span>
        <div><span class="w han">{{ r.word.w }}</span><small>{{ r.word.p }}</small><small>{{ r.word.e }}</small><small v-if="r.notes && r.notes.length" class="note">{{ r.notes.some(n => n.order || n.backwards) ? "stroke order to polish" : "stroke placement to polish" }}</small></div>
      </div>
    </div>
    <div class="row">
      <button class="btn primary" id="again" @click="startSession()">Another round</button>
      <button class="btn" id="home-btn" @click="router.push({ name: 'home' })">Home</button>
    </div>
  </section>
</template>
