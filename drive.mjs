// drive.mjs — drives the game in headless Chrome over the DevTools protocol.
//   node drive.mjs test   — the scripted checks (title, play, verbs, end, phone)
//   node drive.mjs shots  — the four staged screenshots, 1280x800, deterministic
// Node standard library only, plus a system Chrome (Playwright's cached build
// works). No npm install, no browser extension, no network.

import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = join(ROOT, 'game');
const SHOTS_DIR = join(ROOT, 'screenshots');

const CHROME_CANDIDATES = [
  join(process.env.HOME || '', '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  join(process.env.HOME || '', '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell'),
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  throw new Error('drive.mjs: no Chrome found; set CHROME_BIN or install one');
}

function freePort() {
  return new Promise((resolvePort) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolvePort(port));
    });
  });
}

function serve(root, port) {
  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/game/index.html';
      const filePath = resolve(join(root, rel.replace(/^[/\\]+/, '')));
      if (!filePath.startsWith(root + sep) && filePath !== root) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      const data = readFileSync(filePath);
      res.writeHead(200, { 'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolveServer) => server.listen(port, '127.0.0.1', () => resolveServer(server)));
}

async function httpJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 120));
  }
}

// Poll a boolean expression in the page until it is true (or the timeout
// runs out). SwiftShader renders slowly, so the game advances in game-time,
// not wall-clock time — fixed sleeps are not reliable here.
async function waitState(cdp, expr, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await cdp.evaluate(expr)) return true;
    } catch {
      // The page may still be loading; keep waiting.
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.consoleErrors = [];
    this.ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(`${data.error.message} (${data.error.code})`));
        else resolve(data.result);
      } else if (data.method) {
        this.events.push(data);
        if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
          this.consoleErrors.push(data.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
        }
        if (data.method === 'Runtime.exceptionThrown') {
          this.consoleErrors.push(data.params.exceptionDetails?.text || 'exception');
        }
      }
    };
  }

  ready() {
    return new Promise((resolveReady, rejectReady) => {
      this.ws.onopen = resolveReady;
      this.ws.onerror = rejectReady;
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(`evaluate failed: ${r.exceptionDetails.text}`);
    return r.result?.value;
  }

  async key(code, key, type) {
    await this.send('Input.dispatchKeyEvent', {
      type,
      code,
      key,
      windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    });
  }

  async press(code, key) {
    await this.key(code, key, 'keyDown');
    await new Promise((r) => setTimeout(r, 60));
    await this.key(code, key, 'keyUp');
  }

  async screenshot() {
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    return Buffer.from(r.data, 'base64');
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await waitFor(async () => {
      try {
        return await this.evaluate('!!window.__TURKEY');
      } catch {
        return false;
      }
    }, 30000, 'window.__TURKEY');
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // Already closed.
    }
  }
}

function jpegSize(buf) {
  // Walk the JPEG markers to the frame header (SOF0/SOF2) and read its size.
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    i += 2 + len;
  }
  return null;
}

