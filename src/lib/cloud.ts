/* =========================================================
   Firebase: Google sign-in and the users/{uid} document.
   Imported on demand, so guests never download Firebase.
   Uses Firestore Lite (no offline cache or live listeners):
   IndexedDB stays the source of truth on each device, and
   stores/account.ts syncs it with a transaction when online.
   ========================================================= */
import { normalizeCloud, type CloudDoc, type CloudPatch } from "./sync";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** False when the build has no Firebase config, in which case sign-in is hidden entirely. */
export const cloudEnabled = !!(config.apiKey && config.projectId);

export interface CloudUser { uid: string; email: string | null; name: string | null }

export type Cloud = Awaited<ReturnType<typeof init>>;

let loading: ReturnType<typeof init> | null = null;
export const loadCloud = () => (loading ??= init());

async function init() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import("firebase/app"), import("firebase/auth"), import("firebase/firestore/lite"),
  ]);
  const app = initializeApp(config);
  const a = auth.getAuth(app);
  const db = fs.getFirestore(app);
  const ref = (uid: string) => fs.doc(db, "users", uid);

  return {
    onUser(cb: (u: CloudUser | null) => void) {
      return auth.onAuthStateChanged(a, u => cb(u && { uid: u.uid, email: u.email, name: u.displayName }));
    },
    async signIn() {
      const provider = new auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await auth.signInWithPopup(a, provider);
    },
    signOut: () => auth.signOut(a),
    async read(uid: string): Promise<CloudDoc | null> {
      const s = await fs.getDoc(ref(uid));
      return s.exists() ? normalizeCloud(s.data()) : null;
    },
    /**
     * Reads the document, asks `plan` what to merge into it, and writes that atomically.
     * `plan` may run more than once if another device writes at the same time, so it must be pure.
     */
    transact<T extends { patch: CloudPatch | null }>(uid: string, plan: (cloud: CloudDoc | null) => T): Promise<T & { cloud: CloudDoc | null }> {
      return fs.runTransaction(db, async tx => {
        const s = await tx.get(ref(uid));
        const cloud = s.exists() ? normalizeCloud(s.data()) : null;
        const out = plan(cloud);
        if (out.patch) tx.set(ref(uid), out.patch, { merge: true });
        return { ...out, cloud };
      });
    },
    /** Overwrites the whole document (used by "Reset progress"). */
    replace: (uid: string, doc: CloudDoc) => fs.setDoc(ref(uid), doc),
  };
}

/** A short, learner-facing reason for a failed Firebase call, or null if it needs no message. */
export function cloudError(e: unknown): string | null {
  const code = (e as { code?: string })?.code || "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null;
  if (code === "auth/popup-blocked") return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
  if (code === "auth/unauthorized-domain") return "Sign-in isn't set up for this web address yet.";
  if (code === "auth/network-request-failed" || code === "unavailable" || !navigator.onLine) return "You seem to be offline. Try again when you're connected.";
  return "Something went wrong talking to Google. Please try again.";
}
