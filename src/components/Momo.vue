<script setup lang="ts">
import { computed } from "vue";
import type { Mood } from "../types";
import { momoSVG } from "../lib/momo";

const props = withDefaults(defineProps<{ mood?: Mood }>(), { mood: "happy" });
const svg = computed(() => momoSVG(props.mood));
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true" v-html="svg"></svg>
</template>
