// Turkey Runner — headless driver (Node 22 stdlib only): serves game/,
// drives Chromium 1255 over CDP, and either takes the 4 screenshots
// (`node drive.mjs shots`) or runs the scripted controls test
// (`node drive.mjs test`). Nothing here ships in the entry.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const PORT = 8091;
const DEBUG_PORT = 9222;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await sleep(150);
  }
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    };
  }

  async call(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return result;
  }

  async evaluate(expression) {
    const r = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
    return r.result ? r.result.value : undefined;
  }

  errors() {
    return this.events.filter((e) =>
      (e.method === 'Runtime.exceptionThrown')
      || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
      || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
      || (e.method === 'Network.loadingFailed'));
  }
}

async function launch() {
  const server = spawn(process.execPath, ['serve.mjs', String(PORT)], { cwd: HERE, stdio: 'ignore' });
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--use-angle=swiftshader', '--hide-scrollbars',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });
  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch (e) {} try { server.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  await waitFor(async () => {
    try { await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`); return true; } catch (e) { return false; }
  }, 30000, 'chrome devtools');
  await waitFor(async () => {
    try {
      const ok = await new Promise((resolve) => {
        http.get(`http://127.0.0.1:${PORT}/index.html`, (res) => { res.resume(); resolve(res.statusCode === 200); }).on('error', () => resolve(false));
      });
      return ok;
    } catch (e) { return false; }
  }, 10000, 'game server');
  const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');
  await cdp.call('Log.enable');
  await cdp.call('Network.enable');
  return { cdp, cleanup };
}

async function loadGame(cdp, width, height, mobile) {
  if (mobile) {
    await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  } else {
    await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  }
  await cdp.call('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await waitFor(async () => {
    try { return await cdp.evaluate('window.__turkeyReady === true'); } catch (e) { return false; }
  }, 30000, 'game ready');
  const webgl = await cdp.evaluate('!!document.querySelector("canvas")');
  if (!webgl) throw new Error('no canvas');
}

