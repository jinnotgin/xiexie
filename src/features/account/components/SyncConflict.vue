<script setup lang="ts">
/** Asked on first sign-in when both this device and the Google account already have progress. */
import { nextTick, ref, watch } from "vue";
import { useAccountStore } from "../stores/account";
import { useKeydown } from "../../../composables/useKeydown";

const account = useAccountStore();
const mergeBtn = ref<HTMLButtonElement>();
const words = (n: number) => `${n} word${n === 1 ? "" : "s"}`;

watch(() => account.conflict, async c => { if (c) { await nextTick(); mergeBtn.value?.focus(); } });
useKeydown(e => { if (e.key === "Escape" && account.conflict) account.choose("cancel"); });
</script>

<template>
  <div class="modal" :hidden="!account.conflict">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sc-title" v-if="account.conflict">
      <h2 id="sc-title">You have progress in two places</h2>
      <div class="sync-compare">
        <div><small>This device</small>{{ words(account.conflict.device.words) }}</div>
        <div><small>Your account</small>{{ words(account.conflict.account.words) }}</div>
      </div>
      <p class="answer">Combining keeps your latest result for each word.</p>
      <div class="row sheet-actions">
        <button class="btn primary small" ref="mergeBtn" @click="account.choose('merge')">Combine both</button>
        <button class="btn small" @click="account.choose('account')">Use account's only</button>
      </div>
      <p class="sheet-cancel"><button class="linkish" @click="account.choose('cancel')">Cancel and stay signed out</button></p>
    </div>
  </div>
</template>
