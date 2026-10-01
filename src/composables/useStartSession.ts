import posthog from "posthog-js";
import { useRouter } from "vue-router";
import type { Word } from "../types";
import { WORDS } from "../data/words";
import { buildSession } from "../lib/srs";
import { posthogEnabled, practiceLogger } from "../lib/posthog";
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
    if (posthogEnabled) {
      const sessionType = words ? "single_word" : "recommended";
      posthog.capture("practice_session_started", {
        session_type: sessionType,
        word_count: list.length,
      });
      practiceLogger.info("practice session started", {
        event: "practice_session_started",
        session_type: sessionType,
        word_count: list.length,
      });
    }
    // A round started from the summary ("practise again") goes back where the previous one came from.
    const here = router.currentRoute.value;
    session.start(list, here.name === "summary" ? session.returnTo : here.fullPath);
    router.push({ name: "practice" });
  };
}
