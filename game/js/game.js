// game.js — the orchestrator: boot, main loop, state machine, scoring, collisions,
// camera, and the debug handle the driver uses. Everything else is a module it calls.

import * as THREE from 'three';
import { STAGES, TUNING, ESCAPE_DISTANCE, stageAt, stageIndexAt, mulberry32, clamp } from './config.js';
import { Turkey } from './turkey.js';
import { Farmer } from './farmer.js';
import { Track } from './track.js';
import { Obstacles } from './obstacles.js';
import { Coins } from './coins.js';
import { Missions } from './missions.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { ShotDirector } from './shots.js';

const BEST_KEY = 'turkey-runner-best';

const CAMERA_PRESETS = {
  run: { pos: [0, 2.7, 6.8], look: [0, 1.0, -6] },
  cover: { pos: [0.4, 2.4, 6.6], look: [0.2, 1.0, -4] },
  kitchen: { pos: [0, 2.8, 8.0], look: [0, 1.0, -6] },
  title: { pos: [3.6, 2.4, 7.5], look: [-0.5, 1.2, -2] },
  end: { pos: [0, 3.1, 8.0], look: [0, 1.0, -6] },
};

export class Game {
  constructor(container, seed) {
    this.container = container;
    this.rng = mulberry32(seed ?? ((Date.now() % 2147483647) + 1));
    this.best = this.loadBest();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.1, 220);
    this.cameraPreset = CAMERA_PRESETS.run;
    this.camera.position.set(0, 2.7, 6.8);

    const hemi = new THREE.HemisphereLight(0xfff2d0, 0x8a6a42, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe0a0, 2.1);
    sun.position.set(8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    this.scene.add(sun);
    this.scene.add(sun.target);

    this.track = new Track(this.scene, this.rng);
    this.turkey = new Turkey(this.scene);
    this.farmer = new Farmer(this.scene, this.rng);
    this.obstacles = new Obstacles(this.scene, this.rng);
    this.coins = new Coins(this.scene, this.rng);
    this.missions = new Missions();
    this.audio = new AudioEngine();
    this.hud = new Hud({
      onStart: () => this.startRun(),
      onResume: () => this.togglePause(),
      onRestart: () => this.startRun(),
      onPause: () => this.togglePause(),
      onMute: () => this.toggleMute(),
    });
    this.input = new Input((action) => this.handleAction(action, false));
    this.input.attachTouch(this.renderer.domElement);
    this.input.attachClick(this.renderer.domElement);

    this.state = {
      phase: 'TITLE',
      score: 0,
      distance: 0,
      lives: TUNING.lives,
      nearMiss: 0,
      corn: 0,
      streak: 0,
      multiplier: 1,
      comboT: 0,
      slowmoT: 0,
      invulnT: 0,
      shakeT: 0,
      speed: TUNING.runSpeed,
      stageIndex: 0,
      cause: '',
    };
    this.shot = null;
    this.clock = { last: performance.now() };
    this.destroyed = false;

    window.addEventListener('resize', () => this.resize());
    this.hud.setMuted(this.audio.muted);
    this.hud.showTitle(this.best, this.missions.list());
    this.installDebugHandle();
  }

