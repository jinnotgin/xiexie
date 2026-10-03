<script setup lang="ts">
/**
 * The app's confirm/notice dialog (see lib/dialog.ts). Focuses the safe choice for anything that
 * can't be undone, keeps Tab inside the dialog, and hands focus back to where it was on close.
 */
import { nextTick, ref, watch } from "vue";
import { answerDialog, openDialog } from "../lib/dialog";
import { useKeydown } from "../composables/useKeydown";

const sheet = ref<HTMLElement>();
const confirmBtn = ref<HTMLButtonElement>();
const cancelBtn = ref<HTMLButtonElement>();
let returnFocus: HTMLElement | null = null;

watch(openDialog, async (d, prev) => {
  if (d && !prev) returnFocus = document.activeElement as HTMLElement | null;
  if (d) {
    await nextTick();
    (d.danger && cancelBtn.value ? cancelBtn.value : confirmBtn.value)?.focus();
  } else {
    returnFocus?.focus?.({ preventScroll: true });
    returnFocus = null;
  }
});

useKeydown(e => {
  const d = openDialog.value;
  if (!d) return;
  if (e.key === "Escape") { e.preventDefault(); answerDialog(false); return; }
  if (e.key !== "Tab" || !sheet.value) return;
  const buttons = [...sheet.value.querySelectorAll("button")];
  const first = buttons[0], last = buttons[buttons.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
</script>

<template>
  <Transition name="dialog">
    <div v-if="openDialog" class="modal" @click.self="answerDialog(false)">
      <div ref="sheet" class="sheet dialog" :role="openDialog.cancel ? 'alertdialog' : 'dialog'" aria-modal="true"
        aria-labelledby="dialog-title" :aria-describedby="openDialog.message ? 'dialog-message' : undefined">
        <h2 id="dialog-title">{{ openDialog.title }}</h2>
        <p v-if="openDialog.message" id="dialog-message" class="answer">{{ openDialog.message }}</p>
        <div class="row sheet-actions">
          <button ref="confirmBtn" class="btn primary small" @click="answerDialog(true)">{{ openDialog.confirm }}</button>
          <button v-if="openDialog.cancel" ref="cancelBtn" class="btn small" @click="answerDialog(false)">{{ openDialog.cancel }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
