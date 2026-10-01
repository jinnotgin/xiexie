/**
 * Parity test: runs identical scripted scenarios against the original single-file
 * app (archived/xiexie.html) and the built Vue app (dist/), in system Chrome, and compares:
 *   - a normalised snapshot of the visible screen's DOM (texts, classes, hidden/disabled state)
 *   - what each app saved to IndexedDB
 *   - screenshots (pixel diff), with reduced motion so animations don't interfere
 * Strokes are drawn with real mouse events along the character's stroke medians.
 *
 * Usage:  npm run build && node tests/parity/run.mjs   (or: npm run test:parity)
 * Output: tests/parity/out/{report.md, report.json, *.png}
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, process.env.PARITY_OUT || "tests/parity/out");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(path.join(ROOT, "dist/index.html"))) {
  console.error("dist/ is missing. Run `npm run build` first.");
  process.exit(2);
}

/* ---------- reference data, taken from the original file ---------- */
const ORIGINAL = fs.readFileSync(path.join(ROOT, "archived/xiexie.html"), "utf8");
const LINES = Function(`return ${ORIGINAL.match(/const LINES = (\{[\s\S]*?\n\});/)[1]}`)();
const CHARDATA = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "src/data/chardata.json.gz"))));
const lineCategory = new Map();
for (const [cat, list] of Object.entries(LINES)) for (const l of list) lineCategory.set(l, `<LINES.${cat}>`);

