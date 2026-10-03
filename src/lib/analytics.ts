/* =========================================================
   Analytics: product events, logs and error tracking, sent to
   PostHog. Off unless VITE_POSTHOG_PROJECT_TOKEN is set (fresh
   clones, tests), in which case every call here is a no-op.
   Nothing outside this file imports posthog-js.
   ========================================================= */
import posthog from "posthog-js";
import type { Grade } from "../types";

const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const enabled = !!token;

type Mode = "relaxed" | "strict";

/** Relaxed mode's view of one check, shared by the check and stall events. */
interface CheckProps {
  character: string; rank: number; score: number; best_match: string; best_score: number;
  ink_stroke_count: number;
  // Only with Google handwriting on.
  google_sent_as?: string; google_asked?: boolean; google_top?: string; google_rescued?: boolean; google_agreed?: string;
}

/** Every event the app sends, with its properties. */
export interface Events {
  practice_session_started: { session_type: "single_word" | "recommended"; word_count: number; mode: Mode; counts_progress: boolean };
  practice_session_completed: { initial_word_count: number; completed_card_count: number; requeued_word_count: number };
  practice_session_abandoned: { initial_word_count: number; completed_card_count: number };
  practice_word_completed: {
    grade: Grade; character_count: number; mistake_count: number; hint_count: number; shaky_count: number;
    was_revealed: boolean; was_skipped: boolean; mode: Mode; counts_progress: boolean;
  };
  practice_relaxed_check: CheckProps & { accepted: boolean; clean: boolean; rival_score: number };
  practice_relaxed_stall: CheckProps & { score_ratio: number; incomplete: boolean; ink: number[][][] };
  practice_mode_switched: { mode: Mode };
  /** The first-round warm-up: the writing style picked from the two demos, and how long it took. */
  onboarding_warmup: { chosen: Mode; seconds: number };
  practice_hint_requested: { hint_count: number };
  practice_word_revealed: Record<string, never>;
  practice_word_skipped: Record<string, never>;
  library_word_opened: { level: string; word_status: string; opened_from_search: boolean };
  progress_reset: { reset_scope: "account" | "device" };
  account_signed_out: Record<string, never>;
}

/** Events that also go to the practice log, with the message they are logged under. */
const LOGGED: Partial<Record<keyof Events, string>> = {
  practice_session_started: "practice session started",
  practice_session_completed: "practice session completed",
  practice_session_abandoned: "practice session abandoned",
};

export function initAnalytics() {
  if (!enabled) {
    if (import.meta.env.DEV) console.warn("VITE_POSTHOG_PROJECT_TOKEN is not set; PostHog is off.");
    return;
  }
  posthog.init(token, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://xiexie-peer.jinnotgin.com", // managed reverse proxy
    ui_host: "https://us.posthog.com", // so links in the toolbar etc. point back to PostHog, not the proxy
    defaults: "2026-05-30",
    person_profiles: "always",
    logs: {
      serviceName: "xiexie-web",
      environment: import.meta.env.MODE,
    },
  });
}

/** Sends an event, and logs it too if it is one of the LOGGED ones. */
export function track<E extends keyof Events>(event: E, ...[props]: Events[E] extends Record<string, never> ? [] : [Events[E]]) {
  if (!enabled) return;
  posthog.capture(event, props);
  const message = LOGGED[event];
  if (message) posthog.logger.info(message, { event, ...(props as Record<string, boolean | number | string>) });
}

export function trackError(error: unknown) {
  if (enabled) posthog.captureException(error);
}

let identifiedUserId: string | null = null;
/** Ties events to the signed-in account, or starts a fresh anonymous person after sign-out. */
export function identify(user: { uid: string; email: string | null; name: string | null } | null) {
  if (!enabled) return;
  if (!user) {
    if (identifiedUserId) posthog.reset();
    identifiedUserId = null;
    return;
  }
  if (identifiedUserId && identifiedUserId !== user.uid) posthog.reset();
  posthog.identify(user.uid, {
    ...(user.email ? { email: user.email } : {}),
    ...(user.name ? { name: user.name } : {}),
  });
  identifiedUserId = user.uid;
}
