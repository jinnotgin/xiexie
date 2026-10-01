import { defineStore } from "pinia";
import { ref } from "vue";
import type { Word } from "../types";

/** Screen-level UI state that outlives a single view: the word popup, the library tab and search. */
export const useUiStore = defineStore("ui", () => {
  const modalWord = ref<Word | null>(null);
  const libLevel = ref<string | null>(null);
  const libQuery = ref("");
  return { modalWord, libLevel, libQuery };
});
