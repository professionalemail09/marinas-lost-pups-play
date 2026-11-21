// MLPAudio prototype: one context, one bus, all synthesized (no assets, no licences needed).
// Not wired into the game; validated offline with OfflineAudioContext.
(function (root) {
  let ac = null, bus = null, comp = null, noiseBuf = null;
  const S = { muted: false };
  function build(ctx) {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 6; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.12;
    bus = ctx.createGain(); bus.gain.value = 0.5;
    bus.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, (ctx.sampleRate * 0.25) | 0, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function tone(ctx, o) { // {type,f0,f1,dur,gain,at,attack,lp}
    const t = ctx.currentTime + (o.at || 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || "triangle";
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let n = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; osc.connect(f); n = f; }
    n.connect(g); g.connect(bus); osc.start(t); osc.stop(t + o.dur + 0.03);
  }
  function hiss(ctx, o) { // {dur,freq,q,gain,at,type}
    const t = ctx.currentTime + (o.at || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = o.type || "highpass"; f.frequency.value = o.freq; f.Q.value = o.q || 0.7;
    g.gain.setValueAtTime(o.gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + o.dur + 0.02);
  }
  const semi = (n) => Math.pow(2, n / 12);
  const R = {
    key(c) { hiss(c, { dur: 0.012, freq: 3500, gain: 0.06 }); },
    right(c, streak = 0) { const k = semi(Math.min(streak, 7));
      tone(c, { f0: 880 * k, dur: 0.12, gain: 0.18 });
      tone(c, { f0: 1108.73 * k, dur: 0.16, gain: 0.16, at: 0.07 });
      tone(c, { type: "sine", f0: 1760 * k, dur: 0.1, gain: 0.05, at: 0.07 }); },
    wrong(c) { tone(c, { type: "sine", f0: 220, f1: 140, dur: 0.18, gain: 0.25, lp: 600 }); },
    invalid(c) { tone(c, { type: "square", f0: 180, dur: 0.06, gain: 0.05, lp: 900 });
      tone(c, { type: "square", f0: 180, dur: 0.06, gain: 0.05, lp: 900, at: 0.09 }); },
    flip(c, i = 0) { tone(c, { type: "sine", f0: 600 * semi(i * 2), f1: 900 * semi(i * 2), dur: 0.05, gain: 0.08, at: i * 0.07 }); },
    buzzIn(c) { tone(c, { type: "square", f0: 1046, dur: 0.09, gain: 0.08, lp: 2500 }); },
    win(c) { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, { f0: f, dur: 0.14, gain: 0.16, at: i * 0.09 }));
      [523.25, 659.25, 783.99].forEach((f) => tone(c, { f0: f, dur: 0.6, gain: 0.07, at: 0.36, attack: 0.02 }));
      hiss(c, { dur: 0.35, freq: 6000, gain: 0.04, at: 0.36 }); },
    lose(c) { [392, 349.23, 311.13].forEach((f, i) => tone(c, { f0: f, f1: f * 0.97, dur: 0.22, gain: 0.12, at: i * 0.16, lp: 1400 })); },
    streak(c, n) { const k = semi(Math.min(n, 10));
      [0, 4, 7, 12].forEach((s, i) => tone(c, { type: "square", f0: 523.25 * k * semi(s), dur: 0.07, gain: 0.06, at: i * 0.05, lp: 3000 })); },
    dailyDouble(c) { for (let i = 0; i < 6; i++) tone(c, { f0: 659.25 * semi(i % 2 ? 7 : 0), dur: 0.08, gain: 0.1, at: i * 0.08 }); },
    bark(c, miss = 1) { const p = 0.92 + Math.random() * 0.16;
      [0, 0.2].forEach((d) => { tone(c, { type: "square", f0: 520 * p, f1: 170 * p, dur: 0.13, gain: 0.22, at: d, lp: 1100 });
        hiss(c, { dur: 0.08, freq: 900 * p, q: 1.2, gain: 0.12, at: d, type: "bandpass" }); });
      if (miss >= 3) tone(c, { type: "sawtooth", f0: 95 * p, dur: 0.45, gain: 0.12, at: 0.42, lp: 700 }); },
    kenaiYip(c) { tone(c, { type: "sine", f0: 1200, f1: 1650, dur: 0.09, gain: 0.14 }); tone(c, { type: "sine", f0: 1300, f1: 1800, dur: 0.09, gain: 0.12, at: 0.12 }); },
  };
  const api = {
    ctx: () => ac,
    unlock() { // call from EVERY pointerup until running; cheap no-op afterwards
      try {
        if (!ac) { ac = new (root.AudioContext || root.webkitAudioContext)(); build(ac);
          try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) {} }
        if (ac.state !== "running") ac.resume().catch(() => {});
      } catch (e) {}
    },
    play(name, ...a) { if (S.muted || !ac || ac.state !== "running" || !R[name]) return; try { R[name](ac, ...a); } catch (e) {} },
    setMuted(m) { S.muted = !!m; if (bus && ac) bus.gain.setTargetAtTime(m ? 0 : 0.5, ac.currentTime, 0.02); },
    _offline(ctx) { ac = ctx; build(ctx); return R; },
    R,
  };
  root.MLPAudio = api;
})(typeof window !== "undefined" ? window : globalThis);
