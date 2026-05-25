"use strict";
/* =============================================================================
 * BESTSCREEN AUDIO — multi-layered Web Audio ambience + per-scene soundtrack
 *
 * Synthesized in-browser, zero dependencies. Each preset uses multiple noise
 * sources, filters, panning, and stochastic event scheduling to feel less
 * "obviously synthesized" than a single filtered noise band.
 * ============================================================================= */

const Audio = (() => {
  let ctx = null;
  let active = null;  // { stop, name }
  let masterGain = null;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.18;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  /* ---------- Noise generators ---------- */
  function whiteNoise() {
    const dur = 4;
    const buf = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; return src;
  }
  function brownNoise() {
    // Brown noise = integrated white noise — smoother, lower-pitched
    const dur = 4;
    const buf = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch); let last = 0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.5;
      }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; return src;
  }
  function pinkNoise() {
    // Paul Kellet's approximation — for "warmer" hiss
    const dur = 4;
    const buf = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886*b0 + w*0.0555179;
        b1 = 0.99332*b1 + w*0.0750759;
        b2 = 0.96900*b2 + w*0.1538520;
        b3 = 0.86650*b3 + w*0.3104856;
        b4 = 0.55000*b4 + w*0.5329522;
        b5 = -0.7616*b5 - w*0.0168980;
        data[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.11;
        b6 = w*0.115926;
      }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; return src;
  }

  function panNode(value=0) {
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) p.pan.value = value;
    return p || ctx.createGain();
  }

  /* ---------- Rain: layered hiss + droplets + occasional thunder ---------- */
  function startRain() {
    ensureCtx(); stop();
    const cleanup = [];

    // Distant rain hiss (pink, high-passed)
    const hiss = pinkNoise();
    const hpf = ctx.createBiquadFilter(); hpf.type = "highpass"; hpf.frequency.value = 600;
    const lpf = ctx.createBiquadFilter(); lpf.type = "lowpass";  lpf.frequency.value = 3500;
    const hissG = ctx.createGain(); hissG.gain.value = 0.7;
    hiss.connect(hpf); hpf.connect(lpf); lpf.connect(hissG); hissG.connect(masterGain);
    hiss.start();

    // Wider "wet pavement" bed (brown)
    const wet = brownNoise();
    const wetF = ctx.createBiquadFilter(); wetF.type = "lowpass"; wetF.frequency.value = 800;
    const wetG = ctx.createGain(); wetG.gain.value = 0.5;
    wet.connect(wetF); wetF.connect(wetG); wetG.connect(masterGain);
    wet.start();

    // Random droplets — short filtered ticks at varying pitches
    const dropletTick = setInterval(() => {
      if (Math.random() < 0.4) return;
      const burst = whiteNoise();
      const f = ctx.createBiquadFilter(); f.type = "bandpass";
      f.frequency.value = 1500 + Math.random() * 3000;
      f.Q.value = 12 + Math.random() * 8;
      const g = ctx.createGain();
      const pan = panNode((Math.random() - 0.5) * 1.6);
      const start = ctx.currentTime;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.18 * (0.4 + Math.random() * 0.6), start + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.05 + Math.random() * 0.08);
      burst.connect(f); f.connect(g); g.connect(pan); pan.connect(masterGain);
      burst.start(); burst.stop(start + 0.15);
    }, 90);
    cleanup.push(() => clearInterval(dropletTick));

    // Occasional distant thunder rumble
    const thunderTick = setInterval(() => {
      if (Math.random() < 0.92) return;
      const rumble = brownNoise();
      const f = ctx.createBiquadFilter(); f.type = "lowpass";
      f.frequency.value = 90 + Math.random() * 40;
      const g = ctx.createGain();
      const start = ctx.currentTime;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.4, start + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, start + 4 + Math.random() * 2);
      rumble.connect(f); f.connect(g); g.connect(masterGain);
      rumble.start(); rumble.stop(start + 7);
    }, 9000);
    cleanup.push(() => clearInterval(thunderTick));

    active = { name: "rain", stop: () => { hiss.stop(); wet.stop(); cleanup.forEach(fn => fn()); } };
  }

  /* ---------- Fireplace: bed warmth + crackles + pop ---------- */
  function startFireplace() {
    ensureCtx(); stop();
    const cleanup = [];

    const bed = brownNoise();
    const bedF = ctx.createBiquadFilter(); bedF.type = "lowpass"; bedF.frequency.value = 350;
    const bedG = ctx.createGain(); bedG.gain.value = 1.6;
    bed.connect(bedF); bedF.connect(bedG); bedG.connect(masterGain);
    bed.start();

    // Subtle high hiss for ember sizzle
    const sizzle = pinkNoise();
    const sF = ctx.createBiquadFilter(); sF.type = "bandpass"; sF.frequency.value = 4000; sF.Q.value = 0.7;
    const sG = ctx.createGain(); sG.gain.value = 0.10;
    sizzle.connect(sF); sF.connect(sG); sG.connect(masterGain);
    sizzle.start();

    // Crackles — varied size + stereo position
    const crackleTick = setInterval(() => {
      if (Math.random() < 0.55) return;
      const big = Math.random() < 0.15;
      const burst = whiteNoise();
      const f = ctx.createBiquadFilter(); f.type = "bandpass";
      f.frequency.value = 1800 + Math.random() * 2800;
      f.Q.value = big ? 1.5 : 4;
      const g = ctx.createGain();
      const pan = panNode((Math.random() - 0.5) * 1.4);
      const start = ctx.currentTime;
      const peak = big ? 0.5 : 0.22;
      const dur = big ? 0.4 + Math.random() * 0.3 : 0.1 + Math.random() * 0.15;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
      burst.connect(f); f.connect(g); g.connect(pan); pan.connect(masterGain);
      burst.start(); burst.stop(start + dur + 0.05);
    }, 200);
    cleanup.push(() => clearInterval(crackleTick));

    active = { name: "fireplace", stop: () => { bed.stop(); sizzle.stop(); cleanup.forEach(fn => fn()); } };
  }

  /* ---------- Cafe: HVAC + murmur + clinks + chair scrapes ---------- */
  function startCafe() {
    ensureCtx(); stop();
    const cleanup = [];

    // HVAC / room tone
    const hvac = brownNoise();
    const hF = ctx.createBiquadFilter(); hF.type = "lowpass"; hF.frequency.value = 600;
    const hG = ctx.createGain(); hG.gain.value = 0.5;
    hvac.connect(hF); hF.connect(hG); hG.connect(masterGain);
    hvac.start();

    // Voice murmur — many short filtered bursts at speech bandwidth
    const murmurTick = setInterval(() => {
      if (Math.random() < 0.4) return;
      const burst = brownNoise();
      const f = ctx.createBiquadFilter(); f.type = "bandpass";
      f.frequency.value = 250 + Math.random() * 800;
      f.Q.value = 6 + Math.random() * 4;
      const g = ctx.createGain();
      const pan = panNode((Math.random() - 0.5) * 1.8);
      const start = ctx.currentTime;
      const dur = 0.6 + Math.random() * 1.4;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.10 + Math.random() * 0.06, start + 0.08);
      g.gain.linearRampToValueAtTime(0.08, start + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
      burst.connect(f); f.connect(g); g.connect(pan); pan.connect(masterGain);
      burst.start(); burst.stop(start + dur + 0.1);
    }, 220);
    cleanup.push(() => clearInterval(murmurTick));

    // Cup / saucer clinks
    const clinkTick = setInterval(() => {
      if (Math.random() < 0.88) return;
      const osc = ctx.createOscillator(); osc.type = "triangle";
      osc.frequency.value = 1600 + Math.random() * 1200;
      const g = ctx.createGain();
      const pan = panNode((Math.random() - 0.5) * 1.6);
      const start = ctx.currentTime;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.07, start + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(g); g.connect(pan); pan.connect(masterGain);
      osc.start(); osc.stop(start + 0.3);
    }, 300);
    cleanup.push(() => clearInterval(clinkTick));

    // Espresso machine hiss occasionally
    const espressoTick = setInterval(() => {
      if (Math.random() < 0.96) return;
      const burst = whiteNoise();
      const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2000;
      const g = ctx.createGain();
      const start = ctx.currentTime;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.18, start + 0.15);
      g.gain.linearRampToValueAtTime(0.18, start + 2);
      g.gain.exponentialRampToValueAtTime(0.001, start + 2.5);
      burst.connect(f); f.connect(g); g.connect(masterGain);
      burst.start(); burst.stop(start + 2.8);
    }, 11000);
    cleanup.push(() => clearInterval(espressoTick));

    active = { name: "cafe", stop: () => { hvac.stop(); cleanup.forEach(fn => fn()); } };
  }

  /* ---------- Vinyl: warm bed + clicks + 33⅓ thump ---------- */
  function startVinyl() {
    ensureCtx(); stop();
    const cleanup = [];

    const bed = pinkNoise();
    const bF = ctx.createBiquadFilter(); bF.type = "lowpass"; bF.frequency.value = 700;
    const bG = ctx.createGain(); bG.gain.value = 0.35;
    bed.connect(bF); bF.connect(bG); bG.connect(masterGain);
    bed.start();

    // Click each rotation (~1.8s for 33⅓ RPM)
    const clickTick = setInterval(() => {
      const osc = ctx.createOscillator(); osc.type = "square";
      osc.frequency.value = 4500;
      const g = ctx.createGain();
      const start = ctx.currentTime;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.05, start + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.018);
      osc.connect(g); g.connect(masterGain);
      osc.start(); osc.stop(start + 0.04);
    }, 1800);
    cleanup.push(() => clearInterval(clickTick));

    // Random pops
    const popTick = setInterval(() => {
      if (Math.random() < 0.7) return;
      const burst = whiteNoise();
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 800; f.Q.value = 2;
      const g = ctx.createGain();
      const start = ctx.currentTime;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.13, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      burst.connect(f); f.connect(g); g.connect(masterGain);
      burst.start(); burst.stop(start + 0.1);
    }, 380);
    cleanup.push(() => clearInterval(popTick));

    active = { name: "vinyl", stop: () => { bed.stop(); cleanup.forEach(fn => fn()); } };
  }

  /* ---------- Brown noise (pure focus) ---------- */
  function startBrown() {
    ensureCtx(); stop();
    const n = brownNoise();
    const g = ctx.createGain(); g.gain.value = 0.9;
    n.connect(g); g.connect(masterGain);
    n.start();
    active = { name: "brown", stop: () => n.stop() };
  }

  function stop() {
    if (active) { try { active.stop(); } catch(e){} }
    active = null;
  }
  function setVolume(v) { if (masterGain) masterGain.gain.value = Math.max(0, Math.min(0.8, v)); }
  function activeName() { return active?.name || null; }

  function startNamed(name) {
    if (name === "rain")      return startRain();
    if (name === "fireplace") return startFireplace();
    if (name === "cafe")      return startCafe();
    if (name === "vinyl")     return startVinyl();
    if (name === "brown")     return startBrown();
    stop();
  }

  /* ---------- Soundtrack (per-scene URL) ---------- */
  let soundtrackEl = null;
  function playSoundtrack(url) {
    if (!url) { stopSoundtrack(); return; }
    if (!soundtrackEl) {
      soundtrackEl = document.createElement("audio");
      soundtrackEl.loop = true;
      soundtrackEl.volume = 0.5;
      document.body.appendChild(soundtrackEl);
    }
    if (soundtrackEl.src !== url) soundtrackEl.src = url;
    soundtrackEl.play().catch(() => {});
  }
  function stopSoundtrack() {
    if (soundtrackEl) { soundtrackEl.pause(); soundtrackEl.currentTime = 0; }
  }

  return { startNamed, stop, setVolume, activeName, playSoundtrack, stopSoundtrack, isPlaying: () => !!active };
})();
