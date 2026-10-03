import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import type { Grade, Meta, ProgressRec, SyncState, Word } from "../types";
import { WORDS } from "../data/words";
import { Store } from "../lib/storage";
import { loadCharData } from "../lib/chardata";
import { DEFAULT_META, addWritten, applyWritten, dueWords, migrateLevels, nextProgress, statusOf } from "../lib/srs";
import { freshSync, type Pull } from "../lib/sync";

/** The learner's saved state: per-word progress plus the profile (streak, settings). */
export const useProgressStore = defineStore("progress", () => {
  const status = ref<"loading" | "ready" | "error">("loading");
  /** Stroke-data download progress, 0–1, or null while unpacking or when the size is unknown. */
  const loaded = ref<number | null>(0);
  const persistent = ref(false);
  const progress = reactive(new Map<string, ProgressRec>());
  const meta = reactive<Meta>({ ...DEFAULT_META });
  /** Bumped on every local change, so the account store knows there is something to sync. */
  const rev = ref(0);

  const masteredCount = computed(() => WORDS.filter(w => statusOf(progress, w.id) === "mastered").length);
  const status_ = (id: string) => statusOf(progress, id);
  const due = (levels = meta.levels) => dueWords(WORDS, progress, levels);
  const sync = () => meta.sync!;
  const isEmpty = () => !progress.size && !meta.written;

  async function init() {
    try { await loadCharData(undefined, f => { loaded.value = f; }); }
    catch (e) { status.value = "error"; return; }
    await Store.init();
    persistent.value = Store.persistent;
    await load();
    status.value = "ready";
  }

  /** (Re)reads everything from IndexedDB, e.g. after another tab signed in or out. */
  async function load() {
    const recs = await Store.allProgress();
    progress.clear();
    recs.forEach(p => progress.set(p.id, p));
    for (const k of Object.keys(meta)) delete (meta as Record<string, unknown>)[k];
    Object.assign(meta, DEFAULT_META, (await Store.getMeta()) || {});
    delete (meta as Partial<Meta> & { id?: string }).id;
    delete (meta as Partial<Meta> & { tracing?: boolean }).tracing; // retired setting
    delete (meta as Partial<Meta> & { xp?: number }).xp;            // retired XP counter
    meta.levels = migrateLevels(meta.levels).slice(0, 1); // one level at a time
    // Progress from before sign-in existed counts as this device's own contribution.
    if (!meta.sync) meta.sync = freshSync({ written: meta.written });
  }

  const saveMeta = () => Store.putMeta(meta);
  const changed = () => { rev.value++; };

  async function setLevel(id: string) {
    meta.levels = [id];
    sync().settingsAt = Date.now();
    await saveMeta(); changed();
  }
  async function setStrict(v: boolean) {
    meta.relaxed = !v;
    sync().settingsAt = Date.now();
    await saveMeta(); changed();
  }

  async function record(word: Word, grade: Grade) {
    // All in-memory changes happen before the first await, so a sync landing mid-way can't drop any.
    const p = nextProgress(progress.get(word.id), word.id, grade);
    progress.set(p.id, p);
    applyWritten(meta, word);
    addWritten(sync().own, word.w.length);
    await Store.putProgress(p);
    await saveMeta(); changed();
  }

  /** Clears everything on this device and starts a fresh, unlinked profile (a new cloud counter id too). */
  async function wipe(link: Pick<SyncState, "uid" | "epoch"> = { uid: null, epoch: null }) {
    await Store.reset();
    progress.clear();
    Object.assign(meta, DEFAULT_META, { levels: [...DEFAULT_META.levels], sync: { ...freshSync(), ...link } });
    await saveMeta(); changed();
  }
  const reset = () => wipe();

  /** Takes in what a sync brought down from the cloud (see pullChanges in lib/sync.ts). */
  async function applyPull(pull: Pull) {
    pull.save.forEach(p => progress.set(p.id, p));
    Object.assign(meta, pull.meta);
    Object.assign(sync(), pull.sync);
    await Store.putAllProgress(pull.save);
    await saveMeta();
  }

  /** Links this device to an account (or unlinks it with uid null) without touching its progress. */
  async function setLink(uid: string | null, epoch: string | null) {
    Object.assign(sync(), { uid, epoch });
    await saveMeta();
  }

  return {
    status, loaded, persistent, progress, meta, rev, masteredCount, statusOf: status_, due, sync, isEmpty,
    init, load, setLevel, setStrict, record, reset, wipe, applyPull, setLink,
  };
});
