/* Park Hunt must not show the answer park's name (or a photo credit that
   contains it) in the question view. The name may appear only as one of
   the multiple-choice buttons, and in the reveal line after a pick.
   Credits stay in assets/parks/CREDITS.md, opened from Settings. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const chrome = process.env.CHROME || "/usr/local/bin/google-chrome";
const puppeteer = require("/tmp/node_modules/puppeteer-core");

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url.split("?")[0];
      const file = path.join(root, url === "/" ? "index.html" : decodeURIComponent(url.replace(/^\/+/, "")));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      const ext = path.extname(file).toLowerCase();
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
        ".json": "application/json", ".woff2": "font/woff2", ".md": "text/markdown" };
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function nameVariants(n) {
  const out = new Set([n]);
  out.add(n.normalize("NFD").replace(/\p{M}/gu, ""));
  out.add(n.replace(/[ʻʼ‘’]/g, "'"));
  out.add(n.replace(/\u2013/g, "-").replace(/\u2014/g, "-"));
  return [...out].filter(Boolean);
}

(async () => {
  const src = fs.readFileSync(path.join(root, "app.v0-6-0.js"), "utf8");
  assert(
    !src.includes("T(U,oe.ans,b,o+c-18,u)"),
    "on-photo credit overlay T() is still called during Park Hunt play"
  );
  assert(
    src.includes("Marina's pup wandered off here. Which national park?"),
    "question prompt missing"
  );

  const server = await serve();
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  // Phone portrait, the size the layout is tuned for.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    await page.goto(origin + "/?v=parkhunt-noname", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const rs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map((r) => r.unregister()));
    });
    await page.reload({ waitUntil: "networkidle0", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 400));

    const hookOk = await page.evaluate(() => {
      if (!window.ParkHuntMode || !ParkHuntMode.PARKS) return { err: "ParkHuntMode missing" };
      window.__phTexts = [];
      const proto = CanvasRenderingContext2D.prototype;
      if (!proto.__phHooked) {
        const wrap = (fn) => function (t, x, y, ...rest) {
          try { window.__phTexts.push({ t: String(t), x, y }); } catch (e) {}
          return fn.call(this, t, x, y, ...rest);
        };
        proto.fillText = wrap(proto.fillText);
        proto.strokeText = wrap(proto.strokeText);
        proto.__phHooked = true;
      }
      return { n: ParkHuntMode.PARKS.length };
    });
    assert(!hookOk.err, hookOk.err);
    assert.strictEqual(hookOk.n, 63, "expected 63 parks");

    await page.evaluate(() => {
      modal = null;
      scrollOff = 0;
      window.__inStory = 0;
      startDuel("parkhunt");
    });
    await new Promise((r) => setTimeout(r, 500));

    const result = await page.evaluate(async () => {
      const parks = ParkHuntMode.PARKS;
      const leaks = [];
      const creditHits = [];
      function variants(n) {
        const out = [n];
        try { out.push(n.normalize("NFD").replace(/\p{M}/gu, "")); } catch (e) {}
        out.push(n.replace(/[ʻʼ‘’]/g, "'"));
        out.push(n.replace(/\u2013/g, "-").replace(/\u2014/g, "-"));
        return [...new Set(out.filter(Boolean))];
      }
      function waitFrame() {
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      // Force every park as the current unanswered question, 10 dummy options.
      for (const park of parks) {
        const others = parks.filter((p) => p.n !== park.n).slice(0, 9).map((p) => p.n);
        const opts = [park.n, ...others];
        D.g.done = false;
        D.g.cur = { ans: park, opts, pick: null, born: 0 };
        D.g.wait = 0;
        window.__phTexts = [];
        // Let the image decode; draw a few frames.
        const img = new Image();
        img.src = (window.MLP_PARK_BASE || "assets/parks/") + park.f;
        await new Promise((r) => { if (img.complete) r(); else { img.onload = r; img.onerror = r; setTimeout(r, 1500); } });
        await waitFrame();
        await waitFrame();
        const texts = window.__phTexts.slice();
        const strings = texts.map((x) => x.t);
        const joined = strings.join("\n");
        // Credit overlay should never appear on the question view.
        for (const s of strings) {
          if (/^Photo:\s/i.test(s) || /Wikimedia Commons/i.test(s)) {
            creditHits.push({ park: park.n, text: s });
          }
        }
        // The answer name may appear only as an exact option-button label.
        const allowed = new Set(opts);
        const promptOk = strings.some((s) => s.includes("Which national park"));
        if (!promptOk) leaks.push({ park: park.n, why: "missing question prompt", sample: strings.slice(0, 8) });
        for (const s of strings) {
          if (allowed.has(s)) continue; // option button (or later, reveal — but pick is null)
          for (const v of variants(park.n)) {
            if (v.length >= 4 && s.toLowerCase().includes(v.toLowerCase())) {
              leaks.push({ park: park.n, why: "name drawn outside option buttons", text: s });
            }
          }
          // Author or license fields must not be drawn during the question.
          if (park.a && park.a.length >= 5 && s.includes(park.a)) {
            leaks.push({ park: park.n, why: "author credit drawn during question", text: s });
          }
          if (park.l && /public domain|CC0|CC BY/i.test(park.l) && s.includes(park.l) && !allowed.has(s)) {
            leaks.push({ park: park.n, why: "license drawn during question", text: s });
          }
        }
      }
      // One reveal check: after a pick, the name in "Yes! {n}!" / "It was {n}." is allowed.
      const park = parks[0];
      D.g.done = false;
      D.g.cur = { ans: park, opts: [park.n, parks[1].n], pick: park.n, born: 0 };
      window.__phTexts = [];
      await waitFrame();
      await waitFrame();
      const reveal = window.__phTexts.map((x) => x.t).join(" | ");
      const revealed = reveal.includes("Yes! " + park.n) || reveal.includes("It was " + park.n);
      return {
        parks: parks.length,
        leaks,
        creditHits,
        revealed,
        revealSample: reveal.slice(0, 300),
        files: parks.map((p) => p.f),
      };
    });

    if (result.creditHits.length) {
      console.error("credit overlay still drawn:", result.creditHits.slice(0, 5));
    }
    if (result.leaks.length) {
      console.error("leaks:", JSON.stringify(result.leaks.slice(0, 8), null, 2));
    }
    assert.strictEqual(result.creditHits.length, 0, "Photo credit overlay still appears during a question");
    assert.strictEqual(result.leaks.length, 0, "Park name or credit leaked in the question view (" + result.leaks.length + " hits)");
    assert(result.revealed, "after a correct pick the park name should be revealed, got: " + result.revealSample);

    // Neutral file names: no park name / slug in the image filename.
    const banned = [];
    for (const f of result.files) {
      const base = f.replace(/\.[^.]+$/, "").toLowerCase();
      if (/[a-z]/i.test(base) && /(acadia|arches|badlands|yellowstone|yosemite|zion|canyon|teton|smoky|saguaro|sequoia|rainier|olympic|denali|everglades|shenandoah|mesa|bryce|capitol|congaree|biscayne|glacier|haleakala|hawaii|joshua|kobuk|pinnacles|redwood|voyageurs|katmai|kenai|lassen|mammoth|petrified|wrangell|channel|carlsbad|cuyahoga|indiana|royale|guadalupe|gateway|hot-springs|white-sands|crater|death-valley|grand-canyon|rocky|virgin|islands|new-river|north-cascades|theodore|dry-tortugas|american-samoa|great-basin|great-sand|lake-clark|gates-of|wind-cave|mount-rainier|black-canyon)/i.test(base)) {
        banned.push(f);
      }
    }
    assert.strictEqual(banned.length, 0, "image file names still contain park names: " + banned.slice(0, 8).join(", "));

    console.log("ok: no park name or credit in question view for", result.parks, "parks (phone 390x844)");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
