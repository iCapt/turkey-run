// Turkey Run 3D — the game itself: loop, physics, collisions, stages, scoring.
// One job: own the run state and tie every module together.
import * as THREE from 'three';
import {
  LANES, GRAVITY, JUMP_VELOCITY, ROLL_SECONDS, INVULN_SECONDS,
  BOARD_SECONDS, MAGNET_SECONDS, SLOWMO_SECONDS, SLOWMO_FACTOR,
  START_LIVES, ESCAPE_DISTANCE, BASE_SPEED, MAX_SPEED, SPEED_PER_100M,
  STAGES, mulberry32, clamp,
} from './config.js';
import { Turkey } from './turkey.js';
import { Farmer } from './farmer.js';
import { Track } from './track.js';
import { Obstacles } from './obstacles.js';
import { Coins } from './coins.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { stageShot, shotFromUrl } from './shots.js';

export class Game {
  constructor() {
    this.app = document.getElementById('app');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.app.prepend(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(STAGES[0].sky);
    this.scene.fog = new THREE.Fog(STAGES[0].fog, 26, 95);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 220);
    this.camera.position.set(0, 3.6, -7.4);

    this.track = new Track(this.scene);
    this.turkeyModel = new Turkey();
    this.scene.add(this.turkeyModel.group);
    this.farmerModel = new Farmer();
    this.scene.add(this.farmerModel.group);
    this.obstacles = new Obstacles(this.scene);
    this.coins = new Coins(this.scene);
    this.missions = new Missions();
    this.sound = new SoundBank();
    this.hud = new Hud({
      onStart: () => this.startRun(),
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
      onPause: () => this.togglePause(),
      onMute: () => this.toggleMute(),
    });
    this.input = new Input(this.app, {
      onLane: (dir) => this.changeLane(dir),
      onJump: () => this.jump(),
      onRoll: () => this.roll(),
      onPause: () => this.togglePause(),
      onMute: () => this.toggleMute(),
      onConfirm: () => { if (this.state === 'title' || this.state === 'over') this.startRun(); },
    });

    // The hoverboard tray the turkey rides when the power-up is active.
    this.boardMesh = this._buildBoardMesh();
    this.boardMesh.visible = false;
    this.turkeyModel.group.add(this.boardMesh);

    this.missions.onEvent = (name, payload) => {
      if (name === 'mission-done') {
        this.hud.showToast(`Mission done: ${payload.text}!`);
        this.sound.mission();
      } else if (name === 'set-done') {
        this.hud.showToast(`All missions done — multiplier ×${payload.multiplier}!`);
        this.sound.mission();
      }
    };

    this.state = 'title';
    this.frozen = false; // screenshot staging freezes the loop after posing
    this.time = 0;
    this.distance = 0;
    this.score = 0;
    this.coinCount = 0;
    this.lives = START_LIVES;
    this.stageIndex = 0;
    this.farmerGap = 14;
    this.speed = 0;
    this.shakeT = 0;
    this.random = mulberry32((Date.now() % 100000) | 0);
    this.player = {
      lane: 1, x: 0, y: 0, vy: 0,
      rolling: false, rollT: 0, invuln: 0,
      board: null, magnet: 0, slowmo: 0,
    };

    this.missions.reset(this.random);
    this.track.setStage(0, this.random);
    this.hud.showScreen('title');
    this.hud.update(this._hudState());
    this.hud.showBest();

    window.addEventListener('resize', () => this._onResize());
    this._onResize();
    this._loop = this._loop.bind(this);
    this._last = performance.now();
    requestAnimationFrame(this._loop);
  }

