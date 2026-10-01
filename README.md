# 写写 Xiě Xiě

Chinese handwriting practice for Singaporeans who learnt Chinese in school but have barely written it since.
Live at [xiexie.web.app](https://xiexie.web.app).

## Why

Many Singaporeans spend ten years or more learning Chinese in school, then rarely use it after they graduate.
Reading often comes back easily, but handwriting fades fast: you know the word, and the strokes won't come.
写写 helps you revise and reconnect with writing Chinese, starting from what you learnt in school:

- **Levels follow the Singapore syllabus.** P1 to P6 use the MOE 欢乐伙伴 character lists, so you can start from the year you remember.
  Sec 1 to Sec 4 cover the rest of China's 3,500 everyday characters, and a Business level adds words for working life.
- **You write every stroke.** A lenient stroke checker lets you get the gist without failing on small wobbles.
- **Spaced repetition brings words back** just before you are likely to forget them.
- **Momo the ink-drop mascot** keeps you company along the way.
- **No account needed.** Progress stays on your device unless you choose to sign in with Google to sync it.

Built with Vue 3, Pinia, Vue Router and Vite.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests for spaced repetition, grading, search and sync
npm run build        # static site in dist/ (relative paths and hash routing, so it can be hosted anywhere)
```

The live site is on Firebase Hosting: `npm run build`, then `firebase deploy --only hosting`.

## Project layout

```
src/
  main.ts, App.vue, router.ts   app shell; screens are routes (#/, #/practice, #/summary, #/library)
  views/                        HomeView, PracticeView, SummaryView, LibraryView
  components/                   HanziStage (one HanziWriter), GridSvg, Momo, Icon, WordModal, SyncConflict
  stores/                       progress (saved state), session (current round), ui (popup, library tab), account (sign-in, sync)
  lib/                          srs and sync (pure rules), storage (IndexedDB), search, cloud (Firebase), chardata, speech, momo, dom
  data/                         levels.ts, words.json (word bank), chardata.json.gz (stroke data)
  vendor/hanzi-writer.js        Hanzi Writer 3.7.3, patched for out-of-order strokes and leniency
docs/sources/                   MOE character lists the primary levels are based on
archived/xiexie.html            the original single-file app, kept for reference
```

Progress is stored in IndexedDB (`xiexie-db`) in the same format as the original single-file app,
so it carries over when the new build is served from the same origin.

## Word bank

The word bank (`src/data/words.json`) is organised by character, not by vocabulary.
Every character is taught by at least one word, but a common word can be missing when its characters are taught elsewhere:
雨伞 is not in the bank, but 下雨 and 伞 are.

It covers 3,502 characters: the 3,500 everyday characters of China's 通用规范汉字表 (2013), plus 咦 and 踮.
A word sits in the level of its latest character.

| Level | Characters | Source |
|---|---|---|
| P1 to P6 | 1,815 | The year each character is first taught in the 欢乐伙伴 Higher Chinese textbooks (2015 edition). This list includes every character in the standard Chinese course, so both courses are covered: 28 characters come a year earlier than in standard Chinese, and 160 are taught only in Higher Chinese, in P5 and P6. |
| Sec 1 to Sec 4 | 1,687 | The remaining characters, split into four groups by how common they are. MOE publishes no secondary character list, so this follows frequency, not the syllabus. |
| Business | 103 words | Hand-picked office words, including Singapore ones like CPF and GST. Kept separate from the school levels. |

A character counts as taught from the first lesson where it appears, in either the 识读字 (read) or the 识写字 (write) column.

### Editing the word bank

The script that first generated `words.json` is not in this repo, so fixes are made directly in the file.
Saved progress is keyed by the word itself, so a word can change level, pinyin or meaning without losing anyone's progress.

## Saving progress to a Google account (optional)

Signing in is optional. Without a Firebase config the button is hidden and nothing from Firebase is downloaded.

When signed in, IndexedDB stays the source of truth on each device, and syncs with one Firestore document, `users/{uid}`.
It syncs after each word, when the tab is hidden or shown, and when the connection comes back.
The merge rules are pure functions in `src/lib/sync.ts`, tested in `tests/unit/sync.test.ts`:

- **Words**: the most recently practised result for each word wins.
- **Characters written**: each device keeps its own counter and the total is the sum, so devices never overwrite each other.
- **Streak**: day ranges from each device are joined, so 1 day on a new phone after a 10-day run elsewhere makes 11.
- **First sign-in** with progress on both the device and the account: the learner chooses to combine them or keep only the account's.
- **Sign out** clears the device after checking everything reached the account, so a shared computer starts fresh.
- **Reset progress** while signed in clears the account, and other devices drop their copy on their next sync instead of re-uploading it.

To turn it on:

1. Create a Firebase project. Under Authentication, enable the Google provider, and add your hosting domain (for example `you.github.io`) under Settings, Authorized domains.
2. Create a Firestore database, then publish the rules and indexes with `firebase deploy --only firestore`.
   `firestore.indexes.json` turns off indexing of the progress map, which is never queried.
3. Register a web app, copy `.env.example` to `.env.local`, fill in its values and run `npm run build`.
   These values are public by design: access is controlled by the Firestore rules.

## Credits and sources

### Data

| What | Source | Licence |
|---|---|---|
| Words, pinyin and English meanings | [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict), by MDBG and contributors, with words chosen with the help of HSK word lists | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). `words.json` is derived from it and shares this licence. |
| Character set | 通用规范汉字表 (2013), level one, from the Ministry of Education of the PRC and the State Language Commission, via [this transcription](https://github.com/shengdoushi/common-standard-chinese-characters-table) | Official standard |
| Primary levels | 欢乐伙伴 character lists, © Ministry of Education, Singapore, from its [Chinese Language teaching resources](https://www.moe.gov.sg/careers/become-teachers/pri-sec-jc-ci/chinese-language-teaching/useful-information-and-resources) | © MOE Singapore. Copies in `docs/sources/` are kept for reference only. |
| Pronunciation checks | [Unicode Unihan database](https://www.unicode.org/charts/unihan.html) (`kMandarin`), used to correct single characters shown with a rare reading | [Unicode License](https://www.unicode.org/license.txt) |
| Stroke shapes and order | [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) by Shaunak Kishore, packaged as [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) by David Chanin | [Arphic Public License](https://github.com/skishore/makemeahanzi/blob/master/APL/LICENSE) |

The MOE character lists in `docs/sources/`:

- 2015 edition, P1 to P6: [Chinese](https://www.moe.gov.sg/media/files/primary/f607087e-d909-4581-82ac-9c3867c617ee.pdf) and [Higher Chinese](https://www.moe.gov.sg/media/files/primary/e055a4ab-c7f4-42b2-96a1-e2b96a370477.pdf). The primary levels follow these.
- 欢乐伙伴 2.0, P1 and P2 only so far: [Chinese](https://www.moe.gov.sg/api/media/6c0f68ed-a8bf-471c-9f32-b5ea75831910/2024-Character-List-Primary-One-to-Two-Chinese.pdf) and [Higher Chinese](https://www.moe.gov.sg/api/media/394e06b1-f4f3-4e90-adb4-a33efd9e1c5e/2024-Character-List-Primary-One-to-Two-Higher-Chinese.pdf).
  The new edition teaches some characters earlier (伞 moves from P2 to P1), so the bank will need updating as it reaches more years.

Other resources based on the same lists: the SCCL [字词复习巩固配套](https://www.sccl.sg/zh/publication-and-jcle-ch/teaching-toolkit/primary-school-teaching-toolkit/1491-%E3%80%8A%E6%96%B0%E5%8A%A0%E5%9D%A1%E5%B0%8F%E5%AD%A6%E5%8D%8E%E6%96%87%E5%AD%97%E8%AF%8D%E5%A4%8D%E4%B9%A0%E5%B7%A9%E5%9B%BA%E9%85%8D%E5%A5%97%E3%80%8B) and the 文心书院 [欢乐伙伴 resources](https://visionchinese.com/learningresources/huanlehuoban/).

### Code

- [Hanzi Writer](https://hanziwriter.org) 3.7.3 by David Chanin, MIT licence. A patched copy is in `src/vendor/`.
- [Vue](https://vuejs.org), [Pinia](https://pinia.vuejs.org), [Vue Router](https://router.vuejs.org) and [Vite](https://vite.dev), MIT licence.
- [Firebase](https://firebase.google.com) JavaScript SDK, Apache 2.0, used only for the optional sign-in and sync.
