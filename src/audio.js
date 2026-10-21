// All sound is synthesised with the Web Audio API: noise beds for water,
// breeze and rain, plus scheduled events (birds by day, crickets and frogs at
// night, swan calls, splashes and the throb of swan wings).

const rand = (a, b) => a + Math.random() * (b - a);

export class PondAudio {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.state = { day: 1, night: 0, rain: 0, wind: 0 };
    this.timers = { bird: 2, cricket: 0, frog: 4 };
  }

  init() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 3;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    this.water = this.bed(this.brown, 'lowpass', 520, 0.7);
    this.breeze = this.bed(this.white, 'bandpass', 700, 0.6);
    this.rain = this.bed(this.white, 'highpass', 1400, 0.5);
    this.rainLow = this.bed(this.brown, 'lowpass', 900, 0.5);
    // Slow swell on the water bed.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = ctx.createGain();
    lg.gain.value = 0.05;
    lfo.connect(lg).connect(this.water.gain.gain);
    lfo.start();
  }

  bed(buffer, type, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(f).connect(gain).connect(this.master);
    src.start();
    return { src, filter: f, gain };
  }

  async setEnabled(on) {
    this.on = on;
    if (on && !this.ctx) this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on) {
      await this.ctx.resume();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.85, t, 0.15);
    } else {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.12);
      clearTimeout(this.suspendT);
      this.suspendT = setTimeout(() => { if (!this.on) this.ctx.suspend(); }, 700);
    }
  }

  setHidden(hidden) {
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend();
    else if (this.on) this.ctx.resume();
  }

  get live() { return this.ctx && this.on && this.ctx.state === 'running'; }

  out(pan = 0) {
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan / 16));
    g.connect(p).connect(this.master);
    return g;
  }

  noise(dest, type, freq, q, t0, dur, peak, attack = 0.01) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = rand(0.9, 1.1);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 2);
    src.stop(t0 + dur + 0.05);
    return f;
  }

  tone(dest, type, f0, f1, t0, dur, peak) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  update(dt, s) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    const set = (node, v) => node.gain.gain.setTargetAtTime(v, t, 0.4);
    set(this.water, 0.11 * (1 - s.night * 0.35) + s.wind * 0.04);
    set(this.breeze, 0.012 + s.wind * 0.07);
    this.breeze.filter.frequency.setTargetAtTime(600 + s.wind * 500, t, 0.5);
    set(this.rain, s.rain * 0.09);
    set(this.rainLow, s.rain * 0.06);

    const day = Math.max(0, 1 - s.night * 1.6);
    this.timers.bird -= dt;
    if (this.timers.bird < 0) { this.timers.bird = rand(3, 9) / Math.max(0.15, day); if (day > 0.3 && s.rain < 0.5) this.bird(day); }
    this.timers.cricket -= dt;
    if (s.night > 0.3 && this.timers.cricket < 0) { this.timers.cricket = rand(0.35, 0.9); this.cricket(s.night); }
    this.timers.frog -= dt;
    if (s.night > 0.5 && this.timers.frog < 0) { this.timers.frog = rand(4, 12); this.frog(); }
  }

  bird(level) {
    const t = this.ctx.currentTime, out = this.out(rand(-14, 14));
    const n = Math.floor(rand(2, 6));
    const base = rand(2600, 4200);
    for (let i = 0; i < n; i++) {
      const t0 = t + i * rand(0.09, 0.16);
      this.tone(out, 'sine', base * rand(0.9, 1.15), base * rand(1.1, 1.5), t0, rand(0.05, 0.11), 0.018 * level);
    }
  }

  cricket(level) {
    const t = this.ctx.currentTime, out = this.out(rand(-16, 16));
    const f = rand(4300, 4900);
    for (let i = 0; i < 3; i++) this.tone(out, 'sine', f, f * 0.99, t + i * 0.032, 0.022, 0.008 * level);
  }

  frog() {
    const t = this.ctx.currentTime, out = this.out(rand(-14, 14));
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(180, 260), t);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    for (let i = 0; i < 6; i++) { g.gain.setValueAtTime(0.03, t + i * 0.04); g.gain.setValueAtTime(0, t + i * 0.04 + 0.022); }
    o.connect(f).connect(g).connect(out);
    o.start(t); o.stop(t + 0.3);
  }

  splash(strength = 1, x = 0) {
    if (!this.live) return;
    const t = this.ctx.currentTime, out = this.out(x);
    this.noise(out, 'bandpass', 900, 0.8, t, 0.55 * strength + 0.2, 0.32 * strength);
    this.noise(out, 'lowpass', 400, 0.7, t, 0.8, 0.25 * strength);
    for (let i = 0; i < 3; i++) this.tone(out, 'sine', rand(300, 500), rand(800, 1300), t + 0.05 + i * rand(0.04, 0.12), 0.07, 0.05 * strength);
  }

  plop(x = 0, s = 1) {
    if (!this.live) return;
    const t = this.ctx.currentTime, out = this.out(x);
    // Musical droplet: a bubble's rising pitch, tuned to a pentatonic step.
    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const f = notes[Math.floor(Math.random() * notes.length)];
    this.tone(out, 'sine', f * 0.7, f, t, 0.16, 0.05 * s);
    this.noise(out, 'bandpass', 1800, 1.5, t, 0.08, 0.02 * s);
  }

  slap(x = 0) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.noise(this.out(x), 'bandpass', 600, 1.2, t, 0.12, 0.12);
  }

  hiss(x = 0) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.noise(this.out(x), 'highpass', 3200, 0.6, t, 1.0, 0.07, 0.08);
  }

  bugle(x = 0, pitch = 1) {
    if (!this.live) return;
    const t = this.ctx.currentTime, out = this.out(x);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.4;
    f.connect(out);
    // Two-note "whoop-ah", the call whoopers and trumpeters are named for.
    [[560, 0, 0.32], [470, 0.36, 0.42]].forEach(([hz, dt, dur]) => {
      const o = this.tone(f, 'sawtooth', hz * pitch, hz * pitch * 0.94, t + dt, dur, 0.05);
      const vib = this.ctx.createOscillator();
      vib.frequency.value = 6;
      const vg = this.ctx.createGain();
      vg.gain.value = 8;
      vib.connect(vg).connect(o.frequency);
      vib.start(t + dt); vib.stop(t + dt + dur);
    });
  }

  whistle(x = 0) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.tone(this.out(x), 'triangle', 900, 1150, t, 0.35, 0.025);
  }

  // The rhythmic throbbing of swan wings (mute swans are loud in flight).
  wings(duration, x = 0) {
    if (!this.live) return;
    const t = this.ctx.currentTime, out = this.out(x);
    const beats = Math.floor(duration * 3);
    for (let i = 0; i < beats; i++) this.noise(out, 'bandpass', 380, 1.6, t + i * 0.33, 0.24, 0.12, 0.06);
  }
}
