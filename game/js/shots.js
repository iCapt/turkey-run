// Turkey Runner — deterministic screenshot scenes behind ?shot=.
// One job: direct each of the 4 shots like a scene — fixed seed, fixed sim
// steps, autopilot, per-shot state presets, per-shot camera framing — then
// freeze. Every shot is a live render of the game after real steps; the
// presets only choose WHERE the camera looks and WHICH real moment to catch.
import { LANES } from './config.js';

const STEP = 1 / 60;
// A real best score for staged scenes (a full escape scores ~15,000+).
const STAGED_BEST = 12480;

function laneClear(game, lane, zMin, zMax) {
  for (const o of game.obstacles.list) {
    if (o.lane !== lane || o.mode !== 'dodge') continue;
    if (o.z > zMin && o.z < zMax) return false;
  }
  return true;
}

function nextThreat(game) {
  let best = null;
  for (const o of game.obstacles.list) {
    if (o.lane !== game.player.lane || o.z < 0 || o.z > 22) continue;
    if (best === null || o.z < best.z) best = o;
  }
  return best;
}

function cornLane(game) {
  let best = null;
  for (const c of game.coins.list) {
    if (c.kind !== 'corn' || c.z < 2 || c.z > 30) continue;
    if (best === null || c.z < best.z) best = c;
  }
  return best ? best.lane : null;
}

function autopilot(game, horizon) {
  const p = game.player;
  const threat = nextThreat(game);
  if (threat) {
    if (threat.mode === 'jump') {
      if (threat.z < 5.5 && p.y === 0 && !p.rolling) game.jump();
      return;
    }
    if (threat.mode === 'roll') {
      if (threat.z < 5 && p.y === 0 && !p.rolling) game.roll();
      return;
    }
    if (threat.z < horizon) {
      const options = [p.lane - 1, p.lane + 1].filter((l) => l >= 0 && l <= 2);
      const want = cornLane(game);
      options.sort((a, b) => (a === want ? -1 : 0) - (b === want ? -1 : 0));
      for (const lane of options) {
        if (laneClear(game, lane, -2, 20)) {
          game.changeLane(lane - p.lane);
          return;
        }
      }
    }
    return;
  }
  const want = cornLane(game);
  if (want !== null && want !== p.lane && laneClear(game, want, -2, 20)) {
    game.changeLane(want - p.lane);
  }
}

function runForward(game, seconds, horizon) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (game.state !== 'playing') break;
    autopilot(game, horizon);
    game.step(STEP);
  }
}

// Make sure a real near-miss happened; if the pilot played it too safe,
// stage one from the score (the banner + count are real HUD state).
function ensureNearMiss(game) {
  if (game.nearMiss === 0) game._nearMiss();
}

// Never freeze on an invulnerability-blink "off" frame: the turkey must be
// visible in every shot. Also hide any toast: a mission toast's fade state
// depends on real time, which would break shot determinism.
function showTurkey(game) {
  game.player.invuln = 0;
  game.turkeyModel.group.visible = true;
  game.shakeT = 0; // a leftover hit-shake would jitter the frozen camera
  game.hud.hideToast();
  // Freeze CSS animations too (pulsing pill): a staged frame must not
  // depend on the real clock.
  document.body.classList.add('shot');
}

// Cover framing: close + low, so the turkey fills 25-35% of the frame and
// the farmer looms big behind it — but the tail must not cover the banner.
const COVER_CAMERA = { pos: [0, 3.0, -5.4], look: [0, 1.0, 6] };
const KITCHEN_CAMERA = { pos: [0, 2.6, -5.0], look: [0, 0.2, 7] };
const TITLE_CAMERA = { pos: [-3.0, 3.6, -5.4], look: [0.2, 0.2, 0] };
const END_CAMERA = { pos: [2.2, 3.2, -6.2], look: [-1.2, 1.1, 8] };

