# 写写 Xiě Xiě

Chinese handwriting practice for Singaporeans who learnt Chinese in school but have barely written it since.
Live at [xiexie.web.app](https://xiexie.web.app).

## Why

Many Singaporeans study Chinese for ten years or more but rarely write it after leaving school.
写写 helps you practise again, starting with characters you learnt in primary school.

- **Choose a level to start with.** P1 to P6 follow the MOE 欢乐伙伴 character lists.
  Sec 1 to Sec 4 cover the remaining characters in China's list of 3,500 everyday characters, grouped by frequency.
  Business includes words used at work.
- **Practise writing each character.** The stroke checker allows small mistakes.
  In relaxed mode, you can write strokes in any order or direction, including joined strokes.
  Your answer passes when the character is close enough.
- **Review words over time.** Spaced repetition schedules words for review to help you remember them.
- **Start without an account.** Your progress is saved on your device. You can sign in with Google to sync it across devices.

Built with [Hanzi Writer](https://hanziwriter.org), Vue 3, Pinia, Vue Router and Vite.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests for spaced repetition, grading, relaxed checking, search and sync
npm run lint         # ESLint, including the import boundaries between src/app, src/features and shared code
npm run build        # static site in dist/
```

The live site is on Firebase Hosting: `npm run build`, then `firebase deploy --only hosting`.

## Word bank

The word bank in `src/data/words.json` gives you a way to practise each of the app's 3,502 characters:
the 3,500 in China's 通用规范汉字表 (2013), plus 咦 and 踮, which are both in the app's Primary 6 (P6) level.
Each character appears in at least one practice word, but the bank does not include every common word.
For example, it includes 下雨 and 伞, so you can practise both characters in 雨伞 even though 雨伞 itself is missing.

| Level | Characters | Source |
|---|---|---|
| P1 to P6 | 1,815 | 欢乐伙伴 Higher Chinese (2015 edition), grouped by the year each character is first taught. This includes all characters in the standard Chinese course, plus 160 more in P5 and P6. |
| Sec 1 to Sec 4 | 1,687 | The remaining characters, divided into four groups from most to least common. These groups are not based on an MOE secondary character list, as MOE does not publish one. |
| Business | 103 words | A selection of office words, including CPF and GST. |

When editing the bank, assign each word to the highest level of any character in it.
A character's level is the year it first appears in the syllabus, whether as a 识读字 (for reading) or 识写字 (for writing).
The script used to generate the bank is not included in this repo, so make corrections directly in `words.json`.
Progress is saved against the word itself. Changing its level, pinyin or meaning preserves existing progress.

## Saving progress to a Google account (optional)

The sign-in button only appears when a Firebase config is provided. Without one, the app does not download Firebase code.

When you sign in, progress is still saved locally in IndexedDB and synced to a single Firestore document at `users/{uid}`.
Sync runs after each word, when you leave or return to the tab, and when the device reconnects.
The merge rules are defined in `src/lib/sync.ts` and tested in `tests/unit/sync.test.ts`:

- **Word progress:** the most recently practised result is kept.
- **Characters written:** each device tracks its own count, and the counts are added together.
  The home page shows the total for the current week, starting on Monday, using only counts recorded for that week.
  A lifetime total is also saved.
- **Streak:** practice days from all devices are combined.
  If you practise for ten consecutive days on one device and continue on another the next day, your streak becomes eleven days.
- **First sign-in:** if both the device and the account have saved progress, you can combine them or use only the account's progress.
- **Sign out:** once all progress has synced to the account, the device's copy is cleared so someone else can use it.
- **Reset progress:** the account's progress is cleared. Other devices then clear their copies when they sync.

To turn it on:

1. Create a Firebase project, enable the Google provider under Authentication, and add your hosting domain under Settings, Authorized domains.
2. Create a Firestore database and publish the rules and indexes with `firebase deploy --only firestore`.
3. Register a web app, copy `.env.example` to `.env.local`, fill in its values and rebuild.
   These config values are public. Access to saved progress is controlled by the Firestore rules.

## Google handwriting recognition in relaxed mode (optional, off by default)

Relaxed mode checks handwriting on your device. You can also enable Google's handwriting recognizer to check
completed handwriting that the local checker rejects. If Google recognises the expected character, the answer passes
but does not receive full marks. If both checkers identify the same incorrect character, Momo tells you which character
your handwriting resembles.

This feature uses the handwriting endpoint used by Google Translate and Google Input Tools
(`inputtools.google.com/request?ime=handwriting`). **It is not a public or documented API**, and there are no published
terms for this use, API keys or availability guarantees. It may change or disappear without notice.
If the request fails, takes longer than 1.5 seconds or returns an unexpected response, the app uses the local checker's result.
Enabling this feature **sends the learner's handwriting to Google**.

To enable it, set `VITE_GOOGLE_HANDWRITING=1` in `.env.local` and rebuild.
The integration is in `src/features/practice/lib/handwriting.ts`.
The conditions for sending handwriting are defined in `src/features/practice/lib/inkCheck.ts`.

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
| Optional second opinion in relaxed mode | Google's handwriting recognizer, from Google Translate and Input Tools (unofficial, undocumented endpoint; nothing bundled) | Google's service, no published terms for this use |

The MOE lists are the 2015 edition for P1 to P6 ([Chinese](https://www.moe.gov.sg/media/files/primary/f607087e-d909-4581-82ac-9c3867c617ee.pdf), [Higher Chinese](https://www.moe.gov.sg/media/files/primary/e055a4ab-c7f4-42b2-96a1-e2b96a370477.pdf)),
which the app currently follows. The repo also includes 欢乐伙伴 2.0 lists for P1 and P2 ([Chinese](https://www.moe.gov.sg/api/media/6c0f68ed-a8bf-471c-9f32-b5ea75831910/2024-Character-List-Primary-One-to-Two-Chinese.pdf), [Higher Chinese](https://www.moe.gov.sg/api/media/394e06b1-f4f3-4e90-adb4-a33efd9e1c5e/2024-Character-List-Primary-One-to-Two-Higher-Chinese.pdf)).
欢乐伙伴 2.0 introduces some characters earlier; for example, 伞 moves from P2 to P1.
The app's levels will need updating as the new edition is introduced across more primary years.
