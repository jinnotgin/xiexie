import { defineStore } from "pinia";
import { ref } from "vue";
import type { Word } from "../../../types";

/** Library state that outlives the view: the word popup and the scroll position. Tab and search are in the URL. */
export const useLibraryStore = defineStore("library", () => {
  const modalWord = ref<Word | null>(null);
  const libScroll = ref(0);
  return { modalWord, libScroll };
});
