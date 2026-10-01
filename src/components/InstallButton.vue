<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { install, promptInstall } from "../lib/install";
import { useKeydown } from "../composables/useKeydown";
import Icon from "./Icon.vue";

// iOS can't be prompted from a page, so the button shows how to do it from the Share menu instead.
const tip = ref(false);
function onClick() {
  if (install.mode === "prompt") promptInstall();
  else tip.value = !tip.value;
}
useKeydown(e => { if (e.key === "Escape") tip.value = false; });
// Tapping anywhere else closes the tip (iOS doesn't focus buttons on tap, so focusout can't be relied on).
const root = ref<HTMLElement | null>(null);
const closeOutside = (e: PointerEvent) => { if (!root.value?.contains(e.target as Node)) tip.value = false; };
onMounted(() => document.addEventListener("pointerdown", closeOutside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeOutside));
</script>

<template>
  <div v-if="install.mode" ref="root" class="install">
    <button class="install-btn" id="install" :aria-expanded="install.mode === 'ios' ? tip : undefined" @click="onClick">
      <Icon name="install" />Install
    </button>
    <p v-if="tip" class="install-tip" role="status">
      Tap <Icon name="share" /> <b>Share</b>, then <b>Add to Home Screen</b>.
    </p>
  </div>
</template>
