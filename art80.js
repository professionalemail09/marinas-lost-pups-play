/* Approved character portraits. Bear, Kenai (1.12x), and Marina.
   Loaded after the game so the desk, title, host line, menu, and owner use them. */
(function () {
  if (typeof window === "undefined") return;
  var V = "0-6-17";
  var SRC = {
    bear: "assets/characters/80s/bear-80s.webp?v=" + V,
    kenai: "assets/characters/80s/kenai-80s.webp?v=" + V,
    marina: "assets/characters/80s/marina-80s.webp?v=" + V,
    trio: "assets/characters/80s/trio-80s.webp?v=" + V,
    bearA: "assets/characters/80s/bear-80s-avatar.webp?v=" + V,
    kenaiA: "assets/characters/80s/kenai-80s-avatar.webp?v=" + V,
    marinaA: "assets/characters/80s/marina-80s-avatar.webp?v=" + V
  };
  var img = {};
  Object.keys(SRC).forEach(function (k) {
    var im = new Image();
    im.src = SRC[k];
    img[k] = im;
    if (typeof loadAsset === "function") loadAsset("art80_" + k, SRC[k]);
  });
  window.__art80 = { img: img };
  function loadGear() {
    var meta = window.__gearMeta;
    if (!meta) return;
    var gear = {};
    Object.keys(meta).forEach(function (kind) {
      if (!meta[kind] || !meta[kind].items) return;
      var bucket = {};
      var ear = new Image();
      ear.src = "assets/characters/80s/gear/" + kind + "/ears.webp?v=" + V;
      bucket.ears = ear;
      if (typeof loadAsset === "function") loadAsset("gear_" + kind + "_ears", ear.src);
      Object.keys(meta[kind].items).forEach(function (id) {
        var info = meta[kind].items[id];
        if (!info || !info.file || info.hide) return;
        var im = new Image();
        im.src = "assets/characters/80s/gear/" + kind + "/" + info.file + "?v=" + V;
        bucket[id] = im;
        if (typeof loadAsset === "function") loadAsset("gear_" + kind + "_" + id, im.src);
      });
      gear[kind] = bucket;
    });
    window.__art80.gear = gear;
  }
  loadGear();

  function ready(im) { return im && im.complete && im.naturalWidth; }
  function bust(im, cx, foot, h) {
    if (!ready(im)) return;
    var w = h * (im.naturalWidth / im.naturalHeight);
    ctx.drawImage(im, cx - w / 2, foot - h, w, h);
  }
  function seatBox(im, cx, foot, h) {
    var w = h * (im.naturalWidth / im.naturalHeight);
    return { x: cx - w / 2, y: foot - h - h * 0.04, w: w, h: h * 1.08 };
  }
  function seated(im, cx, foot, h) {
    if (!ready(im)) return;
    var w = h * (im.naturalWidth / im.naturalHeight);
    var x = cx - w / 2, y = foot - h, r = Math.min(w, h) * 0.46;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, foot + 6);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, foot + 6);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(im, x, y - h * 0.04, w, h * 1.08);
    var side = ctx.createLinearGradient(x, 0, x + w, 0);
    side.addColorStop(0, "rgba(20,61,46,0.72)");
    side.addColorStop(0.16, "rgba(20,61,46,0)");
    side.addColorStop(0.84, "rgba(20,61,46,0)");
    side.addColorStop(1, "rgba(20,61,46,0.72)");
    ctx.fillStyle = side;
    ctx.fillRect(x, y, w, h + 8);
    var down = ctx.createLinearGradient(0, y + h * 0.62, 0, foot + 6);
    down.addColorStop(0, "rgba(20,61,46,0)");
    down.addColorStop(1, "rgba(20,61,46,0.88)");
    ctx.fillStyle = down;
    ctx.fillRect(x, y + h * 0.62, w, h * 0.5);
    ctx.restore();
  }
  function roundPath(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function patchDesk(stage) {
    var prev = stage.desk;
    stage.desk = function (box, tm, moodL, moodR, shake) {
      prev.call(stage, box, tm, moodL, moodR, shake);
      if (!ready(img.bearA) || !ready(img.kenaiA) || typeof ctx === "undefined") return;
      var x = box.x, y = box.y, w = box.w, h = box.h;
      var compact = h < 96;
      var bearH = Math.max(40, Math.min(h * 0.72, 92));
      var kenaiH = bearH * 1.12;
      var lip = compact ? Math.max(8, h * 0.16) : Math.max(18, h * 0.24);
      var dy = y + h * 0.76;
      var bx = x + w * 0.30, kx = x + w * 0.70;
      ctx.save();
      roundPath(x, y, w, h, 16);
      ctx.clip();
      var sky = ctx.createLinearGradient(x, y, x, y + h);
      sky.addColorStop(0, "#1B4F3C");
      sky.addColorStop(0.55, "#2F6E56");
      sky.addColorStop(1, "#143D2E");
      ctx.fillStyle = sky;
      ctx.fillRect(x, y, w, h);
      var closet = window.__closet;
      var bearBox = seatBox(img.bearA, bx, dy + 6, bearH);
      var kenaiBox = seatBox(img.kenaiA, kx, dy + 6, kenaiH);
      if (closet && closet.dressBack && closet.outfit) {
        closet.dressBack(ctx, bearBox, closet.outfit("bear"), tm || 0, "bear");
        closet.dressBack(ctx, kenaiBox, closet.outfit("kenai"), tm || 0, "kenai");
      }
      seated(img.bearA, bx, dy + 6, bearH);
      seated(img.kenaiA, kx, dy + 6, kenaiH);
      if (closet && closet.dressGear && closet.outfit) {
        closet.dressGear(ctx, bearBox, closet.outfit("bear"), tm || 0, "bear");
        closet.dressGear(ctx, kenaiBox, closet.outfit("kenai"), tm || 0, "kenai");
      }
      if (closet && closet.dressFront && closet.outfit) {
        closet.dressFront(ctx, bearBox, closet.outfit("bear"), tm || 0, "bear");
        closet.dressFront(ctx, kenaiBox, closet.outfit("kenai"), tm || 0, "kenai");
      }
      var dg = ctx.createLinearGradient(x, dy - lip, x, y + h);
      dg.addColorStop(0, "#1B4F3C");
      dg.addColorStop(0.45, "#2F6E56");
      dg.addColorStop(1, "#10281C");
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, dy + 6);
      ctx.quadraticCurveTo(x + w / 2, dy - lip, x + w, dy + 6);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#E7F2EB";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, dy + 6);
      ctx.quadraticCurveTo(x + w / 2, dy - lip, x + w - 2, dy + 6);
      ctx.stroke();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "700 " + (compact ? 10 : 12) + "px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("HOSTS", x + w / 2, y + (compact ? 12 : 16));
      function tag(px, name) {
        ctx.font = "700 " + (compact ? 11 : 13) + "px Nunito, sans-serif";
        var tw = Math.min(Math.ceil(ctx.measureText(name).width) + 14, Math.max(48, w * 0.28));
        var th = compact ? 16 : 18;
        var ty = Math.min(y + h - th - 4, dy + 8);
        ctx.fillStyle = "#10281C";
        roundPath(px - tw / 2, ty, tw, th, 6);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name, px, ty + th / 2);
      }
      tag(bx, "Bear");
      tag(kx, "Kenai");
      ctx.restore();
    };
  }

  function patchFront(stage) {
    var prev = stage.front;
    stage.front = function (A) {
      prev.call(stage, A);
      if (!A || A.quitAsk || typeof ctx === "undefined" || typeof H === "undefined") return;
      var line = stage.line(A);
      if (!line) return;
      var kenai = /Kenai/.test(line) && !/Bear/.test(line);
      var face = kenai ? img.kenaiA : img.bearA;
      if (!ready(face)) return;
      var size = kenai ? 34 * 1.12 : 34;
      var bh = 48, bw = Math.max(160, W - 24), by = H - bh - 8;
      ctx.save();
      ctx.fillStyle = "#F2F6F0";
      ctx.fillRect(8, by - 4, bw + 12, bh + 10);
      ctx.fillStyle = "#FFFFFF";
      roundPath(12, by, bw, bh, 12);
      ctx.fill();
      ctx.strokeStyle = "#1B4F3C";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(16, by + 4, size + 2, bh - 8);
      ctx.clip();
      bust(face, 18 + size / 2, by + bh - 4, size);
      ctx.restore();
      var textX = 22 + size + 8;
      var maxW = bw - (textX - 12) - 12;
      ctx.fillStyle = "#2B3550";
      ctx.font = "600 15px 'DM Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      var words = String(line).split(" "), rows = [], row = "";
      for (var i = 0; i < words.length; i++) {
        var n = row ? row + " " + words[i] : words[i];
        if (ctx.measureText(n).width > maxW && row) { rows.push(row); row = words[i]; }
        else row = n;
      }
      if (row) rows.push(row);
      var show = rows.slice(0, 2);
      show.forEach(function (r, idx) {
        ctx.fillText(r, textX, by + bh / 2 - (show.length - 1) * 9 + idx * 18);
      });
      ctx.restore();
    };
  }

  function patchTitle() {
    if (typeof drawTitle !== "function" || drawTitle.__art80) return;
    var prev = drawTitle;
    function wrapped(e) {
      prev(e);
      if (typeof scene === "undefined" || scene !== "title" || !ready(img.trio) || typeof W === "undefined") return;
      var playTop = Math.min(H * 0.835, H * 0.925 - 98);
      var w = Math.min(W - 28, 440);
      var h = w * img.trio.naturalHeight / img.trio.naturalWidth;
      var maxH = playTop - H * 0.36;
      if (h > maxH && maxH > 80) {
        h = maxH;
        w = h * img.trio.naturalWidth / img.trio.naturalHeight;
      }
      var x = (W - w) / 2, y = playTop - h - 16;
      ctx.save();
      ctx.fillStyle = "#E7F2EB";
      roundPath(x - 4, y - 4, w + 8, h + 8, 18);
      ctx.fill();
      roundPath(x, y, w, h, 16);
      ctx.save();
      ctx.clip();
      ctx.drawImage(img.trio, x, y, w, h);
      ctx.restore();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#1B4F3C";
      ctx.stroke();
      ctx.restore();
    }
    wrapped.__art80 = true;
    window.drawTitle = wrapped;
  }

  function patchModes() {
    if (typeof drawModes !== "function" || drawModes.__art80) return;
    var prev = drawModes;
    function wrapped() {
      var r = prev.apply(this, arguments);
      if (!ready(img.bearA) || !ready(img.kenaiA) || typeof W === "undefined") return r;
      var bearH = 34, kenaiH = Math.round(bearH * 1.12);
      ctx.save();
      ctx.fillStyle = "#E7F2EB";
      roundPath(6, 12, 86, 42, 12);
      ctx.fill();
      bust(img.bearA, 28, 52, bearH);
      bust(img.kenaiA, 58, 54, kenaiH);
      ctx.restore();
      return r;
    }
    wrapped.__art80 = true;
    window.drawModes = wrapped;
  }

  function patchOwner() {
    if (typeof drawOwner !== "function" || drawOwner.__art80) return;
    var prev = drawOwner;
    function wrapped(x, y, sc) {
      var im = img.marina;
      if (!ready(im) || typeof ctx === "undefined") return prev.apply(this, arguments);
      var scale = sc || 1;
      var bustIm = scale < 0.55 && ready(img.marinaA) ? img.marinaA : im;
      var closet = window.__closet;
      var wear = closet && closet.outfit ? closet.outfit("marina") : null;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      if (bustIm === img.marinaA) {
        var box = { x: -52, y: -70, w: 104, h: 104 };
        if (closet && wear) closet.dressBack(ctx, box, wear, 0, "marinaA");
        ctx.drawImage(bustIm, -52, -70, 104, 104);
        if (closet && wear && closet.dressGear) closet.dressGear(ctx, box, wear, 0, "marinaA");
        if (closet && wear) closet.dressFront(ctx, box, wear, 0, "marinaA");
      } else {
        var h = 168, w = h * im.naturalWidth / im.naturalHeight;
        var box = { x: -w / 2, y: 96 - h, w: w, h: h };
        if (closet && wear) closet.dressBack(ctx, box, wear, 0, "marina");
        ctx.drawImage(im, -w / 2, 96 - h, w, h);
        if (closet && wear && closet.dressGear) closet.dressGear(ctx, box, wear, 0, "marina");
        if (closet && wear) closet.dressFront(ctx, box, wear, 0, "marina");
      }
      ctx.restore();
    }
    wrapped.__art80 = true;
    window.drawOwner = wrapped;
  }

  function drawBust(im, x, y, sc, mul) {
    if (!ready(im) || typeof ctx === "undefined") return false;
    var h = 92 * (sc || 1) * (mul || 1);
    var w = h * (im.naturalWidth / im.naturalHeight);
    var closet = window.__closet;
    var kind = im === img.kenaiA ? "kenai" : im === img.marinaA ? "marinaA" : "bear";
    var wear = closet && closet.outfit ? closet.outfit(kind === "marinaA" ? "marina" : kind) : null;
    var box = { x: x - w / 2, y: y - h * 0.92, w: w, h: h };
    if (closet && wear && closet.dressBack) closet.dressBack(ctx, box, wear, 0, kind);
    ctx.drawImage(im, box.x, box.y, box.w, box.h);
    if (closet && wear && closet.dressGear) closet.dressGear(ctx, box, wear, 0, kind);
    if (closet && wear && closet.dressFront) closet.dressFront(ctx, box, wear, 0, kind);
    return true;
  }
  function patchRival() {
    if (typeof drawRival !== "function" || drawRival.__art80) return;
    var prev = drawRival;
    function wrapped(x, y, sc, col) {
      var c = String(col || "").toLowerCase();
      if (c === "#14151c") return prev.apply(this, arguments);
      var kenai = c === "#e6c98a" || c === "#f0d7a4" || c === "#f2f2f2" || c === "#fff6ea" || c === "#e8a25a";
      var sum = 0;
      for (var i = 0; i < c.length; i++) sum += c.charCodeAt(i);
      if (!kenai && c !== "#2a1810" && c !== "#333" && c !== "#333333") kenai = sum % 2 === 1;
      if (kenai && drawBust(img.kenaiA, x, y, sc, 1.12)) return;
      if (drawBust(img.bearA, x, y, sc, 1)) return;
      return prev.apply(this, arguments);
    }
    wrapped.__art80 = true;
    window.drawRival = wrapped;
  }

  function patch() {
    patchRival();
    if (window.__mlpStage && !__mlpStage.__art80) {
      patchDesk(__mlpStage);
      patchFront(__mlpStage);
      __mlpStage.__art80 = true;
    }
    patchTitle();
    patchModes();
    patchOwner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", patch);
  else patch();
  window.addEventListener("load", patch);
})();
