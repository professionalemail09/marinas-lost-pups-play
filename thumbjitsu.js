/* Thumbjitsu. Local only. Two hands each, five fingers, two feet.
   One phone: each player owns one half and two touches (one per hand).
   Versus Kenai (easy) or Bear (normal / hard). No network. */
(function () {
  if (typeof window === "undefined") return;

  var HAND = 0.16;
  var PALM_R = 0.50 * HAND;
  var TIP_R = 0.040;
  var FOOT_SOLE = 0.066;
  var FOOT_CORE = 0.028;
  var PLANS = ["thumb", "grab", "block", "cover", "double", "step", "feint", "pry"];
  var TIPS = {
    thumb: { x: -0.52, y: -0.08 },
    index: { x: -0.30, y: -0.88 },
    middle: { x: -0.02, y: -1.02 },
    ring: { x: 0.26, y: -0.92 },
    pinky: { x: 0.50, y: -0.70 }
  };
  var TIP_NAMES = ["thumb", "index", "middle", "ring", "pinky"];
  var DIFF = {
    easy: { speed: 0.48, err: 0.05, escape: 0.28, windup: 0.34, name: "Kenai" },
    normal: { speed: 0.66, err: 0.026, escape: 0.62, windup: 0.16, name: "Bear" },
    hard: { speed: 0.88, err: 0.01, escape: 0.86, windup: 0, name: "Bear" }
  };

  var canvas, ctx, raf = 0, on = false, lastT = 0;
  var phase = "menu";
  var buttons = [];
  var pointers = {};
  var G = null;
  var msg = { who: "Bear", text: "Two hands. Pin a thumb, or take both feet." };
  var lastSay = 0;
  var view = { w: 390, h: 844, u: 300, ox: 0, oy: 0, hud: 120, side: 0, land: false, arena: { x: 0, y: 0, w: 1, h: 1 } };

  function raw(fn) {
    var M = window.MLP;
    if (M) M.raw = (M.raw | 0) + 1;
    try { return fn(); } finally { if (M) M.raw--; }
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }
  function rot(x, y, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: x * c - y * s, y: x * s + y * c };
  }
  function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function X(nx) { return view.ox + nx * view.u; }
  function Y(ny) { return view.oy + ny * view.u; }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  function say(who, text, force) {
    var now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (!force && now - lastSay < 850) return;
    lastSay = now;
    msg = { who: who, text: text };
    var live = document.getElementById("mlp-live");
    if (live) live.textContent = who + ". " + text;
  }
  function sound(name) {
    try { if (window.MLPAudio) { MLPAudio.unlock(); MLPAudio.play(name); } } catch (e) {}
  }
  function vibe(pat) {
    try { if (navigator.vibrate) navigator.vibrate(pat); } catch (e) {}
  }
  function tipWorld(hand, name) {
    var t = TIPS[name];
    var p = rot(t.x * HAND, t.y * HAND, hand.ang);
    return { x: hand.x + p.x, y: hand.y + p.y };
  }
  function allTips(hand) {
    var o = {};
    for (var i = 0; i < TIP_NAMES.length; i++) o[TIP_NAMES[i]] = tipWorld(hand, TIP_NAMES[i]);
    return o;
  }
  function closestTip(tips, pt) {
    var best = "thumb", bd = 1e9, i, d;
    for (i = 0; i < TIP_NAMES.length; i++) {
      d = hypot(tips[TIP_NAMES[i]].x - pt.x, tips[TIP_NAMES[i]].y - pt.y);
      if (d < bd) { bd = d; best = TIP_NAMES[i]; }
    }
    return best;
  }
  function makeHand(x, y, ang) {
    return {
      x: x, y: y, vx: 0, vy: 0, ang: ang, tx: x, ty: y, aiming: false, pointer: null,
      stam: 100, stun: 0, charge: 0, chargeKey: "", need: 1, pending: null,
      wiggle: false, px: 0, py: 0, psp: 0, peak: 0, blockT: 0, finger: "thumb"
    };
  }
  function makeFoot(x, y) {
    return { x: x, y: y, tx: x, ty: y, charge: 0, chargeKey: "", need: 1, pending: null };
  }
  function makePlayer(name) {
    return {
      name: name,
      score: 0,
      hands: [makeHand(0.32, 0.78, -0.2), makeHand(0.68, 0.78, 0.2)],
      feet: [makeFoot(0.30, 0.90), makeFoot(0.70, 0.90)]
    };
  }
  function layoutHands(p, side) {
    var y = side === 0 ? 0.80 : 0.20;
    var fy = side === 0 ? 0.91 : 0.09;
    var ang = side === 0 ? 0 : Math.PI;
    var leftX = side === 0 ? 0.30 : 0.70;
    var rightX = side === 0 ? 0.70 : 0.30;
    p.hands[0].x = p.hands[0].tx = leftX;
    p.hands[0].y = p.hands[0].ty = y;
    p.hands[0].ang = ang;
    p.hands[1].x = p.hands[1].tx = rightX;
    p.hands[1].y = p.hands[1].ty = y;
    p.hands[1].ang = ang;
    p.feet[0].x = p.feet[0].tx = side === 0 ? 0.28 : 0.72;
    p.feet[0].y = p.feet[0].ty = fy;
    p.feet[1].x = p.feet[1].tx = side === 0 ? 0.72 : 0.28;
    p.feet[1].y = p.feet[1].ty = fy;
    for (var i = 0; i < 2; i++) {
      p.hands[i].vx = p.hands[i].vy = 0;
      p.hands[i].stam = 100;
      p.hands[i].stun = 0;
      p.hands[i].charge = 0;
      p.hands[i].pointer = null;
      p.hands[i].aiming = false;
      p.feet[i].charge = 0;
    }
  }

  function seedRand() {
    G.seed = (G.seed * 16807 + 11) % 2147483647;
    return (G.seed % 10000) / 10000;
  }

  function beginRound() {
    G.time = G.roundLen;
    G.control = 0;
    G.holds = [];
    G.bonus = 0;
    G.winner = null;
    G.reason = "";
    G.both = [0, 0];
    pointers = {};
    G.players.forEach(function (p, i) { p.score = 0; layoutHands(p, i); });
    if (G.ai) {
      G.ai.deck = PLANS.slice();
      G.ai.t = 0;
      G.ai.plan = "thumb";
      G.ai.wind = 0;
      G.ai.bite = 0;
    }
    phase = "count";
    G.count = G.countLen;
    say("Kenai", "Round " + G.round + ". Hands up.", true);
  }

  function start(mode, opts) {
    opts = opts || {};
    var ai = mode !== "2p";
    var diff = DIFF[mode] || DIFF.normal;
    G = {
      mode: mode,
      roundLen: opts.round || 50,
      countLen: opts.count == null ? 3 : opts.count,
      banner: opts.banner == null ? 2.1 : opts.banner,
      script: !!opts.script,
      round: 1,
      wins: [0, 0],
      control: 0,
      time: opts.round || 50,
      holds: [],
      both: [0, 0],
      bonus: 0,
      winner: null,
      reason: "",
      seed: 42,
      count: 3,
      flash: "",
      flashT: 0,
      players: [
        makePlayer(ai ? "You" : "Player 1"),
        makePlayer(ai ? diff.name : "Player 2")
      ],
      diff: ai ? diff : null,
      ai: ai && !opts.script ? { plan: "thumb", t: 0, seen: {}, deck: PLANS.slice(), wind: 0, bite: 0 } : null
    };
    G.players.forEach(function (p, i) { layoutHands(p, i); });
    if (opts.skip) {
      phase = "fight";
      G.time = G.roundLen;
      say(ai ? "Bear" : "Kenai", ai ? diff.name + " takes the far side." : "Flat on the table. Two hands each.", true);
    } else beginRound();
    on = true;
    if (canvas) {
      canvas.style.display = "block";
      resize();
      if (!raf) raf = requestAnimationFrame(frame);
    }
  }

  function endRound(reason, winner) {
    if (phase !== "fight") return;
    if (winner == null) {
      var bonus = Math.round(Math.abs(G.control) * 8);
      G.bonus = bonus;
      if (bonus) G.players[G.control >= 0 ? 0 : 1].score += bonus;
      if (G.players[0].score > G.players[1].score) winner = 0;
      else if (G.players[1].score > G.players[0].score) winner = 1;
      else winner = G.control === 0 ? -1 : (G.control > 0 ? 0 : 1);
    } else G.bonus = 0;
    G.winner = winner;
    G.reason = reason;
    if (winner >= 0) G.wins[winner]++;
    phase = "round";
    G.roundT = G.banner;
    pointers = {};
    G.players.forEach(function (p) { p.hands.forEach(function (h) { h.pointer = null; h.aiming = false; }); });
    if (reason === "feet") say("Bear", "BOTH FEET. Round's over. Sit down.", true);
    else if (winner < 0) say("Kenai", "Even hands. One more.", true);
    else if (winner === 0) say("Bear", G.players[1].name + " got sat on.", true);
    else say("Bear", "That's on you. Pinned, planted, done.", true);
    sound(reason === "feet" || winner === 0 ? "win" : "lose");
    vibe(reason === "feet" ? [24, 36, 24, 36, 40] : 28);
  }

  function advance() {
    if (G.wins[0] >= 2 || G.wins[1] >= 2 || G.round >= 3) {
      phase = "match";
      var top = G.wins[0] === G.wins[1] ? -1 : (G.wins[0] > G.wins[1] ? 0 : 1);
      G.winner = top;
      if (top < 0) say("Kenai", "Split match. Run it back.", true);
      else if (top === 0) say("Bear", "That's the match. They can clap.", true);
      else say("Bear", "Match over. You lost the hand.", true);
      sound(top === 0 ? "win" : "lose");
      return;
    }
    G.round++;
    beginRound();
  }

  function multOf(h) {
    if (h.kind === "thumb") return 1 + Math.min(3, h.t * 0.85);
    if (h.kind === "cover") {
      var m = 1 + Math.min(2, h.t * 0.6);
      return h.finger === "pinky" ? m * 1.25 : m;
    }
    var g = 1 + Math.min(0.7, h.t * 0.25);
    return h.finger === "middle" ? g * 1.35 : g;
  }

  function seek(hand, x, y, speed, dt) {
    var dx = x - hand.x, dy = y - hand.y;
    var d = hypot(dx, dy) || 1;
    var cap = speed * (hand.stam > 8 ? 1 : 0.38);
    var vx = (dx / d) * Math.min(cap, d * 5);
    var vy = (dy / d) * Math.min(cap, d * 5);
    hand.vx += (vx - hand.vx) * Math.min(1, dt * 7);
    hand.vy += (vy - hand.vy) * Math.min(1, dt * 7);
    hand.x += hand.vx * dt;
    hand.y += hand.vy * dt;
  }

  function face(hand, target, dt) {
    hand.ang += angDiff(target, hand.ang) * Math.min(1, dt * 8);
  }

  function palmFor(name, ang, world) {
    var t = TIPS[name];
    var p = rot(t.x * HAND, t.y * HAND, ang);
    return { x: world.x - p.x, y: world.y - p.y };
  }

  function aiThink(dt) {
    var ai = G.ai;
    if (!ai || G.script) return;
    var diff = G.diff;
    if (ai.bite > 0) ai.bite -= dt;
    ai.t -= dt;
    if (ai.t <= 0) {
      if (!ai.deck.length) ai.deck = PLANS.slice();
      ai.plan = ai.deck.shift();
      ai.seen[ai.plan] = (ai.seen[ai.plan] || 0) + 1;
      ai.t = 0.85;
      ai.wind = diff.windup;
      if (ai.plan === "cover") say("Bear", "Eyes on a foot.");
      else if (ai.plan === "double") say("Bear", "Both feet. Don't let them sit.");
      else if (ai.plan === "feint") say("Kenai", "That's a feint. Don't bite.");
      else if (ai.plan === "thumb") say("Bear", "Thumb coming in.");
    }
    if (ai.wind > 0) { ai.wind -= dt; return; }
    var opp = G.players[0];
    var me = G.players[1];
    var err = function () { return (seedRand() - 0.5) * diff.err * 2; };
    var ang = Math.PI;
    var plan = ai.bite > 0 ? "feint" : ai.plan;
    var held = G.holds.some(function (h) { return h.victim === 1 && h.kind !== "cover"; });
    if (held && seedRand() < diff.escape) plan = "pry";

    function aimHand(hi, finger, point) {
      var h = me.hands[hi];
      var want = Math.atan2(point.y - h.y, point.x - h.x);
      var local = Math.atan2(TIPS[finger].y, TIPS[finger].x);
      var a = want - local;
      var palm = palmFor(finger, a, { x: point.x + err(), y: point.y + err() });
      seek(h, clamp(palm.x, 0.06, 0.94), clamp(palm.y, 0.06, 0.94), diff.speed, dt);
      face(h, a, dt);
      h.finger = finger;
    }

    if (plan === "thumb") {
      aimHand(0, "thumb", tipWorld(opp.hands[0], "thumb"));
      aimHand(1, "grab" === plan ? "middle" : "index", tipWorld(opp.hands[1], "index"));
    } else if (plan === "grab") {
      aimHand(0, "middle", tipWorld(opp.hands[0], "index"));
      aimHand(1, "middle", tipWorld(opp.hands[1], "middle"));
    } else if (plan === "block") {
      var fast = opp.hands[0];
      if (hypot(opp.hands[1].vx, opp.hands[1].vy) > hypot(fast.vx, fast.vy)) fast = opp.hands[1];
      var ft = allTips(fast);
      var lead = closestTip(ft, me.hands[0]);
      aimHand(0, "ring", ft[lead]);
      aimHand(1, "ring", tipWorld(opp.hands[1], "thumb"));
    } else if (plan === "cover") {
      aimHand(0, "pinky", opp.feet[0]);
      aimHand(1, "index", tipWorld(opp.hands[0], "thumb"));
      me.feet[0].tx = opp.feet[1].x;
      me.feet[0].ty = opp.feet[1].y;
    } else if (plan === "double") {
      aimHand(0, "pinky", opp.feet[0]);
      aimHand(1, "pinky", opp.feet[1]);
      me.feet[0].tx = opp.feet[0].x + 0.02;
      me.feet[0].ty = opp.feet[0].y;
      me.feet[1].tx = opp.feet[1].x - 0.02;
      me.feet[1].ty = opp.feet[1].y;
    } else if (plan === "step") {
      me.feet[0].tx = clamp(opp.feet[0].x + err(), 0.08, 0.92);
      me.feet[0].ty = clamp(opp.feet[0].y + 0.05, 0.08, 0.92);
      me.feet[1].tx = clamp(me.feet[1].x + 0.1, 0.08, 0.92);
      me.feet[1].ty = 0.16;
      aimHand(1, "thumb", tipWorld(opp.hands[1], "thumb"));
      aimHand(0, "ring", tipWorld(opp.hands[0], "thumb"));
    } else if (plan === "feint") {
      var th = tipWorld(opp.hands[0], "thumb");
      aimHand(0, "thumb", { x: th.x + 0.12, y: th.y + 0.08 });
      aimHand(1, "index", tipWorld(opp.hands[1], "thumb"));
    } else if (plan === "pry") {
      aimHand(0, "index", tipWorld(opp.hands[0], "thumb"));
      aimHand(1, "index", tipWorld(opp.hands[1], "thumb"));
      if (held) {
        me.hands.forEach(function (h) {
          if (seedRand() < diff.escape) { h.vx *= -1; h.vy *= -1; h.wiggle = true; }
        });
      }
    }
    me.feet.forEach(function (f) {
      var dx = f.tx - f.x, dy = f.ty - f.y;
      var step = Math.min(1, dt * diff.speed * 1.4);
      f.x += dx * step;
      f.y += dy * step;
    });
    me.hands.forEach(function (h) {
      var sp = hypot(h.vx, h.vy);
      if (sp > 0.08) {
        var local = Math.atan2(TIPS[h.finger || "thumb"].y, TIPS[h.finger || "thumb"].x);
        face(h, Math.atan2(h.vy, h.vx) - local, dt);
      }
    });
  }

  function humanMove(dt) {
    G.players.forEach(function (p, pi) {
      if (G.ai && pi === 1) return;
      p.hands.forEach(function (h) {
        if (h.aiming) seek(h, h.tx, h.ty, h.stam > 8 ? 1.25 : 0.42, dt);
        else {
          h.vx *= Math.pow(0.04, dt);
          h.vy *= Math.pow(0.04, dt);
          h.x += h.vx * dt;
          h.y += h.vy * dt;
        }
        var sp = hypot(h.vx, h.vy);
        var locked = h.charge > 0 || G.holds.some(function (hd) { return hd.by === pi && hd.hand === p.hands.indexOf(h); });
        if (sp > 0.25 && !locked) face(h, Math.atan2(h.vy, h.vx) + Math.PI / 2, dt);
      });
    });
  }

  function guideFeet(dt) {
    G.players.forEach(function (p, pi) {
      if (G.ai && pi === 1) return;
      p.hands.forEach(function (h) {
        if (!h.aiming || hypot(h.vx, h.vy) > 0.45) return;
        p.feet.forEach(function (f) {
          if (hypot(h.x - f.x, h.y - f.y) < FOOT_SOLE + 0.02) {
            f.x += (h.x - f.x) * Math.min(1, dt * 4.2);
            f.y += (h.y - f.y) * Math.min(1, dt * 4.2);
          }
        });
      });
    });
  }

  function noteWiggle() {
    G.players.forEach(function (p) {
      p.hands.forEach(function (h) {
        var sp = hypot(h.vx, h.vy);
        var dot = h.vx * h.px + h.vy * h.py;
        if (sp > 0.22 && h.psp > 0.22 && dot < -0.02) h.wiggle = true;
        if (sp > h.peak) h.peak = sp;
        if (h.peak > 0.9 && sp < 0.22) {
          var near = false, opp = G.players[0] === p ? G.players[1] : G.players[0];
          opp.hands.forEach(function (e) {
            var t = tipWorld(e, "thumb");
            var d = hypot(tipWorld(h, "thumb").x - t.x, tipWorld(h, "thumb").y - t.y);
            if (d > 0.045 && d < 0.14) near = true;
          });
          if (near) {
            G.flash = "FEINT";
            G.flashT = 0.7;
            say("Kenai", "Feint. Don't chase it.");
            sound("key");
            if (G.ai && p === G.players[0] && G.diff && G.diff.windup > 0) G.ai.bite = 0.4;
            h.peak = 0;
          }
        }
        if (sp > 0.4) h.peak *= 0.5;
        h.px = h.vx; h.py = h.vy; h.psp = sp;
      });
    });
  }

  function holdKey(h) {
    if (h.kind === "cover") return "cover:" + h.victim + ":" + h.vfoot;
    return h.kind + ":" + h.victim + ":" + h.vhand;
  }
  function hasHold(key) {
    return G.holds.some(function (h) { return holdKey(h) === key; });
  }

  function addHold(spec) {
    if (hasHold(spec.kind === "cover" ? "cover:" + spec.victim + ":" + spec.vfoot : spec.kind + ":" + spec.victim + ":" + spec.vhand)) return;
    spec.t = spec.t || 0;
    spec.mult = spec.mult || 1;
    spec.ring = spec.ring == null ? Math.random() * 0.3 : spec.ring;
    spec.x = spec.x || 0;
    spec.y = spec.y || 0;
    G.holds.push(spec);
    if (spec.kind === "thumb") { say("Bear", "Thumb's pinned. Sit in it.", true); sound("buzzIn"); vibe(18); }
    else if (spec.kind === "grab") { say("Kenai", spec.finger === "middle" ? "Middle finger has the grip." : "That's a grab. Wiggle on green."); sound("flip"); vibe(12); }
    else { say("Bear", spec.finger === "pinky" ? "Pinky has the foot." : "One foot is covered."); sound("bark"); vibe(16); }
  }

  function pryHold(h) {
    say("Kenai", "Index pried it open.", true);
    sound("right");
    vibe([10, 28, 12]);
    if (h.kind !== "thumb") return null;
    return {
      kind: "thumb", by: h.victim, hand: h.vhand, finger: "thumb",
      victim: h.by, vhand: h.hand, vfinger: "thumb", vfoot: null, t: 0.55, ring: 0.2,
      x: h.x, y: h.y, mult: 1.4
    };
  }

  function updateHolds(dt) {
    var keep = [];
    var extra = [];
    G.holds.forEach(function (h) {
      var by = G.players[h.by];
      var victim = G.players[h.victim];
      var alive = true;
      if (h.kind === "thumb" || h.kind === "grab") {
        var hand = by.hands[h.hand];
        var other = victim.hands[h.vhand];
        if (!hand || !other || hand.stam <= 0) alive = false;
        else {
          var a = tipWorld(hand, h.kind === "thumb" ? "thumb" : (h.finger || "middle"));
          var b = tipWorld(other, h.kind === "thumb" ? "thumb" : (h.vfinger || "index"));
          if (hypot(a.x - b.x, a.y - b.y) > 0.07) alive = false;
          h.x = (a.x + b.x) / 2; h.y = (a.y + b.y) / 2;
          var ringHand = other;
          var idx = tipWorld(other, "index");
          var wide = hypot(idx.x - h.x, idx.y - h.y) < 0.075;
          h.ring = (h.ring + dt / 0.9) % 1;
          var win0 = wide ? 0.56 : 0.64, win1 = wide ? 0.84 : 0.78;
          if (ringHand.wiggle) {
            if (h.ring >= win0 && h.ring <= win1) { var rev = pryHold(h); if (rev) extra.push(rev); return; }
            ringHand.stam = Math.max(0, ringHand.stam - 8);
            h.ring = 0;
            vibe(8);
          }
        }
      } else {
        var foot = victim.feet[h.vfoot];
        if (!foot) alive = false;
        else if (h.foot != null) {
          var mine = by.feet[h.foot];
          if (hypot(mine.x - foot.x, mine.y - foot.y) + FOOT_CORE > FOOT_SOLE + 0.004) alive = false;
          h.x = foot.x; h.y = foot.y;
        } else {
          var handC = by.hands[h.hand];
          if (!handC || hypot(handC.x - foot.x, handC.y - foot.y) + FOOT_CORE > PALM_R + 0.004) alive = false;
          h.x = foot.x; h.y = foot.y;
        }
        if (alive) {
          h.ring = (h.ring + dt / 0.9) % 1;
          var shaker = victim.hands[0];
          if (hypot(victim.hands[1].x - foot.x, victim.hands[1].y - foot.y) < hypot(shaker.x - foot.x, shaker.y - foot.y)) shaker = victim.hands[1];
          if (shaker.wiggle) {
            if (h.ring >= 0.64 && h.ring <= 0.78) { var revF = pryHold(h); if (revF) extra.push(revF); return; }
            shaker.stam = Math.max(0, shaker.stam - 8);
            h.ring = 0;
          }
        }
      }
      if (!alive) return;
      h.t += dt;
      h.mult = multOf(h);
      var base = h.kind === "thumb" ? 3.4 : h.kind === "cover" ? 2.3 : 1.25;
      by.score += base * h.mult * dt;
      G.control = clamp(G.control + (h.by === 0 ? 1 : -1) * dt * 0.18 * Math.min(h.mult, 3), -1, 1);
      if (h.hand != null && by.hands[h.hand]) by.hands[h.hand].stam = Math.max(0, by.hands[h.hand].stam - 4 * dt);
      keep.push(h);
    });
    G.holds = keep.concat(extra);
    [0, 1].forEach(function (by) {
      var s = [false, false];
      G.holds.forEach(function (h) {
        if (h.kind === "cover" && h.by === by && h.vfoot != null) s[h.vfoot] = true;
      });
      if (s[0] && s[1]) endRound("feet", by);
    });
  }

  function charge(obj, key, need, pending, dt) {
    if (obj.chargeKey === key) obj.charge += dt;
    else { obj.chargeKey = key; obj.charge = dt; }
    obj.need = need;
    obj.pending = pending;
    if (obj.charge >= need) {
      obj.charge = 0;
      obj.chargeKey = "";
      addHold(pending);
    }
  }

  function consider(dt) {
    if (phase !== "fight") return;
    G.players.forEach(function (p, pi) {
      var opp = G.players[1 - pi];
      p.hands.forEach(function (h, hi) {
        if (h.stun > 0) { h.stun -= dt; h.charge = 0; return; }
        if (h.blockT > 0) h.blockT -= dt;
        var tips = allTips(h);
        var best = null;
        function offer(pri, key, need, spec) {
          if (!best || pri > best.pri) best = { pri: pri, key: key, need: need, spec: spec };
        }
        opp.feet.forEach(function (f, fi) {
          if (hypot(h.x - f.x, h.y - f.y) + FOOT_CORE <= PALM_R) {
            var pinky = closestTip(tips, f) === "pinky";
            offer(4, "cover:" + (1 - pi) + ":" + fi, pinky ? 0.32 : 0.46, {
              kind: "cover", by: pi, hand: hi, foot: null, finger: pinky ? "pinky" : closestTip(tips, f),
              victim: 1 - pi, vhand: null, vfinger: null, vfoot: fi, x: f.x, y: f.y
            });
          }
        });
        opp.hands.forEach(function (e, ei) {
          var et = tipWorld(e, "thumb");
          var d = hypot(tips.thumb.x - et.x, tips.thumb.y - et.y);
          var sp = hypot(h.vx, h.vy);
          var toX = et.x - h.x, toY = et.y - h.y, toD = hypot(toX, toY) || 1;
          var approach = (toX * h.vx + toY * h.vy) / toD;
          var thumbKey = "thumb:" + (1 - pi) + ":" + ei;
          var finishing = h.chargeKey === thumbKey && d < TIP_R;
          if (pi === 0 && hi === 0 && ei === 0) G.trace = { d: d, sp: sp, approach: approach, finishing: finishing, key: h.chargeKey, charge: h.charge, ang: h.ang, vx: h.vx, vy: h.vy };
          if (d < TIP_R && ((sp > 0.26 && approach > 0.08) || finishing)) {
            offer(5, thumbKey, 0.2, {
              kind: "thumb", by: pi, hand: hi, foot: null, finger: "thumb",
              victim: 1 - pi, vhand: ei, vfinger: "thumb", vfoot: null,
              x: (tips.thumb.x + et.x) / 2, y: (tips.thumb.y + et.y) / 2
            });
          }
          if (sp < 0.75) {
            var bi, bn, bd = 1e9, btip = null, bname = "middle";
            for (bi = 0; bi < TIP_NAMES.length; bi++) {
              var nm = TIP_NAMES[bi];
              if (nm === "thumb") continue;
              var tp = tips[nm];
              var their = allTips(e);
              var ti;
              for (ti = 0; ti < TIP_NAMES.length; ti++) {
                var dd = hypot(tp.x - their[TIP_NAMES[ti]].x, tp.y - their[TIP_NAMES[ti]].y);
                if (dd < bd) { bd = dd; bname = nm; btip = TIP_NAMES[ti]; }
              }
            }
            if (bd < TIP_R) {
              offer(3, "grab:" + (1 - pi) + ":" + ei, bname === "middle" ? 0.18 : 0.26, {
                kind: "grab", by: pi, hand: hi, foot: null, finger: bname,
                victim: 1 - pi, vhand: ei, vfinger: btip, vfoot: null,
                x: tips[bname].x, y: tips[bname].y
              });
            }
          }
          if (h.blockT <= 0) {
            var theirTips = allTips(e);
            var tn;
            for (tn = 0; tn < TIP_NAMES.length; tn++) {
              var tp2 = theirTips[TIP_NAMES[tn]];
              var rd = hypot(tips.ring.x - tp2.x, tips.ring.y - tp2.y);
              var toward = (tips.ring.x - e.x) * e.vx + (tips.ring.y - e.y) * e.vy;
              if (rd < TIP_R + 0.012 && toward > 0.02 && hypot(e.vx, e.vy) > 0.25) {
                e.stun = Math.max(e.stun, 0.2);
                e.charge = 0;
                e.vx *= -0.55; e.vy *= -0.55;
                h.blockT = 0.5;
                h.stam = Math.max(0, h.stam - 6);
                G.flash = "BLOCK";
                G.flashT = 0.55;
                say("Bear", "Ring hand says no.");
                sound("invalid");
                vibe(10);
                break;
              }
            }
          }
        });
        if (h.stam <= 0) { h.charge = 0; return; }
        if (best && !hasHold(best.key)) charge(h, best.key, best.need, best.spec, dt);
        else h.charge = Math.max(0, h.charge - dt * 2);
      });
      p.feet.forEach(function (f, fi) {
        var hit = null, ei;
        for (ei = 0; ei < 2; ei++) {
          var e = opp.feet[ei];
          if (hypot(f.x - e.x, f.y - e.y) + FOOT_CORE <= FOOT_SOLE) hit = { e: e, ei: ei };
        }
        if (hit) {
          charge(f, "cover:" + (1 - pi) + ":" + hit.ei, 0.42, {
            kind: "cover", by: pi, hand: null, foot: fi, finger: "foot",
            victim: 1 - pi, vhand: null, vfinger: null, vfoot: hit.ei, x: hit.e.x, y: hit.e.y
          }, dt);
        } else f.charge = Math.max(0, f.charge - dt * 2);
      });
    });
  }

  function stamina(dt) {
    G.players.forEach(function (p, pi) {
      p.hands.forEach(function (h, hi) {
        var moving = hypot(h.vx, h.vy) > 0.15;
        var holding = G.holds.some(function (hd) { return hd.by === pi && hd.hand === hi; });
        if (!moving && !holding) h.stam = Math.min(100, h.stam + 16 * dt);
        else if (moving && !holding) h.stam = Math.max(0, h.stam - 2.2 * dt);
      });
    });
  }

  function clampAll() {
    G.players.forEach(function (p) {
      p.hands.forEach(function (h) {
        h.x = clamp(h.x, 0.05, 0.95);
        h.y = clamp(h.y, 0.05, 0.95);
      });
      p.feet.forEach(function (f) {
        f.x = clamp(f.x, 0.07, 0.93);
        f.y = clamp(f.y, 0.07, 0.93);
      });
    });
  }

  function step(dt) {
    if (!G || G.freeze) return;
    dt = Math.min(0.05, dt);
    if (G.flashT > 0) G.flashT -= dt;
    if (phase === "count") {
      G.count -= dt;
      if (G.count <= 0) {
        phase = "fight";
        say("Bear", "Wrestle.", true);
        sound("buzzIn");
      }
      return;
    }
    if (phase === "round") {
      G.roundT -= dt;
      if (G.roundT <= 0) advance();
      return;
    }
    if (phase !== "fight") return;
    G.time -= dt;
    humanMove(dt);
    aiThink(dt);
    guideFeet(dt);
    clampAll();
    noteWiggle();
    updateHolds(dt);
    if (phase !== "fight") return;
    consider(dt);
    stamina(dt);
    G.players.forEach(function (p) { p.hands.forEach(function (h) { h.wiggle = false; }); });
    if (G.time <= 0) endRound("time", null);
  }

  function metrics() {
    var w = view.w, h = view.h, land = w > h + 20;
    var hud = land ? 0 : Math.max(128, Math.min(148, Math.round(h * 0.16)));
    var side = land ? Math.max(132, Math.min(176, Math.round(w * 0.2))) : 0;
    var arena = land
      ? { x: side + 4, y: 6, w: Math.max(10, w - side * 2 - 8), h: Math.max(10, h - 12) }
      : { x: 8, y: hud, w: Math.max(10, w - 16), h: Math.max(10, h - hud * 2) };
    var u = Math.min(arena.w, arena.h);
    view.land = land;
    view.hud = hud;
    view.side = side;
    view.arena = arena;
    view.u = u;
    view.ox = arena.x + (arena.w - u) / 2;
    view.oy = arena.y + (arena.h - u) / 2;
  }

  function resize() {
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = Math.max(1, r.width);
    view.h = Math.max(1, r.height);
    canvas.width = Math.max(1, Math.round(view.w * dpr));
    canvas.height = Math.max(1, Math.round(view.h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    metrics();
  }

  function localPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function playerAt(x, y) {
    if (!G) return -1;
    if (view.land) return x < view.w / 2 ? 0 : 1;
    return y < view.h / 2 ? 1 : 0;
  }
  function handFor(pi, x) {
    var p = G.players[pi];
    var left;
    if (!view.land && pi === 1) left = x >= view.w / 2;
    else if (view.land) left = x < (pi === 0 ? view.w * 0.25 : view.w * 0.75);
    else left = x < view.w / 2;
    var idx = left ? 0 : 1;
    if (p.hands[idx].pointer != null) idx = 1 - idx;
    if (p.hands[idx].pointer != null) return -1;
    return idx;
  }
  function hitButton(x, y) {
    for (var i = buttons.length - 1; i >= 0; i--) {
      var b = buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return true; }
    }
    return false;
  }
  function onDown(e) {
    if (!on) return;
    e.preventDefault();
    var p = localPoint(e);
    if (hitButton(p.x, p.y)) return;
    if (!G || (phase !== "fight" && phase !== "count")) return;
    var who = playerAt(p.x, p.y);
    if (who < 0) return;
    if (G.ai && who === 1) return;
    var hi = handFor(who, p.x);
    if (hi < 0) return;
    var n = { x: clamp((p.x - view.ox) / view.u, 0.05, 0.95), y: clamp((p.y - view.oy) / view.u, 0.05, 0.95) };
    var h = G.players[who].hands[hi];
    h.pointer = e.pointerId;
    h.aiming = true;
    h.tx = n.x; h.ty = n.y;
    pointers[e.pointerId] = { player: who, hand: hi };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    try { if (window.MLPAudio) MLPAudio.unlock(); } catch (err) {}
  }
  function onMove(e) {
    if (!on || !G) return;
    var rec = pointers[e.pointerId];
    if (!rec) return;
    e.preventDefault();
    var p = localPoint(e);
    var h = G.players[rec.player].hands[rec.hand];
    h.tx = clamp((p.x - view.ox) / view.u, 0.05, 0.95);
    h.ty = clamp((p.y - view.oy) / view.u, 0.05, 0.95);
    h.aiming = true;
  }
  function onUp(e) {
    var rec = pointers[e.pointerId];
    if (!rec || !G) return;
    var h = G.players[rec.player].hands[rec.hand];
    h.pointer = null;
    h.aiming = false;
    delete pointers[e.pointerId];
  }

  function endMatch() {
    G = null;
    phase = "menu";
    closeMatch();
    if (typeof setScene === "function") setScene("modes");
  }

  function txt(text, x, y, size, color, align) {
    ctx.fillStyle = color;
    ctx.font = "700 " + size + "px Nunito, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function shepherd(x, y, s, kind) {
    var kenai = kind === "kenai";
    var sc = s * (kenai ? 1.12 : 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.fillStyle = kenai ? "#9AA3B2" : "#14181F";
    ctx.beginPath(); ctx.moveTo(-0.28, -0.28); ctx.lineTo(-0.55, -0.95); ctx.lineTo(0.02, -0.32); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.28, -0.28); ctx.lineTo(0.55, -0.95); ctx.lineTo(-0.02, -0.32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = kenai ? "#E4E7EE" : "#C9892D";
    ctx.beginPath(); ctx.moveTo(-0.2, -0.32); ctx.lineTo(-0.38, -0.78); ctx.lineTo(-0.02, -0.34); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.2, -0.32); ctx.lineTo(0.38, -0.78); ctx.lineTo(0.02, -0.34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = kenai ? "#F4F1EA" : "#1A1C22";
    ctx.beginPath(); ctx.ellipse(0, 0.05, 0.62, 0.5, 0, 0, 7); ctx.fill();
    ctx.lineWidth = 0.06; ctx.strokeStyle = "#2B3550"; ctx.stroke();
    if (!kenai) {
      ctx.fillStyle = "#C9892D";
      ctx.beginPath(); ctx.ellipse(-0.32, 0.08, 0.16, 0.13, 0, 0, 7); ctx.ellipse(0.32, 0.08, 0.16, 0.13, 0, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = "#D5DAE2";
      ctx.beginPath(); ctx.ellipse(0, -0.12, 0.34, 0.16, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = kenai ? "#F7F4EF" : "#C9892D";
    ctx.beginPath(); ctx.ellipse(0, 0.32, 0.28, 0.22, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#14181F";
    ctx.beginPath(); ctx.ellipse(0, 0.36, 0.1, 0.07, 0, 0, 7); ctx.fill();
    ctx.fillStyle = kenai ? "#2B3550" : "#F6E7C4";
    ctx.beginPath(); ctx.arc(-0.18, -0.02, 0.07, 0, 7); ctx.arc(0.18, -0.02, 0.07, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawFinger(name, skin, hot) {
    var t = TIPS[name];
    var bx = t.x * 0.32, by = t.y * 0.28;
    var ang = Math.atan2(t.y - by, t.x - bx);
    var len = hypot(t.x - bx, t.y - by);
    var w = name === "thumb" ? 0.24 : name === "pinky" ? 0.12 : 0.15;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang - Math.PI / 2);
    ctx.fillStyle = skin;
    ctx.strokeStyle = hot ? "#8A5A00" : "#2B3550";
    ctx.lineWidth = hot ? 0.08 : 0.045;
    rr(-w / 2, 0, w, len, w / 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#FFE6D4";
    ctx.beginPath(); ctx.ellipse(0, len - w * 0.2, w * 0.28, w * 0.18, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawHand(hand, pi, hotName) {
    var skin = pi === 0 ? "#F3C7A6" : "#E7B496";
    var band = pi === 0 ? "#1B4F3C" : "#C5CED6";
    ctx.save();
    ctx.translate(X(hand.x), Y(hand.y));
    ctx.rotate(hand.ang);
    ctx.scale(view.u * HAND, view.u * HAND);
    TIP_NAMES.forEach(function (n) { if (n !== "thumb") drawFinger(n, skin, hotName === n); });
    ctx.fillStyle = skin;
    ctx.strokeStyle = "#2B3550";
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.ellipse(0.02, 0.12, 0.5, 0.46, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.beginPath(); ctx.ellipse(-0.12, -0.02, 0.16, 0.1, -0.4, 0, 7); ctx.fill();
    drawFinger("thumb", skin, hotName === "thumb");
    ctx.fillStyle = band;
    rr(-0.42, 0.42, 0.84, 0.16, 0.06); ctx.fill();
    ctx.restore();
  }

  function drawFoot(f, pi, covered) {
    var x = X(f.x), y = Y(f.y), s = view.u * FOOT_SOLE;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(0.5 - f.y, 0.5 - f.x));
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#10281C";
    ctx.fillStyle = pi === 0 ? "#143D2E" : "#C5CED6";
    ctx.beginPath(); ctx.ellipse(-s * 0.55, 0, s * 0.4, s * 0.5, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = pi === 0 ? "#1B4F3C" : "#E4E7EE";
    ctx.beginPath(); ctx.ellipse(s * 0.15, 0, s * 1.05, s * 0.68, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = pi === 0 ? "#2F6E56" : "#F7F4EF";
    ctx.beginPath(); ctx.ellipse(s * 0.95, 0, s * 0.46, s * 0.4, 0, 0, 7); ctx.fill(); ctx.stroke();
    if (covered) {
      ctx.strokeStyle = "#8A5A00";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s * 0.2, 0, s * 1.45, 0, 7); ctx.stroke();
    }
    ctx.restore();
    txt(covered ? "HELD" : "FOOT", x, y + s + 12, 12, "#10281C", "center");
  }

  function drawGrip(x, y, w, stam) {
    rr(x, y, w, 10, 5);
    ctx.fillStyle = "#D5E0DA"; ctx.fill();
    rr(x, y, Math.max(0, w * clamp(stam / 100, 0, 1)), 10, 5);
    ctx.fillStyle = stam < 25 ? "#8A5A00" : "#1B4F3C"; ctx.fill();
  }

  function drawHud(pi, box, flip) {
    var p = G.players[pi];
    ctx.save();
    if (flip) {
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
    }
    ctx.fillStyle = "#E7F2EB";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    var endX = box.x + box.w - 56;
    var endY = box.y + Math.max(8, (box.h - 48) / 2);
    if (flip) {
      var vx = box.x + (box.w - (endX - box.x) - 48);
      var vy = box.y + (box.h - (endY - box.y) - 48);
      buttons.push({ x: vx, y: vy, w: 48, h: 48, fn: endMatch });
    } else buttons.push({ x: endX, y: endY, w: 48, h: 48, fn: endMatch });
    rr(endX, endY, 48, 48, 12);
    ctx.fillStyle = "#1B4F3C"; ctx.fill();
    txt("End", endX + 24, endY + 24, 16, "#FFFFFF", "center");
    txt(p.name, box.x + 12, box.y + 22, 16, "#10281C", "left");
    txt(fmtTime(G.time), box.x + (box.w > 220 ? 148 : 12), box.y + (box.w > 220 ? 22 : 118), 15, "#1B4F3C", "left");
    txt(String(Math.floor(p.score)), box.x + 12, box.y + 48, 28, "#1B4F3C", "left");
    var i;
    for (i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(box.x + 78 + i * 16, box.y + 50, 5, 0, 7);
      ctx.fillStyle = G.wins[pi] > i ? "#1B4F3C" : "#D5E0DA"; ctx.fill();
    }
    var wide = box.w > 220;
    var gripW = wide ? Math.min(120, (box.w - 120) / 2) : Math.max(48, box.w - 48);
    txt("L", box.x + 12, box.y + 78, 12, "#10281C", "left");
    drawGrip(box.x + 28, box.y + 73, gripW, p.hands[0].stam);
    txt("R", box.x + (wide ? 40 + gripW : 12), box.y + (wide ? 78 : 98), 12, "#10281C", "left");
    drawGrip(box.x + (wide ? 56 + gripW : 28), box.y + (wide ? 73 : 93), gripW, p.hands[1].stam);
    var controlY = view.land ? box.y + 128 : box.y + box.h - 18;
    txt(pi === 0 ? "You" : "Them", box.x + 12, controlY - 2, 11, "#10281C", "left");
    var cw = Math.min(140, box.w - 56);
    var cx = box.x + 44;
    rr(cx, controlY - 6, cw, 12, 6);
    ctx.fillStyle = "#D5E0DA"; ctx.fill();
    var mid = cx + cw / 2;
    ctx.fillStyle = "#1B4F3C";
    if (G.control >= 0) ctx.fillRect(mid, controlY - 6, cw / 2 * G.control, 12);
    else ctx.fillRect(mid + cw / 2 * G.control, controlY - 6, -cw / 2 * G.control, 12);
    if (view.land && pi === 0) {
      shepherd(box.x + 22, box.y + box.h - 78, 16, "bear");
      shepherd(box.x + 54, box.y + box.h - 74, 16, "kenai");
      wrap(msg.text || "", box.x + 8, box.y + box.h - 48, box.w - 16, 12, "#10281C");
    }
    ctx.restore();
  }

  function drawCallout(x, y, flip) {
    var hold = null;
    G.holds.forEach(function (h) {
      var m = h.mult || multOf(h) || 1;
      if (!hold || m > hold._m) hold = h, hold._m = m;
    });
    var label = hold
      ? (hold.kind === "thumb" ? "THUMB" : hold.kind === "cover" ? (hold.finger === "pinky" ? "PINKY FOOT" : "FOOT") : (hold.finger || "GRAB").toUpperCase()) + " x" + (hold._m || 1).toFixed(1)
      : (G.flashT > 0 ? G.flash : "");
    if (!label) return;
    ctx.save();
    if (flip) { ctx.translate(x, y); ctx.rotate(Math.PI); ctx.translate(-x, -y); }
    var w = Math.max(148, label.length * 11 + 28);
    rr(x - w / 2, y - 18, w, 36, 12);
    ctx.fillStyle = "#1B4F3C"; ctx.fill();
    txt(label, x, y, 18, "#FFFFFF", "center");
    ctx.restore();
  }

  function drawHosts(x, y, flip) {
    ctx.save();
    if (flip) { ctx.translate(x, y); ctx.rotate(Math.PI); ctx.translate(-x, -y); }
    rr(x - 150, y - 28, 300, 56, 14);
    ctx.fillStyle = "#10281C"; ctx.fill();
    shepherd(x - 118, y + 6, 26, "bear");
    shepherd(x - 78, y + 8, 26, "kenai");
    var who = msg.who || "Bear";
    txt(who, x - 48, y - 14, 12, "#E7F2EB", "left");
    ctx.font = "700 13px Nunito, sans-serif";
    var words = (msg.text || "").split(" "), line1 = "", line2 = "", wi;
    for (wi = 0; wi < words.length; wi++) {
      var trial = line1 ? line1 + " " + words[wi] : words[wi];
      if (ctx.measureText(trial).width < 200) line1 = trial;
      else line2 = line2 ? line2 + " " + words[wi] : words[wi];
    }
    txt(line1, x - 48, y + (line2 ? -1 : 8), 13, "#FFFFFF", "left");
    if (line2) txt(line2, x - 48, y + 15, 13, "#FFFFFF", "left");
    ctx.restore();
  }

  function drawMat() {
    ctx.fillStyle = "#E7F2EB";
    ctx.fillRect(0, 0, view.w, view.h);
    var a = view.arena;
    rr(a.x, a.y, a.w, a.h, 18);
    ctx.fillStyle = "#F2F6F0"; ctx.fill();
    var g = ctx.createLinearGradient(view.ox, view.oy, view.ox + view.u, view.oy + view.u);
    g.addColorStop(0, "#E7F2EB"); g.addColorStop(1, "#C9DDD2");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(view.ox + view.u / 2, view.oy + view.u / 2, view.u * 0.48, 0, 7); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = "#1B4F3C"; ctx.stroke();
    ctx.beginPath(); ctx.arc(view.ox + view.u / 2, view.oy + view.u / 2, view.u * 0.16, 0, 7);
    ctx.lineWidth = 2; ctx.stroke();
  }
  function fmtTime(t) {
    t = Math.max(0, Math.ceil(t));
    return Math.floor(t / 60) + ":" + (t % 60 < 10 ? "0" : "") + (t % 60);
  }

  function hotFinger(hand, pi) {
    var key = hand.chargeKey || "";
    if (key.indexOf("thumb") === 0) return "thumb";
    if (key.indexOf("grab") === 0) return "middle";
    if (key.indexOf("cover") === 0) return "pinky";
    var hold = null;
    G.holds.forEach(function (h) { if (h.by === pi && h.hand != null && G.players[pi].hands[h.hand] === hand) hold = h; });
    return hold ? hold.finger : hand.finger;
  }

  function drawWorld() {
    drawMat();
    var covered = {};
    G.holds.forEach(function (h) { if (h.kind === "cover") covered[h.victim + ":" + h.vfoot] = true; });
    G.players.forEach(function (p, pi) {
      p.feet.forEach(function (f, fi) { drawFoot(f, pi, !!covered[pi + ":" + fi]); });
    });
    var order = [];
    G.players.forEach(function (p, pi) {
      p.hands.forEach(function (h, hi) { order.push({ h: h, pi: pi, hi: hi }); });
    });
    order.sort(function (a, b) {
      var ap = G.holds.some(function (h) { return h.by === a.pi && h.hand === a.hi; }) ? 1 : 0;
      var bp = G.holds.some(function (h) { return h.by === b.pi && h.hand === b.hi; }) ? 1 : 0;
      return ap - bp;
    });
    order.forEach(function (o) { drawHand(o.h, o.pi, hotFinger(o.h, o.pi)); });
    G.holds.forEach(function (h) {
      if (h.kind === "cover") return;
      var x = X(h.x), y = Y(h.y);
      ctx.strokeStyle = "#1B4F3C";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.stroke();
      var a0 = -Math.PI / 2 + h.ring * Math.PI * 2;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 22, a0, a0 + 0.5); ctx.stroke();
      ctx.strokeStyle = "#8A5A00";
      ctx.beginPath(); ctx.arc(x, y, 28, -Math.PI / 2 + 0.64 * 6.28, -Math.PI / 2 + 0.78 * 6.28); ctx.stroke();
    });
    G.players.forEach(function (p) {
      p.hands.forEach(function (h) {
        if (h.charge > 0.05 && h.need) {
          var tip = h.chargeKey.indexOf("cover") === 0 ? { x: h.x, y: h.y } : tipWorld(h, h.chargeKey.indexOf("thumb") === 0 ? "thumb" : "middle");
          ctx.strokeStyle = "#1B4F3C";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(X(tip.x), Y(tip.y), 18, -Math.PI / 2, -Math.PI / 2 + (h.charge / h.need) * Math.PI * 2);
          ctx.stroke();
        }
      });
    });
  }

  function panel(x, y, w, h) {
    rr(x, y, w, h, 16);
    ctx.fillStyle = "#FFFFFF"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#1B4F3C"; ctx.stroke();
  }

  function button(x, y, w, h, label, fn) {
    w = Math.max(48, w); h = Math.max(48, h);
    buttons.push({ x: x, y: y, w: w, h: h, fn: fn });
    rr(x, y, w, h, 14);
    ctx.fillStyle = "#1B4F3C"; ctx.fill();
    txt(label, x + w / 2, y + h / 2, w < 150 ? 15 : 17, "#FFFFFF", "center");
  }

  function drawMenu() {
    ctx.fillStyle = "#E7F2EB";
    ctx.fillRect(0, 0, view.w, view.h);
    var land = view.land;
    var titleY = land ? 28 : 36;
    txt("Thumbjitsu", view.w / 2, titleY, land ? 26 : 32, "#10281C", "center");
    shepherd(view.w / 2 - 78, titleY + (land ? 48 : 62), land ? 28 : 36, "bear");
    shepherd(view.w / 2 - 34, titleY + (land ? 52 : 68), land ? 28 : 36, "kenai");
    txt("Bear", view.w / 2 + 8, titleY + (land ? 36 : 48), 13, "#10281C", "left");
    txt("Kenai", view.w / 2 + 8, titleY + (land ? 54 : 70), 13, "#10281C", "left");
    var help = "Two fingers each, one per hand. Thumb pins and the score climbs. Index pries on the green ring. Middle grabs. Ring blocks. Pinky covers a foot faster. Cover both feet and the round is yours.";
    var hy = land ? 96 : 130;
    wrap(help, 16, hy, view.w - 32, land ? 15 : 16, "#10281C");
    var labels = [
      ["Two players, one phone", function () { start("2p"); }],
      ["Vs Kenai, Easy", function () { start("easy"); }],
      ["Vs Bear, Normal", function () { start("normal"); }],
      ["Vs Bear, Hard", function () { start("hard"); }]
    ];
    var bw = land ? Math.min(280, (view.w - 48) / 2) : Math.min(420, view.w - 32);
    var bh = 48;
    var top = land ? 168 : 250;
    labels.forEach(function (item, i) {
      var col = land ? i % 2 : 0;
      var row = land ? Math.floor(i / 2) : i;
      var x = land ? 16 + col * (bw + 12) : (view.w - bw) / 2;
      var y = top + row * (bh + 8);
      button(x, y, bw, bh, item[0], item[1]);
    });
    var by = land ? view.h - 60 : top + labels.length * (bh + 8) + 6;
    button((view.w - Math.min(bw, 200)) / 2, Math.min(by, view.h - 60), Math.min(bw, 200), 48, "Back", endMatch);
    if (!land) {
      var jobs = [["Thumb", "Pin. Score climbs while you hold."], ["Index", "Pry when the ring is green."], ["Middle", "Grab, and it sticks harder."], ["Ring", "Block a hand that's coming in."], ["Pinky", "Cover a foot sooner."], ["Both feet", "Cover them together. Round won."]];
      var cardY = Math.min(by, view.h - 60) + 60;
      var cardH = view.h - cardY - 12;
      if (cardH > 150) {
        panel(16, cardY, view.w - 32, cardH);
        var rowH = Math.min(36, (cardH - 16) / jobs.length);
        jobs.forEach(function (job, i) {
          var y = cardY + 12 + rowH * i + rowH / 2;
          txt(job[0], 32, y, 15, "#1B4F3C", "left");
          txt(job[1], 118, y, 14, "#10281C", "left");
        });
      }
    }
  }

  function wrap(text, x, y, w, size, color) {
    ctx.fillStyle = color;
    ctx.font = "700 " + size + "px Nunito, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    var words = text.split(" "), line = "", ly = y;
    for (var i = 0; i < words.length; i++) {
      var t = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, ly); line = words[i]; ly += size + 3; }
      else line = t;
    }
    if (line) ctx.fillText(line, x, ly);
  }

  function drawOverlayCard(title, lines) {
    var w = Math.min(view.w - 24, 420), h = Math.min(view.h - 24, 280);
    var x = (view.w - w) / 2, y = (view.h - h) / 2;
    panel(x, y, w, h);
    txt(title, x + w / 2, y + 32, 22, "#10281C", "center");
    lines.forEach(function (line, i) { txt(line, x + w / 2, y + 68 + i * 24, 16, "#10281C", "center"); });
    button(x + 16, y + h - 64, (w - 44) / 2, 48, phase === "match" ? "Again" : "Next", function () {
      if (phase === "match") start(G.mode, { round: G.roundLen, count: G.countLen, banner: G.banner });
      else advance();
    });
    button(x + w / 2 + 6, y + h - 64, (w - 44) / 2, 48, "Menu", function () { G = null; phase = "menu"; say("Bear", "Two hands. Pin a thumb, or take both feet.", true); });
  }

  function draw() {
    if (!ctx) return;
    buttons = [];
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 1;
    raw(function () {
      if (!G || phase === "menu") { drawMenu(); return; }
      ctx.fillStyle = "#E7F2EB";
      ctx.fillRect(0, 0, view.w, view.h);
      drawWorld();
      if (view.land) {
        drawHud(0, { x: 0, y: 0, w: view.side, h: view.h }, false);
        drawHud(1, { x: view.w - view.side, y: 0, w: view.side, h: view.h }, false);
      } else {
        drawHud(1, { x: 0, y: 0, w: view.w, h: view.hud }, true);
        drawHud(0, { x: 0, y: view.h - view.hud, w: view.w, h: view.hud }, false);
      }
      if (!view.land) {
        var gap = view.oy - view.hud;
        if (gap > 50) drawHosts(view.w / 2, view.hud + gap * 0.42, true);
        drawCallout(view.w / 2, view.oy - 22, true);
        drawCallout(view.w / 2, view.oy + view.u + 22, false);
        var gap2 = (view.h - view.hud) - (view.oy + view.u);
        if (gap2 > 50) drawHosts(view.w / 2, view.oy + view.u + gap2 * 0.55, false);
      } else {
        drawCallout(view.ox + view.u / 2, view.oy + 28, false);
      }
      if (phase === "count") {
        panel(view.w / 2 - 70, view.h / 2 - 50, 140, 100);
        txt("Round " + G.round, view.w / 2, view.h / 2 - 22, 16, "#10281C", "center");
        txt(String(Math.max(1, Math.ceil(G.count))), view.w / 2, view.h / 2 + 16, 36, "#1B4F3C", "center");
      }
      if (phase === "round") {
        var who = G.winner < 0 ? "Draw" : (G.players[G.winner].name === "You" ? "You win" : G.players[G.winner].name + " wins");
        var why = G.reason === "feet" ? "Both feet covered." : "Score " + Math.floor(G.players[0].score) + " to " + Math.floor(G.players[1].score);
        drawOverlayCard(who, [why, G.bonus ? "Control +" + G.bonus : "Best of 3", "Round " + G.round + "  ·  " + G.wins[0] + "–" + G.wins[1]]);
      }
      if (phase === "match") {
        var t = G.winner < 0 ? "Split match" : (G.players[G.winner].name === "You" ? "You win" : G.players[G.winner].name + " wins");
        drawOverlayCard(t, [G.wins[0] + " – " + G.wins[1], msg.text]);
      }
    });
  }

  function frame(t) {
    if (!on) return;
    try {
      var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
      lastT = t;
      if (G) step(dt);
      draw();
    } catch (err) {
      window.__thumbErr = String(err && err.stack || err);
    }
    if (on) raf = requestAnimationFrame(frame);
  }

  function openMenu() {
    if (on) return;
    on = true;
    phase = "menu";
    G = null;
    canvas.style.display = "block";
    lastT = 0;
    resize();
    say("Bear", "Two hands. Pin a thumb, or take both feet.", true);
    raf = requestAnimationFrame(frame);
  }
  function closeMatch() {
    on = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    pointers = {};
    if (canvas) canvas.style.display = "none";
  }

  function snap() {
    if (!G) return { phase: phase, holds: [], scores: [0, 0], wins: [0, 0], seen: {}, hands: [], feet: [] };
    return {
      phase: phase,
      mode: G.mode,
      round: G.round,
      time: G.time,
      scores: [G.players[0].score, G.players[1].score],
      wins: G.wins.slice(),
      control: G.control,
      reason: G.reason,
      winner: G.winner,
      flash: G.flashT > 0 ? G.flash : "",
      line: msg.who + ": " + msg.text,
      trace: G.trace || null,
      seen: G.ai ? Object.assign({}, G.ai.seen) : {},
      holds: G.holds.map(function (h) { return { kind: h.kind, by: h.by, finger: h.finger, mult: h.mult || multOf(h), t: h.t, vfoot: h.vfoot }; }),
      hands: G.players.map(function (p) { return p.hands.map(function (h) { return { x: h.x, y: h.y, pointer: h.pointer != null, stam: h.stam }; }); }),
      feet: G.players.map(function (p) { return p.feet.map(function (f) { return { x: f.x, y: f.y }; }); })
    };
  }

  function install() {
    if (document.getElementById("thumbjitsu")) return;
    canvas = document.createElement("canvas");
    canvas.id = "thumbjitsu";
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-label", "Thumbjitsu. Two hands each. Pin a thumb or cover both feet.");
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:60;touch-action:none;display:none;background:#E7F2EB";
    ctx = canvas.getContext("2d");
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    document.body.appendChild(canvas);
    window.addEventListener("resize", function () { if (on) resize(); });
    if (typeof setScene === "function" && !setScene.__tj) {
      var prev = setScene;
      var wrapped = function (name) {
        if (name === "thumbjitsu") { openMenu(); return prev("modes"); }
        closeMatch();
        return prev(name);
      };
      wrapped.__tj = true;
      window.setScene = wrapped;
    }
    var add = function () {
      if (typeof MODES === "undefined" || MODES.some(function (m) { return m.id === "thumbjitsu"; })) return;
      MODES.push({
        id: "thumbjitsu",
        n: "Thumbjitsu",
        d: "Two hands each. Pin a thumb. Cover both feet to win the round.",
        c: ["#E7F2EB", "#1B4F3C"],
        scene: "thumbjitsu"
      });
    };
    add();
    if (typeof loadAsset === "function") loadAsset("mode_thumbjitsu", "assets/modes/thumbjitsu.webp?v=0-6-8");
    window.__thumb = {
      open: openMenu,
      close: closeMatch,
      start: start,
      snap: snap,
      buttons: function () { return buttons.map(function (b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; }); },
      homes: function () {
        return {
          w: view.w, h: view.h, u: view.u, ox: view.ox, oy: view.oy,
          hands: G ? G.players.map(function (p) { return p.hands.map(function (h) { return { x: X(h.x), y: Y(h.y) }; }); }) : []
        };
      },
      debug: {
        thumbPin: function () {
          start("2p", { skip: true, script: true, round: 50 });
          var A = G.players[0].hands[0];
          var B = G.players[1].hands[0];
          B.ang = Math.PI; B.x = 0.5; B.y = 0.46; B.vx = 0; B.vy = 0;
          var tb = tipWorld(B, "thumb");
          A.ang = 0;
          var off = rot(TIPS.thumb.x * HAND, TIPS.thumb.y * HAND, 0);
          A.x = tb.x - off.x; A.y = tb.y - off.y;
          A.aiming = true;
          A.tx = A.x; A.ty = A.y;
          var dx = tb.x - A.x, dy = tb.y - A.y, len = Math.hypot(dx, dy) || 1;
          A.vx = dx / len * 0.55; A.vy = dy / len * 0.55;
          var i, hist = [];
          for (i = 0; i < 50; i++) {
            step(0.02);
            if (i % 5 === 0) {
              var tip = tipWorld(A, "thumb");
              var tbNow = tipWorld(B, "thumb");
              hist.push({ i: i, ang: +A.ang.toFixed(2), x: +A.x.toFixed(3), y: +A.y.toFixed(3), vx: +A.vx.toFixed(2), vy: +A.vy.toFixed(2), ch: +A.charge.toFixed(2), key: A.chargeKey, d: +Math.hypot(tip.x - tbNow.x, tip.y - tbNow.y).toFixed(3) });
            }
          }
          G.freeze = true;
          var shot = snap();
          shot.hist = hist;
          return shot;
        },
        bothFeet: function () {
          start("2p", { skip: true, script: true, round: 50 });
          G.players[1].feet[0].x = 0.35; G.players[1].feet[0].y = 0.42;
          G.players[1].feet[1].x = 0.66; G.players[1].feet[1].y = 0.42;
          G.players[0].hands[0].x = 0.35; G.players[0].hands[0].y = 0.42;
          G.players[0].hands[1].x = 0.66; G.players[0].hands[1].y = 0.42;
          var i;
          for (i = 0; i < 40; i++) step(0.02);
          G.freeze = true;
          return snap();
        },
        plans: function (mode) {
          start(mode, { skip: true, script: false, round: 30 });
          G.script = false;
          if (!G.ai) G.ai = { plan: "", t: 0, seen: {}, deck: PLANS.slice(), wind: 0, bite: 0 };
          var i;
          for (i = 0; i < PLANS.length; i++) {
            G.ai.t = 0;
            G.ai.wind = 0;
            step(0.02);
          }
          G.freeze = true;
          return Object.keys(G.ai.seen);
        }
      }
    };
  }

  if (document.body) install();
  else document.addEventListener("DOMContentLoaded", install);
})();