async function launch(base, debugPort, viewW = 1280, viewH = 800) {
  const chrome = process.env.CHROME_BIN || findChrome();
  const profile = join(tmpdir(), `turkey-drive-${process.pid}`);
  mkdirSync(profile, { recursive: true });
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--no-first-run',
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${viewW},${viewH}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });
  const version = await waitFor(async () => {
    try {
      return await httpJson(`http://127.0.0.1:${debugPort}/json/version`);
    } catch {
      return null;
    }
  }, 30000, 'Chrome DevTools');
  const targets = await httpJson(`http://127.0.0.1:${debugPort}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.setViewport(viewW, viewH);
  void version;
  return { child, cdp, base };
}

async function runTests() {
  const serverPort = await freePort();
  const debugPort = await freePort();
  const server = await serve(ROOT, serverPort);
  const base = `http://127.0.0.1:${serverPort}`;
  // The checks are state, not pixels: run them at 800x500 so the software
  // renderer keeps up even when the machine is busy. The shots stay 1280x800.
  const { child, cdp } = await launch(base, debugPort, 800, 500);
  const results = [];
  const check = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };
  try {
    await cdp.navigate(`${base}/game/index.html?seed=7`);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // 1. Title screen is up on load.
    check('title-visible', await cdp.evaluate(`window.__TURKEY.phase === 'TITLE' && !document.getElementById('screen-title').classList.contains('hidden')`));

    // 2. START RUN begins a run.
    await cdp.evaluate(`document.getElementById('btn-start').click()`);
    check('start', await waitState(cdp, `window.__TURKEY.phase === 'RUN'`, 5000));

    // 3-4. Lanes change left, then right.
    const lane0 = await cdp.evaluate(`window.__TURKEY.lane`);
    await cdp.press('ArrowLeft', 'ArrowLeft');
    const laneLeftOk = await waitState(cdp, `window.__TURKEY.lane === ${lane0 - 1}`, 5000);
    const laneL = await cdp.evaluate(`window.__TURKEY.lane`);
    check('lane-left', laneLeftOk, `lane ${lane0} -> ${laneL}`);
    await cdp.press('ArrowRight', 'ArrowRight');
    const laneRightOk = await waitState(cdp, `window.__TURKEY.lane === ${lane0}`, 5000);
    const laneR = await cdp.evaluate(`window.__TURKEY.lane`);
    check('lane-right', laneRightOk, `lane ${laneL} -> ${laneR}`);

    // 5. Jump leaves the ground.
    await cdp.press('Space', ' ');
    check('jump', await waitState(cdp, `window.__TURKEY.airborne === true`, 5000));

    // 6. Roll tucks the bird (wait to land first — SwiftShader runs slow, so
    // retry the press if the bird is still coming down from the jump).
    let rolled = false;
    for (let attempt = 0; attempt < 3 && !rolled; attempt++) {
      await waitState(cdp, `window.__TURKEY.airborne === false`, 20000);
      await cdp.press('KeyS', 's');
      rolled = await waitState(cdp, `window.__TURKEY.rolling === true`, 8000);
    }
    check('roll', rolled);

    // 7. Dash fires and spends stamina.
    await waitState(cdp, `window.__TURKEY.rolling === false`, 10000);
    const stamina0 = await cdp.evaluate(`window.__TURKEY.stamina`);
    await cdp.press('ShiftLeft', 'Shift');
    const dashing = await waitState(cdp, `window.__TURKEY.dashing === true`, 5000);
    const stamina1 = await cdp.evaluate(`window.__TURKEY.stamina`);
    check('dash', dashing && stamina1 < stamina0, `stamina ${stamina0.toFixed(2)} -> ${stamina1.toFixed(2)}`);

    // 8. Decoy spends one stock and confuses the farmer.
    await cdp.press('KeyQ', 'q');
    const decoyOk = await waitState(cdp, `window.__TURKEY.decoys === 1 && window.__TURKEY.farmerState === 'SEARCH'`, 5000);
    const decoyState = await cdp.evaluate(`({ decoys: window.__TURKEY.decoys, farmer: window.__TURKEY.farmerState })`);
    check('decoy', decoyOk, `decoys ${decoyState.decoys}, farmer ${decoyState.farmer}`);

    // 9. The score climbs while running.
    const score0 = await cdp.evaluate(`window.__TURKEY.score`);
    const scoreRose = await waitState(cdp, `window.__TURKEY.score > ${score0}`, 20000);
    const score1 = await cdp.evaluate(`window.__TURKEY.score`);
    check('score-increases', scoreRose, `${score0} -> ${score1}`);

    // 10. A crate in the turkey's lane costs a life. Retry with a fresh crate
    // if the bird is still blinking from an earlier hit.
    const lives0 = await cdp.evaluate(`window.__TURKEY.lives`);
    let hit = false;
    for (let attempt = 0; attempt < 3 && !hit; attempt++) {
      await cdp.evaluate(`window.__TURKEY.debug.spawnObstacleAtTurkey('crate')`);
      hit = await waitState(cdp, `window.__TURKEY.lives === ${lives0 - 1}`, 6000);
    }
    const lives1 = await cdp.evaluate(`window.__TURKEY.lives`);
    check('collision-loses-life', hit, `lives ${lives0} -> ${lives1}`);

    // 11-12. Pause, then resume.
    await cdp.press('KeyP', 'p');
    check('pause', await waitState(cdp, `window.__TURKEY.phase === 'PAUSED' && !document.getElementById('screen-pause').classList.contains('hidden')`, 5000));
    await cdp.press('KeyP', 'p');
    check('resume', await waitState(cdp, `window.__TURKEY.phase === 'RUN'`, 5000));

    // 13. Mute toggles.
    await cdp.press('KeyM', 'm');
    const muted = await waitState(cdp, `window.__TURKEY.muted === true`, 3000);
    await cdp.press('KeyM', 'm');
    const unmuted = await waitState(cdp, `window.__TURKEY.muted === false`, 3000);
    check('mute', muted === true && unmuted, `muted ${muted}, back ${unmuted}`);

    // 14. One life left plus one more crate ends the run, caught.
    await cdp.evaluate(`window.__TURKEY.debug.setLives(1)`);
    let caught = false;
    for (let attempt = 0; attempt < 3 && !caught; attempt++) {
      await cdp.evaluate(`window.__TURKEY.debug.spawnObstacleAtTurkey('crate')`);
      caught = await waitState(cdp, `window.__TURKEY.phase === 'END'`, 6000);
    }
    const endState = await cdp.evaluate(`({ phase: window.__TURKEY.phase, title: document.getElementById('end-title').textContent, visible: !document.getElementById('screen-end').classList.contains('hidden') })`);
    check('caught-end', caught && endState.title === 'CAUGHT!' && endState.visible, JSON.stringify(endState));

    // 15. RUN AGAIN starts a fresh run.
    await cdp.evaluate(`document.getElementById('btn-again').click()`);
    const againOk = await waitState(cdp, `window.__TURKEY.phase === 'RUN'`, 5000);
    const again = await cdp.evaluate(`({ phase: window.__TURKEY.phase, score: window.__TURKEY.score, lives: window.__TURKEY.lives })`);
    check('restart', againOk && again.score < 50 && again.lives === 3, JSON.stringify(again));

    // 16. A phone viewport does not overflow horizontally.
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${base}/game/index.html?seed=7`);
    await sleep(600);
    const overflow = await cdp.evaluate(`({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth })`);
    check('phone-no-overflow', overflow.doc <= 391 && overflow.body <= 391, JSON.stringify(overflow));
    await cdp.setViewport(800, 500);

    // 17. Nothing errored in the console along the way.
    check('no-console-errors', cdp.consoleErrors.length === 0, cdp.consoleErrors.slice(0, 3).join(' | '));
  } finally {
    cdp.close();
    child.kill();
    server.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — FAILED: ${failed.map((r) => r.name).join(', ')}` : ' — ALL CHECKS PASSED'}`);
  process.exit(failed.length ? 1 : 0);
}

async function runShots() {
  const serverPort = await freePort();
  const debugPort = await freePort();
  const server = await serve(ROOT, serverPort);
  const base = `http://127.0.0.1:${serverPort}`;
  const { child, cdp } = await launch(base, debugPort);
  const shots = [
    ['cover', '1-cover.jpg'],
    ['title', '2-title.jpg'],
    ['kitchen', '3-kitchen.jpg'],
    ['end', '4-end.jpg'],
  ];
  try {
    mkdirSync(SHOTS_DIR, { recursive: true });
    for (const [name, file] of shots) {
      await cdp.navigate(`${base}/game/index.html?shot=${name}&seed=7`);
      await waitFor(async () => {
        try {
          return await cdp.evaluate('window.__TURKEY && window.__TURKEY.shotFrozen === true');
        } catch {
          return false;
        }
      }, 30000, `shot ${name} freeze`);
      await new Promise((r) => setTimeout(r, 250));
      const buf = await cdp.screenshot();
      const out = join(SHOTS_DIR, file);
      writeFileSync(out, buf);
      const log = await cdp.evaluate('window.__TURKEY.shotLog || ""');
      const size = jpegSize(buf);
      console.log(`${file}: ${buf.length} bytes, ${size ? `${size.width}x${size.height}` : 'size unknown'} — ${log}`);
    }
  } finally {
    cdp.close();
    child.kill();
    server.close();
  }
  console.log('\nshots done — check sizes: every file must be 1280x800 and at most 256 KiB');
}

const cmd = process.argv[2];
if (cmd === 'test') {
  runTests();
} else if (cmd === 'shots') {
  runShots();
} else {
  console.log('usage: node drive.mjs test | shots');
  process.exit(2);
}
