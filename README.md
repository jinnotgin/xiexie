# 写写 Xiě Xiě

Chinese handwriting practice for Singaporeans who learnt Chinese in school but have barely written it since.
Live at [xiexie.web.app](https://xiexie.web.app).

## Why

Many Singaporeans spend ten years or more learning Chinese in school, then rarely use it after they graduate.
写写 helps you revise and reconnect with writing it:

- **Levels follow the Singapore syllabus.** P1 to P6 use the MOE 欢乐伙伴 character lists, so you can start from the year you remember.
  Sec 1 to Sec 4 cover the rest of China's 3,500 everyday characters, and Business adds words for working life.
- **You write every stroke,** with a lenient checker that forgives small wobbles.
  Turn off strict stroke order to write freely instead: any order, any direction, joined-up strokes and all; the character counts once it is close enough.
- **Spaced repetition** brings words back just before you are likely to forget them.
- **No account needed.** Progress stays on your device unless you sign in with Google to sync it.

Built with [Hanzi Writer](https://hanziwriter.org), Vue 3, Pinia, Vue Router and Vite.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests for spaced repetition, grading, relaxed checking, search and sync
npm run lint         # ESLint, including the import boundaries between src/app, src/features and shared code
npm run build        # static site in dist/, hostable anywhere
```

The live site is on Firebase Hosting: `npm run build`, then `firebase deploy --only hosting`.

## Word bank

`src/data/words.json` is organised by character, not vocabulary: every character is taught by at least one word,
so a common word can be missing when its characters are taught elsewhere (雨伞 is not in the bank, but 下雨 and 伞 are).
It covers 3,502 characters: the 3,500 of China's 通用规范汉字表 (2013), plus 咦 and 踮.

| Level | Characters | Source |
|---|---|---|
| P1 to P6 | 1,815 | Year first taught in 欢乐伙伴 Higher Chinese (2015 edition), which includes every standard Chinese character plus 160 more in P5 and P6. |
| Sec 1 to Sec 4 | 1,687 | The remaining characters in four groups, most common first. MOE publishes no secondary character list. |
| Business | 103 words | Hand-picked office words, including CPF and GST. |

When editing: a word sits in the level of its latest character, and a character counts from the first lesson it appears in,
as either 识读字 (read) or 识写字 (write). The script that generated the bank is not in this repo, so fixes go straight into `words.json`.
Progress is keyed by the word, so changing a word's level, pinyin or meaning keeps everyone's progress.

## Saving progress to a Google account (optional)

Without a Firebase config the sign-in button is hidden and nothing from Firebase is downloaded.
Signed in, each device keeps IndexedDB as its source of truth and syncs with one Firestore document, `users/{uid}`,
after each word, when the tab is hidden or shown, and when the connection comes back.
The merge rules are pure functions in `src/lib/sync.ts`, tested in `tests/unit/sync.test.ts`:

- **Words**: the most recently practised result wins.
- **Characters written**: each device keeps its own counter and the total is the sum. The home page shows this week's (from Monday), summing only devices whose count is from this week; the lifetime total is kept too.
- **Streak**: day ranges from each device are joined, so 1 day on a new phone after a 10-day run elsewhere makes 11.
- **First sign-in** with progress on both sides: the learner chooses to combine them or keep only the account's.
- **Sign out** clears the device once everything has reached the account, so a shared computer starts fresh.
- **Reset progress** clears the account, and other devices drop their copy instead of re-uploading it.

To turn it on:

1. Create a Firebase project, enable the Google provider under Authentication, and add your hosting domain under Settings, Authorized domains.
2. Create a Firestore database and publish the rules and indexes with `firebase deploy --only firestore`.
3. Register a web app, copy `.env.example` to `.env.local`, fill in its values and rebuild.
   These values are public by design: the Firestore rules control access.

## Credits and sources

| What | Source | Licence |
|---|---|---|
| Words, pinyin and meanings | [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) by MDBG and contributors, with HSK word lists | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), which `words.json` shares |
| Character set | 通用规范汉字表 (2013), level one, from the PRC Ministry of Education and State Language Commission, via [this transcription](https://github.com/shengdoushi/common-standard-chinese-characters-table) | Official standard |
| Primary levels | 欢乐伙伴 character lists from MOE's [Chinese Language teaching resources](https://www.moe.gov.sg/careers/become-teachers/pri-sec-jc-ci/chinese-language-teaching/useful-information-and-resources) | © Ministry of Education, Singapore; copies in `docs/sources/` for reference only |
| Pronunciation checks | [Unicode Unihan database](https://www.unicode.org/charts/unihan.html) (`kMandarin`) | [Unicode License](https://www.unicode.org/license.txt) |
| Stroke data | [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) by Shaunak Kishore, via [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) by David Chanin | [Arphic Public License](https://github.com/skishore/makemeahanzi/blob/master/APL/LICENSE) |
| Stroke drawing and checking | [Hanzi Writer](https://hanziwriter.org) 3.7.3 by David Chanin, patched in `src/vendor/` | MIT |
| App framework | [Vue](https://vuejs.org), [Pinia](https://pinia.vuejs.org), [Vue Router](https://router.vuejs.org), [Vite](https://vite.dev) | MIT |
| Optional sign-in and sync | [Firebase](https://firebase.google.com) JavaScript SDK | Apache 2.0 |

The MOE lists are the 2015 edition for P1 to P6 ([Chinese](https://www.moe.gov.sg/media/files/primary/f607087e-d909-4581-82ac-9c3867c617ee.pdf), [Higher Chinese](https://www.moe.gov.sg/media/files/primary/e055a4ab-c7f4-42b2-96a1-e2b96a370477.pdf)),
which the levels follow, and 欢乐伙伴 2.0 for P1 and P2 ([Chinese](https://www.moe.gov.sg/api/media/6c0f68ed-a8bf-471c-9f32-b5ea75831910/2024-Character-List-Primary-One-to-Two-Chinese.pdf), [Higher Chinese](https://www.moe.gov.sg/api/media/394e06b1-f4f3-4e90-adb4-a33efd9e1c5e/2024-Character-List-Primary-One-to-Two-Higher-Chinese.pdf)).
2.0 teaches some characters earlier (伞 moves from P2 to P1), so the levels will need updating as it reaches more years.
