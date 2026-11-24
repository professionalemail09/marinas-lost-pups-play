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
      viewport: { width: 412, height: 915 },
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
      assert(b.w >= 48 && b.h >= 48, "tap target " + JSON.stringify(b));
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
    assert(ring.live === 5, "the ring used five live fingers");
    assert(ring.scores[0] > 0.4, "encircle scores by time held, got " + ring.scores[0]);
    assert(!(ring.holds || []).some((h) => h.kind === "grab"), "grabs do not score");
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(shots, "thumbjitsu-encircle.png") });

    const lifted = await page.evaluate(() => __thumb.debug.lift());
    assert(!(lifted.holds || []).some((h) => h.kind === "encircle" && h.by === 0), "lifting the fingers releases the ring: " + JSON.stringify(lifted.holds));
    assert(lifted.rose <= 0, "an untouched hand does not keep scoring");

    const feet = await page.evaluate(() => __thumb.debug.bothFeet());
    assert(feet.phase === "match" && feet.reason === "feet" && feet.winner === 0, "both feet wins the match: " + JSON.stringify({ phase: feet.phase, reason: feet.reason, winner: feet.winner }));
    await page.screenshot({ path: path.join(shots, "thumbjitsu-both-feet.png") });

    for (const mode of ["easy", "normal", "hard"]) {
      const seen = await page.evaluate((m) => __thumb.debug.plans(m), mode);
      ["thumb", "encircle", "block", "cover", "double", "step", "feint", "pry"].forEach((plan) => {
        assert(seen.indexOf(plan) >= 0, mode + " AI did not use " + plan + " (" + seen.join(",") + ")");
      });
    }

    for (const mode of ["easy", "normal", "hard"]) {
      const idle = await page.evaluate((m) => __thumb.debug.idle(m), mode);
      assert(idle.phase === "match" && idle.winner === 1 && idle.scores[0] === 0, mode + " should beat an idle player " + JSON.stringify(idle));
    }
    const easyB = await page.evaluate(() => __thumb.debug.bouts("easy", 4));
    const hardB = await page.evaluate(() => __thumb.debug.bouts("hard", 4));
    assert(hardB.wins >= easyB.wins, "Hard won " + hardB.wins + " of " + hardB.n + ", Easy won " + easyB.wins);

    await page.evaluate(() => __thumb.start("2p", { skip: true, round: 50 }));
    await page.waitForTimeout(200);
    const session = await context.newCDPSession(page);
    function cluster(x, y, n, id0) {
      const pts = [];
      for (let i = 0; i < n; i++) pts.push({ x: x + (i % 3) * 12, y: y + Math.floor(i / 3) * 14, id: id0 + i });
      return pts;
    }
    const ten = cluster(180, 700, 5, 1).concat(cluster(180, 160, 5, 6));
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: ten });
    await page.waitForTimeout(250);
    const tenSnap = await page.evaluate(() => __thumb.snap());
    assert(tenSnap.fingers[0] === 5 && tenSnap.fingers[1] === 5, "five fingers each, got " + JSON.stringify(tenSnap.fingers));
    await page.screenshot({ path: path.join(shots, "thumbjitsu-2p-action.png") });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.evaluate(() => __thumb.start("2p", { skip: true, round: 50 }));
    await page.waitForTimeout(150);
    const six = cluster(180, 720, 6, 1);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: six });
    await page.waitForTimeout(200);
    const sixSnap = await page.evaluate(() => __thumb.snap());
    assert(sixSnap.fingers[0] === 5, "a sixth finger is refused, got " + sixSnap.fingers[0]);
    assert(sixSnap.refused >= 1, "the extra touch was counted as refused");
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(200);
    const landOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(landOverflow <= 1, "landscape overflow " + landOverflow);
    const landButtons = await page.evaluate(() => __thumb.buttons());
    landButtons.forEach((b) => assert(b.w >= 48 && b.h >= 48, "landscape target " + JSON.stringify(b)));
    await page.screenshot({ path: path.join(shots, "thumbjitsu-landscape.png") });

    await page.setViewportSize({ width: 412, height: 915 });
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
        assert(snap.wins[0] + snap.wins[1] >= 1 || snap.reason === "feet", "the match reached a result " + JSON.stringify(snap));
        break;
      }
      await page.waitForTimeout(200);
    }
    const finalSnap = await page.evaluate(() => __thumb.snap());
    assert(finalSnap.phase === "match", "full versus-AI match did not finish: " + finalSnap.phase + " " + finalSnap.reason);
    assert(!errors.length, errors.join("\n"));
    const loopErr = await page.evaluate(() => window.__thumbErr || "");
    assert(!loopErr, loopErr);
    console.log("thumbjitsu ok", JSON.stringify({ tile, pin: pin.holds.map((h) => h.kind + " x" + h.mult.toFixed(2)), feet: feet.reason, wins: finalSnap.wins }));
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
