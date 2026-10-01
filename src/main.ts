import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import { useProgressStore } from "./stores/progress";
import { useAccountStore } from "./stores/account";
import { setupInstall } from "./lib/install";
import "./styles.css";

setupInstall();
const app = createApp(App).use(createPinia()).use(router);
app.mount("#app");
useProgressStore().init().then(() => useAccountStore().start());
