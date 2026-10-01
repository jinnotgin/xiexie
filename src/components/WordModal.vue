<script setup lang="ts">
/** Popup with a looping stroke-order animation for each character of a word. */
import { computed, nextTick, ref, watch } from "vue";
import { reduceMotion, writerColors } from "../lib/dom";
import { speak, speechOk } from "../lib/speech";
import { useProgressStore } from "../stores/progress";
import { useUiStore } from "../stores/ui";
import { useStartSession } from "../composables/useStartSession";
import { useKeydown } from "../composables/useKeydown";
import HanziStage from "./HanziStage.vue";

const app = useProgressStore();
const ui = useUiStore();
const startSession = useStartSession();
const closeBtn = ref<HTMLButtonElement>();

const word = computed(() => ui.modalWord);
const size = ref(0);
const opts = ref<Record<string, unknown>>({});

watch(word, async w => {
  if (!w) return;
  const n = w.w.length;
  const s = Math.max(90, Math.min(170, Math.floor((Math.min(window.innerWidth, 440) - 80) / Math.min(n, 2)) - 10));
  size.value = s;
  opts.value = { width: s, height: s, padding: Math.round(s * .07), showOutline: true, strokeAnimationSpeed: 1, delayBetweenStrokes: 180, delayBetweenLoops: 1600, ...writerColors() };
  await nextTick();
  closeBtn.value?.focus();
});

const status = computed(() => {
  const w = word.value;
  if (!w) return "";
  const p = app.progress.get(w.id);
  const st = app.statusOf(w.id);
  return st === "new" || !p ? "Not practised yet." :
    `${st === "mastered" ? "Mastered" : "Learning"}. Written ${p.seen} time${p.seen > 1 ? "s" : ""}, ${p.perfect} perfect.`;
});

function start(wr: any) { if (reduceMotion) wr.showCharacter(); else wr.loopCharacterAnimation(); }
const close = () => { ui.modalWord = null; };
function practise() { const w = word.value!; close(); startSession([w]); }

useKeydown(e => { if (e.key === "Escape" && word.value) close(); });
</script>

<template>
  <div class="modal" id="modal" :hidden="!word" @click.self="close">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="m-en">
      <div class="prompt-py"><span id="m-py">{{ word?.p }}</span><button class="speak" id="m-speak" aria-label="Hear it" :hidden="!speechOk" @click="word && speak(word.w)">🔊</button></div>
      <p class="prompt-en" id="m-en">{{ word?.e }}</p>
      <div class="anim-row" id="m-anim">
        <template v-if="word">
          <div v-for="(ch, i) in [...word.w]" :key="word.id + i" class="stage" :style="{ width: size + 3 + 'px', height: size + 3 + 'px' }">
            <HanziStage :char="ch" :size="size" :options="opts" @ready="start" />
          </div>
        </template>
      </div>
      <p class="answer" id="m-status">{{ status }}</p>
      <div class="row" style="margin-top:12px">
        <button class="btn primary small" id="m-practise" @click="practise">Practise this</button>
        <button class="btn small" id="m-close" ref="closeBtn" @click="close">Close</button>
      </div>
    </div>
  </div>
</template>
