<script lang="ts">
import { ref as vueRef } from "vue";
// Keep the splash up for a beat from app start, so a fast load doesn't just flash it.
const SPLASH_MIN_MS = 1400;
const splashHeld = vueRef(true);
setTimeout(() => { splashHeld.value = false; }, SPLASH_MIN_MS);
</script>

<script setup lang="ts">
import { track } from "../../lib/analytics";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { LEVELS } from "../../data/levels";
import { wordsIn } from "../../data/words";
import { LINES, pick } from "../../lib/momo";
import { streakLive, writtenThisWeek } from "../../lib/srs";
import { useProgressStore } from "../../stores/progress";
import { useAccountStore } from "../../features/account/stores/account";
import { cloudError } from "../../features/account/lib/cloud";
import { ask, tell } from "../../lib/dialog";
import { useStartSession } from "../../features/practice/composables/useStartSession";
import Momo from "../../components/Momo.vue";
import Icon from "../../components/Icon.vue";
import InstallButton from "../../components/InstallButton.vue";

const learner = useProgressStore();
const account = useAccountStore();
const router = useRouter();
const startSession = useStartSession();

const greeting = ref(pick(LINES.home));
// Rotate through Momo's loading lines, starting from a random one.
const loadingIdx = ref(Math.floor(Math.random() * LINES.loading.length));
const loadingLine = computed(() => LINES.loading[loadingIdx.value % LINES.loading.length]);
const rotate = setInterval(() => { if (ready.value) clearInterval(rotate); else loadingIdx.value++; }, 1800);
onUnmounted(() => clearInterval(rotate));
const ready = computed(() => learner.status === "ready" && !splashHeld.value);
const failed = computed(() => learner.status === "error");
const pct = computed(() => learner.loaded === null ? null : Math.round(learner.loaded * 100));
const unpacking = computed(() => pct.value === null || pct.value >= 100);

const levelCount = (id: string) => wordsIn(id).length;

// Phones: levels grouped by stage: pick a stage, then a number within it.
const STAGES = [
  { id: "pri", name: "Primary", levels: LEVELS.filter(L => /^p\d/.test(L.id)) },
  { id: "sec", name: "Secondary", levels: LEVELS.filter(L => L.id.startsWith("sec")) },
  { id: "biz", name: "Business", levels: LEVELS.filter(L => L.id === "biz") },
];
const stage = computed(() => STAGES.find(S => S.levels.some(L => learner.meta.levels.includes(L.id))) ?? STAGES[0]);
// Switching stage starts at its first level; tapping the current stage keeps the choice.
function pickStage(S: typeof STAGES[number]) {
  if (S !== stage.value) learner.setLevel(S.levels[0].id);
}
// Phones hide the captions inside the mode buttons, so the chosen one is spelt out below them.
const MODE_NOTES = { strict: "Every stroke in the right order.", relaxed: "Any order, joined-up strokes and all." };
const modeNote = computed(() => learner.meta.relaxed === false ? MODE_NOTES.strict : MODE_NOTES.relaxed);
const levelNote = computed(() =>
  `${LEVELS.filter(L => learner.meta.levels.includes(L.id)).map(L => L.sub).join(" + ")} · ${levelWords.value.length} words`);

// Mastery counted within the chosen levels, so a new learner sees a goal they can reach.
const levelWords = computed(() => learner.meta.levels.flatMap(wordsIn));
const levelMastered = computed(() => levelWords.value.filter(w => learner.statusOf(w.id) === "mastered").length);
const levelLabel = computed(() => {
  const names = LEVELS.filter(L => learner.meta.levels.includes(L.id)).map(L => L.name);
  return names.length <= 2 ? names.join(" + ") : `${names.length} levels`;
});
const dueCount = computed(() => learner.due().length);
const dueNote = computed(() =>
  `${dueCount.value} word${dueCount.value > 1 ? "s" : ""} due for review. They'll come up first.`);

