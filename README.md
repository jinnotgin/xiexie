# 写写 Xiě Xiě

Chinese handwriting practice with a lenient stroke checker, spaced repetition and Momo the ink-drop mascot.
Built with Vue 3, Pinia, Vue Router and Vite.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/ (relative paths, hash routing: host it anywhere)
npm test             # unit tests for the spaced-repetition and grading rules
npm run test:parity  # builds, then compares the Vue app with archived/xiexie.html in Chrome
```

## Layout

```
src/
  main.ts, App.vue, router.ts   app shell; screens are routes (#/, #/practice, #/summary, #/library)
  views/                        HomeView, PracticeView, SummaryView, LibraryView
  components/                   HanziStage (one HanziWriter), GridSvg, Momo, WordModal
  stores/                       progress (saved state), session (current round), ui (popup, library tab)
  lib/                          srs (pure rules), storage (IndexedDB), chardata, speech, momo, dom
  data/                         levels, words.json, chardata.json.gz (stroke data)
  vendor/hanzi-writer.js        Hanzi Writer 3.7.3, patched for out-of-order strokes and leniency
archived/xiexie.html            the original single-file app, kept as the parity-test reference
```

Progress is stored in IndexedDB (`xiexie-db`) in the same format as the original single-file version,
so data carries over when the new build is served from the same origin.

The parity test needs Google Chrome installed (it drives the system Chrome through `playwright-core`).
Its report and screenshots land in `tests/parity/out/`.
