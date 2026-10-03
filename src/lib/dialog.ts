/* =========================================================
   In-app replacements for confirm() and alert(): one dialog
   at a time, drawn by components/AppDialog.vue (mounted once
   in App.vue). Both return a promise, so callers read like
   the browser versions: `if (!(await ask({...}))) return;`
   ========================================================= */
import { shallowRef } from "vue";

export interface DialogRequest {
  title: string;
  message?: string;
  confirm: string;       // label of the main button
  cancel?: string;       // label of the way out; none for a notice
  danger?: boolean;      // the main button can't be undone: the way out gets the focus
}

interface OpenDialog extends DialogRequest { resolve: (ok: boolean) => void }

/** The dialog on screen, or null. Only AppDialog should read this. */
export const openDialog = shallowRef<OpenDialog | null>(null);

function show(req: DialogRequest): Promise<boolean> {
  openDialog.value?.resolve(false);   // a newer question replaces an unanswered one
  return new Promise(resolve => { openDialog.value = { ...req, resolve }; });
}

/** Asks the learner to confirm. True for the main button; false for cancel, Escape or a tap outside. */
export const ask = (req: Omit<DialogRequest, "cancel"> & { cancel?: string }) => show({ cancel: "Cancel", ...req });

/** Tells the learner something, with a single button to close it. */
export const tell = (title: string, message?: string) => show({ title, message, confirm: "OK" }).then(() => {});

/** Closes the dialog with the learner's answer. */
export function answerDialog(ok: boolean) {
  const d = openDialog.value;
  openDialog.value = null;
  d?.resolve(ok);
}