async function reset() {
  if (account.signedIn) {
    if (!(await ask({
      title: "Reset all your progress?",
      message: "This clears your progress and streak in your Google account and on all your devices. It can't be undone.",
      confirm: "Reset everywhere", danger: true,
    }))) return;
    try { await account.resetAll(); }
    catch (e) { await tell("Couldn't reset your account", cloudError(e) || "Please try again."); return; }
  } else {
    if (!(await ask({
      title: "Reset your progress?",
      message: "This clears your progress and streak on this device. It can't be undone.",
      confirm: "Reset", danger: true,
    }))) return;
    await learner.wipe();
  }
  track("progress_reset", { reset_scope: account.signedIn ? "account" : "device" });
  greeting.value = pick(LINES.home);
}

onMounted(() => { if (!account.signedIn) account.prepare(); });

// A short status line, plus a quieter detail line (the account's email, or a hint).
const storageNote = computed(() => {
  if (account.signedIn) {
    const who = account.user!.email || account.user!.name || "your Google account";
    const title = {
      idle: "Signed in", busy: "Saving…", synced: "Progress saved",
      offline: "Offline, will try again later", error: "Couldn't save, will try again",
    }[account.state];
    return { title, detail: who };
  }
  if (account.state === "busy") return { title: "Signing in…", detail: "" };
  if (account.lapsed) return { title: "You've been signed out", detail: "Sign in again to keep your progress." };
  if (!learner.persistent) return { title: "Storage is unavailable here", detail: "Progress lasts until you close this page." };
  return { title: "Saved on this browser", detail: account.enabled ? "Sign in to keep it on all your devices." : "" };
});
// Stamped into <meta name="build-commit"> by vite.config.ts.
const buildCommit = document.querySelector<HTMLMetaElement>('meta[name="build-commit"]')?.content;

const syncHealthy = computed(() => account.signedIn && account.state !== "offline" && account.state !== "error");

async function signIn() {
  try { await account.signIn(); }
  catch (e) { const msg = cloudError(e); if (msg) await tell("Couldn't sign in", msg); }
}

async function signOut() {
  if (!(await ask({
    title: "Sign out?",
    message: "Your progress stays in your Google account, and this device starts fresh.",
    confirm: "Sign out",
  }))) return;
  if (await account.signOut()) return;
  if (await ask({
    title: "Some progress hasn't been saved",
    message: "Progress from this device hasn't reached your account yet (you may be offline). If you sign out now, it's lost.",
    confirm: "Sign out and lose it", cancel: "Stay signed in", danger: true,
  })) await account.signOut(true);
}
</script>

