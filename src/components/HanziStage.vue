<script setup lang="ts">
/**
 * Mounts one HanziWriter for one character. With `grid` the writer draws into a
 * GridSvg of `size`; otherwise it builds its own svg inside a plain div.
 * The writer is created once on mount (props are read once): re-key the
 * component to start over with a fresh writer.
 */
import { markRaw, onBeforeUnmount, onMounted, ref } from "vue";
import { createWriter, safely, type Writer, type WriterOptions } from "../lib/writer";
import GridSvg from "./GridSvg.vue";

const props = withDefaults(defineProps<{ char: string; options: WriterOptions; grid?: boolean; size?: number }>(), { grid: true, size: 0 });
const emit = defineEmits<{ ready: [writer: Writer] }>();

const gridRef = ref<InstanceType<typeof GridSvg>>();
const divRef = ref<HTMLDivElement>();
let writer: Writer | null = null;

onMounted(() => {
  const el = props.grid ? gridRef.value!.$el : divRef.value;
  // markRaw: Vue must never wrap the writer in a reactive proxy.
  const w = markRaw(createWriter(el, props.char, props.options));
  writer = w;
  emit("ready", w);
});
onBeforeUnmount(() => {
  safely(() => writer?.cancelQuiz());
  safely(() => writer?.pauseAnimation());
});
</script>

<template>
  <GridSvg v-if="grid" ref="gridRef" :size="size" />
  <div v-else ref="divRef"></div>
</template>
