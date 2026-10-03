import type { Word } from "../types";
import raw from "./words.json";

// Business words keep their own id, so the same word can also live in a school level.
export const WORDS: Word[] = (raw as Omit<Word, "id">[]).map(w => ({ ...w, id: w.l === "biz" ? "biz:" + w.w : w.w }));

/** The words in each level, in list order. */
export const WORDS_BY_LEVEL: Record<string, Word[]> = {};
for (const w of WORDS) (WORDS_BY_LEVEL[w.l] ??= []).push(w);
export const wordsIn = (level: string): Word[] => WORDS_BY_LEVEL[level] ?? [];