  _buildBoardMesh() {
    const g = new THREE.Group();
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.07, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.3, metalness: 0.75 }),
    );
    tray.castShadow = true;
    g.add(tray);
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.04, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xf2b705, emissive: 0xf2b705, emissiveIntensity: 1.2 }),
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.y = -0.05;
    g.add(glow);
    g.position.y = 0.06;
    return g;
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _hudState() {
    const powerup = this.player.board
      ? { kind: 'tray', left: this.player.board.left, total: this.player.board.total }
      : this.player.magnet > 0
        ? { kind: 'feather', left: this.player.magnet, total: MAGNET_SECONDS }
        : this.player.slowmo > 0
          ? { kind: 'pie', left: this.player.slowmo, total: SLOWMO_SECONDS }
          : null;
    return {
      score: this.score,
      distance: this.distance,
      stageName: STAGES[this.stageIndex].name,
      multiplier: this.missions.multiplier,
      coins: this.coinCount,
      lives: this.lives,
      missions: this.missions.snapshot(),
      powerup,
    };
  }

  // ---- run control ----
  startRun(seed) {
    this.sound.ensure();
    this.sound.startAmbience();
    this.sound.gobble();
    this.random = mulberry32(seed !== undefined ? seed : (Date.now() % 100000) | 0);
    this.distance = 0;
    this.score = 0;
    this.coinCount = 0;
    this.lives = START_LIVES;
    this.stageIndex = 0;
    this.farmerGap = 14;
    this.shakeT = 0;
    this.player = {
      lane: 1, x: 0, y: 0, vy: 0,
      rolling: false, rollT: 0, invuln: 0,
      board: null, magnet: 0, slowmo: 0,
    };
    this.obstacles.reset();
    this.coins.reset();
    this.missions.reset(this.random);
    this.track.reset(this.random);
    this.turkeyModel.group.position.set(0, 0, 0);
    this.turkeyModel.group.rotation.set(0, 0, 0);
    this.turkeyModel.group.scale.set(1, 1, 1);
    this.state = 'playing';
    this.hud.showScreen('play');
    this.hud.showBanner('FARMYARD', 'THE GREAT ESCAPE BEGINS');
    this.hud.update(this._hudState());
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.hud.showScreen('pause');
      this.sound.click();
    } else if (this.state === 'paused') {
      this.resume();
    }
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.showScreen('play');
    this.sound.click();
  }

  toggleMute() {
    this.sound.ensure();
    const muted = this.sound.setMuted(!this.sound.muted);
    this.hud.setMuted(muted);
  }

  endRun(escaped) {
    this.state = 'over';
    const isRecord = this.hud.saveBest(this.score);
    this.hud.showEnd(escaped, {
      score: this.score, distance: this.distance,
      coins: this.coinCount, multiplier: this.missions.multiplier,
    });
    // Freeze the caught pose: turkey down, farmer right on top of it.
    if (!escaped) {
      this.turkeyModel.update(0.016, 'caught', 0);
      this.turkeyModel.group.visible = true;
      this.farmerModel.group.position.set(this.player.x * 0.85, 0, -1.6);
      this.farmerModel.group.scale.set(1, 1, 1);
    }
    if (escaped) this.sound.escaped();
    else this.sound.caught();
    if (isRecord) this.hud.showToast('New best score!');
  }

  // Test / screenshot staging helpers.
  spawnObstacle(kind, lane, z) { return this.obstacles.spawnAt(kind, lane, z); }
  spawnPowerup(kind, lane, z) { this.coins.placePowerupAhead(kind, lane, z); }

  // ---- player moves ----
  changeLane(dir) {
    if (this.state !== 'playing') return;
    const next = clamp(this.player.lane + dir, 0, 2);
    if (next !== this.player.lane) this.player.lane = next;
  }

  jump() {
    if (this.state !== 'playing') return;
    if (this.player.y === 0 && !this.player.rolling) {
      this.player.vy = JUMP_VELOCITY;
      this.player.y = 0.01;
      this.sound.jump();
    }
  }

  roll() {
    if (this.state !== 'playing') return;
    if (this.player.y === 0 && !this.player.rolling) {
      this.player.rolling = true;
      this.player.rollT = ROLL_SECONDS;
      this.sound.roll();
    }
  }

  _speed() {
    const stage = STAGES[this.stageIndex];
    let v = BASE_SPEED + (this.distance / 100) * SPEED_PER_100M + stage.speedBonus;
    v = Math.min(MAX_SPEED, v);
    if (this.player.slowmo > 0) v *= SLOWMO_FACTOR;
    if (this.player.board) v += 2;
    return v;
  }

  _applyHit() {
    if (this.player.board) {
      this.player.board = null;
      this.boardMesh.visible = false;
      this.player.invuln = INVULN_SECONDS;
      this.sound.shieldPop();
      this.hud.showToast('Board shield saved you!');
      return;
    }
    this.lives -= 1;
    this.player.invuln = INVULN_SECONDS;
    this.farmerGap = Math.max(6, this.farmerGap - 4);
    this.shakeT = 0.45;
    this.sound.thud();
    this.sound.gobble();
    if (this.lives <= 0) this.endRun(false);
  }

  _applyPowerup(kind) {
    if (kind === 'tray') {
      this.player.board = { left: BOARD_SECONDS, total: BOARD_SECONDS };
      this.boardMesh.visible = true;
      this.hud.showToast('Hoverboard! Shield + speed!');
    } else if (kind === 'feather') {
      this.player.magnet = MAGNET_SECONDS;
      this.hud.showToast('Magnet feather — corn flies to you!');
    } else if (kind === 'pie') {
      this.player.slowmo = SLOWMO_SECONDS;
      this.hud.showToast('Pumpkin pie — everything slows down!');
    } else if (kind === 'heart') {
      this.lives = Math.min(START_LIVES, this.lives + 1);
      this.hud.showToast('+1 heart!');
    }
    this.missions.event('powerup', 1);
    this.sound.powerup();
  }

  // ---- one logic step (no rendering): used by the live loop and by shots ----
  step(dt) {
    if (this.state === 'title') {
      this.time += dt;
      this.track.update(dt, 2.5, this.random);
      this.turkeyModel.update(dt, 'idle', 0);
      this.farmerModel.update(dt, 0.1, 0.6);
      this.farmerModel.group.position.set(-1.8, 0, -2.6);
      this.farmerModel.group.scale.set(0.75, 0.75, 0.75);
      return;
    }
    if (this.state !== 'playing') return;
    this.time += dt;
    this.speed = this._speed();
    const v = this.speed;
    this.distance += v * dt;
    this.score += v * dt * 10 * this.missions.multiplier;
    this.missions.event('distance', this.distance);

    // Stage transitions.
    let stage = 0;
    for (let i = 0; i < STAGES.length; i += 1) if (this.distance >= STAGES[i].from) stage = i;
    if (stage !== this.stageIndex) {
      this.stageIndex = stage;
      this.track.setStage(stage, this.random);
      this.hud.showBanner(STAGES[stage].name, STAGES[stage].sub);
      this.sound.stageFanfare();
    }

    // Player physics: lane glide, jump gravity, roll timer, invulnerability.
    const targetX = LANES[this.player.lane];
    const dx = targetX - this.player.x;
    this.player.x += clamp(dx, -14 * dt, 14 * dt);
    if (this.player.y > 0 || this.player.vy !== 0) {
      this.player.vy += GRAVITY * dt;
      this.player.y += this.player.vy * dt;
      if (this.player.y <= 0) { this.player.y = 0; this.player.vy = 0; }
    }
    if (this.player.rolling) {
      this.player.rollT -= dt;
      if (this.player.rollT <= 0) this.player.rolling = false;
    }
    if (this.player.invuln > 0) this.player.invuln -= dt;
    if (this.player.board) {
      this.player.board.left -= dt;
      if (this.player.board.left <= 0) { this.player.board = null; this.boardMesh.visible = false; }
    }
    if (this.player.magnet > 0) this.player.magnet -= dt;
    if (this.player.slowmo > 0) this.player.slowmo -= dt;

    // World scroll.
    const stageDef = STAGES[this.stageIndex];
    this.track.update(dt, v, this.random);
    this.obstacles.update(dt, v, this.random, stageDef.obstacles, stageDef.density, this.distance);
    this.coins.update(dt, v, this.random, this.time);

    // Collisions.
    const hit = this.obstacles.checkHit(this.player);
    if (hit) {
      if (hit.type === 'hit') this._applyHit();
      else if (hit.type === 'jumped') this.missions.event('jump', 1);
    }
    const dodged = this.obstacles.passedCount(this.player);
    if (dodged > 0) this.missions.event('dodge', dodged);

    // Pickups.
    const got = this.coins.collect(this.player, this.player.magnet > 0);
    if (got.corn > 0) {
      this.coinCount += got.corn;
      this.score += got.corn * 25 * this.missions.multiplier;
      this.missions.event('corn', got.corn);
      this.sound.coin();
    }
    if (got.lines > 0) this.missions.event('line', got.lines);
    if (got.powerup) this._applyPowerup(got.powerup);

    // The farmer: clean running pushes him back and to the side, stumbles
    // pull him in toward the turkey's tail. He runs between the camera and
    // the turkey, so he reads as "right behind you" without covering the hero.
    this.farmerGap = clamp(this.farmerGap + 0.45 * dt, 6, 22);
    if (this.distance >= ESCAPE_DISTANCE) this.endRun(true);

    // Poses + positions.
    const pose = this.player.board ? 'board'
      : this.player.y > 0 ? 'jump'
      : this.player.rolling ? 'roll'
      : this.state === 'over' ? 'caught' : 'run';
    this.turkeyModel.update(dt, pose, v / MAX_SPEED);
    this.turkeyModel.group.position.set(this.player.x, this.player.y, 0);
    this.turkeyModel.group.visible = !(this.player.invuln > 0 && Math.floor(this.time * 10) % 2 === 0);
    const gapNorm = (this.farmerGap - 6) / 16;
    this.farmerModel.update(dt, v / MAX_SPEED, gapNorm);
    this.farmerModel.group.position.set(
      this.player.x * 0.85 - gapNorm * 2.4,
      0,
      -2.0 - gapNorm * 1.2,
    );
    const farmerScale = 0.55 + (1 - gapNorm) * 0.25;
    this.farmerModel.group.scale.set(farmerScale, farmerScale, farmerScale);

    if (this.shakeT > 0) this.shakeT -= dt;
    this.hud.update(this._hudState());
  }

  render() {
    const tx = this.player.x * 0.7;
    const shake = this.shakeT > 0 ? this.shakeT * 0.35 : 0;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    this.camera.position.set(tx + sx, 3.7 + sy, -6.6);
    this.camera.lookAt(tx * 1.2, 1.25, 8);
    this.renderer.render(this.scene, this.camera);
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (!this.frozen && (this.state === 'playing' || this.state === 'title')) this.step(dt);
    this.render();
  }

  freeze() { this.frozen = true; }
  unfreeze() { this.frozen = false; this._last = performance.now(); }
}

// ---- boot: one game, one public handle for tests and screenshot staging ----
const game = new Game();
window.__turkey = {
  game,
  version: '1.0.0',
  stageShot: (name) => {
    const description = stageShot(game, name);
    game.freeze();
    return description;
  },
  state: () => ({
    screen: game.state,
    score: Math.floor(game.score),
    distance: Math.floor(game.distance),
    lives: game.lives,
    coins: game.coinCount,
    multiplier: game.missions.multiplier,
    board: !!game.player.board,
    stage: STAGES[game.stageIndex].name,
  }),
};
requestAnimationFrame(() => {
  const staged = shotFromUrl(game);
  if (staged) {
    game.freeze();
    console.log('[shot]', staged);
  }
  window.__turkeyReady = true;
});
