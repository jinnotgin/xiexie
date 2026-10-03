<script setup lang="ts">
import WordModal from "../features/library/components/WordModal.vue";
import SyncConflict from "../features/account/components/SyncConflict.vue";
import { useStartSession } from "../features/practice/composables/useStartSession";
import AppDialog from "../components/AppDialog.vue";

const startSession = useStartSession();
</script>

<template>
  <main>
    <RouterView />
  </main>
  <WordModal @practise="w => startSession([w])" />
  <SyncConflict />
  <AppDialog />
</template>
