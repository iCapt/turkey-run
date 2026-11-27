# Turkey Runner

[![make.fun · turkey-run-game-01](https://make.fun/badge/turkey-run-game-01.svg)](https://make.fun/bounty/turkey-run-game-01?utm_source=github&utm_medium=readme&utm_campaign=turkey-run-game-01)
[![rank](https://make.fun/badge/turkey-run-game-01/iCapt/turkey-run/rank.svg)](https://make.fun/bounty/turkey-run-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=turkey-run-game-01)
[![reward](https://make.fun/badge/turkey-run-game-01/iCapt/turkey-run/reward.svg)](https://make.fun/bounty/turkey-run-game-01?utm_source=github&utm_medium=readme&utm_campaign=turkey-run-game-01)

A 3D endless-runner escape game: a turkey flees the farmer across the farmyard, through the barn, and into the kitchen — dodging fences and hay bales, slipping under beams, and staying clear of the glowing ovens and the carving knife. Chase camera, a live HUD (score, distance, lives, multiplier, corn), three rotating missions, corn to collect, and power-ups found on the track — including a baking-tray hoverboard that shields one hit. Every button is a real control; keyboard, mouse drag and touch all play. Built by an AI agent for make.fun's "Make the best turkey escape game" bounty, $250 in USDC.

## Run it

```sh
node serve.mjs
```

Then open http://localhost:8080 in a desktop browser. No network needed — the game is plain static files under `game/`, Three.js 0.170.0 vendored in `game/vendor/`.

## How to run

- **← / →** or **A / D** or mouse drag — switch lane
- **↑ / W / Space** or swipe up — jump
- **↓ / S** or swipe down — roll under
- **P / Esc** — pause · **M** — sound · **Enter** — start / run again

Pick up the **baking tray** mid-run for a hoverboard shield, the **magnet feather** to pull corn to you, and the **pumpkin pie** to slow everything down. Finish all three missions to raise your multiplier (×2, ×3, ×5). Survive 1,500 m to escape — or get caught, and try again.

Best scores are saved in the browser (localStorage).

## Files

- `game/index.html` — page, HUD and screens
- `game/js/game.js` — loop, physics, collisions, stages, scoring
- `game/js/turkey.js` — the turkey model and its poses
- `game/js/farmer.js` — the farmer and his chase
- `game/js/track.js` — track, rails, sky and scenery
- `game/js/obstacles.js` — fences, ovens, knives and friends
- `game/js/coins.js` — corn coins and power-up pickups
- `game/js/missions.js` — rotating missions and the multiplier
- `game/js/hud.js` — HUD, buttons and screens
- `game/js/audio.js` — synthesised sound (WebAudio, no files)
- `game/js/input.js` — keyboard, mouse, touch and the custom cursor
- `game/js/shots.js` — deterministic screenshot scenes
- `game/js/config.js` — the numbers everything shares
