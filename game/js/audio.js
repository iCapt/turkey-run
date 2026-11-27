// Turkey Runner — all sound is synthesized with WebAudio: no audio files.
// One job: gobbles, coin pings, thuds, fanfares and farm ambience.
export class SoundBank {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.ambientNodes = null;
  }

  // Must be called from a user gesture at least once (the Start button does it).
  ensure() {
    try {
      if (!this.context) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.context = new AC();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume();
      return true;
    } catch (error) {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
    return this.muted;
  }

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.context || this.muted) return;
    try {
      const t0 = this.context.currentTime;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol || 0.2, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain); gain.connect(this.master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch (error) { /* sound is decoration; never break the game */ }
  }

  _noise(dur, vol, filterFreq) {
    if (!this.context || this.muted) return;
    try {
      const t0 = this.context.currentTime;
      const len = Math.floor(this.context.sampleRate * dur);
      const buffer = this.context.createBuffer(1, len, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.context.createBufferSource();
      src.buffer = buffer;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = filterFreq || 800;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(vol || 0.25, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter); filter.connect(gain); gain.connect(this.master);
      src.start(t0);
    } catch (error) { /* ignore */ }
  }

  // The turkey's own voice: three fast descending squawks.
  gobble() {
    if (!this.context || this.muted) return;
    [0, 0.09, 0.18].forEach((delay, i) => {
      setTimeout(() => this._tone(620 - i * 90, 0.09, 'sawtooth', 0.12, 300 - i * 40), delay * 1000);
    });
  }

  coin() {
    this._tone(988, 0.07, 'sine', 0.16);
    setTimeout(() => this._tone(1319, 0.12, 'sine', 0.16), 60);
  }

  jump() { this._tone(280, 0.16, 'sine', 0.12, 620); }

  roll() { this._noise(0.14, 0.1, 1200); }

  thud() {
    this._noise(0.22, 0.35, 500);
    this._tone(110, 0.25, 'sine', 0.3, 55);
  }

  powerup() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.14, 'triangle', 0.18), i * 70));
  }

  shieldPop() {
    this._tone(880, 0.1, 'square', 0.12, 220);
    this._noise(0.18, 0.2, 2400);
  }

  mission() {
    [784, 988].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, 'triangle', 0.18), i * 90));
  }

  stageFanfare() {
    [392, 523, 659].forEach((f, i) => setTimeout(() => this._tone(f, 0.18, 'triangle', 0.16), i * 110));
  }

  caught() {
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this._tone(f, 0.28, 'sawtooth', 0.14), i * 160));
  }

  escaped() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'triangle', 0.16), i * 120));
  }

  click() { this._tone(700, 0.05, 'square', 0.08); }

  // Soft wind + the odd distant bird: loops quietly under the game.
  startAmbience() {
    if (!this.context || this.ambientNodes) return;
    try {
      const len = this.context.sampleRate * 2;
      const buffer = this.context.createBuffer(1, len, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const src = this.context.createBufferSource();
      src.buffer = buffer; src.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 320;
      const gain = this.context.createGain();
      gain.gain.value = 0.035;
      const lfo = this.context.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoGain = this.context.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain); lfoGain.connect(gain.gain);
      src.connect(filter); filter.connect(gain); gain.connect(this.master);
      src.start(); lfo.start();
      this.ambientNodes = { src, lfo };
    } catch (error) { /* ignore */ }
  }
}
