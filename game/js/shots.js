// shots.js — the shot director. When the page opens with ?shot=cover|title|kitchen|end
// it stages a real run: fixed seed, fixed steps, autopilot moves, hazards primed into
// frame, then it freezes the frame so the driver can capture it. One job: staging.

import { COVER_FARMER_GAP, ESCAPE_DISTANCE, TUNING } from './config.js';

export const SHOT_NAMES = ['cover', 'title', 'kitchen', 'end'];

// Presets: the state each shot starts from. Scores are staged totals, not zeros.
const PRESETS = {
  cover: {
    distance: 89,
    score: 940,
    lives: 3,
    farmerGap: 2.8,
    nearMiss: 1,
    corn: 6,
    streak: 6,
    steps: 48,
    moves: [{ step: 22, action: 'right' }, { step: 40, action: 'jump' }],
    banner: { text: null, kind: 'moment', seconds: 1.2 },
  },
  title: {
    distance: 0,
    score: 0,
    lives: 3,
    farmerGap: 2.5,
    nearMiss: 0,
    corn: 0,
    streak: 0,
    steps: 30,
    moves: [],
    best: 12630,
    banner: null,
  },
  kitchen: {
    distance: 1050,
    score: 1920,
    lives: 2,
    farmerGap: 4.4,
    nearMiss: 3,
    corn: 14,
    streak: 4,
    steps: 72,
    moves: [{ step: 30, action: 'left' }, { step: 55, action: 'jump' }],
    banner: null,
  },
  end: {
    distance: 1492,
    score: 14500,
    lives: 2,
    farmerGap: 14,
    nearMiss: 9,
    corn: 24,
    streak: 12,
    steps: 40,
    moves: [{ step: 12, action: 'dash' }],
    best: 15110,
    banner: null,
  },
};

export class ShotDirector {
  constructor(game) {
    this.game = game;
    this.name = null;
    this.preset = null;
    this.step = 0;
    this.frozen = false;
    this.logLine = '';
  }

  static fromUrl() {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (!shot || !SHOT_NAMES.includes(shot)) return null;
    const seed = Number.parseInt(params.get('seed') || '7', 10) || 7;
    return { shot, seed };
  }

  start(name) {
    this.name = name;
    this.preset = PRESETS[name];
    const g = this.game;
    g.best = this.preset.best ?? g.best;
    g.resetRun();
    g.state.score = this.preset.score;
    g.state.distance = this.preset.distance;
    g.state.lives = this.preset.lives;
    g.state.nearMiss = this.preset.nearMiss;
    g.state.corn = this.preset.corn;
    g.state.streak = this.preset.streak;
    g.state.multiplier = Math.min(TUNING.maxMultiplier, 1 + Math.floor(this.preset.streak / TUNING.streakForMult));
    g.farmer.gap = this.preset.farmerGap;
    g.farmer.state = name === 'title' ? 'SEARCH' : 'CHASE';
    g.farmer.stateT = 0;
    if (name === 'title') {
      g.setState('TITLE');
      g.hud.showTitle(g.best, g.missions.list());
    } else if (name === 'kitchen') {
      // Make sure the kitchen has its hazards, then prime them into frame hot.
      g.obstacles.spawn('oven', 0, -30);
      g.obstacles.spawn('knife', 2, -24);
      g.obstacles.primeShotHazards();
    }
    if (name !== 'title') {
      g.setState('RUN');
      // The run shots are live gameplay: the title card must not cover them.
      g.hud.hideScreens();
    }
    this.step = 0;
  }

  // Advance one fixed step. Returns true once the shot has frozen.
  advance() {
    if (this.frozen || !this.preset) return true;
    const g = this.game;
    for (const move of this.preset.moves) {
      if (move.step === this.step) g.handleAction(move.action, true);
    }
    if (this.name === 'title') {
      g.stepAttract(1 / 60);
    } else {
      g.step(1 / 60);
      // The end shot lets the real rules carry the run over the line.
      if (this.name === 'end' && g.state.distance >= ESCAPE_DISTANCE && g.state.phase === 'RUN') {
        g.endRun(true);
      }
    }
    this.step += 1;
    if (this.step >= this.preset.steps || g.state.phase === 'END') {
      this.freeze();
      return true;
    }
    return false;
  }