async function shot(cdp, name, file, width, height, mobile) {
  await loadGame(cdp, width, height, mobile);
  const description = await cdp.evaluate(`window.__turkey.stageShot(${JSON.stringify(name)})`);
  await sleep(400);
  if (name === 'cover') {
    // Move the real mouse onto the pause button as well, so its hover state shows.
    const rect = await cdp.evaluate(`(() => { const r = document.getElementById('btn-pause').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await sleep(200);
  }
  const jpg = await cdp.call('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  const out = path.join(HERE, 'screenshots', file);
  fs.writeFileSync(out, Buffer.from(jpg.data, 'base64'));
  const size = fs.statSync(out).size;
  const state = await cdp.evaluate('window.__turkey.state()');
  console.log(`${file}: ${size} bytes (${(size / 1024).toFixed(1)} KiB) ${size <= 262144 ? 'OK' : 'OVER 256 KiB!'} — ${description}`);
  console.log(`   state: ${JSON.stringify(state)}`);
  return { file, size, description, state };
}

async function runShots() {
  const { cdp, cleanup } = await launch();
  try {
    const results = [];
    results.push(await shot(cdp, 'cover', '1-cover.jpg', 1280, 800, false));
    results.push(await shot(cdp, 'title', '2-title.jpg', 1280, 800, false));
    results.push(await shot(cdp, 'kitchen', '3-kitchen.jpg', 1280, 800, false));
    results.push(await shot(cdp, 'end', '4-end.jpg', 540, 960, true));
    const errors = cdp.errors();
    console.log(`console/network errors: ${errors.length}`);
    for (const e of errors.slice(0, 10)) console.log('  ', JSON.stringify(e).slice(0, 300));
    const bad = results.filter((r) => r.size > 262144);
    if (bad.length) console.log('OVER-SIZE SHOTS:', bad.map((b) => b.file).join(', '));
    else console.log('All 4 screenshots within 256 KiB.');
  } finally {
    cleanup();
  }
}

async function key(cdp, type, keyName, code, keyCode) {
  await cdp.call('Input.dispatchKeyEvent', {
    type, key: keyName, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
  });
}
async function press(cdp, keyName, code, keyCode) {
  await key(cdp, 'keyDown', keyName, code, keyCode);
  await sleep(60);
  await key(cdp, 'keyUp', keyName, code, keyCode);
}

async function runTest() {
  const { cdp, cleanup } = await launch();
  const checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };
  try {
    await loadGame(cdp, 1280, 800, false);
    let s = await cdp.evaluate('window.__turkey.state()');
    check('title screen shows', s.screen === 'title', `screen=${s.screen}`);

    await cdp.evaluate(`document.getElementById('btn-start').click()`);
    await sleep(700);
    s = await cdp.evaluate('window.__turkey.state()');
    check('start button starts the run', s.screen === 'playing', `screen=${s.screen}`);

    const lane0 = await cdp.evaluate('window.__turkey.game.player.lane');
    await press(cdp, 'ArrowLeft', 'ArrowLeft', 37);
    await sleep(300);
    const lane1 = await cdp.evaluate('window.__turkey.game.player.lane');
    check('ArrowLeft switches lane', lane1 === lane0 - 1, `lane ${lane0} -> ${lane1}`);
    await press(cdp, 'ArrowRight', 'ArrowRight', 39);
    await sleep(300);
    const lane2 = await cdp.evaluate('window.__turkey.game.player.lane');
    check('ArrowRight switches back', lane2 === lane0, `lane ${lane1} -> ${lane2}`);

    await press(cdp, ' ', 'Space', 32);
    await sleep(800);
    const y = await cdp.evaluate('window.__turkey.game.player.y');
    check('Space jumps', y > 0.2, `y=${y.toFixed(2)}`);
    await sleep(900);
    // Wait until the turkey has landed before rolling (roll needs both feet down).
    await waitFor(async () => (await cdp.evaluate('window.__turkey.game.player.y')) === 0, 10000, 'landing');
    await press(cdp, 'ArrowDown', 'ArrowDown', 40);
    await sleep(150);
    const rolling = await cdp.evaluate('window.__turkey.game.player.rolling');
    check('ArrowDown rolls', rolling === true, `rolling=${rolling}`);
    await sleep(800);

    await sleep(4000);
    s = await cdp.evaluate('window.__turkey.state()');
    check('score and distance advance', s.score > 0 && s.distance > 0, `score=${s.score} dist=${s.distance}`);

    // Force a hit in the turkey's own lane and watch a life go.
    const lives0 = s.lives;
    await cdp.evaluate(`(() => { const g = window.__turkey.game; g.player.invuln = 0; g.spawnObstacle('crate', g.player.lane, 3); })()`);
    await sleep(3000);
    s = await cdp.evaluate('window.__turkey.state()');
    check('collision costs a life', s.lives === lives0 - 1, `lives ${lives0} -> ${s.lives}`);

    // Hoverboard shield: pick up a tray, then take a hit and keep the life.
    await cdp.evaluate(`(() => { const g = window.__turkey.game; g.spawnPowerup('tray', g.player.lane, 4); })()`);
    await sleep(3500);
    const board = await cdp.evaluate('window.__turkey.game.player.board !== null');
    check('tray pickup activates the hoverboard', board === true, `board=${board}`);
    const lives1 = await cdp.evaluate('window.__turkey.state()').then((st) => st.lives);
    await cdp.evaluate(`(() => { const g = window.__turkey.game; g.player.invuln = 0; g.spawnObstacle('crate', g.player.lane, 3); })()`);
    await sleep(3000);
    s = await cdp.evaluate('window.__turkey.state()');
    const boardGone = await cdp.evaluate('window.__turkey.game.player.board === null');
    check('hoverboard absorbs a hit (life kept)', s.lives === lives1 && boardGone, `lives ${lives1} -> ${s.lives}, board gone=${boardGone}`);

    // Pause button is a real control.
    await cdp.evaluate(`document.getElementById('btn-pause').click()`);
    await sleep(300);
    s = await cdp.evaluate('window.__turkey.state()');
    check('pause button pauses', s.screen === 'paused', `screen=${s.screen}`);
    await cdp.evaluate(`document.getElementById('btn-resume').click()`);
    await sleep(300);
    s = await cdp.evaluate('window.__turkey.state()');
    check('resume button resumes', s.screen === 'playing', `screen=${s.screen}`);

    // Mute button toggles sound.
    await cdp.evaluate(`document.getElementById('btn-mute').click()`);
    await sleep(200);
    const muted = await cdp.evaluate('window.__turkey.game.sound.muted');
    check('mute button mutes', muted === true, `muted=${muted}`);
    await cdp.evaluate(`document.getElementById('btn-mute').click()`);

    // Drive to the caught end screen, then restart from its button.
    await cdp.evaluate(`(() => { const g = window.__turkey.game; g.lives = 1; g.player.invuln = 0; g.spawnObstacle('crate', g.player.lane, 2); })()`);
    await sleep(3000);
    s = await cdp.evaluate('window.__turkey.state()');
    const endOn = await cdp.evaluate(`document.getElementById('end-screen').classList.contains('on')`);
    const endTitle = await cdp.evaluate(`document.getElementById('end-title').textContent`);
    check('caught end screen shows', s.screen === 'over' && endOn && endTitle === 'CAUGHT!', `screen=${s.screen} title=${endTitle}`);
    await cdp.evaluate(`document.getElementById('btn-restart').click()`);
    await sleep(500);
    s = await cdp.evaluate('window.__turkey.state()');
    check('restart button restarts', s.screen === 'playing' && s.lives === 3, `screen=${s.screen} lives=${s.lives}`);

    // Mobile layout: no horizontal overflow at phone width.
    await loadGame(cdp, 540, 960, true);
    const overflow = await cdp.evaluate('document.documentElement.scrollWidth - window.innerWidth');
    check('phone layout has no horizontal overflow', overflow <= 0, `overflow=${overflow}px`);

    const errors = cdp.errors();
    check('no console/network errors', errors.length === 0, errors.length ? JSON.stringify(errors.slice(0, 3)).slice(0, 300) : 'clean');
    const failed = checks.filter((c) => !c.ok).length;
    console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`);
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    cleanup();
  }
}

