import { onBeforeUnmount } from "vue";

export type Timer = ReturnType<typeof setTimeout>;
export type Timers = ReturnType<typeof useTimers>;

/** Timeouts that die with the component, so nothing fires into a view that has gone. */
export function useTimers() {
  let alive = true;
  const pending = new Set<Timer>();

  function later(fn: () => void, ms: number): Timer {
    const t = setTimeout(() => { pending.delete(t); if (alive) fn(); }, ms);
    pending.add(t);
    return t;
  }
  function cancel(t: Timer | undefined) {
    if (t === undefined) return;
    clearTimeout(t);
    pending.delete(t);
  }

  onBeforeUnmount(() => { alive = false; pending.forEach(clearTimeout); pending.clear(); });
  return { later, cancel, alive: () => alive };
}
