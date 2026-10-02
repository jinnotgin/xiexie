import posthog from "posthog-js";
import { useRouter } from "vue-router";
import type { Word } from "../types";
import { WORDS } from "../data/words";
import { buildSession } from "../lib/srs";
import { posthogEnabled, practiceLogger } from "../lib/posthog";
import { useProgressStore } from "../stores/progress";
import { useSessionStore } from "../stores/session";

/**
 * Starts a practice round with the given words, or a fresh 10-word round from the chosen levels.
 * Only the fresh round counts towards progress: words picked from the library are practice,
 * where the learner has just seen the character.
 */
export function useStartSession() {
  const router = useRouter();
  const app = useProgressStore();
  const session = useSessionStore();
  return (words?: Word[]) => {
    const list = words ?? buildSession(WORDS, app.progress, app.meta.levels);
    if (!list.length) return;
    const here = router.currentRoute.value;
    const fromSummary = here.name === "summary";
    const counts = !words;
    // Quiz rounds always use the home setting; practising again from the summary keeps the mode picked last time.
    const relaxed = !counts && fromSummary ? session.relaxed : app.meta.relaxed === true;
    if (posthogEnabled) {
      const sessionType = words ? "single_word" : "recommended";
      posthog.capture("practice_session_started", {
        session_type: sessionType,
        word_count: list.length,
        mode: relaxed ? "relaxed" : "strict",
        counts_progress: counts,
      });
      practiceLogger.info("practice session started", {
        event: "practice_session_started",
        session_type: sessionType,
        word_count: list.length,
      });
    }
    // A round started from the summary ("practise again") goes back where the previous one came from.
    session.start(list, fromSummary ? session.returnTo : here.fullPath, { relaxed, counts });
    router.push({ name: "practice" });
  };
}
