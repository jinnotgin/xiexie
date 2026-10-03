<script setup lang="ts">
/** Popup with a looping stroke-order animation that writes a word one character at a time. Emits `practise` with the word. */
import { computed, nextTick, ref, watch } from "vue";
import { reduceMotion, writerColors } from "../../../lib/dom";
import { speak, speechOk } from "../../../lib/speech";
import { useProgressStore } from "../../../stores/progress";
import { useLibraryStore } from "../stores/library";
import type { Word } from "../../../types";
import { useKeydown } from "../../../composables/useKeydown";
import { animate, type Writer } from "../../../lib/writer";
import HanziStage from "../../../components/HanziStage.vue";
import Icon from "../../../components/Icon.vue";

const learner = useProgressStore();
const library = useLibraryStore();
const emit = defineEmits<{ practise: [word: Word] }>();
const closeBtn = ref<HTMLButtonElement>();

const word = computed(() => library.modalWord);
const size = ref(0);
const opts = ref<Record<string, unknown>>({});

let writers: Writer[] = [];
let run = 0;   // bumped to cancel the running animation loop

watch(word, async w => {
  writers = [];
  run++;
  if (!w) return;
  const n = w.w.length;
  const s = Math.max(90, Math.min(170, Math.floor((Math.min(window.innerWidth, 440) - 80) / Math.min(n, 2)) - 10));
  size.value = s;
  opts.value = { width: s, height: s, padding: Math.round(s * .07), showOutline: true, strokeAnimationSpeed: 1, delayBetweenStrokes: 180, ...writerColors() };
  await nextTick();
  closeBtn.value?.focus();
});

const status = computed(() => {
  const w = word.value;
  if (!w) return "";
  const p = learner.progress.get(w.id);
  const st = learner.statusOf(w.id);
  return st === "new" || !p ? "Not practised yet." :
    `${st === "mastered" ? "Mastered" : "Learning"}. Written ${p.seen} time${p.seen > 1 ? "s" : ""}, ${p.perfect} perfect.`;
});

function onReady(i: number, wr: Writer) {
  if (reduceMotion) { wr.showCharacter(); return; }
  wr.hideCharacter({ duration: 0 });
  writers[i] = wr;
  const n = word.value ? [...word.value.w].length : 0;
  if (writers.filter(Boolean).length === n) loop(++run);
}

// Animate each character in turn, pause, clear them all, and go again.
async function loop(id: number) {
  const pause = (ms: number) => new Promise(res => setTimeout(res, ms));
  const list = writers;
  while (id === run) {
    for (const wr of list) {
      await animate(wr);
      if (id !== run) return;
    }
    await pause(1600);
    if (id !== run) return;
    for (const wr of list) wr.hideCharacter();
    await pause(400);
  }
}
const close = () => { library.modalWord = null; };
function practise() { const w = word.value!; close(); emit("practise", w); }

useKeydown(e => { if (e.key === "Escape" && word.value) close(); });
</script>

<template>
  <div class="modal" id="modal" :hidden="!word" @click.self="close">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="m-en">
      <div class="prompt-py"><span id="m-py">{{ word?.p }}</span><button class="speak" id="m-speak" aria-label="Hear it" :hidden="!speechOk" @click="word && speak(word.w)"><Icon name="speaker" /></button></div>
      <p class="prompt-en" id="m-en">{{ word?.e }}</p>
      <div class="anim-row" id="m-anim">
        <template v-if="word">
          <div v-for="(ch, i) in [...word.w]" :key="word.id + i" class="stage" :style="{ width: size + 3 + 'px', height: size + 3 + 'px' }">
            <HanziStage :char="ch" :size="size" :options="opts" @ready="wr => onReady(i, wr)" />
          </div>
        </template>
      </div>
      <p class="answer" id="m-status">{{ status }}</p>
      <div class="row sheet-actions">
        <button class="btn primary small" id="m-practise" @click="practise">Practise this</button>
        <button class="btn small" id="m-close" ref="closeBtn" @click="close">Close</button>
      </div>
    </div>
  </div>
</template>