async function runDebug() {
  const { cdp, cleanup } = await launch();
  try {
    await loadGame(cdp, 1280, 800, false);
    await cdp.evaluate(`(() => {
      const g = window.__turkey.game;
      const orig = g._applyHit.bind(g);
      window.__hits = [];
      g._applyHit = function () {
        window.__hits.push({
          t: +g.time.toFixed(2), dist: Math.floor(g.distance), lane: g.player.lane,
          y: +g.player.y.toFixed(2), rolling: g.player.rolling, board: !!g.player.board,
          invuln: +g.player.invuln.toFixed(2),
          near: g.obstacles.list.filter((o) => Math.abs(o.z) < 8).map((o) => o.kind + '@' + o.z.toFixed(1) + ' L' + o.lane + ' ' + o.mode),
        });
        return orig();
      };
      return 'hooked';
    })()`);
    const description = await cdp.evaluate(`window.__turkey.stageShot('cover')`);
    const hits = await cdp.evaluate('window.__hits');
    console.log(description);
    console.log('hits:', JSON.stringify(hits, null, 1));
    console.log('final:', JSON.stringify(await cdp.evaluate('window.__turkey.state()')));
  } finally {
    cleanup();
  }
}

const mode = process.argv[2] || 'shots';
if (mode === 'test') await runTest();
else if (mode === 'debug') await runDebug();
else await runShots();
