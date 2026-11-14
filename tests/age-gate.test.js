/* First load opens the game mode menu. The 13-or-older prompt does not appear,
   even on a fresh save and even on the old age-gate test URL. */
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
  const src = fs.readFileSync(path.join(root, "app.v0-6-0.js"), "utf8");
  assert(!src.includes('modal="age22"') || src.includes("function needAge(){return!1}"), "age check must not be able to block play");
  assert(src.includes('let scene="modes"'));
  assert(!src.includes("13 or older\",()=>setAge") || src.includes("function needAge(){return!1}"));

  const server = await serve();
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(origin + "/?agegate=1", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      localStorage.clear();
      const rs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map((r) => r.unregister()));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 700));
    const state = await page.evaluate(() => {
      const asksAge = (btns || []).some((b) => /setAge|he\("13\+"\)|he\("u13"\)/.test(String(b.fn)));
      return {
        scene,
        modal,
        version: window.MLP_V048 && MLP_V048.version,
        asksAge,
        cards: (btns || []).length
      };
    });
    assert.strictEqual(state.version, "0.6.0");
    assert.strictEqual(state.scene, "modes", "first load should be the mode menu");
    assert.strictEqual(state.modal, null, "no age prompt");
    assert.strictEqual(state.asksAge, false);
    assert(state.cards > 3, "mode menu should list games");
    const shot = process.env.SHOT || "/opt/cursor/artifacts/first-load-menu.png";
    await page.screenshot({ path: shot });
    console.log("first load", state);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
