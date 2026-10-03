/* =========================================================
   HanziWriter, typed. The vendored build is plain JS, so this
   is the only file that touches it untyped, and the only one
   that reaches into its quiz internals.
   ========================================================= */
import HanziWriter from "../vendor/hanzi-writer.js";
import { loader } from "./chardata";

type Done = { onComplete?: () => void };

/** What the strict-mode quiz reports for a stroke. */
export interface QuizMistake { mistakesOnStroke: number }
export interface QuizComplete { backwards?: number[] }

export interface QuizOptions {
  showHintAfterMisses?: number;
  highlightOnComplete?: boolean;
  leniency?: number;
  onMistake?: (d: QuizMistake) => void;
  onCorrectStroke?: () => void;
  onComplete?: (d: QuizComplete) => void;
}

/** The part of a HanziWriter the app uses. */
export interface Writer {
  quiz(opts: QuizOptions): void;
  cancelQuiz(): void;
  showCharacter(opts?: { duration?: number }): void;
  hideCharacter(opts?: { duration?: number }): void;
  animateCharacter(opts?: Done): void;
  highlightStroke(n: number): void;
  showOutline(): void;
  hideOutline(): void;
  pauseAnimation(): void;
}

export type WriterOptions = Record<string, unknown>;

/** A writer for `char` drawn into `el`, with stroke data from the loaded chardata. */
export function createWriter(el: Element, char: string, options: WriterOptions): Writer {
  return HanziWriter.create(el, char, { ...options, charDataLoader: loader });
}

/**
 * Runs a writer call that may throw once the writer is torn down or between characters
 * (cancelling a quiz that already ended, hiding an outline that's gone). Those throws are
 * expected and harmless, so they are ignored; nothing else should be wrapped in this.
 */
export function safely(fn: () => void) {
  try { fn(); } catch { /* the writer is gone or idle: nothing to undo */ }
}

/** Animates the whole character, resolving when it's done. */
export const animate = (w: Writer) => new Promise<void>(res => w.animateCharacter({ onComplete: res }));

interface QuizInternals { _isActive: boolean; _currentStrokeIndex: number; _character: { strokes: unknown[] } }

/**
 * Where a quiz is up to: whether it is still taking strokes, which stroke is next and how many
 * there are. Null when the writer has no quiz. Reads HanziWriter's private state, so check it
 * after upgrading the vendored build.
 */
export function quizProgress(w: Writer | null): { active: boolean; next: number; strokes: number } | null {
  const q = (w as unknown as { _quiz?: QuizInternals } | null)?._quiz;
  if (!q) return null;
  return { active: q._isActive, next: q._currentStrokeIndex, strokes: q._character.strokes.length };
}
