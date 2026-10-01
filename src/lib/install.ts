// "Add to home screen" support: registers the service worker and works out which install prompt, if any, to offer.
import { reactive } from "vue";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "xiexie-install-dismissed";
// "Not now" hides the banner for two weeks, then it may ask once more.
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const ua = navigator.userAgent;
// iPadOS reports itself as a Mac, so tell it apart by touch.
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isMobile = isIOS || /Android|Mobi/i.test(ua);
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function readDismissed() {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < SNOOZE_MS; } catch { return false; }
}

let deferred: InstallPromptEvent | null = null;

/** mode: "prompt" when the browser can install with one tap (Android Chrome etc), "ios" for the Share-menu hint, null for nothing. Phones and tablets only. */
export const install = reactive({
  mode: null as "prompt" | "ios" | null,
  dismissed: readDismissed(),
});

export function setupInstall() {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  if (!isMobile || standalone()) return;
  if (isIOS) install.mode = "ios";
  // Chrome fires this once it judges the app installable; keep it to show our own button instead.
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    install.mode = "prompt";
  });
  window.addEventListener("appinstalled", () => { install.mode = null; deferred = null; });
}

export async function promptInstall() {
  if (!deferred) return;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  // A used prompt can't be shown again; Chrome fires a fresh beforeinstallprompt if it allows another.
  install.mode = null;
  if (outcome === "dismissed") dismissInstall();
}

export function dismissInstall() {
  install.dismissed = true;
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode: hide for this visit only */ }
}
