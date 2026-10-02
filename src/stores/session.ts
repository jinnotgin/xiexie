import { defineStore } from "pinia";
import { ref } from "vue";
import type { CardState, Result, Word } from "../types";

/** One practice round: the word queue, results so far and the card being written. */
export const useSessionStore = defineStore("session", () => {
  const queue = ref<Word[]>([]);
  const idx = ref(0);
  const results = ref<(Result | undefined)[]>([]);
  const requeued = ref(new Set<string>());
  const total = ref(0);
  const cur = ref<CardState | null>(null);
  const returnTo = ref("/");   // the page the round was started from, to go back to afterwards
  const relaxed = ref(false);  // this round's writing mode: the home setting, switchable mid-round in practice
  const counts = ref(true);    // false for practice picked from the library: nothing is recorded

  function start(words: Word[], from: string, opts: { relaxed: boolean; counts: boolean }) {
    queue.value = [...words]; idx.value = 0; results.value = [];
    requeued.value = new Set(); total.value = words.length; cur.value = null;
    returnTo.value = from; relaxed.value = opts.relaxed; counts.value = opts.counts;
  }
  const active = () => queue.value.length > 0;

  return { queue, idx, results, requeued, total, cur, returnTo, relaxed, counts, start, active };
});