  loadBest() {
    try {
      const v = Number.parseInt(window.localStorage.getItem(BEST_KEY) || '0', 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0;
    }
  }

  saveBest() {
    try {
      window.localStorage.setItem(BEST_KEY, String(this.best));
    } catch {
      // Storage can be off; the best still lives in memory for the session.
    }
  }

  installDebugHandle() {
    const g = this;
    window.__TURKEY = {
      game: g,
      get phase() { return g.state.phase; },
      get score() { return Math.floor(g.state.score); },
      get distance() { return g.state.distance; },
      get lives() { return g.state.lives; },
      get farmerGap() { return g.farmer.gap; },
      get farmerState() { return g.farmer.state; },
      get muted() { return g.audio.muted; },
      get lane() { return g.turkey.lane; },
      get airborne() { return g.turkey.airborne; },
      get rolling() { return g.turkey.rolling; },
      get dashing() { return g.turkey.dashing; },
      get stamina() { return g.turkey.stamina; },
      get decoys() { return g.turkey.decoys; },
      shotFrozen: false,
      shotLog: '',
      debug: {
        start: () => g.startRun(),
        spawnObstacleAtTurkey(kind) { g.obstacles.spawn(kind || 'crate', g.turkey.lane, -0.5); },
        setLives(n) { g.state.lives = n; },
        setDistance(d) { g.state.distance = d; },
        setFarmerGap(gap) { g.farmer.gap = gap; },
        setScore(n) { g.state.score = n; },
        setBest(n) { g.best = n; },
        endRun(escaped) { g.endRun(escaped); },
      },
    };
  }

  setState(phase) {
    this.state.phase = phase;
  }

  setCameraPreset(name) {
    this.cameraPreset = CAMERA_PRESETS[name] || CAMERA_PRESETS.run;
  }

  resetRun() {
    this.state.score = 0;
    this.state.distance = 0;
    this.state.lives = TUNING.lives;
    this.state.nearMiss = 0;
    this.state.corn = 0;
    this.state.streak = 0;
    this.state.multiplier = 1;
    this.state.comboT = 0;
    this.state.slowmoT = 0;
    this.state.invulnT = 0;
    this.state.shakeT = 0;
    this.state.stageIndex = 0;
    this.state.cause = '';
    this.turkey.reset();
    this.farmer.reset();
    this.obstacles.reset();
    this.coins.reset();
    this.missions.reset();
    this.track.applyStage(0, true);
  }

  startRun() {
    this.audio.ensure();
    this.audio.click();
    this.resetRun();
    this.setState('RUN');
    this.setCameraPreset('run');
    this.hud.hideScreens();
    this.hud.setPausedIcon(false);
    this.audio.startMusic();
  }

  togglePause() {
    if (this.state.phase === 'RUN') {
      this.setState('PAUSED');
      this.hud.showPause(true);
      this.hud.setPausedIcon(true);
      this.audio.stopMusic();
    } else if (this.state.phase === 'PAUSED') {
      this.setState('RUN');
      this.hud.showPause(false);
      this.hud.setPausedIcon(false);
      this.audio.startMusic();
    }
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.hud.setMuted(this.audio.muted);
  }

  handleAction(action, fromShot) {
    if (action === 'mute') {
      this.toggleMute();
      return;
    }
    if (action === 'confirm') {
      if (this.state.phase === 'TITLE' || this.state.phase === 'END') this.startRun();
      return;
    }
    if (this.state.phase === 'TITLE') return;
    if (this.state.phase === 'END') return;
    if (action === 'pause') {
      this.togglePause();
      return;
    }
    if (this.state.phase !== 'RUN') return;
    switch (action) {
      case 'left':
        this.turkey.moveLeft();
        break;
      case 'right':
        this.turkey.moveRight();
        break;
      case 'jump':
        if (this.turkey.jump()) this.audio.jump();
        break;
      case 'roll':
        this.turkey.roll();
        break;
      case 'dash':
        if (this.turkey.dash()) {
          this.audio.dash();
          this.hud.showBanner('FEATHER DASH!', 'moment', 0.7);
        }
        break;
      case 'decoy': {
        if (this.turkey.useDecoy()) {
          this.farmer.forceSearch([]);
          this.hud.showBanner('WRONG BIRD!', 'info', 1.0);
          this.audio.gobble();
        }
        break;
      }
      default:
        break;
    }
    void fromShot;
  }

  applyEvent(ev) {
    const s = this.state;
    if (ev.type === 'coin') {
      s.corn += 1;
      s.streak += 1;
      s.comboT = TUNING.comboTimeout;
      s.score += TUNING.cornPoints * s.multiplier;
      this.audio.coin();
      const done = this.missions.feed({ type: 'coin' });
      if (done) this.missionDone(done);
    } else if (ev.type === 'nearMiss') {
      s.nearMiss += 1;
      s.streak += 1;
      s.comboT = TUNING.comboTimeout;
      const pts = TUNING.nearMissPoints * s.multiplier;
      s.score += pts;
      s.slowmoT = 0.45;
      this.audio.nearMiss();
      this.hud.showBanner(`THAT WAS CLOSE! +${pts}`, 'moment', 1.0);
      const done = this.missions.feed({ type: 'nearMiss' });
      if (done) this.missionDone(done);
    } else if (ev.type === 'lungeDodged') {
      s.nearMiss += 1;
      s.streak += 1;
      s.comboT = TUNING.comboTimeout;
      const pts = TUNING.nearMissPoints * s.multiplier;
      s.score += pts;
      this.hud.showBanner(`SLIPPED THE GRAB! +${pts}`, 'moment', 1.0);
      this.audio.nearMiss();
    } else if (ev.type === 'hit') {
      if (s.invulnT > 0) return;
      s.lives -= 1;
      s.invulnT = TUNING.invulnAfterHit;
      s.streak = 0;
      s.multiplier = 1;
      s.shakeT = 0.35;
      this.farmer.gap = Math.max(TUNING.farmerMinGap, this.farmer.gap - TUNING.hitFarmerGain);
      this.audio.hit();
      this.hud.showBanner('CLIPPED!', 'danger', 0.9);
      if (this.hud.flash) this.hud.flash();
      if (s.lives <= 0) this.endRun(false, ev.cause || 'obstacle');
    } else if (ev.type === 'banner') {
      if (ev.key === 'corner') this.hud.showBanner('CUT OFF!', 'danger', 0.9);
      if (ev.key === 'spotted') this.hud.showBanner('SPOTTED!', 'danger', 0.9);
    }
  }

  missionDone(id) {
    const s = this.state;
    s.score += TUNING.missionBonus;
    this.hud.showBanner(`MISSION DONE! +${TUNING.missionBonus}`, 'info', 1.2);
    this.audio.fanfare();
    void id;
  }

  endResult() {
    const s = this.state;
    return {
      escaped: s.distance >= ESCAPE_DISTANCE,
      score: Math.floor(s.score),
      distance: s.distance,
      corn: s.corn,
      multiplier: s.multiplier,
      dodges: s.nearMiss,
      best: this.best,
      cause: s.cause,
    };
  }

  endRun(escaped, cause) {
    const s = this.state;
    if (s.phase === 'END') return;
    s.cause = cause || (escaped ? '' : 'obstacle');
    if (escaped) s.distance = Math.max(s.distance, ESCAPE_DISTANCE);
    const finalScore = Math.floor(s.score);
    if (finalScore > this.best) {
      this.best = finalScore;
      this.saveBest();
    }
    this.setState('END');
    this.setCameraPreset('end');
    this.audio.stopMusic();
    if (escaped) this.audio.fanfare();
    else this.audio.hit();
    this.hud.showEnd(this.endResult());
  }

  difficulty() {
    const stage = stageAt(this.state.distance);
    return {
      farmerRate: stage.farmerRate,
      stageIndex: stageIndexAt(this.state.distance),
    };
  }

  step(dt) {
    const s = this.state;
    if (s.phase !== 'RUN') return;
    const stage = stageAt(s.distance);
    const speed = stage.speed * (this.turkey.dashing ? TUNING.dashSpeedMult : 1);
    s.speed = speed;
    s.distance += speed * dt;
    s.score += speed * dt * TUNING.distancePointsPerMetre;
    s.stageIndex = stageIndexAt(s.distance);

    if (s.comboT > 0) {
      s.comboT -= dt;
      if (s.comboT <= 0) {
        s.streak = 0;
        s.multiplier = 1;
      }
    } else {
      s.multiplier = Math.min(TUNING.maxMultiplier, 1 + Math.floor(s.streak / TUNING.streakForMult));
    }
    if (s.invulnT > 0) {
      s.invulnT -= dt;
      this.turkey.group.visible = Math.floor(s.invulnT * 12) % 2 === 0;
    } else {
      this.turkey.group.visible = true;
    }
    if (s.shakeT > 0) s.shakeT -= dt;

    const events = [];
    this.turkey.update(dt, speed, this.farmer.gap);
    this.farmer.update(dt, this.turkey, this.difficulty(), events);
    this.track.update(dt, s.distance, speed);
    this.obstacles.update(dt, speed, s.distance, events, this.turkey);
    this.coins.update(dt, speed, s.distance, events, this.turkey);
    for (const ev of events) this.applyEvent(ev);
    this.missions.feed({ type: 'distance', value: s.distance });

    // The farmer's shout, when he is close enough to be heard.
    this.hud.setShout(this.farmer.shout);
    this.hud.update(dt, {
      score: s.score,
      distance: s.distance,
      stageIndex: s.stageIndex,
      lives: s.lives,
      farmerGap: this.farmer.gap,
      farmerState: this.farmer.state,
      stamina: this.turkey.stamina,
      dashReady: this.turkey.dashCooldown <= 0 && this.turkey.stamina >= TUNING.dashStaminaCost,
      decoys: this.turkey.decoys,
      mission: this.missions.firstIncomplete(),
    });

    if (s.distance >= ESCAPE_DISTANCE) {
      this.endRun(true);
      return;
    }
    this.updateCamera(dt);
  }

  stepAttract(dt) {
    // The title screen's living backdrop: the bird runs, the farmer searches.
    const speed = 6;
    this.turkey.update(dt, speed, this.farmer.gap);
    this.farmer.update(dt, this.turkey, { farmerRate: 0.1, stageIndex: 0 }, null);
    this.track.update(dt, this.state.distance, speed);
    this.obstacles.update(dt, speed, this.state.distance, null, this.turkey);
    this.coins.update(dt, speed, this.state.distance, null, this.turkey);
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const p = this.cameraPreset;
    const tx = this.turkey.x * 0.55 + p.pos[0] * 0.45;
    const target = new THREE.Vector3(
      this.turkey.x * 0.55 + p.pos[0],
      p.pos[1],
      p.pos[2],
    );
    const look = new THREE.Vector3(
      this.turkey.x * 0.7 + p.look[0],
      p.look[1],
      p.look[2],
    );
    this.camera.position.lerp(target, Math.min(1, dt * 5));
    if (this.state.shakeT > 0) {
      this.camera.position.x += (this.rng() - 0.5) * 0.3;
      this.camera.position.y += (this.rng() - 0.5) * 0.2;
    }
    this.camera.lookAt(look);
    void tx;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  loop() {
    if (this.destroyed) return;
    window.requestAnimationFrame(() => this.loop());
    const now = performance.now();
    let dt = Math.min((now - this.clock.last) / 1000, 0.05);
    this.clock.last = now;
    if (this.state.slowmoT > 0) {
      this.state.slowmoT -= dt;
      dt *= 0.45;
    }
    if (this.state.phase === 'RUN') this.step(dt);
    else if (this.state.phase === 'TITLE') this.stepAttract(dt);
    this.render();
  }

  run() {
    const shotInfo = ShotDirector.fromUrl();
    if (shotInfo) {
      // Staged mode: fixed steps, then freeze. No live loop.
      this.rng = mulberry32(shotInfo.seed);
      this.shot = new ShotDirector(this);
      this.setCameraPreset(shotInfo.shot === 'title' ? 'title' : shotInfo.shot);
      this.shot.start(shotInfo.shot);
      while (!this.shot.advance()) {
        // Steps run synchronously; the frame freezes at the end.
      }
      window.__TURKEY.shotLog = this.shot.logLine;
      return;
    }
    this.loop();
  }
}

// Boot: the page loads this module, the game starts.
const root = document.getElementById('game-root');
const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') || '', 10);
const game = new Game(root, Number.isFinite(seedParam) && seedParam > 0 ? seedParam : undefined);
game.run();
