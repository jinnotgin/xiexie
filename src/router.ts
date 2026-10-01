import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import PracticeView from "./views/PracticeView.vue";
import SummaryView from "./views/SummaryView.vue";
import LibraryView from "./views/LibraryView.vue";
import { useProgressStore } from "./stores/progress";
import { useSessionStore } from "./stores/session";
import { useUiStore } from "./stores/ui";

// Old links and home-screen shortcuts used hash URLs (/#/library); move them to the clean path before routing.
if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1));

// Clean URLs (/library). The host must serve index.html for every path: see the rewrite in firebase.json.
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/practice", name: "practice", component: PracticeView },
    { path: "/summary", name: "summary", component: SummaryView },
    { path: "/library", name: "library", component: LibraryView },
    { path: "/:rest(.*)*", redirect: "/" },
  ],
  // Back/forward keeps the old position; returning to the library from a round picks up where it was left.
  scrollBehavior: (to, from, saved) => {
    if (saved) return saved;
    if (to.name === "library" && (from.name === "practice" || from.name === "summary")) return { top: useUiStore().libScroll };
    return { top: 0 };
  },
});

// Screens other than home need loaded data, and practice/summary need a round in progress.
router.beforeEach((to, from) => {
  if (from.name === "library") useUiStore().libScroll = window.scrollY;
  if (to.name === "home") return true;
  if (useProgressStore().status !== "ready") return { name: "home" };
  if ((to.name === "practice" || to.name === "summary") && !useSessionStore().active()) return { name: "home" };
  return true;
});
