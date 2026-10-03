import { useRouter } from "vue-router";
import type { Word } from "../../../types";
import { WORDS } from "../../../data/words";
import { buildSession } from "../../../lib/srs";
import { track } from "../../../lib/analytics";
import { useProgressStore } from "../../../stores/progress";
import { useSessionStore } from "../stores/session";

/**
 * Starts a practice round with the given words, or a fresh 10-word round from the chosen levels.
 * Only the fresh round counts towards progress: words picked from the library are practice,
 * where the learner has just seen the character.
 */
export function useStartSession() {
  const router = useRouter();
  const learner = useProgressStore();
  const session = useSessionStore();
  return (words?: Word[]) => {
    const list = words ?? buildSession(WORDS, learner.progress, learner.meta.levels);
    if (!list.length) return;
    const here = router.currentRoute.value;
    const fromSummary = here.name === "summary";
    const counts = !words;
    // Quiz rounds always use the home setting; practising again from the summary keeps the mode picked last time.
    const relaxed = !counts && fromSummary ? session.relaxed : learner.meta.relaxed === true;
    track("practice_session_started", {
      session_type: words ? "single_word" : "recommended",
      word_count: list.length,
      mode: relaxed ? "relaxed" : "strict",
      counts_progress: counts,
    });
    // A round started from the summary ("practise again") goes back where the previous one came from.
    session.start(list, fromSummary ? session.returnTo : here.fullPath, { relaxed, counts });
    router.push({ name: "practice" });
  };
}
