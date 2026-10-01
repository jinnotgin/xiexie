<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { LEVELS } from "../data/levels";
import { WORDS } from "../data/words";
import { LINES, pick } from "../lib/momo";
import { streakLive } from "../lib/srs";
import { useProgressStore } from "../stores/progress";
import { useStartSession } from "../composables/useStartSession";
import Momo from "../components/Momo.vue";

const app = useProgressStore();
const router = useRouter();
const startSession = useStartSession();

const greeting = ref(pick(LINES.home));
const ready = computed(() => app.status === "ready");
const bubble = computed(() => app.status === "error"
  ? "This browser can't unpack the stroke data. Try an up-to-date Chrome, Safari or Firefox."
  : ready.value ? greeting.value : "");

const levelCount = (id: string) => WORDS.filter(w => w.l === id).length;
const dueCount = computed(() => app.due().length);
const dueNote = computed(() => dueCount.value
  ? `${dueCount.value} word${dueCount.value > 1 ? "s" : ""} due for review. They'll come up first.`
  : "Nothing due for review. New words await.");

async function reset() {
  if (!confirm("Clear all progress, XP and streak on this device?")) return;
  await app.reset();
  greeting.value = pick(LINES.home);
}
</script>

<template>
  <section id="home">
    <div class="masthead">
      <Momo class="momo bob" id="momo-big" />
      <div>
        <h1 class="han">写写</h1>
        <p>Remember how to write, one stroke at a time.</p>
      </div>
    </div>
    <div class="bubble" id="home-bubble">{{ bubble }}</div>
    <div class="stats" id="stats">
      <template v-if="ready">
        <span class="pill">🔥 {{ streakLive(app.meta) ? app.meta.streak : 0 }}-day streak</span>
        <span class="pill">⭐ {{ app.meta.xp }} XP</span>
        <span class="pill">✍️ {{ app.meta.written }} written</span>
        <span class="pill">熟 {{ app.masteredCount }} / {{ WORDS.length }} mastered</span>
      </template>
    </div>

    <h2>Practise from</h2>
    <div class="levels" id="levels" role="group" aria-label="Levels">
      <template v-if="ready">
        <button v-for="L in LEVELS" :key="L.id" class="chip" :aria-pressed="app.meta.levels.includes(L.id)"
          @click="app.toggleLevel(L.id)">{{ L.name }}<small>{{ L.sub }}, {{ levelCount(L.id) }}</small></button>
      </template>
    </div>

    <label class="toggle">
      <input type="checkbox" id="tracing" :checked="ready && !!app.meta.tracing"
        @change="app.setTracing(($event.target as HTMLInputElement).checked)">
      <span>Tracing guide<small>Show a faint outline to trace over. Off means writing from memory.</small></span>
    </label>

    <label class="toggle">
      <input type="checkbox" id="strict" :checked="ready && app.meta.relaxed === false"
        @change="app.setStrict(($event.target as HTMLInputElement).checked)">
      <span>Strict stroke order<small>Strokes must go in the right order and direction. Off means any order counts, with a note if it differs.</small></span>
    </label>

    <div class="start-row">
      <button class="btn primary" id="start" :disabled="!ready" @click="startSession()">
        {{ ready ? "Start 10 words" : "Unpacking 3,500 characters…" }}
      </button>
      <p class="due-note" id="due-note">{{ ready ? dueNote : "" }}</p>
      <button class="btn" id="open-library" :disabled="!ready" @click="router.push({ name: 'library' })">Browse all words</button>
    </div>

    <div class="foot">
      <span id="storage-note">{{ !ready || app.persistent ? "Progress is saved on this device." : "Storage is unavailable here, so progress lasts until you close this page." }}</span>
      <button class="linkish" id="reset" :disabled="!ready" @click="reset">Reset progress</button>
    </div>
  </section>
</template>
