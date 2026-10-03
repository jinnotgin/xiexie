import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { CardState, Grade, Result, Word } from "../../../types";
import { gradeOf } from "../../../lib/srs";

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
  const completedCount = computed(() => results.value.filter(Boolean).length);

  /** Puts the current word on a fresh card. True when it's a requeued word's second go. */
  function beginCard(): boolean {
    const word = queue.value[idx.value];
    cur.value = { word, ci: 0, filled: 0, mistakes: 0, hints: 0, revealed: false, done: false, notes: [], shaky: 0 };
    return requeued.value.has(word.id) && idx.value >= total.value;
  }

  /**
   * Grades the card and records the result. A word only comes back once per round: a fail queues
   * it again at the end, and peeking on its second try counts as "ok", not another "again".
   */
  function finishCard(skipped = false): Grade {
    const c = cur.value!;
    c.done = true;
    if (skipped) { c.revealed = true; c.filled = [...c.word.w].length; }
    const secondTry = requeued.value.has(c.word.id);
    let grade = gradeOf(c);
    if (grade === "again" && secondTry && !skipped) grade = "ok";
    results.value[idx.value] = { word: c.word, grade, notes: c.notes };
    if (grade === "again" && !secondTry) { requeued.value.add(c.word.id); queue.value.push(c.word); }
    return grade;
  }

  /** Moves on to the next queued word. False when the round is over. */
  function advance(): boolean {
    idx.value++;
    return idx.value < queue.value.length;
  }

  return {
    queue, idx, results, requeued, total, cur, returnTo, relaxed, counts, completedCount,
    start, active, beginCard, finishCard, advance,
  };
});
