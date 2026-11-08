/* World Sniff must offer a working New country action after a win or a six-guess loss.
   The next round is practice (not a silent replay of the daily) and accepts a guess. */
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
      const file = path.join(root, url === "/" ? "index.html" : url.replace(/^\/+/, ""));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function boot(page, origin, w, h) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 800, hasTouch: w < 800 });
  await page.goto(origin + "/?v=replay", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(rs.map((r) => r.unregister()));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 250));
}

async function finishRound(page, how) {
  return page.evaluate((how) => {
    startDuel("worldsniff");
    const g = D.g;
    const secret = g.secret.n;
    const daily = !!g.daily;
    if (how === "win") {
      window.__wsGuess(g, secret);
    } else {
      const pool = ["Brazil", "Japan", "Canada", "Egypt", "Norway", "Chile", "Kenya", "Peru"];
      for (const name of pool) {
        if (g.done) break;
        if (name === secret) continue;
        window.__wsGuess(g, name);
      }
    }
    g.t = (g.doneAt || 0) + 3;
    return { secret, daily, done: g.done, result: g.result, guesses: g.guesses.length };
  }, how);
}

async function settle(page) {
  await new Promise((r) => setTimeout(r, 350));
  return page.evaluate(() => {
    const btn = (D.g.rects || []).find((r) => String(r.fn).includes("New country") || String(r.fn).includes("g.g=next") || String(r.fn).includes("A(ke"));
    const labeled = (D.g.rects || []).map((r) => ({ y: Math.round(r.y), h: Math.round(r.h), block: !!r.blocker, src: String(r.fn).slice(0, 40) }));
    return { n: (D.g.rects || []).length, hasReplay: !!btn, btn: btn && { x: btn.x, y: btn.y, w: btn.w, h: btn.h }, labeled };
  });
}

async function replay(page) {
  const pos = await page.evaluate(() => {
    const btn = (D.g.rects || []).find((r) => /A\(ke/.test(String(r.fn)) && !r.blocker);
    if (!btn) return null;
    D.down(btn.x + btn.w / 2, btn.y + btn.h / 2);
    return { x: btn.x + btn.w / 2, y: btn.y + btn.h / 2 };
  });
  assert(pos, "New country hit target missing");
  await new Promise((r) => setTimeout(r, 200));
  return page.evaluate(() => ({
    scene,
    over: !!D.over,
    done: D.g.done,
    daily: !!D.g.daily,
    secret: D.g.secret && D.g.secret.n,
    guesses: D.g.guesses.length,
    input: D.g.input || ""
  }));
}

async function cycle(page, how, label) {
  const first = await finishRound(page, how);
  assert.strictEqual(first.done, true, label + " should finish");
  const ui = await settle(page);
  assert.strictEqual(ui.hasReplay, true, label + " should show New country");
  const before = first.secret;
  const next = await replay(page);
  assert.strictEqual(next.scene, "duel", label + " stays in the game");
  assert.strictEqual(next.over, false, label + " does not end the duel");
  assert.strictEqual(next.done, false, label + " new round is playable");
  assert.strictEqual(next.daily, false, label + " replay is practice, not the daily");
  assert.notStrictEqual(next.secret, before, label + " should not repeat the country just finished");
  const guessed = await page.evaluate((secret) => {
    const wrong = secret === "Brazil" ? "Japan" : "Brazil";
    window.__wsGuess(D.g, wrong);
    return { n: D.g.guesses.length, name: D.g.guesses[0] && D.g.guesses[0].n, done: D.g.done };
  }, next.secret);
  assert.strictEqual(guessed.n, 1, label + " new round accepts a guess");
  assert.strictEqual(guessed.name, next.secret === "Brazil" ? "Japan" : "Brazil");
  console.log("ok", label, first.result, before, "->", next.secret);
}

(async () => {
  if (!fs.existsSync(chrome)) {
    console.error("chrome missing, skip");
    process.exit(1);
  }
  const server = await serve();
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-gpu"], headless: "new" });
  try {
    for (const [name, w, h] of [["phone", 320, 568], ["desktop", 1280, 800], ["land", 844, 390]]) {
      const page = await browser.newPage();
      page.on("pageerror", (e) => { throw e; });
      await boot(page, origin, w, h);
      await cycle(page, "win", name + " win");
      await cycle(page, "loss", name + " loss");
      await cycle(page, "win", name + " win again");
      const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      assert.ok(scroll[0] <= scroll[1] + 1, name + " horizontal overflow " + scroll);
      await page.close();
    }
    console.log("world sniff replay tests passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
