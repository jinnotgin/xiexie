import { createApp } from "vue";
import { createPinia } from "pinia";
import posthog from "posthog-js";
import App from "./App.vue";
import { router } from "./router";
import { useProgressStore } from "./stores/progress";
import { useAccountStore } from "./stores/account";
import { setupInstall } from "./lib/install";
import { initPosthog, posthogEnabled } from "./lib/posthog";
import "./styles.css";

initPosthog();
setupInstall();
const app = createApp(App).use(createPinia()).use(router);

if (posthogEnabled) {
  app.config.errorHandler = (error) => {
    console.error(error); // a custom handler replaces Vue's default console logging
    posthog.captureException(error);
  };
}

app.mount("#app");
useProgressStore().init().then(() => useAccountStore().start());