<template>
  <Transition name="splash" mode="out-in">
  <section v-if="!ready" id="splash" class="splash" :aria-busy="!failed">
    <Momo class="splash-momo" :class="{ bob: !failed }" :mood="failed ? 'hmm' : 'happy'" />
    <h1 class="han">写写</h1>
    <p class="splash-tag">Remember how to write, one stroke at a time.</p>
    <template v-if="failed">
      <p class="bubble splash-msg" role="alert">This browser can't unpack the stroke data. Try an up-to-date Chrome, Safari or Firefox.</p>
    </template>
    <template v-else>
      <div class="loadbar" :class="{ busy: unpacking }" role="progressbar" aria-label="Loading"
        aria-valuemin="0" aria-valuemax="100" :aria-valuenow="unpacking ? undefined : pct!">
        <span :style="{ width: unpacking ? '100%' : pct + '%' }"></span>
      </div>
      <Transition name="line" mode="out-in">
        <p class="splash-status" :key="loadingLine" aria-live="polite">{{ loadingLine }}</p>
      </Transition>
    </template>
  </section>
  <section v-else id="home">
    <div class="masthead">
      <Momo class="momo bob" id="momo-big" />
      <div>
        <h1 class="han">写写</h1>
        <p>Remember how to write, one stroke at a time.</p>
      </div>
      <InstallButton />
    </div>
    <div class="bubble" id="home-bubble">{{ greeting }}</div>
    <div class="stats" id="stats">
      <span class="pill"><Icon name="flame" />{{ streakLive(learner.meta) ? learner.meta.streak : 0 }}-day streak</span>
      <span class="pill"><Icon name="pen" />{{ writtenThisWeek(learner.meta) }} written this week</span>
      <span class="pill"><Icon name="award" />{{ levelMastered }} / {{ levelWords.length }} mastered in {{ levelLabel }}</span>
    </div>

    <h2>Practise from</h2>
    <div class="levels" id="levels" role="group" aria-label="Levels">
      <button v-for="L in LEVELS" :key="L.id" class="chip" :aria-pressed="learner.meta.levels.includes(L.id)"
        @click="learner.setLevel(L.id)">{{ L.name }}<small>{{ L.sub }}, {{ levelCount(L.id) }}</small></button>
    </div>
    <div class="stage-picker">
      <div class="seg" role="group" aria-label="Stage">
        <button v-for="S in STAGES" :key="S.id" :aria-pressed="S === stage" @click="pickStage(S)">{{ S.name }}</button>
      </div>
      <div v-if="stage.levels.length > 1" class="level-nums" role="group" :aria-label="`${stage.name} level`">
        <button v-for="L in stage.levels" :key="L.id" :aria-label="L.name" :aria-pressed="learner.meta.levels.includes(L.id)"
          @click="learner.setLevel(L.id)">{{ L.name.replace(/\D/g, "") }}</button>
      </div>
      <p class="level-note">{{ levelNote }}</p>
    </div>

    <h2>How to write</h2>
    <div class="modes" id="modes" role="group" aria-label="Writing mode">
      <button class="mode" id="mode-strict" :aria-pressed="learner.meta.relaxed === false" @click="learner.setStrict(true)">
        <svg viewBox="-3 -7 56 49" aria-hidden="true">
          <path d="M12 18H48M30 1V40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          <circle cx="12" cy="8" r="7" fill="var(--seal)" /><text x="12" y="11.6" fill="var(--seal-ink)">1</text>
          <circle cx="39.5" cy="0" r="7" fill="var(--seal)" /><text x="39.5" y="3.6" fill="var(--seal-ink)">2</text>
        </svg>
        Stroke by stroke<small>{{ MODE_NOTES.strict }}</small>
      </button>
      <button class="mode" id="mode-relaxed" :aria-pressed="learner.meta.relaxed !== false" @click="learner.setStrict(false)">
        <svg viewBox="-3 -7 56 49" aria-hidden="true">
          <path d="M12 18C24 16 40 16 48 18C40 22 32 6 30 1C30 15 31 30 30 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Relaxed<small>{{ MODE_NOTES.relaxed }}</small>
      </button>
    </div>
    <p class="mode-note" id="mode-note">{{ modeNote }}</p>

    <div class="start-row">
      <button class="btn primary" id="start" @click="startSession()">Start 10 words</button>
      <p v-if="dueCount" class="due-note" id="due-note">{{ dueNote }}</p>
      <button class="btn" id="open-library" @click="router.push({ name: 'library' })">Browse all words</button>
    </div>

    <div class="sync-card" :class="{ synced: syncHealthy, 'has-link': account.enabled && account.signedIn }">
      <Icon :name="account.signedIn ? 'cloud' : 'device'" class="sync-icon" />
      <p class="sync-text">
        <strong id="storage-note">{{ storageNote.title }}</strong>
        <small v-if="storageNote.detail" :class="{ 'sync-who': account.signedIn }" :title="storageNote.detail">{{ storageNote.detail }}</small>
      </p>
      <template v-if="account.enabled">
        <button v-if="account.signedIn" class="linkish" id="sign-out" @click="signOut">Sign out</button>
        <button v-else class="btn small" id="sign-in" :disabled="account.state === 'busy'" @click="signIn">Sign in with Google</button>
      </template>
    </div>
    <div class="foot">
      <button class="linkish" id="reset" @click="reset"><Icon name="reset" />Reset progress</button>
    </div>
    <footer class="credit">
      <span>© {{ new Date().getFullYear() }} · Created by <a href="https://itsjin.com" target="_blank" rel="noopener">Jin</a></span>
      <span v-if="buildCommit" class="build" title="Build commit">{{ buildCommit }}</span>
    </footer>
  </section>
  </Transition>
</template>
