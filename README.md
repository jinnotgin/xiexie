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
  components/                   HanziStage (one HanziWriter), GridSvg, Momo, Icon, WordModal, SyncConflict
  stores/                       progress (saved state), session (current round), ui (popup, library tab), account (Google sign-in, sync)
  lib/                          srs (pure rules), storage (IndexedDB), sync (pure merge rules), search (library search), cloud (Firebase), chardata, speech, momo, dom
  data/                         levels, words.json, chardata.json.gz (stroke data)
  vendor/hanzi-writer.js        Hanzi Writer 3.7.3, patched for out-of-order strokes and leniency
archived/xiexie.html            the original single-file app, kept for reference
docs/sources/                   MOE 欢乐伙伴 2.0 character lists, kept for reference
```

Progress is stored in IndexedDB (`xiexie-db`) in the same format as the original single-file version,
so data carries over when the new build is served from the same origin.

## Word bank

`src/data/words.json` is built around characters, not vocabulary: every character is taught by at least one word,
but a common word is left out when its characters are already covered elsewhere (雨伞 is missing, while 下雨 and 伞 are in).

- **Characters**: all 3,500 level-one characters of the [通用规范汉字表 (2013)](https://github.com/shengdoushi/common-standard-chinese-characters-table), plus 咦, each with stroke data.
- **P1 to P6**: characters placed by the year they are first taught in the 欢乐伙伴 primary textbooks (Chinese, not Higher Chinese),
  using each lesson's 识读字 (read) and 识写字 (write) list. 1,648 of the list's 1,655 characters sit in the same year here.
  MOE publishes the lists on its [Chinese Language teaching resources](https://www.moe.gov.sg/careers/become-teachers/pri-sec-jc-ci/chinese-language-teaching/useful-information-and-resources) page,
  and copies are kept in `docs/sources/` (© Ministry of Education, Singapore):
  - 2015 edition, P1 to P6: [Chinese](https://www.moe.gov.sg/media/files/primary/f607087e-d909-4581-82ac-9c3867c617ee.pdf) (the one this bank follows) and
    [Higher Chinese](https://www.moe.gov.sg/media/files/primary/e055a4ab-c7f4-42b2-96a1-e2b96a370477.pdf).
  - 欢乐伙伴 2.0 (2024 edition, P1 and P2 so far): [Chinese](https://www.moe.gov.sg/api/media/6c0f68ed-a8bf-471c-9f32-b5ea75831910/2024-Character-List-Primary-One-to-Two-Chinese.pdf) and
    [Higher Chinese](https://www.moe.gov.sg/api/media/394e06b1-f4f3-4e90-adb4-a33efd9e1c5e/2024-Character-List-Primary-One-to-Two-Higher-Chinese.pdf).
    2.0 moves some characters earlier: about 80% of its P1 and P2 characters are in this bank's P1 and P2 (伞 is P1 in 2.0 but P2 here).
  - Other resources built on the same lists: the SCCL [字词复习巩固配套](https://www.sccl.sg/zh/publication-and-jcle-ch/teaching-toolkit/primary-school-teaching-toolkit/1491-%E3%80%8A%E6%96%B0%E5%8A%A0%E5%9D%A1%E5%B0%8F%E5%AD%A6%E5%8D%8E%E6%96%87%E5%AD%97%E8%AF%8D%E5%A4%8D%E4%B9%A0%E5%B7%A9%E5%9B%BA%E9%85%8D%E5%A5%97%E3%80%8B) and the 文心书院 [欢乐伙伴 resources](https://visionchinese.com/learningresources/huanlehuoban/).
- **Sec 1 to Sec 4**: the remaining characters split into four groups by how common they are, most common first. This is not the secondary syllabus.
- **Business**: a hand-picked list of office words, kept separate from the school levels.
- **Words, pinyin and meanings**: picked automatically from [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) (CC BY-SA 4.0) and HSK word lists.
  Single-character entries with several readings were checked against the usual reading in the [Unicode Unihan database](https://www.unicode.org/charts/unihan.html) (`kMandarin`) and corrected by hand.
- **Strokes**: [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) (Arphic Public License) via [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data), drawn with [Hanzi Writer](https://hanziwriter.org).

The script that generated the list is not in this repo, so later fixes are made directly in `words.json`.
Progress is keyed by the word itself, so fixing an entry's pinyin or meaning keeps the learner's progress.

## Saving progress to a Google account (optional)

Signing in is optional. Without a Firebase config the button is hidden and nothing from Firebase is downloaded.
Signed in, IndexedDB stays the source of truth on each device and is synced with one Firestore document,
`users/{uid}`, after each word, when the tab is hidden or shown, and when the connection comes back.
The merge rules are pure functions in `src/lib/sync.ts`, tested in `tests/unit/sync.test.ts`:

- **Words**: the most recently practised result for each word wins.
- **Characters written**: each device keeps its own counter, and the total is the sum, so devices never overwrite each other.
- **Streak**: day ranges from each device are joined, so 1 day on a new phone after a 10-day run elsewhere makes 11.
- **First sign-in** on a device that has progress, to an account that also has progress: the learner chooses to combine both or keep only the account's.
- **Sign out** clears the device (after checking everything reached the account), so a shared computer starts fresh.
- **Reset progress** while signed in clears the account, and other devices drop their copy on their next sync instead of re-uploading it.

To turn it on:

1. Create a Firebase project. Under Authentication, enable the Google provider, and add the domain you host on (for example `you.github.io`) under Settings, Authorized domains.
2. Create a Firestore database and publish the rules in `firestore.rules`, along with `firestore.indexes.json` (turns off indexing of the progress map, which is never queried): `firebase deploy --only firestore`, with `"firestore": {"rules": "firestore.rules", "indexes": "firestore.indexes.json"}` in `firebase.json`.
3. Register a web app and copy `.env.example` to `.env.local` with its config values, then `npm run build`. These values are public by design: access is controlled by the rules.
