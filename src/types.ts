export type Grade = "perfect" | "good" | "ok" | "again";
export type Status = "new" | "learning" | "mastered";
export type Mood = "happy" | "wow" | "hmm";

export interface Level { id: string; name: string; sub: string }

/** One vocabulary entry: word, pinyin, English, level id, plus a derived unique id. */
export interface Word { w: string; p: string; e: string; l: string; id: string }

/** Leitner-box progress for one word, stored as-is in IndexedDB ("progress" store). */
export interface ProgressRec {
  id: string;
  box: number;
  due: number;
  seen: number;
  perfect: number;
  last?: Grade;
  updatedAt?: number;
}

/** Profile document, stored in IndexedDB ("meta" store, id "meta"). */
export interface Meta {
  xp: number;
  streak: number;
  lastDay: string | null;
  levels: string[];
  tracing: boolean;
  relaxed: boolean;
  written: number;
}

export interface StrokeNote { ch: string; order: number; backwards: number }

/** State of the word currently on the practice card. */
export interface CardState {
  word: Word;
  ci: number;        // index of the character being written
  filled: number;    // how many answer slots are filled in
  mistakes: number;
  hints: number;
  revealed: boolean;
  done: boolean;
  notes: StrokeNote[];
}

export interface Result { word: Word; grade: Grade; notes: StrokeNote[] }
