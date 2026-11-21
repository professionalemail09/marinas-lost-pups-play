/* Thumbjitsu: two hands on one phone, and full rounds versus the AI. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const shots = "/opt/cursor/artifacts";
const chrome = process.env.CHROME || "/usr/local/bin/google-chrome";
const { chromium } = require("/tmp/node_modules/playwright-core");

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url.split("?")[0];
      const file = path.join(root, url === "/" ? "index.html" : decodeURIComponent(url.replace(/^\/+/, "")));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      const ext = path.extname(file);
      const type = ext === ".js" ? "text/javascript" : ext === ".svg" ? "image/svg+xml" : ext === ".webp" ? "image/webp" : "text/html";
      res.setHeader("Content-Type", type);
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function boot(page) {
  await page.goto(page.url() ? page.url() : "about:blank");
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const server = await serve();
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const rs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map((r) => r.unregister()));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__thumb && typeof MODES !== "undefined");
    await page.waitForTimeout(250);

    const listed = await page.evaluate(() => MODES.some((m) => m.id === "thumbjitsu" && m.scene === "thumbjitsu"));
    assert(listed, "Thumbjitsu is on the mode list");

    await page.evaluate(() => setScene("modes"));
    await page.waitForFunction(() => window.__modeBoxes && __modeBoxes.thumbjitsu);
    await page.evaluate(() => { scrollOff = Math.max(0, __modeBoxes.thumbjitsu.y - 24); });
    await page.waitForTimeout(350);
    const tile = await page.evaluate(() => {
      const b = __modeBoxes.thumbjitsu;
      const y = 96 - scrollOff + b.y;
      return { x: b.x * S, y: y * S, w: b.w * S, h: b.h * S, S };
    });
    await page.screenshot({ path: path.join(shots, "thumbjitsu-menu.png") });
    const png = await page.screenshot();
    fs.writeFileSync("/tmp/tj-menu.png", png);

    const buttons = await page.evaluate(() => {
      __thumb.open();
      return new Promise((resolve) => requestAnimationFrame(() => resolve(__thumb.buttons())));
    });
    assert(buttons.length >= 5, "menu has the match buttons");
    buttons.forEach((b) => {
      assert(b.w >= 44 && b.h >= 44, "tap target " + JSON.stringify(b));
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, "portrait overflow " + overflow);
    await page.screenshot({ path: path.join(shots, "thumbjitsu-menu-screen.png") });

    const pin = await page.evaluate(() => __thumb.debug.thumbPin());
    const thumb = (pin.holds || []).find((h) => h.kind === "thumb");
    assert(thumb, "a thumb pin locks when the thumb lands with speed: " + JSON.stringify(pin.holds));
    assert(thumb.mult > 1.4, "thumb multiplier ramps, got " + thumb.mult);
    assert(pin.scores[0] > 1, "holding the thumb scores, got " + pin.scores[0]);
    await page.screenshot({ path: path.join(shots, "thumbjitsu-pin-multiplier.png") });

    const ring = await page.evaluate(() => __thumb.debug.encircle());
    const enc = (ring.holds || []).find((h) => h.kind === "encircle");
    assert(enc, "a closed ring around a hand scores: " + JSON.stringify({ holds: ring.holds, wrap: ring.wrap }));
    assert(ring.scores[0] > 0.4, "encircle scores by time held, got " + ring.scores[0]);
    assert(!(ring.holds || []).some((h) => h.kind === "grab"), "grabs do not score");
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(shots, "thumbjitsu-encircle.png") });

    const feet = await page.evaluate(() => __thumb.debug.bothFeet());
    assert(feet.phase === "round" && feet.reason === "feet" && feet.winner === 0, "both feet is an instant round win: " + JSON.stringify({ phase: feet.phase, reason: feet.reason, winner: feet.winner, holds: feet.holds }));
    await page.screenshot({ path: path.join(shots, "thumbjitsu-both-feet.png") });

    for (const mode of ["easy", "normal", "hard"]) {
      const seen = await page.evaluate((m) => __thumb.debug.plans(m), mode);
      ["thumb", "encircle", "block", "cover", "double", "step", "feint", "pry"].forEach((plan) => {
        assert(seen.indexOf(plan) >= 0, mode + " AI did not use " + plan + " (" + seen.join(",") + ")");
      });
    }

    await page.evaluate(() => __thumb.start("2p", { skip: true, round: 50 }));
    await page.waitForTimeout(200);
    const homes = await page.evaluate(() => __thumb.homes());
    const session = await context.newCDPSession(page);
    const pts = [
      { x: 70, y: 700, id: 1 },
      { x: 300, y: 720, id: 2 },
      { x: 80, y: 140, id: 3 },
      { x: 310, y: 150, id: 4 }
    ];
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts });
    await page.waitForTimeout(200);
    const moved = pts.map((p, i) => ({ x: i < 2 ? 180 : 200, y: i < 2 ? 460 : 380, id: p.id }));
    for (let i = 0; i < 6; i++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: moved });
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(250);
    const two = await page.evaluate(() => __thumb.snap());
    const pointers = two.hands.flat().filter((h) => h.pointer).length;
    assert(pointers === 4, "both players' hands are tracking, got " + pointers + " " + JSON.stringify(two.hands));
    assert(two.hands[0].some((h) => h.y < 0.72), "player 1 hands moved up from home " + JSON.stringify(two.hands[0]) + " touches " + JSON.stringify(moved));
    await page.screenshot({ path: path.join(shots, "thumbjitsu-2p-action.png") });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(200);
    const landOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(landOverflow <= 1, "landscape overflow " + landOverflow);
    const landButtons = await page.evaluate(() => __thumb.buttons());
    landButtons.forEach((b) => assert(b.w >= 44 && b.h >= 44, "landscape target " + JSON.stringify(b)));
    await page.screenshot({ path: path.join(shots, "thumbjitsu-landscape.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => __thumb.start("hard", { skip: true, round: 50 }));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(shots, "thumbjitsu-vs-ai.png") });

    await page.evaluate(() => __thumb.start("normal", { round: 4, count: 0.25, banner: 0.45 }));
    let sawRound = false;
    const started = Date.now();
    while (Date.now() - started < 40000) {
      const snap = await page.evaluate(() => __thumb.snap());
      if (snap.phase === "round" && !sawRound) {
        sawRound = true;
        await page.screenshot({ path: path.join(shots, "thumbjitsu-round.png") });
      }
      if (snap.phase === "match") {
        await page.screenshot({ path: path.join(shots, "thumbjitsu-results.png") });
        assert(snap.wins[0] + snap.wins[1] >= 2, "best of 3 reached a result " + JSON.stringify(snap.wins));
        break;
      }
      await page.waitForTimeout(200);
    }
    const finalSnap = await page.evaluate(() => __thumb.snap());
    assert(finalSnap.phase === "match", "full versus-AI match did not finish: " + finalSnap.phase);
    assert(sawRound, "a round result was shown");
    assert(!errors.length, errors.join("\n"));
    console.log("thumbjitsu ok", JSON.stringify({ tile, pin: pin.holds.map((h) => h.kind + " x" + h.mult.toFixed(2)), feet: feet.reason, wins: finalSnap.wins }));
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
