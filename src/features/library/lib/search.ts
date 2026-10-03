import type { Word } from "../../../types";

/** Lower-case, drop tone marks and spaces, so "nǐ hǎo", "ni hao" and "nihao" all match. "v" stands for "ü". */
export const foldPinyin = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ\s]/g, "").toLowerCase().replace(/v/g, "u");

/**
 * Words matching a query typed as characters, pinyin (with or without tones) or English.
 * Exact matches on the word or its pinyin come first; the rest keep list order (most common first).
 */
export function searchWords(words: Word[], query: string): Word[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const py = foldPinyin(q);
  const exact: Word[] = [], rest: Word[] = [];
  for (const w of words) {
    const wp = foldPinyin(w.p);
    if (w.w === q || (py && wp === py)) exact.push(w);
    else if (w.w.includes(q) || (py && wp.startsWith(py)) || w.e.toLowerCase().includes(q)) rest.push(w);
  }
  return [...exact, ...rest];
}
