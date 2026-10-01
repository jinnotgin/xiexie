import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import type { Grade, Meta, ProgressRec, Word } from "../types";
import { WORDS } from "../data/words";
import { Store } from "../lib/storage";
import { loadCharData } from "../lib/chardata";
import { DEFAULT_META, applyWritten, dueWords, migrateLevels, nextProgress, statusOf } from "../lib/srs";

/** The learner's saved state: per-word progress plus the profile (XP, streak, settings). */
export const useProgressStore = defineStore("progress", () => {
  const status = ref<"loading" | "ready" | "error">("loading");
  const persistent = ref(false);
  const progress = reactive(new Map<string, ProgressRec>());
  const meta = reactive<Meta>({ ...DEFAULT_META });

  const masteredCount = computed(() => WORDS.filter(w => statusOf(progress, w.id) === "mastered").length);
  const status_ = (id: string) => statusOf(progress, id);
  const due = (levels = meta.levels) => dueWords(WORDS, progress, levels);

  async function init() {
    try { await loadCharData(); }
    catch (e) { status.value = "error"; return; }
    await Store.init();
    persistent.value = Store.persistent;
    (await Store.allProgress()).forEach(p => progress.set(p.id, p));
    Object.assign(meta, DEFAULT_META, (await Store.getMeta()) || {});
    delete (meta as Partial<Meta> & { id?: string }).id;
    delete (meta as Partial<Meta> & { tracing?: boolean }).tracing; // retired setting
    meta.levels = migrateLevels(meta.levels).slice(0, 1); // one level at a time
    status.value = "ready";
  }

  const saveMeta = () => Store.putMeta(meta);

  async function setLevel(id: string) {
    meta.levels = [id];
    await saveMeta();
  }
  async function setStrict(v: boolean) { meta.relaxed = !v; await saveMeta(); }

  async function record(word: Word, grade: Grade, xp: number) {
    meta.xp += xp;
    const p = nextProgress(progress.get(word.id), word.id, grade);
    progress.set(p.id, p);
    await Store.putProgress(p);
    applyWritten(meta, word);
    await saveMeta();
  }

  async function reset() {
    await Store.reset();
    progress.clear();
    Object.assign(meta, DEFAULT_META, { levels: [...DEFAULT_META.levels] });
    await saveMeta();
  }

  return { status, persistent, progress, meta, masteredCount, statusOf: status_, due, init, setLevel, setStrict, record, reset };
});
