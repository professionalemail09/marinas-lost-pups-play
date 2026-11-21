/* Two browser contexts on one machine: QR decode plus a host-only
   WebRTC data channel. No signaling server and no STUN. */
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
      const ext = path.extname(file);
      const type = ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function boot(page, origin) {
  await page.goto(origin + "/?v=near", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(rs.map((r) => r.unregister()));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__near && window.__nearChess && window.qrcode && window.jsQR);
}

(async () => {
  const server = await serve();
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-features=WebRtcHideLocalIpsWithMdns"]
  });
  const host = await browser.newPage();
  const guest = await browser.newPage();
  try {
    await boot(host, origin);
    await boot(guest, origin);

    const opened = await host.evaluate(() => {
      setScene("nearby");
      const root = document.getElementById("nearRoot");
      const text = root ? root.innerText : "";
      return { hidden: !root || root.hidden, text: text.slice(0, 80) };
    });
    assert.strictEqual(opened.hidden, false, "Nearby screen should open");
    assert.ok(opened.text.indexOf("Nearby (same Wi-Fi)") >= 0, opened.text);

    const shots = "/opt/cursor/artifacts";
    await host.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
    await guest.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
    await host.evaluate(() => __near.host());
    await host.waitForFunction(() => __near.debug && __near.debug.code && __near.debug.role === "host");
    await host.screenshot({ path: path.join(shots, "nearby-qr.png") });
    const qrOk = await host.evaluate(() => {
      const canvas = document.querySelector(".near-qr");
      const g = canvas.getContext("2d");
      const img = g.getImageData(0, 0, canvas.width, canvas.height);
      const hit = jsQR(img.data, img.width, img.height);
      return { decoded: hit && hit.data, code: __near.debug.code, match: hit && hit.data === __near.debug.code };
    });
    assert.ok(qrOk.match, "QR picture should decode to the typed code");

    const offer = qrOk.code;
    await guest.evaluate((code) => __near.join(), offer);
    await guest.evaluate((code) => __near.ingest(code), offer);
    await guest.waitForFunction(() => __near.debug && __near.debug.role === "guest" && __near.debug.code);
    const answer = await guest.evaluate(() => __near.debug.code);
    assert.notStrictEqual(answer, offer, "answer code differs from the offer");

    const guestQr = await guest.evaluate(() => {
      const canvas = document.querySelector(".near-qr");
      const g = canvas.getContext("2d");
      const img = g.getImageData(0, 0, canvas.width, canvas.height);
      const hit = jsQR(img.data, img.width, img.height);
      return hit && hit.data === __near.debug.code;
    });
    assert.ok(guestQr, "answer QR should decode");
    await guest.screenshot({ path: path.join(shots, "nearby-answer.png") });

    await host.evaluate((code) => __near.ingest(code), answer);
    const waitReady = async (page) => {
      const start = Date.now();
      while (Date.now() - start < 15000) {
        const ok = await page.evaluate(() => !!(window.__near && window.__near.ready));
        if (ok) return;
        await new Promise((r) => setTimeout(r, 200));
      }
      const info = await page.evaluate(() => ({
        ready: !!(window.__near && window.__near.ready),
        text: (document.getElementById("nearRoot") || {}).innerText || ""
      }));
      throw new Error("not ready " + JSON.stringify(info).slice(0, 300));
    };
    await waitReady(host);
    await waitReady(guest);
    await host.screenshot({ path: path.join(shots, "nearby-games.png") });

    await host.evaluate(() => {
      const buttons = [...document.querySelectorAll("#nearRoot button")];
      const chess = buttons.find((b) => b.textContent === "Chess");
      chess.click();
    });
    await host.waitForFunction(() => typeof D !== "undefined" && D && D.id === "chess" && D.nearSide === "w");
    await guest.waitForFunction(() => typeof D !== "undefined" && D && D.id === "chess" && D.nearSide === "b");

    const before = await host.evaluate(() => __nearChess.fen());
    const moved = await host.evaluate(() => {
      const legal = __nearChess.legal();
      const ok = __nearChess.local(legal[0]);
      return { ok, move: legal[0], fen: __nearChess.fen() };
    });
    assert.ok(moved.ok, "host can play a legal move");
    await guest.waitForFunction((fen) => __nearChess.fen() === fen, { timeout: 4000 }, moved.fen);
    const guestFen = await guest.evaluate(() => __nearChess.fen());
    assert.strictEqual(guestFen, moved.fen, "guest board matches after the move");
    assert.notStrictEqual(guestFen, before, "the move changed the position");

    const reply = await guest.evaluate(() => {
      const legal = __nearChess.legal();
      const ok = __nearChess.local(legal[0]);
      return { ok, fen: __nearChess.fen() };
    });
    assert.ok(reply.ok, "guest can reply");
    await host.waitForFunction((fen) => __nearChess.fen() === fen, { timeout: 4000 }, reply.fen);
    await host.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await new Promise((r) => setTimeout(r, 400));
    await host.screenshot({ path: path.join(shots, "nearby-chess.png") });

    await guest.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Leave");
      if (btn) btn.click();
    });
    await host.waitForFunction(() => {
      const box = document.getElementById("nearRoot");
      return box && !box.hidden && box.innerText.indexOf("dropped off") >= 0;
    }, { timeout: 6000 });
    console.log("nearby lan ok", moved.move.from, "->", moved.move.to);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
