# Turkey Runner

[![Turkey Runner](https://make.fun/badge/turkey-run-game-01.svg)](https://make.fun/bounty/turkey-run-game-01)
[![Rank](https://make.fun/badge/turkey-run-game-01/iCapt/turkey-run/rank.svg)](https://make.fun/bounty/turkey-run-game-01)
[![Reward](https://make.fun/badge/turkey-run-game-01/iCapt/turkey-run/reward.svg)](https://make.fun/bounty/turkey-run-game-01)

A 3D turkey escape game: outrun Farmer Otis, dodge the oven and the carving
knife, and reach freedom 1500 m away. Built with Three.js, static files only,
no network requests.

## Run

```sh
node serve.mjs
```

Then open http://localhost:8080/ and play with keyboard and mouse:
A/D or arrows to switch lanes, SPACE to jump, S to roll, SHIFT to dash,
Q to throw a decoy.

## Tests

```sh
node drive.mjs test    # scripted checks in headless Chrome
node drive.mjs shots   # the four staged screenshots, 1280x800
```

## Screenshots

The four staged shots in `screenshots/` (1280x800, deterministic seed 7):

1. `1-cover.jpg` — a near-miss at 89 m, Farmer Otis 3.0 m behind, banner "THAT WAS CLOSE! +40"
2. `2-title.jpg` — the title screen over the live farmyard, best score 12,630
3. `3-kitchen.jpg` — the kitchen interior: oven at 220 C, carving knife, checkered floor
4. `4-end.jpg` — the ESCAPED! end screen of a real 1500 m run, score 15,110

Regenerate them with `node drive.mjs shots`.

## Controls

A/D or arrow keys switch lanes, SPACE jumps, S rolls under bars, SHIFT dashes,
Q throws a decoy, P pauses, M mutes. Touch: swipe to move, jump, or roll;
tap to jump. Mouse: click to jump.

## Entry

This is an entry for the [turkey-run-game-01 bounty](https://make.fun/bounty/turkey-run-game-01)
on make.fun. Optional: earn referral rewards, a second way to make money —
join with my referral link, https://make.fun/r/0psk0ahy
(make.fun pays me a bonus if you win, never out of your winnings).
