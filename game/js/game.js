// Turkey Runner — the game itself: loop, physics, collisions, stages, scoring.
// One job: own the run state and tie every module together.
import * as THREE from 'three';
import {
  LANES, GRAVITY, JUMP_VELOCITY, ROLL_SECONDS, INVULN_SECONDS,
  BOARD_SECONDS, MAGNET_SECONDS, SLOWMO_SECONDS, SLOWMO_FACTOR,
  START_LIVES, ESCAPE_DISTANCE, BASE_SPEED, MAX_SPEED, SPEED_PER_100M,
  STAGES, FARMER_NAME, FARMER_SHOUTS, FARMER_SHOUT_RANGE,
  FARMER_GAP_MIN, FARMER_GAP_MAX, FARMER_GAP_START,
  LUNGE_RANGE, LUNGE_TELEGRAPH_SECONDS, LUNGE_FALLBACK,
  CORNER_AFTER_SECONDS, CORNER_SECONDS, SEARCH_SECONDS,
  DASH_SECONDS, DASH_SPEED_MULT, DASH_COOLDOWN_SECONDS,
  DASH_STAMINA_COST, DASH_FARMER_PUSHBACK, STAMINA_REGEN_PER_SECOND,
  NEAR_MISS_POINTS, LUNGE_DODGE_POINTS, DECOY_START_STOCK,
  mulberry32, clamp,
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // plain PCF: cheaper than PCFSoft, same look at this scale
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
      onDash: () => this.dash(),
      onDecoy: () => this.throwDecoy(),
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
    this.farmerGap = FARMER_GAP_START;
    this.speed = 0;
    this.shakeT = 0;
    // Farmer brain: CHASE | SEARCH | CORNER | LUNGE (see step()).
    this.farmerHold = false; // staging only: poseFarmerForShot freezes the brain
    this.farmerState = 'CHASE';
    this.farmerStateT = 0;
    this.chaseT = 0;
    this.lungeDodged = false;
    this.cornerLane = 1;
    this.shoutT = 0;
    this.shoutIndex = 0;
    this.currentShout = '';
    // Verbs: dash + feather decoy.
    this.stamina = 1;
    this.dashT = 0;
    this.dashCooldown = 0;
    this.decoys = DECOY_START_STOCK;
    this.nearMiss = 0;
    // Per-shot camera framing (shots.js); null = the default chase camera.
    this.cameraShot = null;
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
    this._fpsFrames = 0;
    this._fpsWindowStart = performance.now();
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
      stageIndex: this.stageIndex,
      stageName: STAGES[this.stageIndex].name,
      multiplier: this.missions.multiplier,
      coins: this.coinCount,
      lives: this.lives,
      missions: this.missions.snapshot(),
      powerup,
      farmerGap: this.farmerGap,
      farmerName: FARMER_NAME,
      farmerState: this.farmerState,
      stamina: this.stamina,
      dashReady: this.dashCooldown <= 0 && this.stamina >= DASH_STAMINA_COST,
      decoys: this.decoys,
      shout: this.currentShout,
    };
  }

  // ---- run control ----
  startRun(seed) {
    this.sound.ensure();
    this.sound.startAmbience();
    this.sound.gobble();
    this.random = mulberry32(seed !== undefined ? seed : (Date.now() % 100000) | 0);
    this.time = 0;
    this.turkeyModel.runPhase = 0;
    this.farmerModel.runPhase = 0;
    this.farmerHold = false;
    this.distance = 0;
    this.score = 0;
    this.coinCount = 0;
    this.lives = START_LIVES;
    this.stageIndex = 0;
    this.farmerGap = FARMER_GAP_START;
    this.shakeT = 0;
    this.farmerState = 'CHASE';
    this.farmerStateT = 0;
    this.chaseT = 0;
    this.lungeDodged = false;
    this.currentShout = '';
    this.stamina = 1;
    this.dashT = 0;
    this.dashCooldown = 0;
    this.decoys = DECOY_START_STOCK;
    this.nearMiss = 0;
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
    this.hud.showBanner('FARMYARD', 'THE GREAT ESCAPE BEGINS', 'moment', 1.6);
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
      nearMiss: this.nearMiss,
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
    if (next !== this.player.lane) {
      this.player.lane = next;
      if (this.farmerState === 'LUNGE') this.lungeDodged = true;
    }
  }

  // Feather dash (Shift): 0.38 s at 1.55x speed, stamina cost, and the burst
  // shoves the farmer back. A dash during a lunge telegraph dodges the grab.
  dash() {
    if (this.state !== 'playing') return;
    if (this.dashCooldown > 0 || this.stamina < DASH_STAMINA_COST) return;
    this.dashT = DASH_SECONDS;
    this.dashCooldown = DASH_COOLDOWN_SECONDS;
    this.stamina -= DASH_STAMINA_COST;
    this.farmerGap = clamp(this.farmerGap + DASH_FARMER_PUSHBACK, FARMER_GAP_MIN, FARMER_GAP_MAX);
    if (this.farmerState === 'LUNGE') this.lungeDodged = true;
    this.sound.jump();
  }

  // Feather decoy (Q): toss a lure into another lane; the farmer SEARCHes it.
  throwDecoy() {
    if (this.state !== 'playing') return;
    if (this.decoys <= 0) { this.hud.showToast('No decoys left!'); return; }
    this.decoys -= 1;
    const other = [0, 1, 2].filter((l) => l !== this.player.lane);
    const lane = other[Math.floor(this.random() * other.length)];
    this.farmerState = 'SEARCH';
    this.farmerStateT = SEARCH_SECONDS;
    this.searchLane = lane;
    this.hud.showMoment('WRONG BIRD!', 'hide', 1.2);
    this.sound.powerup();
  }

  // Screenshot staging: pose the farmer at an exact gap + state (cover/title).
  poseFarmerForShot(gap, state) {
    this.farmerGap = clamp(gap, FARMER_GAP_MIN, FARMER_GAP_MAX);
    this.farmerState = state || 'CHASE';
    this.farmerStateT = 0;
    this.chaseT = 0;
    this.farmerHold = true; // hold this exact gap + state for the photo
    this.currentShout = this.farmerGap < FARMER_SHOUT_RANGE ? FARMER_SHOUTS[0] : '';
    this.shoutT = 2.5;
    this.hud.update(this._hudState());
  }

  setCameraShot(preset) { this.cameraShot = preset; }
  clearCameraShot() { this.cameraShot = null; }

  jump() {
    if (this.state !== 'playing') return;
    if (this.player.y === 0 && !this.player.rolling) {
      this.player.vy = JUMP_VELOCITY;
      this.player.y = 0.01;
      if (this.farmerState === 'LUNGE') this.lungeDodged = true;
      this.sound.jump();
    }
  }

  roll() {
    if (this.state !== 'playing') return;
    if (this.player.y === 0 && !this.player.rolling) {
      this.player.rolling = true;
      this.player.rollT = ROLL_SECONDS;
      if (this.farmerState === 'LUNGE') this.lungeDodged = true;
      this.sound.roll();
    }
  }

  _speed() {
    const stage = STAGES[this.stageIndex];
    let v = BASE_SPEED + (this.distance / 100) * SPEED_PER_100M + stage.speedBonus;
    v = Math.min(MAX_SPEED, v);
    if (this.player.slowmo > 0) v *= SLOWMO_FACTOR;
    if (this.player.board) v += 2;
    if (this.dashT > 0) v *= DASH_SPEED_MULT;
    return v;
  }

  // A near-miss: cleared an obstacle at arm's length, or slipped past a
  // dodge obstacle in the next lane. Worth points + a moment banner.
  _nearMiss() {
    this.nearMiss += 1;
    const points = NEAR_MISS_POINTS * this.missions.multiplier;
    this.score += points;
    this.hud.showMoment(`THAT WAS CLOSE! +${points}`, 'moment', 1.2);
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
    this.farmerGap = Math.max(FARMER_GAP_MIN, this.farmerGap - 4);
    this.farmerState = 'CHASE';
    this.chaseT = 0;
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
      this.farmerModel.update(dt, 0.1, 0.6, 'SEARCH');
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
      this.hud.showBanner(STAGES[stage].name, STAGES[stage].sub, 'moment', 1.6);
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
    if (this.dashT > 0) this.dashT -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    this.stamina = Math.min(1, this.stamina + STAMINA_REGEN_PER_SECOND * dt);
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
      else if (hit.type === 'jumped') { this.missions.event('jump', 1); this._nearMiss(); }
      else if (hit.type === 'rolled') this._nearMiss();
    }
    const dodged = this.obstacles.passedCount(this.player);
    if (dodged > 0) this.missions.event('dodge', dodged);
    // Slipped past a dodge obstacle in the next lane: another near-miss.
    for (const o of this.obstacles.list) {
      if (!o.nearCounted && o.passed && o.mode === 'dodge' && Math.abs(o.lane - this.player.lane) === 1) {
        o.nearCounted = true;
        this._nearMiss();
      }
    }

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

    // The farmer brain: CHASE closes the gap; SEARCH (decoy) lets it open;
    // CORNER cuts a lane off; LUNGE is a telegraphed grab the turkey dodges
    // by moving, jumping, rolling or dashing during the wind-up.
    const closeRate = STAGES[this.stageIndex].closeRate;
    if (this.farmerHold) {
      // Staged pose: the brain holds still, the body still animates.
    } else if (this.farmerState === 'SEARCH') {
      this.farmerStateT -= dt;
      this.farmerGap = clamp(this.farmerGap + 1.2 * dt, FARMER_GAP_MIN, FARMER_GAP_MAX);
      if (this.farmerStateT <= 0) {
        this.farmerState = 'CHASE';
        this.chaseT = 0;
        this.hud.showMoment('SPOTTED!', 'danger', 0.9);
      }
    } else if (this.farmerState === 'LUNGE') {
      this.farmerStateT -= dt;
      if (this.farmerStateT <= 0) {
        if (this.lungeDodged) {
          this.farmerGap = clamp(this.farmerGap + LUNGE_FALLBACK, FARMER_GAP_MIN, FARMER_GAP_MAX);
          const pts = LUNGE_DODGE_POINTS * this.missions.multiplier;
          this.score += pts;
          this.hud.showMoment(`SLIPPED THE GRAB! +${pts}`, 'moment', 1.2);
        } else {
          this._applyHit();
        }
        // Either way he is a few metres back now — no instant re-lunge.
        this.farmerGap = Math.max(this.farmerGap, 6);
        this.farmerState = 'CHASE';
        this.chaseT = 0;
      }
    } else if (this.farmerState === 'CORNER') {
      this.farmerStateT -= dt;
      this.farmerGap = clamp(this.farmerGap - closeRate * 2 * dt, FARMER_GAP_MIN, FARMER_GAP_MAX);
      if (this.farmerStateT <= 0) { this.farmerState = 'CHASE'; this.chaseT = 0; }
    } else { // CHASE
      this.chaseT += dt;
      this.farmerGap = clamp(this.farmerGap - closeRate * dt, FARMER_GAP_MIN, FARMER_GAP_MAX);
      if (this.farmerGap <= LUNGE_RANGE) {
        this.farmerState = 'LUNGE';
        this.farmerStateT = LUNGE_TELEGRAPH_SECONDS;
        this.lungeDodged = false;
        this.hud.showMoment("HE'S GRABBING!", 'danger', 0.6);
      } else if (this.chaseT >= CORNER_AFTER_SECONDS) {
        this.farmerState = 'CORNER';
        this.farmerStateT = CORNER_SECONDS;
        this.cornerLane = this.player.lane === 1
          ? (this.random() < 0.5 ? 0 : 2) : 1;
        this.hud.showMoment('CUT OFF!', 'danger', 1.0);
      }
    }
    // Farmer shouts: rotate our 3 lines while he is close.
    if (this.farmerGap < FARMER_SHOUT_RANGE && (this.farmerState === 'CHASE' || this.farmerState === 'LUNGE')) {
      this.shoutT -= dt;
      if (this.shoutT <= 0) {
        this.currentShout = FARMER_SHOUTS[this.shoutIndex % FARMER_SHOUTS.length];
        this.shoutIndex += 1;
        this.shoutT = 2.5;
      }
    } else {
      this.currentShout = '';
    }
    if (this.distance >= ESCAPE_DISTANCE) this.endRun(true);

    // Poses + positions.
    const pose = this.dashT > 0 ? 'dash'
      : this.player.board ? 'board'
      : this.player.y > 0 ? 'jump'
      : this.player.rolling ? 'roll'
      : this.state === 'over' ? 'caught' : 'run';
    this.turkeyModel.update(dt, pose, v / MAX_SPEED);
    this.turkeyModel.group.position.set(this.player.x, this.player.y, 0);
    this.turkeyModel.group.visible = !(this.player.invuln > 0 && Math.floor(this.time * 10) % 2 === 0);
    const gapNorm = (this.farmerGap - FARMER_GAP_MIN) / (FARMER_GAP_MAX - FARMER_GAP_MIN);
    this.farmerModel.update(dt, v / MAX_SPEED, gapNorm, this.farmerState);
    // He runs between the camera and the turkey, so he reads as "right
    // behind you" without covering the hero. SEARCH sweeps the lanes,
    // CORNER cuts toward the blocking lane, LUNGE leans straight in.
    let farmerX = this.player.x * 0.85 - gapNorm * 2.4;
    if (this.farmerState === 'SEARCH') farmerX = Math.sin(this.time * 0.9) * 2.2;
    else if (this.farmerState === 'CORNER') {
      const k = 1 - Math.max(0, this.farmerStateT / CORNER_SECONDS);
      farmerX = farmerX * (1 - k) + LANES[this.cornerLane] * 0.9 * k;
    }
    this.farmerModel.group.position.set(
      farmerX,
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
    if (this.cameraShot) {
      // Per-shot framing (shots.js): [x, y, z] + look-at [x, y, z].
      const [px, py, pz] = this.cameraShot.pos;
      const [lx, ly, lz] = this.cameraShot.look;
      this.camera.position.set(px + sx, py + sy, pz);
      this.camera.lookAt(lx, ly, lz);
    } else {
      this.camera.position.set(tx + sx, 3.7 + sy, -6.6);
      this.camera.lookAt(tx * 1.2, 1.25, 8);
    }
    this.renderer.render(this.scene, this.camera);
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (!this.frozen && (this.state === 'playing' || this.state === 'title')) this.step(dt);
    this.render();
    this._sampleFps(now);
  }

  // Debug FPS meter (?fps=1): live fps + draw calls, sampled over 500 ms.
  _sampleFps(now) {
    if (!this.hud.fpsOn) return;
    this._fpsFrames += 1;
    if (now - this._fpsWindowStart >= 500) {
      const fps = Math.round((this._fpsFrames * 1000) / (now - this._fpsWindowStart));
      this._fpsFrames = 0;
      this._fpsWindowStart = now;
      this.hud.setFps(fps, this.renderer.info.render.calls);
    }
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
    farmerGap: +game.farmerGap.toFixed(1),
    farmerState: game.farmerState,
    nearMiss: game.nearMiss,
    stamina: +game.stamina.toFixed(2),
    decoys: game.decoys,
    best: game.hud.best,
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
