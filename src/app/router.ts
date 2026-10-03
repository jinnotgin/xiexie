import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./routes/HomeView.vue";
import { useProgressStore } from "../stores/progress";
import { useSessionStore } from "../features/practice/stores/session";
import { useLibraryStore } from "../features/library/stores/library";

// Old links and home-screen shortcuts used hash URLs (/#/library); move them to the clean path before routing.
if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1));

// Clean URLs (/library). The host must serve index.html for every path: see the rewrite in firebase.json.
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // Home (with the splash) is in the main bundle; the other screens load when first opened.
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/practice", name: "practice", component: () => import("./routes/PracticeView.vue") },
    { path: "/summary", name: "summary", component: () => import("./routes/SummaryView.vue") },
    { path: "/library", name: "library", component: () => import("./routes/LibraryView.vue") },
    { path: "/:rest(.*)*", redirect: "/" },
  ],
  // Back/forward keeps the old position; returning to the library from a round picks up where it was left.
  scrollBehavior: (to, from, saved) => {
    if (saved) return saved;
    if (to.path === from.path) return false;   // only the query changed (library tab or search): stay put
    if (to.name === "library" && (from.name === "practice" || from.name === "summary")) return { top: useLibraryStore().libScroll };
    return { top: 0 };
  },
});

// Screens other than home need loaded data, and practice/summary need a round in progress.
router.beforeEach((to, from) => {
  if (from.name === "library") useLibraryStore().libScroll = window.scrollY;
  if (to.name === "home") return true;
  if (useProgressStore().status !== "ready") return { name: "home" };
  if ((to.name === "practice" || to.name === "summary") && !useSessionStore().active()) return { name: "home" };
  return true;
});
