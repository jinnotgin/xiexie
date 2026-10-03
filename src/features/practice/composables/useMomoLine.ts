import { reactive } from "vue";
import type { Mood } from "../../../types";

/**
 * What Momo is saying under the practice card. Most lines are ambient; a "nudge" (you need to
 * change what you're doing) gets the pill and a pop-in. `glyph` is highlighted wherever it appears
 * in the text. `seq` re-keys the line so each nudge pops in again.
 */
export interface MomoLineState { mood: Mood; text: string; tone: "" | "nudge"; glyph: string; seq: number }
export type Say = (mood: Mood, text: string, opts?: { tone?: "nudge"; glyph?: string }) => void;

export function useMomoLine() {
  const line = reactive<MomoLineState>({ mood: "happy", text: "", tone: "", glyph: "", seq: 0 });
  const say: Say = (mood, text, { tone, glyph = "" } = {}) => {
    line.mood = mood; line.text = text; line.tone = tone ?? ""; line.glyph = glyph; line.seq++;
  };
  return { line, say };
}
