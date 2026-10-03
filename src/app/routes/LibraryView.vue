<script setup lang="ts">
import { track } from "../../lib/analytics";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { LEVELS, LIB_INTRO, SOURCE_NOTE } from "../../data/levels";
import { WORDS, wordsIn } from "../../data/words";
import type { Word } from "../../types";
import { searchWords } from "../../features/library/lib/search";
import { useProgressStore } from "../../stores/progress";
import { useLibraryStore } from "../../features/library/stores/library";

const learner = useProgressStore();
const library = useLibraryStore();
const route = useRoute();
const router = useRouter();

const MAX_RESULTS = 120;
const LEVEL_NAME = Object.fromEntries(LEVELS.map(L => [L.id, L.name]));

// The tab and search live in the URL (/library?level=p3&q=water), so a round started from here
// (which returns to the URL it came from) and back/forward both come back to the same view.
const param = (k: string) => typeof route.query[k] === "string" ? route.query[k] as string : "";
const level = computed(() => LEVEL_NAME[param("level")] ? param("level") : learner.meta.levels[0] || "p1");
// The box keeps its own copy while typing and the URL follows it (bound straight to the route,
// a keystroke landing before the last navigation settles could be undone). v-model also waits
// for a pinyin IME to finish composing before it searches.
const query = ref(param("q"));
watch(query, q => {
  if (q !== param("q")) router.replace({ query: { level: param("level") || undefined, q: q || undefined } });
});
// A new tab starts with an empty search; the URL drops the old one when the tab is picked.
watch(() => param("level"), () => { query.value = ""; });
const searching = computed(() => query.value.trim() !== "");
const found = computed(() => searchWords(WORDS, query.value));
const words = computed(() => searching.value ? found.value.slice(0, MAX_RESULTS) : wordsIn(level.value));
const resultNote = computed(() => {
  const n = found.value.length;
  if (!n) return "No words match. Try characters, pinyin (tones optional) or English.";
  return n > MAX_RESULTS ? `Showing the ${MAX_RESULTS} most common of ${n} matches.` : `${n} match${n > 1 ? "es" : ""} across all levels.`;
});
const tabLabels = computed(() => Object.fromEntries(LEVELS.map(L => {
  const ws = wordsIn(L.id);
  return [L.id, `${L.name} (${ws.filter(w => learner.statusOf(w.id) === "mastered").length}/${ws.length})`];
})));
const intro = computed(() => LIB_INTRO[level.value.startsWith("p") ? "p" : level.value]);
function pickLevel(id: string) { if (id === level.value) query.value = ""; else router.replace({ query: { level: id } }); }
function openWord(word: Word) {
  track("library_word_opened", {
    level: word.l,
    word_status: learner.statusOf(word.id),
    opened_from_search: searching.value,
  });
  library.modalWord = word;
}
</script>

<template>
  <section id="library">
    <div class="topbar">
      <button class="btn ghost small" id="lib-back" @click="router.push({ name: 'home' })">← Home</button>
    </div>
    <h2 class="lib-title">All words</h2>
    <div class="search">
      <input type="search" id="lib-search" v-model="query" placeholder="Search 字, pinyin or English"
        aria-label="Search words" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <button v-if="searching" class="search-clear" aria-label="Clear search" @click="query = ''">✕</button>
    </div>
    <div class="tabs-wrap">
      <div class="tabs" id="tabs" role="tablist">
        <button v-for="L in LEVELS" :key="L.id" class="tab" role="tab" :aria-selected="!searching && L.id === level"
          @click="pickLevel(L.id)">{{ tabLabels[L.id] }}</button>
      </div>
    </div>
    <p class="lib-intro" id="lib-intro" aria-live="polite">{{ searching ? resultNote : intro }}</p>
    <div class="legend"><span><i></i>New</span><span><i class="l"></i>Learning</span><span><i class="m"></i>Mastered</span></div>
    <div class="tiles" id="tiles">
      <button v-for="w in words" :key="w.id" :class="['tile', learner.statusOf(w.id), { tagged: searching }]" @click="openWord(w)">
        <span v-if="searching" class="tile-level">{{ LEVEL_NAME[w.l] }}</span>
        <span class="w han">{{ w.w }}</span><small>{{ w.p }}</small><small class="en">{{ w.e }}</small>
      </button>
    </div>
    <p class="source-note" id="source-note">{{ SOURCE_NOTE }}</p>
  </section>
</template>
