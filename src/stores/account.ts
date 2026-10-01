import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useProgressStore } from "./progress";
import { cloudEnabled, loadCloud, type Cloud, type CloudUser } from "../lib/cloud";
import {
  applyPatch, emptyCloud, linkAction, newId, pullChanges, pushPatch, summarizeCloud, summarizeLocal,
} from "../lib/sync";

export type Choice = "merge" | "account" | "cancel";
export interface Conflict { device: { words: number; xp: number }; account: { words: number; xp: number } }

/**
 * Optional Google sign-in. When signed in, this device's progress (still kept in IndexedDB)
 * is synced with users/{uid} in Firestore: after each word, when the tab is hidden or shown
 * again, and when the connection comes back. Merge rules are in lib/sync.ts.
 */
export const useAccountStore = defineStore("account", () => {
  const app = useProgressStore();
  const user = ref<CloudUser | null>(null);
  const state = ref<"idle" | "busy" | "synced" | "offline" | "error">("idle");
  const conflict = ref<Conflict | null>(null);

  let cloud: Cloud | null = null;
  let connecting: Promise<Cloud> | null = null;
  let answer: ((c: Choice) => void) | null = null;
  let syncedRev = -1;  // app.rev as of the last successful sync; -1 until the first one
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queued = false;

  /** Signed in, and this device's progress belongs to that account. */
  const signedIn = computed(() => !!user.value && user.value.uid === app.meta.sync?.uid);
  /** Linked to an account, but the Google session is gone (signed out elsewhere or expired). */
  const lapsed = computed(() => !user.value && !!app.meta.sync?.uid);

  // Linking, syncing, signing out and resetting run one at a time.
  let chain: Promise<unknown> = Promise.resolve();
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const p = chain.then(fn);
    chain = p.catch(() => {});
    return p;
  }

  async function start() {
    if (!cloudEnabled) return;
    watch(() => app.rev, () => schedule());
    window.addEventListener("online", () => schedule(0));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(); else schedule(0);
    });
    if (app.meta.sync?.uid) await connect(); // signed in before: pick the Google session back up
  }

  /** Loads Firebase ahead of time, so the sign-in popup opens straight from the click (browsers block it otherwise). */
  function prepare() {
    if (!cloudEnabled || cloud || connecting) return;
    const idle = (window as any).requestIdleCallback || ((f: () => void) => setTimeout(f, 1500));
    idle(() => connect().catch(() => {}));
  }

  function connect() {
    return connecting ??= loadCloud().then(c => {
      cloud = c;
      let first = true;
      c.onUser(u => {
        const reload = !first; first = false;
        user.value = u;
        exclusive(async () => {
          if (reload) await app.load(); // another tab may have signed in, out, or reset
          if (u) await link(u); else state.value = "idle";
        }).catch(() => {});
      });
      return c;
    }).catch(e => { connecting = null; throw e; });
  }

  async function signIn() {
    if (!cloudEnabled) return;
    // Already signed in with Google but linking failed (e.g. went offline): just retry it.
    if (user.value && !signedIn.value) return void exclusive(() => link(user.value!));
    state.value = "busy";
    try {
      await (cloud || await connect()).signIn(); // onUser takes it from here
    } catch (e) {
      state.value = "idle";
      throw e;
    }
  }

  /** Ties this device to the account, settling any conflict, then syncs. */
  async function link(u: CloudUser) {
    state.value = "busy";
    try {
      const doc = await cloud!.read(u.uid);
      const action = linkAction(app.sync(), u.uid, doc, app.isEmpty());
      if (action === "ask") {
        const choice = await ask({ device: summarizeLocal(app.progress, app.meta), account: summarizeCloud(doc!) });
        if (choice === "cancel") { await cloud!.signOut(); return; }
        if (choice === "account") await app.wipe();
      } else if (action === "adopt") {
        await app.wipe();
      }
      await app.setLink(u.uid, doc?.epoch || app.sync().epoch || newId());
      await syncOnce();
    } catch (e) {
      state.value = navigator.onLine ? "error" : "offline";
    }
  }

  function ask(c: Conflict) {
    conflict.value = c;
    return new Promise<Choice>(res => { answer = res; });
  }
  function choose(c: Choice) {
    conflict.value = null;
    answer?.(c); answer = null;
  }

  /** One round trip: push what the cloud lacks (atomically), then take in what it has. True on success. */
  async function syncOnce(): Promise<boolean> {
    const u = user.value;
    if (!cloud || !u || app.sync().uid !== u.uid) return false;
    const rev = app.rev;
    state.value = "busy";
    try {
      const r = await cloud.transact(u.uid, doc =>
        doc && doc.epoch !== app.sync().epoch
          ? { patch: null, reset: true }
          : { patch: pushPatch(app.progress, app.meta, app.sync(), doc), reset: false });
      if (r.reset) {
        // Progress was reset on another device: drop this copy rather than re-uploading it.
        await app.wipe({ uid: u.uid, epoch: r.cloud!.epoch });
        return syncOnce();
      }
      const after = applyPatch(r.cloud, r.patch, app.sync().epoch!);
      await app.applyPull(pullChanges(app.progress, app.meta, app.sync(), after));
      syncedRev = rev;
      state.value = "synced";
      return true;
    } catch (e) {
      state.value = navigator.onLine ? "error" : "offline";
      return false;
    }
  }

  function schedule(delay = 2500) {
    if (!signedIn.value) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (queued) return;
      queued = true;
      exclusive(() => { queued = false; return syncOnce(); });
    }, delay);
  }

  function flush() {
    clearTimeout(timer);
    return exclusive(syncOnce);
  }

  /** True when everything on this device has reached the account. */
  const upToDate = () => app.rev === syncedRev;

  /**
   * Signs out and clears this device, so the next person starts fresh. Returns false
   * (without signing out) if unsynced progress would be lost and `force` is not set.
   */
  async function signOut(force = false) {
    if (!(await flush()) || !upToDate()) { if (!force) return false; }
    await exclusive(async () => {
      await cloud!.signOut();
      await app.wipe();
      syncedRev = -1;
      state.value = "idle";
    });
    return true;
  }

  /** Clears progress in the account and on this device. Other devices drop theirs on their next sync. */
  function resetAll() {
    return exclusive(async () => {
      const uid = user.value!.uid, epoch = newId();
      await cloud!.replace(uid, emptyCloud(epoch));
      await app.wipe({ uid, epoch });
      syncedRev = app.rev;
      state.value = "synced";
    });
  }

  return {
    enabled: cloudEnabled, user, state, conflict, signedIn, lapsed,
    start, prepare, signIn, choose, flush, signOut, resetAll,
  };
});
