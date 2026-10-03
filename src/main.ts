import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./app/App.vue";
import { router } from "./app/router";
import { useProgressStore } from "./stores/progress";
import { useAccountStore } from "./features/account/stores/account";
import { setupInstall } from "./lib/install";
import { initAnalytics, trackError } from "./lib/analytics";
import "./styles.css";

initAnalytics();
setupInstall();
const app = createApp(App).use(createPinia()).use(router);

app.config.errorHandler = (error) => {
  console.error(error); // a custom handler replaces Vue's default console logging
  trackError(error);
};

app.mount("#app");
useProgressStore().init().then(() => useAccountStore().start());
