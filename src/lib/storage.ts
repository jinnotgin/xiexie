/* =========================================================
   Storage layer. Everything the app saves on this device goes
   through Store. It stays the source of truth when signed in:
   the account store (features/account) syncs it with Firestore (see lib/sync.ts).
   Database name, version and store layout are unchanged from
   the single-file version, so existing progress keeps loading.
   ========================================================= */
import type { Meta, ProgressRec } from "../types";

type StoredMeta = Meta & { id: "meta" };

const DB_NAME = "xiexie-db", DB_VER = 1;
let db: IDBDatabase | null = null;
const mem: { progress: Map<string, ProgressRec>; meta: StoredMeta | null } = { progress: new Map(), meta: null };

function open(): Promise<boolean> {
  return new Promise(res => {
    try {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("progress")) d.createObjectStore("progress", { keyPath: "id" });
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "id" });
      };
      r.onsuccess = () => { db = r.result; res(true); };
      r.onerror = () => res(false);
      r.onblocked = () => res(false);
    } catch (e) { res(false); }
  });
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return new Promise((res, rej) => {
    const t = db!.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

// IndexedDB can't clone Vue proxies, so everything is written as plain data.
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * A write to IndexedDB failed (storage full, the database closed or was deleted). The app carries
 * on with what it has in memory, but this device can no longer be trusted to keep progress, so
 * Store stops claiming it does and tells whoever is listening, once.
 */
function writeFailed(e: unknown) {
  if (!Store.persistent) return;
  Store.persistent = false;
  Store.onWriteError?.(e);
}

async function write(store: string, fn: (s: IDBObjectStore) => IDBRequest | void) {
  if (!db) return;
  try { await run(store, "readwrite", fn); } catch (e) { writeFailed(e); }
}

export const Store = {
  persistent: false,
  /** Called the first time a write fails after a successful open. */
  onWriteError: null as ((e: unknown) => void) | null,
  async init() { this.persistent = await open(); },
  async allProgress(): Promise<ProgressRec[]> {
    if (!db) return [...mem.progress.values()];
    try { return (await run<ProgressRec[]>("progress", "readonly", s => s.getAll())) || []; }
    catch (e) { return [...mem.progress.values()]; }
  },
  async putProgress(rec: ProgressRec) {
    const r = plain(rec);
    mem.progress.set(r.id, r);
    await write("progress", s => s.put(r));
  },
  async putAllProgress(recs: ProgressRec[]) {
    if (!recs.length) return;
    const rs = recs.map(plain);
    rs.forEach(r => mem.progress.set(r.id, r));
    await write("progress", s => { rs.forEach(r => s.put(r)); });
  },
  async getMeta(): Promise<Partial<Meta> | null> {
    if (!db) return mem.meta;
    try { return (await run<StoredMeta>("meta", "readonly", s => s.get("meta"))) || null; }
    catch (e) { return mem.meta; }
  },
  async putMeta(m: Meta) {
    const meta: StoredMeta = { ...plain(m), id: "meta" };
    mem.meta = meta;
    await write("meta", s => s.put(meta));
  },
  async reset() {
    mem.progress.clear(); mem.meta = null;
    await write("progress", s => s.clear());
    await write("meta", s => s.clear());
  },
};