/* ---------- static servers (separate origins, so separate IndexedDB) ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".gz": "application/gzip", ".json": "application/json", ".png": "image/png" };
function serve(dir) {
  return new Promise(res => {
    const server = http.createServer((req, rsp) => {
      const p = path.join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, "127.0.0.1", () => res(server));
  });
}
const origServer = await serve(ROOT);
const vueServer = await serve(path.join(ROOT, "dist"));
const TARGETS = {
  original: `http://127.0.0.1:${origServer.address().port}/archived/xiexie.html`,
  vue: `http://127.0.0.1:${vueServer.address().port}/index.html`,
};

/* ---------- page helpers ---------- */
// Same seeded Math.random in both apps, so random picks line up when call order matches.
const SEED_SCRIPT = `(() => { let s = 0x2F7D5B; Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, target, { reducedMotion = "no-preference", viewport = { width: 420, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: 1 });
  await context.addInitScript(SEED_SCRIPT);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // Failed requests are reported by URL; the browser's own favicon probe is not the app's doing.
  page.on("response", r => { if (r.status() >= 400 && !/\/favicon\.ico$/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  page.on("dialog", d => (page.__dialog === "dismiss" ? d.dismiss() : d.accept()));
  await page.goto(TARGETS[target]);
  await waitReady(page);
  return { context, page, errors };
}
async function waitReady(page) {
  await page.waitForFunction(() => {
    const b = document.getElementById("start");
    return b && !b.disabled && /Start 10 words/.test(b.textContent) && document.querySelectorAll("#levels .chip").length > 0;
  }, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
}
const click = (page, sel) => page.click(sel);
const visible = (page, sel) => page.waitForSelector(sel, { state: "visible", timeout: 15000 });
const waitDone = page => visible(page, "#next-wrap:not([hidden])");

/** Draws stroke `k` of the character currently on the practice stage, using its median line. */
async function drawStroke(page, ch, k, { reverse = false } = {}) {
  const box = await page.evaluate(() => {
    const svg = document.querySelector("#stage > svg");
    const r = svg.getBoundingClientRect();
    return { left: r.left, top: r.top, size: Number(svg.getAttribute("width")) };
  });
  const size = box.size, padding = Math.round(size * 0.07);
  const eff = size - 2 * padding, scale = eff / 1024;
  const xOff = padding, yOff = 124 * scale + padding;
  let pts = CHARDATA[ch].medians[k].map(([x, y]) => ({ x: box.left + x * scale + xOff, y: box.top + size - yOff - y * scale }));
  if (reverse) pts = pts.reverse();
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.up();
  await sleep(120);
}
async function drawChar(page, ch, order) {
  const n = CHARDATA[ch].medians.length;
  for (const k of order || [...Array(n).keys()]) await drawStroke(page, ch, k);
}
/** A long stroke down the far left edge of the box, which matches nothing. */
async function drawWrong(page) {
  const r = await page.evaluate(() => { const b = document.querySelector("#stage > svg").getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width }; });
  await page.mouse.move(r.l + r.w * 0.03, r.t + r.w * 0.1);
  await page.mouse.down();
  await page.mouse.move(r.l + r.w * 0.03, r.t + r.w * 0.9, { steps: 12 });
  await page.mouse.up();
  await sleep(150);
}
/** Library → tile for `word` (on the current tab) → "Practise this". */
async function practiseFromLibrary(page, word) {
  await click(page, "#open-library");
  await visible(page, "#tiles .tile");
  await page.locator("#tiles .tile", { has: page.locator(".w", { hasText: new RegExp(`^${word}$`) }) }).first().click();
  await visible(page, "#modal:not([hidden])");
  await click(page, "#m-practise");
  await visible(page, "#practice #stage > svg");
  await sleep(150);
}

/** Normalised snapshot of whatever screen is showing (and the popup, if open). */
async function snapshot(page) {
  const snap = await page.evaluate(() => {
    const norm = s => (s || "").replace(/\s+/g, " ").trim();
    // Text of an element, ignoring whitespace-only text nodes (template formatting, invisible in flex rows).
    const text = el => {
      const parts = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (w.currentNode.nodeValue.trim()) parts.push(norm(w.currentNode.nodeValue));
      return parts.join("|");
    };
    const styleOf = el => (el.getAttribute("style") || "").split(";").map(norm).filter(Boolean).sort().join("; ");
    const isShown = el => el && !el.closest("[hidden]");
    const section = [...document.querySelectorAll("main > section")].find(isShown);
    const modal = document.getElementById("modal");
    const roots = [section, isShown(modal) ? modal : null].filter(Boolean);
    const out = { screen: section ? section.id : null, modal: isShown(modal), els: {} };
    const LISTS = ["stats", "levels", "tabs", "tiles", "wall", "dots", "slots", "m-anim"];
    for (const root of roots) {
      for (const el of [root, ...root.querySelectorAll("[id]")]) {
        if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
        const rec = { tag: el.tagName.toLowerCase(), hidden: !!el.closest("[hidden]") };
        if (el.matches("button,input")) rec.disabled = el.disabled;
        if (el.type === "checkbox") rec.checked = el.checked;
        if (el.hasAttribute("aria-pressed")) rec.pressed = el.getAttribute("aria-pressed");
        if (el.id === "stage") { rec.cls = el.className; rec.svgs = el.querySelectorAll("svg").length; rec.stamp = norm(el.querySelector(".stamp")?.className); rec.stampText = el.querySelector(".stamp") ? text(el.querySelector(".stamp")) : undefined; }
        else if (el.id === "momo-small" || el.id === "momo-big") { rec.mouthPath = el.innerHTML.match(/M4[01] 6[69][^"]*/)?.[0] || (el.innerHTML.includes('cy="68"') ? "wow" : ""); }
        else if (el !== root && !LISTS.includes(el.id)) rec.text = text(el);
        if (LISTS.includes(el.id)) {
          const kids = [...el.children];
          rec.count = kids.length;
          rec.items = kids.slice(0, 24).map(k => {
            const it = { cls: norm(k.getAttribute("class")), text: text(k) };
            if (k.hasAttribute("aria-pressed")) it.pressed = k.getAttribute("aria-pressed");
            if (k.hasAttribute("aria-selected")) it.selected = k.getAttribute("aria-selected");
            if (el.id === "m-anim") { it.text = undefined; it.style = styleOf(k); }
            return it;
          });
        }
        out.els[el.id || "<" + rec.tag + ">"] = rec;
      }
    }
    return out;
  });
  // Momo's lines are random picks; compare which list they came from.
  for (const id of ["momo-say", "home-bubble"]) {
    const e = snap.els[id];
    if (e && lineCategory.has(e.text)) e.text = lineCategory.get(e.text);
  }
  return snap;
}

async function dumpDB(page) {
  return page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("xiexie-db", 1);
    r.onsuccess = () => {
      const db = r.result;
      const t = db.transaction(["progress", "meta"], "readonly");
      const out = {};
      t.objectStore("progress").getAll().onsuccess = e => { out.progress = e.target.result; };
      t.objectStore("meta").getAll().onsuccess = e => { out.meta = e.target.result; };
      t.oncomplete = () => {
        out.progress = out.progress
          .map(p => ({ ...p, interval: p.due - p.updatedAt, due: undefined, updatedAt: undefined }))
          .sort((a, b) => a.id.localeCompare(b.id));
        db.close(); res(out);
      };
    };
    r.onerror = () => res({ error: String(r.error) });
  }));
}

async function seedDB(page, { meta, progress }) {
  await page.evaluate(({ meta, progress }) => new Promise((res, rej) => {
    const r = indexedDB.open("xiexie-db", 1);
    r.onsuccess = () => {
      const db = r.result;
      const t = db.transaction(["progress", "meta"], "readwrite");
      const now = Date.now();
      if (meta) t.objectStore("meta").put({ ...meta, id: "meta" });
      for (const p of progress || []) t.objectStore("progress").put({ ...p, due: now + p.dueIn, updatedAt: now - 1000 });
      t.oncomplete = () => { db.close(); res(); };
      t.onerror = () => rej(t.error);
    };
  }), { meta, progress });
}

async function shot(page, name, target) {
  // Web-font glyph files load on demand, so wait for the network to settle as well as fonts.ready.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await sleep(250);
  const file = path.join(OUT, `${name}.${target}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
  return file;
}

