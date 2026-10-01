import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import PracticeView from "./views/PracticeView.vue";
import SummaryView from "./views/SummaryView.vue";
import LibraryView from "./views/LibraryView.vue";
import { useProgressStore } from "./stores/progress";
import { useSessionStore } from "./stores/session";

// Hash history keeps the app working from any static host or folder, with no server rewrites.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/practice", name: "practice", component: PracticeView },
    { path: "/summary", name: "summary", component: SummaryView },
    { path: "/library", name: "library", component: LibraryView },
    { path: "/:rest(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

// Screens other than home need loaded data, and practice/summary need a round in progress.
router.beforeEach(to => {
  if (to.name === "home") return true;
  if (useProgressStore().status !== "ready") return { name: "home" };
  if ((to.name === "practice" || to.name === "summary") && !useSessionStore().active()) return { name: "home" };
  return true;
});
