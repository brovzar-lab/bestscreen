"use strict";
/* =============================================================================
 * BESTSCREEN AUDIO — Web Audio synthesized ambience + per-scene soundtrack
 *
 * Ambient sounds (rain, fireplace, cafe, vinyl) are synthesized in-browser —
 * no audio files needed. Soundtrack column lets you attach a URL per scene
 * (Spotify embed, SoundCloud, mp3 URL) that plays during read-aloud / read.
 * ============================================================================= */

const Audio = (() => {
  let ctx = null;
  let active = null;  // { stop }
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

  function makeNoise() {
    // Pre-baked 2-second buffer used as a looping noise source
    const dur = 2;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  function startRain() {
    ensureCtx();
    stop();
    // Two filtered noise sources: low hiss + occasional drop sounds
    const noise = makeNoise();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = 0.5;
    noise.connect(filt); filt.connect(g); g.connect(masterGain);
    noise.start();

    // Sparkles: short high-passed pings
    const tick = setInterval(() => {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1200 + Math.random() * 1800;
      og.gain.setValueAtTime(0, ctx.currentTime);
      og.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.005);
      og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(og); og.connect(masterGain);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    }, 120);
    active = { stop: () => { noise.stop(); clearInterval(tick); } };
  }

  function startFireplace() {
    ensureCtx(); stop();
    const noise = makeNoise();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = 500;
    const g = ctx.createGain(); g.gain.value = 1.2;
    noise.connect(filt); filt.connect(g); g.connect(masterGain);
    noise.start();
    // Crackles
    const tick = setInterval(() => {
      if (Math.random() > 0.45) return;
      const burst = makeNoise();
      const f = ctx.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 2400 + Math.random()*1600;
      f.Q.value = 2;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, ctx.currentTime);
      og.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12 + Math.random()*0.2);
      burst.connect(f); f.connect(og); og.connect(masterGain);
      burst.start(); burst.stop(ctx.currentTime + 0.4);
    }, 280);
    active = { stop: () => { noise.stop(); clearInterval(tick); } };
  }

  function startCafe() {
    ensureCtx(); stop();
    const noise = makeNoise();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.4;
    noise.connect(filt); filt.connect(g); g.connect(masterGain);
    noise.start();
    // Murmur: random bandpass bursts simulating voices
    const tick = setInterval(() => {
      if (Math.random() > 0.6) return;
      const burst = makeNoise();
      const f = ctx.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 300 + Math.random()*400;
      f.Q.value = 4;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, ctx.currentTime);
      og.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.05);
      og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8 + Math.random()*0.7);
      burst.connect(f); f.connect(og); og.connect(masterGain);
      burst.start(); burst.stop(ctx.currentTime + 1.5);
    }, 320);
    // Cup clinks occasionally
    const tick2 = setInterval(() => {
      if (Math.random() > 0.92) {
        const osc = ctx.createOscillator(); osc.type = "triangle";
        osc.frequency.value = 1800 + Math.random()*800;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0, ctx.currentTime);
        og.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.005);
        og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.connect(og); og.connect(masterGain);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
      }
    }, 250);
    active = { stop: () => { noise.stop(); clearInterval(tick); clearInterval(tick2); } };
  }

  function startVinyl() {
    ensureCtx(); stop();
    // Soft pink noise + click track
    const noise = makeNoise();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = 600;
    const g = ctx.createGain(); g.gain.value = 0.25;
    noise.connect(filt); filt.connect(g); g.connect(masterGain);
    noise.start();
    const tick = setInterval(() => {
      const osc = ctx.createOscillator(); osc.type = "square";
      osc.frequency.value = 3000;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, ctx.currentTime);
      og.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 0.002);
      og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
      osc.connect(og); og.connect(masterGain);
      osc.start(); osc.stop(ctx.currentTime + 0.03);
    }, 670); // ~33⅓ rpm click
    active = { stop: () => { noise.stop(); clearInterval(tick); } };
  }

  function stop() {
    if (active) { try { active.stop(); } catch(e){} }
    active = null;
  }
  function setVolume(v) { if (masterGain) masterGain.gain.value = Math.max(0, Math.min(0.6, v)); }

  function startNamed(name) {
    if (name === "rain")      return startRain();
    if (name === "fireplace") return startFireplace();
    if (name === "cafe")      return startCafe();
    if (name === "vinyl")     return startVinyl();
    stop();
  }

  // ---------- Soundtrack (per-scene URL) ----------
  let soundtrackEl = null;
  function playSoundtrack(url) {
    if (!url) { stopSoundtrack(); return; }
    if (!soundtrackEl) {
      soundtrackEl = document.createElement("audio");
      soundtrackEl.loop = true;
      soundtrackEl.volume = 0.5;
      document.body.appendChild(soundtrackEl);
    }
    if (soundtrackEl.src !== url) {
      soundtrackEl.src = url;
    }
    soundtrackEl.play().catch(() => {});
  }
  function stopSoundtrack() {
    if (soundtrackEl) { soundtrackEl.pause(); soundtrackEl.currentTime = 0; }
  }

  return { startNamed, stop, setVolume, playSoundtrack, stopSoundtrack, isPlaying: () => !!active };
})();