/* ---------- scenarios: each returns a list of named checkpoints ---------- */
const P1_FIRST_TEN = ["的", "一起", "是", "不", "了", "在", "人", "没有", "我们", "他们"];
const yesterday = () => new Date(Date.now() - 86400000).toLocaleDateString("en-CA");

const SCENARIOS = [
  ["fresh boot shows home", async ({ page }, cp) => {
    cp("home", await snapshot(page));
    cp("db", await dumpDB(page));
  }],

  ["levels and settings persist across reload", async ({ page }, cp) => {
    const chip = i => page.locator("#levels .chip").nth(i);
    await chip(1).click();              // add P2
    await chip(0).click();              // drop P1
    await chip(1).click();              // P2 is the last one, so this is refused
    await chip(8).click();              // add Business
    await click(page, "#strict");
    cp("after clicks", await snapshot(page));
    await sleep(300);                   // let the last IndexedDB write commit; a reload aborts it otherwise
    await page.reload(); await waitReady(page);
    cp("after reload", await snapshot(page));
    cp("db", await dumpDB(page));
  }],

  ["library tabs, remembered tab and popup", async ({ page }, cp) => {
    await click(page, "#open-library"); await visible(page, "#tiles .tile");
    cp("library p1", await snapshot(page));
    await page.locator("#tabs .tab").nth(8).click();
    cp("library biz", await snapshot(page));
    await click(page, "#lib-back"); await visible(page, "#home");
    await click(page, "#open-library"); await visible(page, "#tiles .tile");
    cp("library tab remembered", await snapshot(page));
    await page.locator("#tiles .tile").nth(2).click(); await visible(page, "#modal:not([hidden])");
    cp("popup open", await snapshot(page));
    cp("popup focus", await page.evaluate(() => document.activeElement?.id));
    await page.keyboard.press("Escape");
    cp("popup closed by Escape", await snapshot(page));
    await page.locator("#tiles .tile").nth(0).click(); await visible(page, "#modal:not([hidden])");
    await page.mouse.click(5, 5);       // backdrop
    cp("popup closed by backdrop", await snapshot(page));
  }],

  ["perfect word from the library, summary, home stats", async ({ page }, cp) => {
    await practiseFromLibrary(page, "人");
    cp("card", await snapshot(page));
    await drawStroke(page, "人", 0);
    cp("after first stroke", await snapshot(page));
    await drawStroke(page, "人", 1);
    await waitDone(page);
    cp("done", await snapshot(page));
    cp("focus", await page.evaluate(() => document.activeElement?.id));
    await page.keyboard.press("Enter");
    await visible(page, "#summary");
    cp("summary", await snapshot(page));
    await click(page, "#home-btn"); await visible(page, "#home");
    cp("home", await snapshot(page));
    cp("db", await dumpDB(page));
    await click(page, "#open-library"); await visible(page, "#tiles .tile");
    await page.locator("#tiles .tile", { has: page.locator(".w", { hasText: /^人$/ }) }).click();
    cp("popup status", await snapshot(page));
  }],

  ["two characters: mistake, then hint", async ({ page }, cp) => {
    await practiseFromLibrary(page, "一起");
    cp("card", await snapshot(page));
    await drawWrong(page);
    cp("after mistake", await snapshot(page));
    await drawChar(page, "一");
    await visible(page, "#slots .slot.done");
    await sleep(500);
    cp("first char done", await snapshot(page));
    await click(page, "#hint");
    cp("after hint", await snapshot(page));
    await sleep(900);
    await drawChar(page, "起");
    await waitDone(page);
    cp("done", await snapshot(page));
    cp("db", await dumpDB(page));
  }],

  ["three misses on one stroke", async ({ page }, cp) => {
    await practiseFromLibrary(page, "十");
    for (let i = 0; i < 3; i++) await drawWrong(page);
    cp("after 3 misses", await snapshot(page));
  }],

  ["out-of-order strokes accepted (relaxed), replay", async ({ page }, cp) => {
    await practiseFromLibrary(page, "人");
    await drawStroke(page, "人", 1);
    cp("after out-of-order stroke", await snapshot(page));
    await drawStroke(page, "人", 0);
    await waitDone(page);
    cp("done", await snapshot(page));
    await click(page, "#replay");
    await sleep(100);
    cp("replaying", await snapshot(page));
    await page.waitForFunction(() => !document.getElementById("replay").disabled, null, { timeout: 15000 });
    cp("replayed", await snapshot(page));
    cp("db", await dumpDB(page));
  }],

  ["backwards stroke accepted (relaxed)", async ({ page }, cp) => {
    await practiseFromLibrary(page, "八");
    await drawStroke(page, "八", 0, { reverse: true });
    cp("after backwards stroke", await snapshot(page));
    await drawStroke(page, "八", 1);
    await waitDone(page);
    cp("done", await snapshot(page));
  }],

  ["strict order rejects out-of-order", async ({ page }, cp) => {
    await click(page, "#strict");
    await practiseFromLibrary(page, "人");
    await drawStroke(page, "人", 1);
    cp("after out-of-order stroke", await snapshot(page));
    await drawChar(page, "人");
    await waitDone(page);
    cp("done", await snapshot(page));
  }],

  ["10-word round: show me, skip, requeue, summary", async ({ page }, cp) => {
    await click(page, "#start"); await visible(page, "#practice #stage > svg"); await sleep(150);
    cp("first card", await snapshot(page));
    await click(page, "#showme");
    cp("show me", await snapshot(page));
    await sleep(2700);
    cp("show me faded", await snapshot(page));
    const prompts = [];
    for (let i = 0; i < 25; i++) {
      if (await page.locator("#summary").isVisible().catch(() => false)) break;
      prompts.push(await page.textContent("#p-py"));
      await click(page, "#skip"); await waitDone(page);
      if (i === 0) cp("after first skip", await snapshot(page));
      await click(page, "#next");
      await page.waitForFunction(() => document.querySelector("#summary") && !document.querySelector("#summary").closest("[hidden]") || !document.querySelector("#next-wrap:not([hidden])"), null, { timeout: 10000 });
      await sleep(100);
    }
    cp("prompt order", prompts);
    cp("set of words", [...new Set(prompts)].sort());
    cp("summary", await snapshot(page));
    cp("db", await dumpDB(page));
  }],


  ["old saved data: level migration, due reviews first", async ({ page }, cp) => {
    const p1 = ["的", "一起", "是", "不", "了", "在", "人", "没有"];
    await seedDB(page, {
      meta: { xp: 50, streak: 3, lastDay: yesterday(), levels: ["p12"], relaxed: true, written: 20 },
      progress: [
        ...p1.slice(0, 3).map((w, i) => ({ id: w, box: 1, seen: 2, perfect: 0, dueIn: -100000 * (i + 1) })),
        ...p1.slice(3, 6).map(w => ({ id: w, box: 5, seen: 6, perfect: 5, dueIn: 86400000 * 9 })),
        { id: "biz:会议", box: 2, seen: 1, perfect: 1, dueIn: -5000 },
      ],
    });
    await page.reload(); await waitReady(page);
    cp("home", await snapshot(page));
    await click(page, "#open-library"); await visible(page, "#tiles .tile");
    cp("library", await snapshot(page));
    await click(page, "#lib-back"); await visible(page, "#home");
    await click(page, "#start"); await visible(page, "#practice #stage > svg");
    const prompts = [];
    for (let i = 0; i < 10; i++) { prompts.push(await page.textContent("#p-en")); await click(page, "#skip"); await waitDone(page); await click(page, "#next"); await sleep(80); }
    cp("first 10 prompts", prompts);
  }],

  ["reset progress: cancel, then confirm", async ({ page }, cp) => {
    await practiseFromLibrary(page, "人");
    await drawChar(page, "人"); await waitDone(page);
    await click(page, "#quit"); await visible(page, "#summary");
    await click(page, "#home-btn"); await visible(page, "#home");
    page.__dialog = "dismiss"; await click(page, "#reset"); await sleep(200);
    cp("after cancel", await snapshot(page));
    page.__dialog = "accept"; await click(page, "#reset"); await sleep(300);
    cp("after confirm", await snapshot(page));
    cp("db", await dumpDB(page));
  }],

  ["ending a round early", async ({ page }, cp) => {
    await click(page, "#start"); await visible(page, "#practice #stage > svg");
    await click(page, "#quit"); await visible(page, "#home");
    cp("quit with nothing done", await snapshot(page));
    await click(page, "#start"); await visible(page, "#practice #stage > svg");
    await click(page, "#skip"); await waitDone(page); await click(page, "#next"); await sleep(150);
    await click(page, "#quit"); await visible(page, "#summary");
    cp("quit after one word", await snapshot(page));
    await click(page, "#again"); await visible(page, "#practice #stage > svg");
    cp("another round", await snapshot(page));
  }],
];

