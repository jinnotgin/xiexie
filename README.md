# 写写 Xiě Xiě

Chinese handwriting practice with a lenient stroke checker, spaced repetition and Momo the ink-drop mascot.
Built with Vue 3, Pinia, Vue Router and Vite.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/ (relative paths, hash routing: host it anywhere)
npm test             # unit tests for the spaced-repetition and grading rules
```

## Layout

```
src/
  main.ts, App.vue, router.ts   app shell; screens are routes (#/, #/practice, #/summary, #/library)
  views/                        HomeView, PracticeView, SummaryView, LibraryView
  components/                   HanziStage (one HanziWriter), GridSvg, Momo, WordModal, SyncConflict
  stores/                       progress (saved state), session (current round), ui (popup, library tab), account (Google sign-in, sync)
  lib/                          srs (pure rules), storage (IndexedDB), sync (pure merge rules), cloud (Firebase), chardata, speech, momo, dom
  data/                         levels, words.json, chardata.json.gz (stroke data)
  vendor/hanzi-writer.js        Hanzi Writer 3.7.3, patched for out-of-order strokes and leniency
archived/xiexie.html            the original single-file app, kept for reference
```

Progress is stored in IndexedDB (`xiexie-db`) in the same format as the original single-file version,
so data carries over when the new build is served from the same origin.

## Saving progress to a Google account (optional)

Signing in is optional. Without a Firebase config the button is hidden and nothing from Firebase is downloaded.
Signed in, IndexedDB stays the source of truth on each device and is synced with one Firestore document,
`users/{uid}`, after each word, when the tab is hidden or shown, and when the connection comes back.
The merge rules are pure functions in `src/lib/sync.ts`, tested in `tests/unit/sync.test.ts`:

- **Words**: the most recently practised result for each word wins.
- **XP and characters written**: each device keeps its own counter, and the total is the sum, so devices never overwrite each other.
- **Streak**: day ranges from each device are joined, so 1 day on a new phone after a 10-day run elsewhere makes 11.
- **First sign-in** on a device that has progress, to an account that also has progress: the learner chooses to combine both or keep only the account's.
- **Sign out** clears the device (after checking everything reached the account), so a shared computer starts fresh.
- **Reset progress** while signed in clears the account, and other devices drop their copy on their next sync instead of re-uploading it.

To turn it on:

1. Create a Firebase project. Under Authentication, enable the Google provider, and add the domain you host on (for example `you.github.io`) under Settings, Authorized domains.
2. Create a Firestore database and publish the rules in `firestore.rules`, along with `firestore.indexes.json` (turns off indexing of the progress map, which is never queried): `firebase deploy --only firestore`, with `"firestore": {"rules": "firestore.rules", "indexes": "firestore.indexes.json"}` in `firebase.json`.
3. Register a web app and copy `.env.example` to `.env.local` with its config values, then `npm run build`. These values are public by design: access is controlled by the rules.
