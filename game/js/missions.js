// missions.js — three small goals that give the run a reason to be replayed.
// One job: define the missions, track progress, pay the bonus when one completes.

import { TUNING } from './config.js';

export const MISSION_DEFS = [
  { id: 'corn', label: 'Gather 15 corn', target: 15, kind: 'corn' },
  { id: 'dodges', label: 'Dodge past 5 hazards', target: 5, kind: 'nearMiss' },
  { id: 'kitchen', label: 'Reach the kitchen', target: 1000, kind: 'distance' },
];

export class Missions {
  constructor() {
    this.reset();
  }

  reset() {
    this.progress = { corn: 0, nearMiss: 0, distance: 0 };
    this.done = { corn: false, dodges: false, kitchen: false };
    this.completedCount = 0;
  }

  // Feed one event at a time; returns the mission id that just completed, or null.
  feed(event) {
    if (event.type === 'coin') this.progress.corn += 1;
    if (event.type === 'nearMiss') this.progress.nearMiss += 1;
    if (event.type === 'distance') this.progress.distance = Math.max(this.progress.distance, event.value);
    for (const def of MISSION_DEFS) {
      if (this.done[def.id]) continue;
      if (this.progress[def.kind] >= def.target) {
        this.done[def.id] = true;
        this.completedCount += 1;
        return def.id;
      }
    }
    return null;
  }

  list() {
    return MISSION_DEFS.map((def) => ({
      id: def.id,
      label: def.label,
      target: def.target,
      value: Math.min(this.progress[def.kind], def.target),
      done: this.done[def.id],
    }));
  }

  // The first mission still open, or null when the run has cleared them all.
  firstIncomplete() {
    return this.list().find((m) => !m.done) || null;
  }

  get bonus() {
    return TUNING.missionBonus;
  }
}
