// Turkey Run 3D — rotating missions and the score multiplier.
// One job: three live goals; finishing all three steps the multiplier up.
import { MISSION_POOL, MULTIPLIERS } from './config.js';

export class Missions {
  constructor() {
    this.active = [];
    this.multiplierIndex = 0;
    this.setsCompleted = 0;
    this.random = Math.random;
    this.onEvent = null; // (eventName, payload) — hud toasts + sounds
  }

  get multiplier() {
    return MULTIPLIERS[Math.min(this.multiplierIndex, MULTIPLIERS.length - 1)];
  }

  reset(random) {
    this.random = random || Math.random;
    this.multiplierIndex = 0;
    this.setsCompleted = 0;
    this._dealSet();
  }

  _dealSet() {
    const pool = [...MISSION_POOL];
    this.active = [];
    for (let i = 0; i < 3; i += 1) {
      const idx = Math.floor(this.random() * pool.length);
      const template = pool.splice(idx, 1)[0];
      const tier = Math.min(this.setsCompleted, 2);
      this.active.push({
        kind: template.kind,
        text: template.text,
        target: template.targets[tier],
        progress: 0,
        done: false,
      });
    }
  }

  // Feed gameplay events: 'corn' (n), 'distance' (meters total), 'dodge' (n),
  // 'jump' (n), 'line' (coin lines completed), 'powerup' (n).
  event(kind, value) {
    let changed = false;
    for (const m of this.active) {
      if (m.done) continue;
      if (kind === 'corn' && m.kind === 'corn') { m.progress += value; changed = true; }
      else if (kind === 'distance' && m.kind === 'distance') { m.progress = Math.floor(value); changed = true; }
      else if (kind === 'dodge' && m.kind === 'dodge') { m.progress += value; changed = true; }
      else if (kind === 'jump' && m.kind === 'jump') { m.progress += value; changed = true; }
      else if (kind === 'line' && m.kind === 'coins') { m.progress += value; changed = true; }
      else if (kind === 'powerup' && m.kind === 'powerup') { m.progress += value; changed = true; }
      if (!m.done && m.progress >= m.target) {
        m.done = true;
        m.progress = m.target;
        if (this.onEvent) this.onEvent('mission-done', m);
      }
    }
    if (changed && this.active.every((m) => m.done)) {
      this.setsCompleted += 1;
      this.multiplierIndex = Math.min(this.multiplierIndex + 1, MULTIPLIERS.length - 1);
      if (this.onEvent) this.onEvent('set-done', { multiplier: this.multiplier });
      this._dealSet();
    }
  }

  snapshot() {
    return this.active.map((m) => ({ text: m.text, progress: m.progress, target: m.target, done: m.done }));
  }
}
