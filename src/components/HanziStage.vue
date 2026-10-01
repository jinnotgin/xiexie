<script setup lang="ts">
/**
 * Mounts one HanziWriter for one character. With `grid` the writer draws into a
 * GridSvg of `size`; otherwise it builds its own svg inside a plain div.
 * The writer is created once on mount (props are read once): re-key the
 * component to start over with a fresh writer.
 */
import { markRaw, onBeforeUnmount, onMounted, ref } from "vue";
import HanziWriter from "../vendor/hanzi-writer.js";
import { loader } from "../lib/chardata";
import GridSvg from "./GridSvg.vue";

const props = withDefaults(defineProps<{ char: string; options: Record<string, unknown>; grid?: boolean; size?: number }>(), { grid: true, size: 0 });
const emit = defineEmits<{ ready: [writer: any] }>();

const gridRef = ref<InstanceType<typeof GridSvg>>();
const divRef = ref<HTMLDivElement>();
let writer: any = null;

onMounted(() => {
  const el = props.grid ? gridRef.value!.$el : divRef.value;
  // markRaw: Vue must never wrap the writer in a reactive proxy.
  writer = markRaw(HanziWriter.create(el, props.char, { ...props.options, charDataLoader: loader }));
  emit("ready", writer);
});
onBeforeUnmount(() => {
  try { writer.cancelQuiz(); } catch (e) {}
  try { writer.pauseAnimation(); } catch (e) {}
});
</script>

<template>
  <GridSvg v-if="grid" ref="gridRef" :size="size" />
  <div v-else ref="divRef"></div>
</template>
