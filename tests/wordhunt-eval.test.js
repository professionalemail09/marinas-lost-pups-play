/* Word Hunt marks exact letters green, misplaced letters yellow, and the rest gray.
   Exact matches consume a letter before leftovers can turn yellow. The keyboard
   keeps the strongest mark and a new round clears it. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "app.v0-5-6.js"), "utf8");
const start = src.indexOf("function a(O,z){const R=Array(5)");
const end = src.indexOf("window.__wordMark=a");
assert(start > 0 && end > start, "mark helpers missing");
const sandbox = { window: {} };
vm.runInNewContext(src.slice(start, end) + "\nthis.a=a;this.wordKeys=wordKeys;", sandbox);
const mark = sandbox.a;
const keys = sandbox.wordKeys;

function contrast(hex) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const n = parseInt(hex.slice(1), 16);
  const L = 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
  return 1.05 / (L + 0.05);
}

assert.deepStrictEqual([...mark("alley", "apple")], ["g", "y", "b", "y", "b"]);
assert.deepStrictEqual([...mark("papal", "apple")], ["y", "y", "g", "b", "y"]);
assert.deepStrictEqual([...mark("puppy", "puppy")], ["g", "g", "g", "g", "g"]);
assert.deepStrictEqual([...mark("otter", "treat")], ["b", "y", "y", "y", "y"]);
assert.deepStrictEqual([...mark("llama", "allay")], ["y", "g", "y", "b", "y"]);
assert.deepStrictEqual([...mark("aaabb", "ababa")], ["g", "y", "g", "g", "y"]);
assert.deepStrictEqual([...mark("zzzzz", "apple")], ["b", "b", "b", "b", "b"]);

let board = {};
board = keys(board, "alley", mark("alley", "apple"));
assert.deepStrictEqual(JSON.parse(JSON.stringify(board)), { a: "g", l: "y", e: "y", y: "b" });
board = keys(board, "apple", mark("apple", "apple"));
assert.strictEqual(board.a, "g");
assert.strictEqual(board.p, "g");
assert.strictEqual(board.e, "g");
assert.strictEqual(board.l, "g");
assert.strictEqual(board.y, "b");
board = keys({ a: "g" }, "xaxxx", ["b", "b", "b", "b", "b"]);
assert.strictEqual(board.a, "g", "a later miss must not erase a green key");
board = keys({ t: "y" }, "xtxxx", ["b", "b", "b", "b", "b"]);
assert.strictEqual(board.t, "y", "a later miss must not erase a yellow key");

for (const hex of ["#157A45", "#8A6A00", "#3D4556", "#5C677C", "#2B3550"]) {
  assert(contrast(hex) >= 4.5, hex + " contrast " + contrast(hex));
}
assert(src.includes('T={g:"#157A45",y:"#8A6A00",b:"#3D4556"}'));
assert(src.includes('ink:"#FFFFFF"'));
assert(!src.includes("NM.FB.right"), "tiles must not inherit the shared feedback object");

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
  await page.goto(origin + "/?v=wordhunt", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(rs.map((r) => r.unregister()));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 300));
}

async function play(page, secret, guesses) {
  return page.evaluate((secret, guesses) => {
    startDuel("word");
    D.secret = secret;
    for (const word of guesses) {
      for (const ch of word) WordHunt.press(D, ch);
      WordHunt.press(D, "Enter");
    }
    return { rows: D.rows.map((r) => r.w + ":" + r.res.join("")), keys: D.keys, over: D.over, result: D.result };
  }, secret, guesses);
}

async function paint(page) {
  await new Promise((r) => setTimeout(r, 1400));
  return page.evaluate(() => {
    WordHunt.draw(D, ctx, W, H);
    const c = document.querySelector("canvas");
    const shot = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    const scale = c.width / W;
    function px(x, y) {
      const i = (y * shot.width + x) * 4;
      return [shot.data[i], shot.data[i + 1], shot.data[i + 2]];
    }
    function box(rect) {
      const colors = [];
      const spots = [[4, 4], [4, rect.h * 0.72], [rect.w * 0.5, rect.h * 0.78]];
      for (const [dx, dy] of spots) {
        colors.push(px(
          Math.min(shot.width - 1, Math.max(0, Math.floor((rect.x + dx) * scale))),
          Math.min(shot.height - 1, Math.max(0, Math.floor((rect.y + dy) * scale)))
        ));
      }
      let white = 0;
      let n = 0;
      const xa = Math.floor((rect.x + 2) * scale);
      const xb = Math.floor((rect.x + rect.w - 2) * scale);
      const ya = Math.floor((rect.y + 2) * scale);
      const yb = Math.floor((rect.y + rect.h - 2) * scale);
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          n++;
          const [r, g, b] = px(x, y);
          if (r > 220 && g > 220 && b > 220) white++;
        }
      }
      return { white, n, colors };
    }
    const tiles = (D._tiles || []).filter((t) => t.mark).map((t) => ({ mark: t.mark, ch: t.ch, ...box(t) }));
    const want = { g: "#157A45", y: "#8A6A00", b: "#3D4556" };
    function hit(sample, hex) {
      const n = parseInt(hex.slice(1), 16);
      const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
      return sample.colors.some(([r, g, b]) => Math.abs(r - R) < 36 && Math.abs(g - G) < 36 && Math.abs(b - B) < 36);
    }
    const keyHits = {};
    for (const [ch, mark] of Object.entries(D.keys)) {
      const rect = (D.keyRects || []).find((k) => k.k.toLowerCase() === ch);
      if (!rect) continue;
      const sample = box(rect);
      let strike = 0;
      if (mark === "b") {
        const mid = Math.floor((rect.y + rect.h / 2) * scale);
        const x0 = Math.floor((rect.x + 6) * scale);
        const x1 = Math.floor((rect.x + rect.w - 6) * scale);
        for (let y = mid - 3; y <= mid + 3; y++) {
          let row = 0;
          for (let x = x0; x < x1; x++) {
            const i = (y * shot.width + x) * 4;
            if (shot.data[i] > 210 && shot.data[i + 1] > 210 && shot.data[i + 2] > 210) row++;
          }
          if (row > strike) strike = row;
        }
      }
      keyHits[ch] = { mark, fill: hit(sample, want[mark]), white: sample.white, strike, peek: sample.colors.slice(0, 3) };
    }
    const css = c.getBoundingClientRect();
    const keyH = Math.min(...(D.keyRects || []).map((k) => k.h * (css.height / H)));
    const keyW = Math.min(...(D.keyRects || []).filter((k) => k.k.length === 1).map((k) => k.w * (css.width / W)));
    return {
      tiles: tiles.map((t) => ({ mark: t.mark, ch: t.ch, fill: hit(t, want[t.mark]), white: t.white, n: t.n, peek: t.colors.slice(0, 4) })),
      keyHits,
      keyH, keyW,
      scroll: document.documentElement.scrollWidth - window.innerWidth,
      version: window.MLP_V048 && MLP_V048.version
    };
  });
}

(async () => {
  const server = await serve();
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"]
  });
  const out = process.env.SHOTS || "/opt/cursor/artifacts";
  fs.mkdirSync(out, { recursive: true });
  try {
    const page = await browser.newPage();
    const sizes = [[390, 844, "phone"], [1280, 800, "desktop"], [320, 700, "narrow"], [740, 360, "landscape"]];
    for (const [w, h, name] of sizes) {
      await boot(page, origin, w, h);
      const played = await play(page, "apple", ["alley"]);
      assert.strictEqual(played.rows[0], "alley:gybyb", name);
      assert.deepStrictEqual(played.keys, { a: "g", l: "y", e: "y", y: "b" });
      const view = await paint(page);
      assert.strictEqual(view.version, "0.5.6");
      for (const tile of view.tiles) {
        assert(tile.fill, name + " tile " + tile.ch + " " + tile.mark + " missing color");
        assert(tile.white >= 3, name + " tile " + tile.ch + " letter is not white (" + tile.white + ")");
      }
      for (const [ch, info] of Object.entries(view.keyHits)) {
        assert(info.fill, name + " key " + ch + " " + info.mark);
        assert(info.white > 2, name + " key " + ch + " letter is not white");
        if (info.mark === "b") assert(info.strike >= 4, name + " absent key " + ch + " strike " + info.strike);
      }
      assert(view.scroll <= 1, name + " horizontal overflow " + view.scroll);
      assert(view.keyH >= (h >= 640 ? 44 : 32), name + " key height " + view.keyH);
      if (name === "phone" || name === "desktop" || name === "landscape") {
        await page.screenshot({ path: path.join(out, "wordhunt-" + name + ".png") });
      }
      console.log(name, "keys", view.keyH.toFixed(1), "x", view.keyW.toFixed(1), "tiles", view.tiles.length);
    }

    await boot(page, origin, 390, 844);
    const won = await play(page, "puppy", ["puppy"]);
    assert.strictEqual(won.result, "win");
    const again = await page.evaluate(() => {
      const before = D.secret;
      WordHunt.press(D, "Enter");
      return { before, secret: D.secret, rows: D.rows.length, keys: Object.keys(D.keys).length, over: D.over };
    });
    assert.strictEqual(again.over, false);
    assert.strictEqual(again.rows, 0);
    assert.strictEqual(again.keys, 0);
    assert.notStrictEqual(again.secret, again.before);

    const lost = await play(page, "apple", ["beach", "cloud", "dream", "fruit", "green"]);
    assert.strictEqual(lost.result, "loss");
    const retried = await page.evaluate(() => {
      WordHunt.tap(D, 200, 400);
      return { rows: D.rows.length, keys: Object.keys(D.keys).length, over: !!D.over, cur: D.cur };
    });
    assert.strictEqual(retried.over, false);
    assert.strictEqual(retried.rows, 0);
    assert.strictEqual(retried.keys, 0);
    const typed = await page.evaluate(() => {
      WordHunt.press(D, "p");
      return D.cur;
    });
    assert.strictEqual(typed, "p");
    console.log("win/loss/restart ok");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
