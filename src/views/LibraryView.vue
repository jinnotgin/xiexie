<script setup lang="ts">
import posthog from "posthog-js";
import { posthogEnabled } from "../lib/posthog";
import { computed } from "vue";
import { useRouter } from "vue-router";
import { LEVELS, LIB_INTRO, SOURCE_NOTE } from "../data/levels";
import { WORDS } from "../data/words";
import { searchWords } from "../lib/search";
import { useProgressStore } from "../stores/progress";
import { useUiStore } from "../stores/ui";

const app = useProgressStore();
const ui = useUiStore();
const router = useRouter();

const MAX_RESULTS = 120;
const LEVEL_NAME = Object.fromEntries(LEVELS.map(L => [L.id, L.name]));

if (!ui.libLevel) ui.libLevel = app.meta.levels[0] || "p1";
const level = computed(() => ui.libLevel!);
const searching = computed(() => ui.libQuery.trim() !== "");
const found = computed(() => searchWords(WORDS, ui.libQuery));
const words = computed(() => searching.value ? found.value.slice(0, MAX_RESULTS) : WORDS.filter(w => w.l === level.value));
const resultNote = computed(() => {
  const n = found.value.length;
  if (!n) return "No words match. Try characters, pinyin (tones optional) or English.";
  return n > MAX_RESULTS ? `Showing the ${MAX_RESULTS} most common of ${n} matches.` : `${n} match${n > 1 ? "es" : ""} across all levels.`;
});
const tabLabel = (id: string, name: string) => {
  const ws = WORDS.filter(w => w.l === id);
  return `${name} (${ws.filter(w => app.statusOf(w.id) === "mastered").length}/${ws.length})`;
};
const intro = computed(() => LIB_INTRO[level.value.startsWith("p") ? "p" : level.value]);
function pickLevel(id: string) { ui.libLevel = id; ui.libQuery = ""; }
function openWord(word: typeof WORDS[number]) {
  if (posthogEnabled) {
    posthog.capture("library_word_opened", {
      level: word.l,
      word_status: app.statusOf(word.id),
      opened_from_search: searching.value,
    });
  }
  ui.modalWord = word;
}
</script>

<template>
  <section id="library">
    <div class="topbar">
      <button class="btn ghost small" id="lib-back" @click="router.push({ name: 'home' })">← Home</button>
    </div>
    <h2 class="lib-title">All words</h2>
    <div class="search">
      <input type="search" id="lib-search" v-model="ui.libQuery" placeholder="Search 字, pinyin or English"
        aria-label="Search words" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <button v-if="searching" class="search-clear" aria-label="Clear search" @click="ui.libQuery = ''">✕</button>
    </div>
    <div class="tabs-wrap">
      <div class="tabs" id="tabs" role="tablist">
        <button v-for="L in LEVELS" :key="L.id" class="tab" role="tab" :aria-selected="!searching && L.id === level"
          @click="pickLevel(L.id)">{{ tabLabel(L.id, L.name) }}</button>
      </div>
    </div>
    <p class="lib-intro" id="lib-intro" aria-live="polite">{{ searching ? resultNote : intro }}</p>
    <div class="legend"><span><i></i>New</span><span><i class="l"></i>Learning</span><span><i class="m"></i>Mastered</span></div>
    <div class="tiles" id="tiles">
      <button v-for="w in words" :key="w.id" :class="['tile', app.statusOf(w.id), { tagged: searching }]" @click="openWord(w)">
        <span v-if="searching" class="tile-level">{{ LEVEL_NAME[w.l] }}</span>
        <span class="w han">{{ w.w }}</span><small>{{ w.p }}</small><small class="en">{{ w.e }}</small>
      </button>
    </div>
    <p class="source-note" id="source-note">{{ SOURCE_NOTE }}</p>
  </section>
</template>
