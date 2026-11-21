/* Nearby (same Wi-Fi).
   WebRTC data channel, host candidates only. No signaling server,
   no STUN/TURN, no share sheet, and no clipboard. Phones exchange a
   QR code, or type the same code by hand. */
(function () {
  if (typeof window === "undefined") return;

  var DUEL_IDS = [
    ["nap", "Nap-Off"],
    ["zoom", "Zoomies"],
    ["stare", "Staring Contest"],
    ["box", "Box Fit"],
    ["knock", "Knock It Off"]
  ];
  var QUIZ = [
    { q: "What does a pup follow on a sniff walk?", a: ["A smell", "A shadow", "A clock", "A sock drawer"], i: 0 },
    { q: "Which noise means the toy is the best one?", a: ["A squeak", "A yawn", "A drip", "A tick"], i: 0 },
    { q: "Where do tired pups like to nap?", a: ["A sunny spot", "A toaster", "A fishbowl", "A mailbox"], i: 0 },
    { q: "What do pups wag when they are glad?", a: ["A tail", "An ear tip only", "A whisker", "A collar tag"], i: 0 },
    { q: "A pup's nose is best at finding...", a: ["Hidden treats", "Radio songs", "Paint colors", "Wi-Fi names"], i: 0 },
    { q: "Which friend stays home as a computer rival?", a: ["Bear", "A neighbor", "A referee", "A scoreboard"], i: 0 },
    { q: "What should you bring on a rainy sniff?", a: ["A towel", "A trumpet", "A ladder", "A snow shovel"], i: 0 },
    { q: "Pups drink to cool off. They drink...", a: ["Water", "Soap", "Ink", "Glue"], i: 0 }
  ];

  var pc = null, ch = null, role = "", payload = "", scanStop = null, dropTimer = 0, dead = false;
  var quiz = null, duelWait = null, chessSide = "";
  var root, bar;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function send(obj) {
    if (ch && ch.readyState === "open") ch.send(JSON.stringify(obj));
  }
  function pretty(code) {
    return String(code || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
  }
  function squash(code) { return String(code || "").replace(/\s+/g, ""); }

  function encode(sdp) {
    var u = (sdp.match(/a=ice-ufrag:(\S+)/) || [])[1];
    var p = (sdp.match(/a=ice-pwd:(\S+)/) || [])[1];
    var fp = (sdp.match(/a=fingerprint:sha-256 (\S+)/) || [])[1];
    var setup = (sdp.match(/a=setup:(\S+)/) || [])[1] || "actpass";
    var cands = [];
    var re = /a=candidate:(\S+) 1 udp (\d+) (\S+) (\d+) typ host/g, m;
    while ((m = re.exec(sdp))) cands.push([m[1], m[2], m[3], m[4]]);
    cands.sort(function (a, b) {
      var ah = a[2].indexOf(".local") < 0 && a[2].indexOf(":") < 0 ? 0 : 1;
      var bh = b[2].indexOf(".local") < 0 && b[2].indexOf(":") < 0 ? 0 : 1;
      return ah - bh;
    });
    if (!u || !p || !fp || !cands.length) throw new Error("no host candidate");
    var lines = ["N1", u, p, fp, setup];
    cands.forEach(function (c) { lines.push(c.join(",")); });
    return lines.join("~");
  }
  function decode(text) {
    var parts = squash(text).split("~");
    if (parts[0] !== "N1" || parts.length < 6) throw new Error("bad code");
    var cands = parts.slice(5).map(function (row) { return row.split(","); });
    var cand = cands.map(function (c) {
      return "a=candidate:" + c[0] + " 1 udp " + c[1] + " " + c[2] + " " + c[3] + " typ host generation 0";
    }).join("\r\n");
    return [
      "v=0", "o=- 0 2 IN IP4 127.0.0.1", "s=-", "t=0 0",
      "a=group:BUNDLE 0", "a=extmap-allow-mixed", "a=msid-semantic: WMS",
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0",
      cand,
      "a=ice-ufrag:" + parts[1], "a=ice-pwd:" + parts[2],
      "a=fingerprint:sha-256 " + parts[3], "a=setup:" + parts[4],
      "a=mid:0", "a=sctp-port:5000", "a=max-message-size:262144", ""
    ].join("\r\n");
  }
  function drawQR(canvas, text) {
    var qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount();
    var max = Math.max(180, Math.min(300, (window.innerWidth || 360) - 48));
    var scale = Math.max(2, Math.floor(max / (n + 8)));
    var size = (n + 8) * scale;
    canvas.width = size;
    canvas.height = size;
    var g = canvas.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, size, size);
    g.fillStyle = "#10213f";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + 4) * scale, (r + 4) * scale, scale, scale);
    return canvas;
  }

  function hangup() {
    dead = true;
    if (scanStop) { scanStop(); scanStop = null; }
    clearTimeout(dropTimer);
    try { if (ch) ch.close(); } catch (e) {}
    try { if (pc) pc.close(); } catch (e) {}
    pc = null; ch = null; payload = ""; quiz = null; duelWait = null; chessSide = "";
    try { window.__near.ready = false; } catch (e2) {}
    try { if (window.D) { D.nearSide = null; D.nearDuel = 0; } } catch (e) {}
  }
  function dropped() {
    if (dead) return;
    dead = true;
    if (scanStop) { scanStop(); scanStop = null; }
    try { if (pc) pc.close(); } catch (e) {}
    pc = null; ch = null;
    showDrop();
  }
  function watchPc() {
    pc.onconnectionstatechange = function () {
      var s = pc && pc.connectionState;
      if (s === "failed" || s === "closed") dropped();
      if (s === "disconnected") {
        clearTimeout(dropTimer);
        dropTimer = setTimeout(function () {
          if (pc && pc.connectionState === "disconnected") dropped();
        }, 3000);
      }
      if (s === "connected") clearTimeout(dropTimer);
    };
  }
  function wire(c) {
    ch = c;
    c.onopen = function () { if (scanStop) { scanStop(); scanStop = null; } window.__near.ready = true; showPicker(); };
    c.onclose = function () { dropped(); };
    c.onmessage = function (ev) {
      var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      onMsg(msg);
    };
  }
  function gather(conn) {
    if (conn.iceGatheringState === "complete") return Promise.resolve();
    return new Promise(function (res) {
      var t = setTimeout(res, 4000);
      conn.addEventListener("icegatheringstatechange", function () {
        if (conn.iceGatheringState === "complete") { clearTimeout(t); res(); }
      });
    });
  }

  async function hostGame() {
    hangup(); dead = false; role = "host";
    pc = new RTCPeerConnection({ iceServers: [] });
    watchPc();
    wire(pc.createDataChannel("play"));
    var offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await gather(pc);
    payload = encode(pc.localDescription.sdp);
    showCode("Show this code", "The other phone scans it, or types it. Then scan or type the answer they show.", payload, true);
  }
  async function beginJoin() {
    hangup(); dead = false; role = "guest";
    showScan("Scan their code", "Point the camera at their QR code, or type the code.");
  }
  async function accept(text) {
    var sdp;
    try { sdp = decode(text); } catch (e) { note("That code did not work. Check every character."); return; }
    try {
      if (role === "guest" && !pc) {
        pc = new RTCPeerConnection({ iceServers: [] });
        watchPc();
        pc.ondatachannel = function (ev) { wire(ev.channel); };
        await pc.setRemoteDescription({ type: "offer", sdp: sdp });
        var answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await gather(pc);
        payload = encode(pc.localDescription.sdp);
        if (scanStop) { scanStop(); scanStop = null; }
        showCode("Show your answer", "They scan this code, or type it, on the first phone.", payload, false);
        return;
      }
      if (role === "host" && pc && pc.signalingState !== "stable") {
        await pc.setRemoteDescription({ type: "answer", sdp: sdp });
        if (scanStop) { scanStop(); scanStop = null; }
        note("Answer received. Connecting…");
      }
    } catch (err) {
      window.__near.debug.err = String(err && err.message || err);
      note("Could not use that code. Try the QR picture again.");
    }
  }

  function onMsg(msg) {
    if (!msg || dead) return;
    if (msg.t === "pick") startGame(msg, false);
    else if (msg.t === "chess" && window.__nearChess) window.__nearChess.play(msg);
    else if (msg.t === "resign") {
      if (window.finishDuel && window.D && D.id === "chess" && !D.over) finishDuel(true, false);
      banner("They resigned. You win.");
    } else if (msg.t === "duelDone") {
      duelWait = duelWait || {};
      duelWait.remote = msg;
      showDuelCompare();
    } else if (msg.t === "quizAns") quizIncoming(msg);
    else if (msg.t === "quizGo") quizApply(msg);
    else if (msg.t === "bye") dropped();
  }

  function startGame(msg, local) {
    if (local) send(msg);
    if (msg.game === "chess") {
      chessSide = role === "host" ? "w" : "b";
      if (typeof startDuel === "function") startDuel("chess");
      if (window.__nearChess) __nearChess.arm(chessSide);
      hidePanel();
      showBar(chessSide === "w" ? "Nearby · You are White" : "Nearby · You are Black");
    } else if (msg.game === "duel") {
      if (typeof startDuel === "function") startDuel(msg.id);
      if (window.D) D.nearDuel = 1;
      duelWait = { id: msg.id, local: null, remote: null };
      hidePanel();
      showBar("Nearby · " + duelName(msg.id));
    } else if (msg.game === "quiz") {
      hideBar();
      openQuiz(msg.seed);
    }
  }
  function duelName(id) {
    for (var i = 0; i < DUEL_IDS.length; i++) if (DUEL_IDS[i][0] === id) return DUEL_IDS[i][1];
    return "Funny Duel";
  }

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function openQuiz(seed) {
    var rnd = mulberry(seed || 1);
    var bag = QUIZ.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
    }
    quiz = { qs: bag.slice(0, 5), n: 0, mine: 0, theirs: 0, pending: null, answered: false };
    renderQuiz();
  }
  function renderQuiz() {
    var q = quiz.qs[quiz.n];
    clear(root);
    root.appendChild(el("h1", "near-h", "Quiz race"));
    root.appendChild(el("p", "near-p", "Same questions on both phones. A correct answer scores. The faster one wins a tie."));
    root.appendChild(el("p", "near-score", "You " + quiz.mine + " · Them " + quiz.theirs + " · " + (quiz.n + 1) + " of " + quiz.qs.length));
    root.appendChild(el("p", "near-q", q.q));
    q.a.forEach(function (label, idx) {
      var b = el("button", "near-btn", label);
      b.style.minHeight = "48px";
      b.disabled = quiz.answered;
      b.onclick = function () { answerQuiz(idx); };
      root.appendChild(b);
    });
    root.appendChild(backBtn());
    root.hidden = false;
  }
  function answerQuiz(idx) {
    if (!quiz || quiz.answered) return;
    quiz.answered = true;
    var msg = { t: "quizAns", n: quiz.n, choice: idx, at: Date.now(), from: role };
    if (role === "host") quiz.pending = quiz.pending || {};
    if (role === "host") { quiz.pending.host = msg; maybeScore(); }
    else send(msg);
    note("Answer sent. Waiting for the other phone…");
  }
  function quizIncoming(msg) {
    if (!quiz || msg.n !== quiz.n) return;
    quiz.pending = quiz.pending || {};
    quiz.pending[msg.from === "host" ? "host" : "guest"] = msg;
    if (role === "host") maybeScore();
  }
  function maybeScore() {
    if (role !== "host" || !quiz) return;
    var p = quiz.pending || {};
    if (!p.host) return;
    if (!p.guest) {
      clearTimeout(quiz.timer);
      quiz.timer = setTimeout(function () { if (quiz && quiz.pending && quiz.pending.host && !quiz.pending.guest) finishQ(); }, 8000);
      return;
    }
    finishQ();
  }
  function finishQ() {
    if (!quiz) return;
    clearTimeout(quiz.timer);
    var q = quiz.qs[quiz.n];
    var p = quiz.pending || {};
    var hOk = p.host && p.host.choice === q.i;
    var gOk = p.guest && p.guest.choice === q.i;
    var winner = "none";
    if (hOk && gOk) winner = p.host.at <= p.guest.at ? "host" : "guest";
    else if (hOk) winner = "host";
    else if (gOk) winner = "guest";
    if (winner === "host") quiz.mine += role === "host" ? 1 : 0, quiz.theirs += role === "host" ? 0 : 1;
    if (winner === "guest") quiz.theirs += role === "host" ? 1 : 0, quiz.mine += role === "host" ? 0 : 1;
    var next = { t: "quizGo", n: quiz.n, winner: winner, host: quiz.mine, guest: quiz.theirs };
    /* host stores scores from its own point of view in the message as host/guest totals */
    next.hostScore = (winner === "host" ? 1 : 0) + (quiz._hs || 0);
    next.guestScore = (winner === "guest" ? 1 : 0) + (quiz._gs || 0);
    quiz._hs = next.hostScore; quiz._gs = next.guestScore;
    send(next);
    quizApply(next);
  }
  function quizApply(msg) {
    if (!quiz) return;
    quiz.mine = role === "host" ? msg.hostScore : msg.guestScore;
    quiz.theirs = role === "host" ? msg.guestScore : msg.hostScore;
    quiz.n = msg.n + 1;
    quiz.answered = false;
    quiz.pending = {};
    if (quiz.n >= quiz.qs.length) {
      clear(root);
      root.appendChild(el("h1", "near-h", quiz.mine === quiz.theirs ? "Quiz tied" : quiz.mine > quiz.theirs ? "You won the race" : "They won the race"));
      root.appendChild(el("p", "near-score", "You " + quiz.mine + " · Them " + quiz.theirs));
      root.appendChild(backBtn());
      root.hidden = false;
      quiz = null;
      return;
    }
    renderQuiz();
  }

  function showDuelCompare() {
    if (!duelWait || !duelWait.local || !duelWait.remote) return;
    var me = duelWait.local.me, them = duelWait.remote.me;
    var title = me === them ? "Duel tied" : me > them ? "You won the duel" : "They won the duel";
    banner(title + " · You " + me + " · Them " + them);
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function note(text) {
    var n = root && root.querySelector(".near-note");
    if (n) n.textContent = text;
  }
  function backBtn() {
    var b = el("button", "near-btn near-ghost", "Back");
    b.onclick = function () { send({ t: "bye" }); hangup(); closeAll(); if (typeof setScene === "function") setScene("modes"); };
    return b;
  }
  function field(placeholder) {
    var t = el("textarea", "near-code");
    t.placeholder = placeholder;
    t.setAttribute("autocomplete", "off");
    t.setAttribute("autocapitalize", "off");
    t.setAttribute("spellcheck", "false");
    return t;
  }
  function showCode(title, help, code, canScanAnswer) {
    clear(root);
    root.appendChild(el("h1", "near-h", "Nearby (same Wi-Fi)"));
    root.appendChild(el("p", "near-p", title));
    root.appendChild(el("p", "near-p", help));
    var canvas = el("canvas", "near-qr");
    drawQR(canvas, code);
    root.appendChild(canvas);
    var box = el("p", "near-mono", pretty(code));
    box.id = "near-offer";
    root.appendChild(box);
    root.appendChild(el("p", "near-note", "Waiting for the other phone…"));
    var typed = field("Type their code");
    root.appendChild(typed);
    var go = el("button", "near-btn", "Use typed code");
    go.onclick = function () { accept(typed.value); };
    root.appendChild(go);
    if (canScanAnswer) {
      var scan = el("button", "near-btn near-ghost", "Scan their answer");
      scan.onclick = function () { startCamera(function (text) { accept(text); }); };
      root.appendChild(scan);
    }
    root.appendChild(backBtn());
    root.hidden = false;
    window.__near.debug = { code: code, role: role };
  }
  function showScan(title, help) {
    clear(root);
    root.appendChild(el("h1", "near-h", "Nearby (same Wi-Fi)"));
    root.appendChild(el("p", "near-p", title));
    root.appendChild(el("p", "near-p", help));
    var video = el("video", "near-video");
    video.setAttribute("playsinline", "true");
    video.muted = true;
    root.appendChild(video);
    root.appendChild(el("p", "near-note", "Camera starting…"));
    var typed = field("Type their code");
    root.appendChild(typed);
    var go = el("button", "near-btn", "Use typed code");
    go.onclick = function () { accept(typed.value); };
    root.appendChild(go);
    root.appendChild(backBtn());
    root.hidden = false;
    startCamera(function (text) { accept(text); }, video);
  }
  function startCamera(onCode, videoEl) {
    if (scanStop) scanStop();
    var video = videoEl || $("near-video") || document.querySelector(".near-video");
    if (!video) return;
    var canvas = document.createElement("canvas");
    var g = canvas.getContext("2d", { willReadFrequently: true });
    var running = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then(function (stream) {
      video.srcObject = stream;
      video.play();
      scanStop = function () {
        running = false;
        stream.getTracks().forEach(function (t) { t.stop(); });
      };
      var loop = function () {
        if (!running) return;
        if (video.videoWidth) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          g.drawImage(video, 0, 0);
          var img = g.getImageData(0, 0, canvas.width, canvas.height);
          var hit = window.jsQR && jsQR(img.data, img.width, img.height);
          if (hit && hit.data) { onCode(hit.data); return; }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }).catch(function () {
      note("Camera is off. Type the code instead.");
    });
  }
  function showPicker() {
    window.__near.ready = true;
    if (scanStop) { scanStop(); scanStop = null; }
    clear(root);
    root.appendChild(el("h1", "near-h", "Nearby (same Wi-Fi)"));
    root.appendChild(el("p", "near-p", "Connected on this Wi-Fi. Pick a game. Either phone can start it."));
    var chess = el("button", "near-btn", "Chess");
    chess.onclick = function () { startGame({ t: "pick", game: "chess" }, true); };
    root.appendChild(chess);
    DUEL_IDS.forEach(function (d) {
      var b = el("button", "near-btn", "Funny Duel · " + d[1]);
      b.onclick = function () { startGame({ t: "pick", game: "duel", id: d[0] }, true); };
      root.appendChild(b);
    });
    var quizBtn = el("button", "near-btn", "Quiz race");
    quizBtn.onclick = function () { startGame({ t: "pick", game: "quiz", seed: (Date.now() ^ (Math.random() * 1e9 | 0)) >>> 0 }, true); };
    root.appendChild(quizBtn);
    root.appendChild(backBtn());
    root.hidden = false;
    hideBar();
  }
  function showDrop() {
    clear(root);
    root.appendChild(el("h1", "near-h", "Phone dropped off"));
    root.appendChild(el("p", "near-p", "The other phone left this Wi-Fi, or the connection closed. Your game on this phone has stopped. You can start Nearby again."));
    var b = el("button", "near-btn", "Back to Nearby");
    b.onclick = function () { hangup(); openHome(); };
    root.appendChild(b);
    root.hidden = false;
    hideBar();
  }
  function showBar(text) {
    bar.hidden = false;
    bar.textContent = "";
    bar.appendChild(el("span", "near-bar-label", text));
    var leave = el("button", "near-mini", "Leave");
    leave.onclick = function () {
      send({ t: "bye" });
      hangup();
      closeAll();
      if (typeof setScene === "function") setScene("modes");
    };
    var resign = el("button", "near-mini", "Resign");
    resign.onclick = function () {
      send({ t: "resign" });
      if (window.finishDuel && window.D && D.id === "chess" && !D.over) finishDuel(false, false);
      banner("You resigned.");
    };
    if (chessSide) bar.appendChild(resign);
    bar.appendChild(leave);
  }
  function hideBar() { if (bar) bar.hidden = true; chessSide = ""; }
  function hidePanel() { root.hidden = true; }
  function closeAll() { root.hidden = true; hideBar(); }
  function banner(text) {
    var old = $("near-banner");
    if (old) old.remove();
    var n = el("div", "near-banner", text);
    n.id = "near-banner";
    document.body.appendChild(n);
  }
  function openHome() {
    clear(root);
    root.appendChild(el("h1", "near-h", "Nearby (same Wi-Fi)"));
    root.appendChild(el("p", "near-p", "Two phones on the same Wi-Fi. One shows a code. The other scans it, then shows an answer code for the first phone to scan. Nothing is sent to a server."));
    var host = el("button", "near-btn", "Host a game");
    host.onclick = function () { hostGame().catch(function () { note("Could not start. Try again."); }); };
    var join = el("button", "near-btn", "Join a game");
    join.onclick = function () { beginJoin(); };
    root.appendChild(host);
    root.appendChild(join);
    root.appendChild(backBtn());
    root.hidden = false;
    hideBar();
  }

  function install() {
    var style = document.createElement("style");
    style.textContent = [
      "#nearRoot{position:fixed;inset:0;z-index:40;background:#F2F6F0;color:#10213f;overflow:auto;box-sizing:border-box;padding:22px 16px 28px;font-family:Nunito,Atkinson Hyperlegible,sans-serif}",
      "#nearRoot *{box-sizing:border-box}",
      "#nearRoot input,#nearRoot textarea{user-select:text;-webkit-user-select:text;touch-action:auto}",
      ".near-h{font-size:28px;margin:8px 0 8px;text-align:center}",
      ".near-p{font-size:16px;line-height:1.4;margin:0 0 12px;text-align:center}",
      ".near-q{font-size:22px;font-weight:700;text-align:center;margin:12px 0}",
      ".near-score{text-align:center;font-weight:700;color:#1B4F3C}",
      ".near-note{text-align:center;min-height:1.2em}",
      ".near-btn{display:block;width:100%;min-height:48px;margin:8px 0;border-radius:14px;border:2px solid #2B3550;background:#1B4F3C;color:#fff;font:700 18px Nunito,sans-serif}",
      ".near-ghost{background:#fff;color:#10213f}",
      ".near-qr{display:block;margin:8px auto;background:#fff;border-radius:12px;max-width:100%}",
      ".near-mono{font:14px/1.45 ui-monospace,monospace;background:#fff;border:2px solid #E6E0D8;border-radius:12px;padding:10px;word-break:break-all;user-select:text;-webkit-user-select:text}",
      ".near-code{width:100%;min-height:72px;font:16px/1.4 ui-monospace,monospace;border:2px solid #2B3550;border-radius:12px;padding:8px}",
      ".near-video{width:100%;max-height:240px;background:#1B2438;border-radius:12px}",
      "#nearBar{position:fixed;left:8px;right:8px;top:8px;z-index:45;display:flex;gap:8px;align-items:center;background:#10213f;color:#fff;border-radius:14px;padding:8px 10px;font:700 14px Nunito,sans-serif}",
      ".near-bar-label{flex:1}",
      ".near-mini{min-height:44px;min-width:72px;border-radius:10px;border:0;background:#1B4F3C;color:#fff;font:700 14px Nunito,sans-serif}",
      ".near-banner{position:fixed;left:16px;right:16px;bottom:96px;z-index:46;background:#fff;color:#10213f;border:2px solid #2B3550;border-radius:16px;padding:14px;text-align:center;font:700 16px Nunito,sans-serif}"
    ].join("");
    document.head.appendChild(style);
    root = el("div");
    root.id = "nearRoot";
    root.hidden = true;
    root.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    document.body.appendChild(root);
    bar = el("div");
    bar.id = "nearBar";
    bar.hidden = true;
    document.body.appendChild(bar);
    if (typeof setScene === "function") {
      var prev = setScene;
      window.setScene = function (name) {
        if (name === "nearby") { openHome(); return prev("modes"); }
        if (name !== "duel") closeAll();
        return prev(name);
      };
    }
    var add = function () {
      if (typeof MODES === "undefined" || MODES.some(function (m) { return m.id === "nearby"; })) return;
      MODES.push({
        id: "nearby",
        n: "Nearby (same Wi-Fi)",
        d: "Two phones on this Wi-Fi. Chess, Funny Duels, and a quiz race.",
        c: ["#E7F3EC", "#1B4F3C"],
        scene: "nearby"
      });
    };
    add();
    window.addEventListener("load", add);
  }

  window.__near = {
    onChess: function (move) { if (!chessSide) return; send({ t: "chess", from: move.from, to: move.to, promo: move.promo || null }); },
    onDuelEnd: function (info) {
      duelWait = duelWait || { id: info.id };
      duelWait.local = info;
      send({ t: "duelDone", id: info.id, me: info.me, win: info.win, draw: info.draw });
      showDuelCompare();
    },
    debug: {},
    ready: false,
    ingest: function (text) { return accept(text); },
    host: hostGame,
    join: beginJoin,
    qr: function (canvas, text) { return drawQR(canvas, text); },
    encode: encode,
    decode: decode
  };

  if (document.body) install();
  else document.addEventListener("DOMContentLoaded", install);
})();
