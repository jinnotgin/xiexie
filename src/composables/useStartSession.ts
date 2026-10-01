import { useRouter } from "vue-router";
import type { Word } from "../types";
import { WORDS } from "../data/words";
import { buildSession } from "../lib/srs";
import { useProgressStore } from "../stores/progress";
import { useSessionStore } from "../stores/session";

/** Starts a practice round with the given words, or a fresh 10-word round from the chosen levels. */
export function useStartSession() {
  const router = useRouter();
  const app = useProgressStore();
  const session = useSessionStore();
  return (words?: Word[]) => {
    const list = words ?? buildSession(WORDS, app.progress, app.meta.levels);
    if (!list.length) return;
    session.start(list);
    router.push({ name: "practice" });
  };
}
