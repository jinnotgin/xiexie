import { defineStore } from "pinia";
import { ref } from "vue";
import type { CardState, Result, Word } from "../types";

/** One practice round: the word queue, results so far and the card being written. */
export const useSessionStore = defineStore("session", () => {
  const queue = ref<Word[]>([]);
  const idx = ref(0);
  const results = ref<(Result | undefined)[]>([]);
  const xp = ref(0);
  const requeued = ref(new Set<string>());
  const total = ref(0);
  const cur = ref<CardState | null>(null);

  function start(words: Word[]) {
    queue.value = [...words]; idx.value = 0; results.value = []; xp.value = 0;
    requeued.value = new Set(); total.value = words.length; cur.value = null;
  }
  const active = () => queue.value.length > 0;

  return { queue, idx, results, xp, requeued, total, cur, start, active };
});
