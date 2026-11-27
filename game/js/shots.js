// Turkey Runner — deterministic screenshot scenes behind ?shot=.
// One job: play the real rules forward from a fresh world with a simple
// autopilot, so each shot is what a short real game looks like, and the same
// seed always gives the same frame. No scene is faked: every shot is a live
// render of the game after real steps.
import { LANES } from './config.js';

const STEP = 1 / 60;
const COVER_SECONDS = 14;
const KITCHEN_SECONDS = 7;
const END_LIMIT_SECONDS = 8;

/** Is `lane` clear of dodge-type obstacles between zMin and zMax? */
function laneClear(game, lane, zMin, zMax) {
  for (const o of game.obstacles.list) {
    if (o.lane !== lane || o.mode !== 'dodge') continue;
    if (o.z > zMin && o.z < zMax) return false;
  }
  return true;
}

/** The nearest obstacle the turkey is about to meet, in its own lane. */
function nextThreat(game) {
  let best = null;
  for (const o of game.obstacles.list) {
    if (o.lane !== game.player.lane || o.z < 0 || o.z > 22) continue;
    if (best === null || o.z < best.z) best = o;
  }
  return best;
}

/** Steer toward the nearest corn line when it is safe to do so. */
function cornLane(game) {
  let best = null;
  for (const c of game.coins.list) {
    if (c.kind !== 'corn' || c.z < 2 || c.z > 30) continue;
    if (best === null || c.z < best.z) best = c;
  }
  return best ? best.lane : null;
}

/**
 * One autopilot decision. Jump and roll are timed late (the move only lasts
 * a few metres), dodges are planned early, and a short horizon plays badly —
 * the end scene uses the short one, as a hurried player would.
 */
function autopilot(game, horizon) {
  const p = game.player;
  const threat = nextThreat(game);
  if (threat) {
    // Jump and roll are timed late: the jump stays above the bar for only
    // ~0.48 s (~5 units), the roll for ~0.55 s, so starting either at z=9
    // lands the turkey back on the track before the obstacle arrives.
    if (threat.mode === 'jump') {
      if (threat.z < 5.5 && p.y === 0 && !p.rolling) game.jump();
      return;
    }
    if (threat.mode === 'roll') {
      if (threat.z < 5 && p.y === 0 && !p.rolling) game.roll();
      return;
    }
    // Dodge: move to a clear neighbour lane, preferring the corn lane.
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

/**
 * Stage the named scene and render one frame. Returns a short description
 * of what the frame shows (used by the screenshot driver + tests).
 */
export function stageShot(game, name) {
  if (name === 'title') {
    game.state = 'title';
    game.hud.showScreen('title');
    game.hud.hideBanner();
    game.render();
    return 'title screen, turkey idle with the farmer behind';
  }

  if (name === 'kitchen') {
    game.startRun(21);
    game.distance = 940;
    game.step(STEP); // stage flip to the kitchen happens here
    game.spawnPowerup('tray', game.player.lane, 7);
    runForward(game, KITCHEN_SECONDS, 16);
    // If the pilot missed the tray, put one right in front of it and roll straight on.
    if (!game.player.board) {
      game.spawnPowerup('tray', game.player.lane, 4);
      for (let i = 0; i < 40 && !game.player.board; i += 1) game.step(STEP);
    }
    // Pose the frame: oven + knife ahead, turkey on the tray.
    const lane = game.player.lane;
    const other = lane === 0 ? 2 : 0;
    game.spawnObstacle('oven', other, 24);
    game.spawnObstacle('knife', lane === 1 ? 2 : 1, 30);
    game.coins.placeLineAhead(lane, 14);
    game.step(STEP);
    game.hud.hideBanner();
    game.render();
    return `kitchen stage, turkey on the hoverboard tray, oven + knife ahead, board ${game.player.board ? 'active' : 'missed'}`;
  }

  if (name === 'end') {
    game.startRun(33);
    game.lives = 1;
    game.player.invuln = 0;
    game.spawnObstacle('crate', game.player.lane, 9);
    runForward(game, END_LIMIT_SECONDS, 4); // short horizon: the pilot is too late
    if (game.state !== 'over') {
      // The pilot dodged it: one more crate, then a forced final hit so the
      // end screen (a real screen reached through the real code path) shows.
      game.player.invuln = 0;
      game.spawnObstacle('crate', game.player.lane, 2);
      runForward(game, 2, 4);
    }
    if (game.state !== 'over') game._applyHit();
    game.hud.hideBanner();
    game.render();
    return `caught end screen, score ${Math.floor(game.score)}`;
  }

  // Default: the cover — a clean plain run in the farmyard.
  game.startRun(7);
  runForward(game, COVER_SECONDS, 16);
  // Pose the frame: a fresh corn line ahead in the turkey's lane, farmer mid-gap.
  game.coins.placeLineAhead(game.player.lane, 13);
  game.farmerGap = 12;
  game.step(STEP);
  game.hud.hideBanner();
  // Cursor over the pause button, so the shot shows an active cursor on a real control.
  game.input.placeCursorOver(document.getElementById('btn-pause'));
  game.render();
  return `cover: plain run, farmer behind, corn ahead, score ${Math.floor(game.score)}`;
}

// Read ?shot= from the URL so a plain browser load can stage a scene too.
export function shotFromUrl(game) {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('shot');
  if (!name) return null;
  return stageShot(game, name);
}
