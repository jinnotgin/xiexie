<script setup lang="ts">
/** Small line icons drawn in the current text colour, with the same rounded weight as the app's borders. */
defineProps<{ name: "flame" | "pen" | "award" | "speaker" | "cloud" | "device" | "reset" }>();
</script>

<template>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'flame'">
      <path d="M12 21.5c-4 0-7-2.7-7-6.6 0-3.4 2.3-5.4 3.6-7.6.4 1.6 1.2 2.7 2.4 3.2C11 7 12.6 4.3 15 2.5c-.3 3.3 4 5.6 4 11.4 0 4.3-3 7.6-7 7.6Z" />
      <path d="M12 21.5c-1.7 0-3-1.2-3-3 0-2 1.6-2.9 2.3-4.6 1.6 1.2 3.7 2.4 3.7 4.6 0 1.8-1.3 3-3 3Z" />
    </template>
    <template v-else-if="name === 'pen'">
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4.5 1.5L5 15Z" />
      <path d="M14.5 5.5l3 3" />
    </template>
    <template v-else-if="name === 'award'">
      <circle cx="12" cy="9" r="6.5" />
      <path d="m9.2 9 2 2 3.6-3.8" />
      <path d="M8.3 14.3 7 21.5l5-2.6 5 2.6-1.3-7.2" />
    </template>
    <template v-else-if="name === 'cloud'">
      <path d="M7 19a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4.8 4.8 0 0 1-.5 9.5Z" />
      <path d="m9.5 13.8 1.8 1.8 3.4-3.6" />
    </template>
    <template v-else-if="name === 'device'">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </template>
    <template v-else-if="name === 'reset'">
      <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
      <path d="M4 3.5v5h5" />
    </template>
    <template v-else>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
      <path d="M18.5 6.5a8 8 0 0 1 0 11" />
    </template>
  </svg>
</template>
