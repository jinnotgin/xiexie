<script setup lang="ts">
import WordModal from "./components/WordModal.vue";
import SyncConflict from "./components/SyncConflict.vue";
</script>

<template>
  <main>
    <RouterView />
  </main>
  <WordModal />
  <SyncConflict />
</template>