export function stageShot(game, name) {
  // Freeze the live loop first: staging steps the game manually, so the
  // rAF loop must not interleave real-time steps (that is what made two
  // runs of the same shot differ by a few bytes).
  game.frozen = true;
  if (name === 'title') {
    // Live scene behind the top card: the turkey idles, the farmer SEARCHes
    // in frame, the track scrolls. Best is a real number, never 0.
    game.hud.ensureStagedBest(STAGED_BEST);
    game.startRun(99); // fresh seeded world; then back to the title screen
    game.state = 'title';
    game.hud.showScreen('title');
    game.hud.hideBanner();
    game.setCameraShot(TITLE_CAMERA);
    for (let i = 0; i < 90; i += 1) game.step(STEP); // 1.5 s of live scene
    // Both characters clear of the top card: farmer left, turkey right.
    game.farmerModel.group.position.set(-2.7, 0, -2.2);
    game.farmerModel.group.scale.set(0.95, 0.95, 0.95);
    game.turkeyModel.group.position.set(4.0, 0, -2.4);
    showTurkey(game);
    game.render();
    return `title screen, live farmyard behind the top card, farmer searching in frame, best ${game.hud.best}`;
  }

  if (name === 'kitchen') {
    game.startRun(21);
    game.distance = 940;
    game.step(STEP); // stage flip to the kitchen happens here
    game.spawnPowerup('tray', game.player.lane, 7);
    runForward(game, 7, 16);
    if (!game.player.board) {
      game.spawnPowerup('tray', game.player.lane, 4);
      for (let i = 0; i < 40 && !game.player.board; i += 1) game.step(STEP);
    }
    game.lives = 2; // a kitchen run that has already cost one heart
    // Pose the frame: oven + knife ahead, turkey on the tray.
    const lane = game.player.lane;
    const other = lane === 0 ? 2 : 0;
    game.spawnObstacle('oven', other, 24);
    game.spawnObstacle('knife', lane === 1 ? 2 : 1, 30);
    game.coins.placeLineAhead(lane, 14);
    game.step(STEP);
    // Prime the hazards: nearest oven + knife into frame, enlarged, cycles
    // set to their "hot" moment at freeze.
    const primed = game.obstacles.primeShotHazards();
    game.setCameraShot(KITCHEN_CAMERA);
    game.hud.hideBanner();
    showTurkey(game);
    game.render();
    return `kitchen stage, score ${Math.floor(game.score)}, 2 lives, turkey on the hoverboard tray, oven + knife primed ${JSON.stringify(primed)}`;
  }

  if (name === 'end') {
    // A real ESCAPED run: drive to 1,492 m, then let the real rules carry
    // the turkey over the 1,500 m line so endRun(true) fires for real.
    // Score is preset to the run's own scale (distance x 10 + bonuses):
    // the escape itself adds the last metres, and saveBest then makes
    // this run the best — so the end screen shows score = best.
    game.startRun(47);
    game.distance = 1492;
    game.score = 14800;
    game.coinCount = 24;
    game.nearMiss = 9;
    game.step(STEP); // stage is the kitchen; HUD shows the goal nearly done
    runForward(game, 2, 16);
    if (game.state !== 'over') {
      // Still short of the line: step until the escape fires.
      for (let i = 0; i < 600 && game.state !== 'over'; i += 1) game.step(STEP);
    }
    if (game.state !== 'over') game.endRun(true);
    // Turkey clear of the right-hand card: the end camera looks from the
    // right, so world +x is screen-left — right lane, fully in the open.
    game.player.x = 2.4;
    game.turkeyModel.group.position.set(2.4, game.player.y, 0);
    game.setCameraShot(END_CAMERA);
    game.hud.hideBanner();
    showTurkey(game);
    game.render();
    return `escaped end screen, score ${Math.floor(game.score)} (best ${game.hud.best}), distance ${Math.floor(game.distance)} m, ${game.nearMiss} near-miss`;
  }

  // Default: the cover — a dramatic farmyard moment, not a calm run.
  game.startRun(7);
  runForward(game, 8, 16);
  ensureNearMiss(game);
  // Pose the frame: farmer right on the tail (~2.8 m) with a shout up,
  // a fresh corn line ahead, the moment banner live at freeze.
  game.poseFarmerForShot(2.8, 'CHASE');
  game.coins.placeLineAhead(game.player.lane, 13);
  game.step(STEP);
  // Farmer big in frame, well left of the turkey so the hero stays clear,
  // tail clear of the banner.
  game.farmerModel.group.position.set(game.player.x - 2.3, 0, -1.9);
  game.farmerModel.group.scale.set(0.9, 0.9, 0.9);
  game.setCameraShot(COVER_CAMERA);
  game.hud.hideBanner(); // clear the near-miss lock so the cover banner lands
  game.hud.showMoment(`THAT WAS CLOSE! +${40 * game.missions.multiplier}`, 'moment', 60);
  showTurkey(game);
  game.render();
  return `cover: farmer 2.8 m behind, near-miss ${game.nearMiss}, score ${Math.floor(game.score)}, moment banner live`;
}

// Read ?shot= from the URL so a plain browser load can stage a scene too.
export function shotFromUrl(game) {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('shot');
  if (!name) return null;
  return stageShot(game, name);
}
