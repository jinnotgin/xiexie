<script setup lang="ts">
// The dashed 米字格 practice grid.
defineProps<{ size: number }>();
</script>

<template>
  <svg :width="size" :height="size">
    <g class="grid">
      <line x1="0" y1="0" :x2="size" :y2="size" /><line :x1="size" y1="0" x2="0" :y2="size" />
      <line :x1="size / 2" y1="0" :x2="size / 2" :y2="size" /><line x1="0" :y1="size / 2" :x2="size" :y2="size / 2" />
    </g>
  </svg>
</template>
