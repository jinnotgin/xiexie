import type { Word } from "../types";
import raw from "./words.json";

// Business words keep their own id, so the same word can also live in a school level.
export const WORDS: Word[] = (raw as Omit<Word, "id">[]).map(w => ({ ...w, id: w.l === "biz" ? "biz:" + w.w : w.w }));
export const WORD_BY_ID: Record<string, Word> = Object.fromEntries(WORDS.map(w => [w.id, w]));
