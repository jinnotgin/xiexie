<script setup lang="ts">
import { install, promptInstall, dismissInstall } from "../lib/install";
import Icon from "./Icon.vue";
</script>

<template>
  <div v-if="install.mode && !install.dismissed" class="sync-card install-card" id="install-card">
    <Icon name="install" class="sync-icon" />
    <p class="sync-text">
      <span>Put 写写 on your home screen.</span>
      <small v-if="install.mode === 'ios'">
        Tap <Icon name="share" class="inline-icon" /> Share, then <b>Add to Home Screen</b>.
        It opens full screen and works offline.
      </small>
      <small v-else>It opens full screen and works offline.</small>
    </p>
    <div class="install-actions">
      <button v-if="install.mode === 'prompt'" class="btn small" id="install" @click="promptInstall">Install</button>
      <button class="linkish" id="install-later" @click="dismissInstall">Not now</button>
    </div>
  </div>
</template>
