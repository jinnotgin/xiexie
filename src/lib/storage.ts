/* =========================================================
   Storage layer. Everything the app saves goes through Store,
   so swapping IndexedDB for Firestore later means rewriting
   only this object:
     progress  ->  users/{uid}/progress/{wordId}
     meta      ->  users/{uid} (profile document)
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

export const Store = {
  persistent: false,
  async init() { this.persistent = await open(); },
  async allProgress(): Promise<ProgressRec[]> {
    if (!db) return [...mem.progress.values()];
    try { return (await run<ProgressRec[]>("progress", "readonly", s => s.getAll())) || []; }
    catch (e) { return [...mem.progress.values()]; }
  },
  async putProgress(rec: ProgressRec) {
    const r = plain(rec);
    mem.progress.set(r.id, r);
    if (db) { try { await run("progress", "readwrite", s => s.put(r)); } catch (e) {} }
  },
  async getMeta(): Promise<Partial<Meta> | null> {
    if (!db) return mem.meta;
    try { return (await run<StoredMeta>("meta", "readonly", s => s.get("meta"))) || null; }
    catch (e) { return mem.meta; }
  },
  async putMeta(m: Meta) {
    mem.meta = { ...plain(m), id: "meta" };
    if (db) { try { await run("meta", "readwrite", s => s.put(mem.meta)); } catch (e) {} }
  },
  async reset() {
    mem.progress.clear(); mem.meta = null;
    if (db) { try { await run("progress", "readwrite", s => s.clear()); await run("meta", "readwrite", s => s.clear()); } catch (e) {} }
  },
};
