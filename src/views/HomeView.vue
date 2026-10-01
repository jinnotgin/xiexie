<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { LEVELS } from "../data/levels";
import { WORDS } from "../data/words";
import { LINES, pick } from "../lib/momo";
import { streakLive } from "../lib/srs";
import { useProgressStore } from "../stores/progress";
import { useAccountStore } from "../stores/account";
import { cloudError } from "../lib/cloud";
import { useStartSession } from "../composables/useStartSession";
import Momo from "../components/Momo.vue";
import Icon from "../components/Icon.vue";

const app = useProgressStore();
const account = useAccountStore();
const router = useRouter();
const startSession = useStartSession();

const greeting = ref(pick(LINES.home));
const ready = computed(() => app.status === "ready");
const bubble = computed(() => app.status === "error"
  ? "This browser can't unpack the stroke data. Try an up-to-date Chrome, Safari or Firefox."
  : ready.value ? greeting.value : "");

const levelCount = (id: string) => WORDS.filter(w => w.l === id).length;

// Mastery counted within the chosen levels, so a new learner sees a goal they can reach.
const levelWords = computed(() => WORDS.filter(w => app.meta.levels.includes(w.l)));
const levelMastered = computed(() => levelWords.value.filter(w => app.statusOf(w.id) === "mastered").length);
const levelLabel = computed(() => {
  const names = LEVELS.filter(L => app.meta.levels.includes(L.id)).map(L => L.name);
  return names.length <= 2 ? names.join(" + ") : `${names.length} levels`;
});
const dueCount = computed(() => app.due().length);
const dueNote = computed(() => dueCount.value
  ? `${dueCount.value} word${dueCount.value > 1 ? "s" : ""} due for review. They'll come up first.`
  : "Nothing due for review. New words await.");

async function reset() {
  if (account.signedIn) {
    if (!confirm("Clear all progress and streak in your account and on all your devices?")) return;
    try { await account.resetAll(); }
    catch (e) { alert(cloudError(e) || "Couldn't reset your account. Please try again."); return; }
  } else {
    if (!confirm("Clear all progress and streak on this device?")) return;
    await app.reset();
  }
  greeting.value = pick(LINES.home);
}

onMounted(() => { if (!account.signedIn) account.prepare(); });

const storageNote = computed(() => {
  if (!ready.value) return "Progress is saved on this device.";
  if (account.signedIn) {
    const who = account.user!.email || account.user!.name || "your Google account";
    return {
      idle: `Signed in as ${who}.`, busy: `Signed in as ${who}. Saving…`, synced: `Progress is saved to ${who}.`,
      offline: `Signed in as ${who}. You're offline, so progress is kept on this device until you reconnect.`,
      error: `Signed in as ${who}. Couldn't reach your account just now, will try again.`,
    }[account.state];
  }
  if (account.state === "busy") return "Signing in…";
  if (account.lapsed) return "You've been signed out. Sign in again to keep syncing.";
  return app.persistent ? "Progress is saved on this device." : "Storage is unavailable here, so progress lasts until you close this page.";
});

async function signIn() {
  try { await account.signIn(); }
  catch (e) { const msg = cloudError(e); if (msg) alert(msg); }
}

async function signOut() {
  if (!confirm("Sign out? Your progress stays in your Google account, and this device starts fresh.")) return;
  if (await account.signOut()) return;
  if (confirm("Some progress from this device hasn't reached your account yet (you may be offline). Sign out anyway and lose it?")) await account.signOut(true);
}
</script>

<template>
  <section id="home">
    <div class="masthead">
      <Momo class="momo bob" id="momo-big" />
      <div>
        <h1 class="han">写写</h1>
        <p>Remember how to write, one stroke at a time.</p>
      </div>
    </div>
    <div class="bubble" id="home-bubble">{{ bubble }}</div>
    <div class="stats" id="stats">
      <template v-if="ready">
        <span class="pill"><Icon name="flame" />{{ streakLive(app.meta) ? app.meta.streak : 0 }}-day streak</span>
        <span class="pill"><Icon name="pen" />{{ app.meta.written }} written</span>
        <span class="pill"><Icon name="award" />{{ levelMastered }} / {{ levelWords.length }} mastered in {{ levelLabel }}</span>
      </template>
    </div>

    <h2>Practise from</h2>
    <div class="levels" id="levels" role="group" aria-label="Levels">
      <template v-if="ready">
        <button v-for="L in LEVELS" :key="L.id" class="chip" :aria-pressed="app.meta.levels.includes(L.id)"
          @click="app.setLevel(L.id)">{{ L.name }}<small>{{ L.sub }}, {{ levelCount(L.id) }}</small></button>
      </template>
    </div>

    <label class="toggle">
      <input type="checkbox" id="strict" :checked="ready && app.meta.relaxed === false"
        @change="app.setStrict(($event.target as HTMLInputElement).checked)">
      <span>Strict stroke order<small>Strokes must go in the right order and direction.</small></span>
    </label>

    <div class="start-row">
      <button class="btn primary" id="start" :disabled="!ready" @click="startSession()">
        {{ ready ? "Start 10 words" : "Unpacking 3,500 characters…" }}
      </button>
      <p class="due-note" id="due-note">{{ ready ? dueNote : "" }}</p>
      <button class="btn" id="open-library" :disabled="!ready" @click="router.push({ name: 'library' })">Browse all words</button>
    </div>

    <div class="foot">
      <span id="storage-note">{{ storageNote }}</span>
      <span class="foot-actions">
        <template v-if="ready && account.enabled">
          <button v-if="account.signedIn" class="linkish" id="sign-out" @click="signOut">Sign out</button>
          <button v-else class="btn small" id="sign-in" :disabled="account.state === 'busy'" @click="signIn">Sign in with Google to sync</button>
        </template>
        <button class="linkish" id="reset" :disabled="!ready" @click="reset">Reset progress</button>
      </span>
    </div>
  </section>
</template>
