// Mandarin text-to-speech through the browser's speechSynthesis, when available.
export const speechOk = typeof window !== "undefined" && "speechSynthesis" in window;

let zhVoice: SpeechSynthesisVoice | null = null;
function loadVoice() {
  try { const vs = speechSynthesis.getVoices(); zhVoice = vs.find(v => /zh[-_]CN/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null; } catch (e) {}
}
if (speechOk) { loadVoice(); speechSynthesis.onvoiceschanged = loadVoice; }

export function speak(text: string) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = "zh-CN"; u.rate = 0.8;
    if (zhVoice) u.voice = zhVoice;
    speechSynthesis.speak(u);
  } catch (e) {}
}
