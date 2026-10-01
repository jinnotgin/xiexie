import { onBeforeUnmount, onMounted } from "vue";

/** Document-level keydown listener tied to the component's lifetime. */
export function useKeydown(handler: (e: KeyboardEvent) => void) {
  onMounted(() => document.addEventListener("keydown", handler));
  onBeforeUnmount(() => document.removeEventListener("keydown", handler));
}
