// Small browser helpers shared by the views.
export const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function writerColors() {
  return { strokeColor: cssVar("--ink"), drawingColor: cssVar("--ink"), outlineColor: cssVar("--grid"), highlightColor: cssVar("--jade"), radicalColor: null };
}

/** Falling 好棒优赞福乐 glyphs. Appended to <body> so it overlays any screen, and removes itself. */
export function confetti() {
  if (reduceMotion) return;
  const box = document.createElement("div"); box.className = "confetti";
  const glyphs = "好棒优赞福乐";
  for (let i = 0; i < 18; i++) {
    const s = document.createElement("span");
    s.textContent = glyphs[i % glyphs.length];
    s.style.left = Math.random() * 100 + "vw";
    s.style.fontSize = 16 + Math.random() * 22 + "px";
    s.style.animationDelay = Math.random() * 0.4 + "s";
    box.appendChild(s);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 2300);
}
