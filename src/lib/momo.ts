/* =========================================================
   Momo, the ink-drop mascot
   ========================================================= */
import type { Mood } from "../types";

export function momoSVG(mood: Mood = "happy") {
  const mouths: Record<Mood, string> = {
    happy: '<path d="M40 66 Q50 75 60 66" fill="none" stroke="var(--card)" stroke-width="4" stroke-linecap="round"/>',
    wow:   '<ellipse cx="50" cy="68" rx="6" ry="7" fill="var(--card)"/>',
    hmm:   '<path d="M41 69 L59 66" fill="none" stroke="var(--card)" stroke-width="4" stroke-linecap="round"/>',
  };
  return `<path d="M50 6 C62 26 84 44 84 64 A34 32 0 0 1 16 64 C16 44 38 26 50 6Z" fill="var(--ink)"/>
    <ellipse cx="39" cy="54" rx="6" ry="${mood === "wow" ? 8 : 7}" fill="var(--card)"/>
    <ellipse cx="61" cy="54" rx="6" ry="${mood === "wow" ? 8 : 7}" fill="var(--card)"/>
    <circle cx="40" cy="56" r="3" fill="var(--ink)"/><circle cx="62" cy="56" r="3" fill="var(--ink)"/>
    <ellipse cx="29" cy="66" rx="5" ry="3" fill="var(--seal)" opacity=".55"/>
    <ellipse cx="71" cy="66" rx="5" ry="3" fill="var(--seal)" opacity=".55"/>
    ${mouths[mood] || mouths.happy}
    <path d="M30 34 Q34 28 40 30" stroke="var(--card)" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>`;
}

export const LINES = {
  home: [
    "Hi, I'm Momo 墨墨. Let's dig those characters out of memory.",
    "Your primary-school self could read about 1,600 characters. We're just waking them up.",
    "No 听写 marks today. Just you, me and some strokes.",
    "Pick a level and let's write a few. Won't take long one."
  ],
  start: ["Write it from memory. You can do it.", "What's the character? Take your time.", "Strokes in order, top to bottom, left to right."],
  mistake: ["Eh, not that stroke. Try again.", "Hmm, check the stroke order leh.", "Almost! Mind the direction.", "Close. Which stroke comes first?"],
  perfect: ["Wah, steady lah!", "Shiok! Every stroke correct.", "Your 老师 would give you a star.", "Solid. Like you never forgot."],
  good: ["Not bad leh, a few wobbles only.", "Nice one!", "Got it. Next time smoother."],
  ok: ["Can, can. Hints are for learning.", "Getting there. It'll come back again soon.", "Slowly remembering already."],
  again: ["Never mind, you'll see this one again later.", "No stress. Watch, then we try again.", "That's what practice is for."],
  retry: ["Your turn now. Trace it once.", "Now you write it, following the outline."]
};

export const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
