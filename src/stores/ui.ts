import { defineStore } from "pinia";
import { ref } from "vue";
import type { Word } from "../types";

/** Screen-level UI state that outlives a single view: the word popup and the library tab. */
export const useUiStore = defineStore("ui", () => {
  const modalWord = ref<Word | null>(null);
  const libLevel = ref<string | null>(null);
  return { modalWord, libLevel };
});
