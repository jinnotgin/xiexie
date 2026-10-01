/* =========================================================
   PostHog: product analytics, logs and error tracking.
   Off unless VITE_POSTHOG_PROJECT_TOKEN is set (fresh clones,
   tests), in which case every call here is a no-op.
   ========================================================= */
import posthog from "posthog-js";

const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;

/** False when the build has no PostHog token; callers skip capturing entirely. */
export const posthogEnabled = !!token;

export function initPosthog() {
  if (!token) {
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

type PracticeLogAttributes = Record<string, boolean | number | string>;

export const practiceLogger = {
  info(message: string, attributes: PracticeLogAttributes) {
    if (posthogEnabled) posthog.logger.info(message, attributes);
  },
};
