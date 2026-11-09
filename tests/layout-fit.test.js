/* Every menu mode should open at phone, landscape, and desktop widths
   without throwing or causing horizontal page scroll. */
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
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  const sizes = [[320, 700, "320"], [375, 812, "375"], [390, 844, "390"], [430, 932, "430"], [740, 360, "landscape"], [1280, 800, "desktop"]];
  const failures = [];
  let modeCount = 0;
  try {
    for (const [w, h, tag] of sizes) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 900, hasTouch: w < 900 });
      await page.goto(origin + "/?v=fit", { waitUntil: "domcontentloaded" });
      await page.evaluate(async () => {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map((r) => r.unregister()));
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await new Promise((r) => setTimeout(r, 200));
      const modes = await page.evaluate(() => {
        modal = null;
        const list = MODES.map((m) => ({ id: m.id, n: m.n, how: m.scene ? "scene" : m.duel ? "duel" : "mode", arg: m.scene || m.duel || m.id }));
        const seen = new Set(list.map((m) => m.how === "duel" ? m.arg : m.id));
        for (const d of DUELS) if (!seen.has(d.id)) list.push({ id: d.id, n: d.n, how: "duel", arg: d.id });
        list.push({ id: "tour", n: "World Tour", how: "scene", arg: "tour" });
        list.push({ id: "story", n: "Story map", how: "story", arg: "map" });
        return list;
      });
      modeCount = modes.length;
      for (const m of modes) {
        const result = await page.evaluate((m) => {
          modal = null;
          scrollOff = 0;
          window.__inStory = 0;
          try {
            if (m.how === "scene") setScene(m.arg);
            else if (m.how === "duel") startDuel(m.arg);
            else if (m.how === "story") window.v042Story && v042Story();
            else startMode(m.arg);
          } catch (e) {
            return { err: String(e && e.message || e) };
          }
          modal = null;
          return { scroll: document.documentElement.scrollWidth - window.innerWidth, scene };
        }, m);
        if (result.err) failures.push(tag + " " + m.id + " " + result.err);
        else if (result.scroll > 1) failures.push(tag + " " + m.id + " overflow " + result.scroll);
      }
      console.log(tag, "modes", modes.length);
    }
    const hunt = fs.readFileSync(path.join(root, "app.v0-5-5.js"), "utf8");
    assert(hunt.includes('T={g:"#157A45",y:"#8A6A00",b:"#3D4556"}'), "Word Hunt colors still present");
    assert.strictEqual(failures.length, 0, failures.slice(0, 12).join("\n"));
    console.log("layout fit ok", modeCount, "modes x", sizes.length, "sizes");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