const VISUALS = [
  ["home", async () => {}],
  ["library", async page => { await click(page, "#open-library"); await visible(page, "#tiles .tile"); }],
  ["popup", async page => { await click(page, "#open-library"); await visible(page, "#tiles .tile"); await page.locator("#tiles .tile").nth(1).click(); await visible(page, "#modal:not([hidden])"); await sleep(400); }],
  ["practice", async page => { await practiseFromLibrary(page, "一起"); }],
  ["practice-done", async page => { await practiseFromLibrary(page, "人"); await drawChar(page, "人"); await waitDone(page); await sleep(600); }],
  ["summary", async page => { await practiseFromLibrary(page, "人"); await drawChar(page, "人"); await waitDone(page); await click(page, "#next"); await visible(page, "#summary"); }],
  ["practice-desktop", async page => { await practiseFromLibrary(page, "人"); }, { width: 1280, height: 900 }],
];

/* ---------- compare ---------- */
function diff(a, b, at = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.flatMap(k => diff(a[k], b[k], at ? `${at}.${k}` : k));
  }
  return [{ at, original: a, vue: b }];
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = { scenarios: [], visuals: [] };

for (const [name, fn] of SCENARIOS) {
  const result = { name, checkpoints: [], errors: {} };
  const runs = {};
  for (const target of ["original", "vue"]) {
    const cps = [];
    const s = await open(browser, target);
    try { await fn(s, (label, data) => cps.push([label, data])); }
    catch (e) { cps.push(["<crash>", String(e).split("\n")[0]]); }
    result.errors[target] = s.errors;
    await s.context.close();
    runs[target] = cps;
  }
  const n = Math.max(runs.original.length, runs.vue.length);
  for (let i = 0; i < n; i++) {
    const [lo, o] = runs.original[i] || ["<missing>"], [lv, v] = runs.vue[i] || ["<missing>"];
    const d = lo !== lv ? [{ at: "<checkpoint>", original: lo, vue: lv }] : diff(o, v);
    result.checkpoints.push({ label: lo, ok: d.length === 0, diffs: d, observed: v });
  }
  result.ok = result.checkpoints.every(c => c.ok) && !result.errors.vue.length;
  report.scenarios.push(result);
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${name}  (${result.checkpoints.length} checkpoints)`);
  for (const c of result.checkpoints.filter(c => !c.ok)) for (const d of c.diffs.slice(0, 6)) console.log(`      ${c.label} › ${d.at}: ${JSON.stringify(d.original)} ≠ ${JSON.stringify(d.vue)}`);
  if (result.errors.vue.length) console.log("      vue page errors:", result.errors.vue);
}

for (const [name, fn, viewport] of VISUALS) {
  const files = {};
  for (const target of ["original", "vue"]) {
    const s = await open(browser, target, { reducedMotion: "reduce", viewport });
    await fn(s.page);
    files[target] = await shot(s.page, name, target);
    await s.context.close();
  }
  const a = PNG.sync.read(fs.readFileSync(files.original)), b = PNG.sync.read(fs.readFileSync(files.vue));
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const pad = img => { const p = new PNG({ width: w, height: h }); p.data.fill(255); PNG.bitblt(img, p, 0, 0, img.width, img.height, 0, 0); return p; };
  const out = new PNG({ width: w, height: h });
  const px = pixelmatch(pad(a).data, pad(b).data, out.data, w, h, { threshold: 0.1 });
  fs.writeFileSync(path.join(OUT, `${name}.diff.png`), PNG.sync.write(out));
  const pct = (100 * px / (w * h));
  const v = { name, sizes: [`${a.width}x${a.height}`, `${b.width}x${b.height}`], diffPixels: px, diffPct: +pct.toFixed(3), ok: pct < 0.1 && a.height === b.height };
  report.visuals.push(v);
  console.log(`${v.ok ? "PASS" : "FAIL"}  visual ${name}: ${v.diffPixels} px differ (${v.diffPct}%), ${v.sizes.join(" vs ")}`);
}

await browser.close();
origServer.close(); vueServer.close();

/* ---------- report ---------- */
const passed = report.scenarios.filter(s => s.ok).length + report.visuals.filter(v => v.ok).length;
const total = report.scenarios.length + report.visuals.length;
let md = `# Parity report: original archived/xiexie.html vs Vue build\n\n${passed}/${total} passed.\n\n## Behaviour scenarios\n\n| | Scenario | Checkpoints |\n|---|---|---|\n`;
for (const s of report.scenarios) md += `| ${s.ok ? "✅" : "❌"} | ${s.name} | ${s.checkpoints.filter(c => c.ok).length}/${s.checkpoints.length} |\n`;
md += `\n## Screenshots (reduced motion)\n\n| | Screen | Differing pixels | Sizes (original vs vue) |\n|---|---|---|---|\n`;
for (const v of report.visuals) md += `| ${v.ok ? "✅" : "❌"} | ${v.name} | ${v.diffPixels} (${v.diffPct}%) | ${v.sizes.join(" vs ")} |\n`;
const fails = report.scenarios.flatMap(s => s.checkpoints.filter(c => !c.ok).map(c => ({ s: s.name, c })));
if (fails.length) {
  md += `\n## Differences\n\n`;
  for (const { s, c } of fails) { md += `**${s} › ${c.label}**\n\n`; for (const d of c.diffs) md += `- \`${d.at}\`: original \`${JSON.stringify(d.original)}\`, vue \`${JSON.stringify(d.vue)}\`\n`; md += "\n"; }
}
const errs = report.scenarios.filter(s => s.errors.original.length || s.errors.vue.length);
if (errs.length) { md += `\n## Page errors\n\n`; for (const s of errs) md += `- ${s.name}: original ${JSON.stringify(s.errors.original)}, vue ${JSON.stringify(s.errors.vue)}\n`; }
fs.writeFileSync(path.join(OUT, "report.md"), md);
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(`\n${passed}/${total} passed. Report: ${path.relative(ROOT, path.join(OUT, "report.md"))}`);
process.exit(passed === total ? 0 : 1);