  freeze() {
    const g = this.game;
    this.frozen = true;
    // A staged frame never catches the bird mid-blink: the hit flash is off.
    g.turkey.group.visible = true;
    if (this.name === 'cover') {
      // One near-miss is forced if the run did not earn one, banner live at freeze.
      if (g.state.nearMiss < 1) g.state.nearMiss = 1;
      // The staged totals: the run reads 89 m, the farmer is close behind,
      // and the near-miss pays its base +40 (multiplier one).
      g.state.score = this.preset.score;
      g.state.distance = this.preset.distance;
      g.state.streak = 4;
      g.state.multiplier = 1;
      g.farmer.gap = COVER_FARMER_GAP;
      g.farmer.group.position.z = g.farmer.gap;
      g.farmer.group.position.x = g.farmer.x;
      const pts = TUNING.nearMissPoints * g.state.multiplier;
      g.hud.showBanner(`THAT WAS CLOSE! +${pts}`, 'moment', 1.2);
      g.hud.setShout('That bird is MINE!');
      // Refresh the HUD so the staged distance and farmer gap are what shows.
      g.hud.update(0, {
        score: g.state.score,
        distance: g.state.distance,
        stageIndex: g.state.stageIndex,
        lives: g.state.lives,
        farmerGap: g.farmer.gap,
        farmerState: g.farmer.state,
        stamina: g.turkey.stamina,
        dashReady: g.turkey.dashCooldown <= 0 && g.turkey.stamina >= TUNING.dashStaminaCost,
        decoys: g.turkey.decoys,
        mission: g.missions.firstIncomplete(),
      });
    }
    if (this.name === 'end' && g.state.phase === 'END') {
      // The staged totals: the escaped run's score is its best.
      g.state.score = this.preset.best;
      g.best = this.preset.best;
      g.hud.hideBanner();
      g.hud.showEnd(g.endResult());
    }
    if (this.name === 'kitchen') {
      // Staged totals, like cover/end: the kitchen frame shows a clean run,
      // even if the live 72 steps took a hit on the way here.
      g.state.lives = this.preset.lives;
      g.hud.hideBanner();
      g.obstacles.primeShotHazards();
      // Refresh the hazard meshes from the primed phases (dt 0: no movement,
      // no events) so the oven glows and the knife sits blade-down in the shot.
      g.obstacles.update(0, 0, g.state.distance, null, g.turkey);
      // Step the farmer aside and lift the turkey mid-jump, so the bird is
      // not hidden behind the farmer in the frame.
      g.farmer.x = g.turkey.x + 1.5;
      g.farmer.group.position.x = g.farmer.x;
      g.turkey.y = 0.9;
      g.turkey.airborne = true;
      g.turkey.group.position.y = 0.9;
      // Refresh the HUD so the staged lives (2) are what shows, and make
      // sure no hit banner survived the freeze.
      g.hud.hideBanner();
      g.hud.update(0, {
        score: g.state.score,
        distance: g.state.distance,
        stageIndex: g.state.stageIndex,
        lives: g.state.lives,
        farmerGap: g.farmer.gap,
        farmerState: g.farmer.state,
        stamina: g.turkey.stamina,
        dashReady: g.turkey.dashCooldown <= 0 && g.turkey.stamina >= TUNING.dashStaminaCost,
        decoys: g.turkey.decoys,
        mission: g.missions.firstIncomplete(),
      });
    }
    g.render();
    const s = g.state;
    this.logLine = `${this.name}: farmer ${g.farmer.gap.toFixed(1)} m behind, near-miss ${s.nearMiss}, score ${Math.floor(s.score)}, moment banner ${this.name === 'cover' ? 'live' : 'n/a'}`;
    if (typeof console !== 'undefined') console.log(`[shot] ${this.logLine}`);
    const logEl = document.getElementById('shot-log');
    if (logEl) logEl.textContent = this.logLine;
    if (window.__TURKEY) window.__TURKEY.shotFrozen = true;
  }
}
