// audio.js — every sound is synthesized with WebAudio: no audio files, no network.
// One job: bleeps, gobbles and a small music loop, with a mute switch.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) {
      this.stopMusic();
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    } else if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  tone(freq, dur, type = 'sine', gain = 0.12, when = 0) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, gain = 0.15) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  gobble() {
    this.tone(320, 0.09, 'square', 0.08);
    this.tone(260, 0.09, 'square', 0.08, 0.1);
    this.tone(340, 0.12, 'square', 0.08, 0.2);
  }

  jump() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, t0);
    osc.frequency.exponentialRampToValueAtTime(520, t0 + 0.16);
    g.gain.setValueAtTime(0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }

  coin() {
    this.tone(880, 0.08, 'sine', 0.1);
    this.tone(1318, 0.12, 'sine', 0.09, 0.07);
  }

  dash() {
    this.noise(0.18, 0.1);
    this.tone(520, 0.12, 'triangle', 0.07);
  }

  hit() {
    this.noise(0.25, 0.2);
    this.tone(110, 0.3, 'sawtooth', 0.12);
  }

  nearMiss() {
    this.tone(660, 0.06, 'triangle', 0.08);
    this.tone(990, 0.1, 'triangle', 0.08, 0.06);
  }

  click() {
    this.tone(700, 0.05, 'square', 0.06);
  }

  fanfare() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone(n, 0.18, 'triangle', 0.1, i * 0.11));
  }

  startMusic() {
    if (this.muted || this.musicTimer) return;
    if (!this.ensure()) return;
    const bass = [110, 110, 131, 98];
    const pluck = [330, 392, 440, 392, 330, 294, 262, 294];
    this.musicTimer = window.setInterval(() => {
      if (this.muted) return;
      const b = bass[this.musicStep % bass.length];
      const p = pluck[this.musicStep % pluck.length];
      this.tone(b, 0.32, 'triangle', 0.05);
      if (this.musicStep % 2 === 0) this.tone(p, 0.16, 'sine', 0.045);
      this.musicStep += 1;
    }, 320);
  }

  stopMusic() {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
