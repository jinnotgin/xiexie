<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { LEVELS, LIB_INTRO, SOURCE_NOTE } from "../data/levels";
import { WORDS } from "../data/words";
import { useProgressStore } from "../stores/progress";
import { useUiStore } from "../stores/ui";

const app = useProgressStore();
const ui = useUiStore();
const router = useRouter();

if (!ui.libLevel) ui.libLevel = app.meta.levels[0] || "p1";
const level = computed(() => ui.libLevel!);
const words = computed(() => WORDS.filter(w => w.l === level.value));
const tabLabel = (id: string, name: string) => {
  const ws = WORDS.filter(w => w.l === id);
  return `${name} (${ws.filter(w => app.statusOf(w.id) === "mastered").length}/${ws.length})`;
};
const intro = computed(() => LIB_INTRO[level.value.startsWith("p") ? "p" : level.value]);
</script>

<template>
  <section id="library">
    <div class="topbar">
      <button class="btn ghost small" id="lib-back" @click="router.push({ name: 'home' })">← Home</button>
      <div style="flex:1"></div>
    </div>
    <h2 style="font-size:1.5rem;margin-bottom:12px">All words</h2>
    <div class="tabs" id="tabs" role="tablist">
      <button v-for="L in LEVELS" :key="L.id" class="tab" role="tab" :aria-selected="L.id === level"
        @click="ui.libLevel = L.id">{{ tabLabel(L.id, L.name) }}</button>
    </div>
    <p class="lib-intro" id="lib-intro">{{ intro }}</p>
    <div class="legend"><span><i></i>New</span><span><i class="l"></i>Learning</span><span><i class="m"></i>Mastered</span></div>
    <div class="tiles" id="tiles">
      <button v-for="w in words" :key="w.id" :class="['tile', app.statusOf(w.id)]" @click="ui.modalWord = w"><span class="w han">{{ w.w }}</span><small>{{ w.p }}</small><small>{{ w.e }}</small></button>
    </div>
    <p class="source-note" id="source-note">{{ SOURCE_NOTE }}</p>
  </section>
</template>
