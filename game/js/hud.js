// hud.js — every pixel of interface: the three HUD panels, the moment banner,
// the farmer's shout, the title / end / pause screens and the buttons.
// One job: read the game state and paint the DOM. It never simulates anything.

import { STAGES, FARMER_NAME, ESCAPE_DISTANCE } from './config.js';

function el(id) {
  return document.getElementById(id);
}

function fmt(n) {
  return Math.floor(n).toLocaleString('en-US');
}

export class Hud {
  constructor(callbacks) {
    this.cb = callbacks;
    this.bannerT = 0;
    this.bannerKind = '';
    this.bannerLockUntil = 0;
    this.shoutT = 0;
    this.now = 0;

    el('btn-start').addEventListener('click', () => callbacks.onStart());
    el('btn-again').addEventListener('click', () => callbacks.onRestart());
    el('btn-resume').addEventListener('click', () => callbacks.onResume());
    el('btn-restart').addEventListener('click', () => callbacks.onRestart());
    el('btn-pause').addEventListener('click', () => callbacks.onPause());
    el('btn-mute').addEventListener('click', () => callbacks.onMute());
    el('btn-howto').addEventListener('click', () => {
      const h = el('howto');
      h.style.display = h.style.display === 'none' ? 'block' : 'none';
    });
  }

  bestText(best) {
    return best > 0 ? fmt(best) : '—';
  }

  showBanner(text, kind, seconds) {
    // Moment banners lock the slot: a small notice never covers a big moment.
    if (this.bannerT > 0.2 && kind !== 'moment' && this.bannerKind === 'moment') return;
    const b = el('banner');
    b.textContent = text;
    b.className = `banner show ${kind}`;
    this.bannerT = seconds;
    this.bannerKind = kind;
    this.bannerLockUntil = this.now + seconds;
  }

  hideBanner() {
    this.bannerT = 0;
    this.bannerKind = '';
    el('banner').classList.remove('show');
  }

  flash() {
    const f = document.getElementById('flash');
    if (!f) return;
    f.style.opacity = '0.35';
    window.setTimeout(() => { f.style.opacity = '0'; }, 60);
  }

  setShout(text) {
    const s = el('shout');
    if (text) {
      s.textContent = `“${text}”`;
      s.classList.add('show');
      this.shoutT = 2.2;
    } else {
      s.classList.remove('show');
      this.shoutT = 0;
    }
  }

  update(dt, s) {
    this.now += dt;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) el('banner').classList.remove('show');
    }
    if (this.shoutT > 0) {
      this.shoutT -= dt;
      if (this.shoutT <= 0) el('shout').classList.remove('show');
    }

    // Left panel: score and distance.
    el('score-value').textContent = fmt(s.score);
    el('dist-value').textContent = `${Math.floor(s.distance)} m`;

    // Centre panel: stage, three labelled segments, and the finish line.
    const stage = STAGES[s.stageIndex];
    el('stage-name').textContent = `STAGE ${s.stageIndex + 1} · ${stage.name}`;
    el('goal-text').textContent = `${Math.floor(s.distance)} / ${ESCAPE_DISTANCE} m TO FREEDOM`;
    const segs = el('stage-bar').children;
    for (let i = 0; i < 3; i++) {
      const st = STAGES[i];
      const fill = segs[i].querySelector('.seg-fill');
      const label = segs[i].querySelector('.seg-label');
      label.textContent = st.name;
      let pct = 0;
      if (s.distance >= st.to) pct = 100;
      else if (s.distance > st.from) pct = ((s.distance - st.from) / (st.to - st.from)) * 100;
      fill.style.width = `${pct}%`;
      segs[i].classList.toggle('active', i === s.stageIndex);
    }

    // Right panel: feathers, the farmer's gap, the threat gauge and his status.
    const lives = el('lives');
    if (lives.children.length !== 3) {
      lives.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const f = document.createElement('span');
        f.className = 'feather';
        f.textContent = '❤';
        lives.appendChild(f);
      }
    }
    Array.from(lives.children).forEach((f, i) => {
      f.classList.toggle('lost', i >= s.lives);
    });
    el('farmer-text').textContent = `FARMER ${FARMER_NAME} ${s.farmerGap.toFixed(1)} m`;
    const threat = Math.max(0, Math.min(1, 1 - s.farmerGap / 16));
    const fill = el('threat-fill');
    fill.style.width = `${threat * 100}%`;
    fill.className = s.farmerGap < 3.2 ? 'fill hot' : s.farmerGap < 7 ? 'fill warm' : 'fill cool';
    const pill = el('status-pill');
    const pillText = { CHASE: 'CLOSING IN!', SEARCH: 'SEARCHING...', CORNER: 'CUT OFF!', LUNGE: 'SPOTTED!' }[s.farmerState] || '';
    pill.textContent = pillText;
    pill.className = `pill ${s.farmerState === 'SEARCH' ? 'calm' : 'alarm'}`;

    // Bottom-left: stamina, dash readiness and decoy stock.
    el('stamina-fill').style.width = `${Math.round(s.stamina * 100)}%`;
    el('stamina-fill').className = s.dashReady ? 'fill ready' : 'fill';
    el('dash-label').textContent = s.dashReady ? 'DASH READY [SHIFT]' : 'DASH… [SHIFT]';
    el('decoy-count').textContent = `DECOY ×${s.decoys} [Q]`;

    // The current mission, one line under the stage bar.
    const m = s.mission;
    el('mission-line').textContent = m ? `${m.label} — ${m.value}/${m.target}` : 'All missions complete!';
    el('mission-line').style.display = 'block';
  }

  showTitle(best, missions) {
    el('screen-title').classList.remove('hidden');
    el('screen-end').classList.add('hidden');
    el('screen-pause').classList.add('hidden');
    el('hud').classList.add('title-mode');
    el('title-best').textContent = `Best score: ${this.bestText(best)}`;
    const list = el('mission-list');
    list.innerHTML = '';
    for (const m of missions) {
      const row = document.createElement('div');
      row.className = 'mission-row';
      row.textContent = `${m.done ? '✓' : '○'} ${m.label} — ${m.value}/${m.target}`;
      list.appendChild(row);
    }
  }

  showEnd(result) {
    el('screen-title').classList.add('hidden');
    el('screen-pause').classList.add('hidden');
    el('screen-end').classList.remove('hidden');
    el('hud').classList.remove('title-mode');
    const title = el('end-title');
    title.textContent = result.escaped ? 'ESCAPED!' : 'CAUGHT!';
    title.className = result.escaped ? 'end-title escaped' : 'end-title caught';
    el('end-subtitle').textContent = result.escaped
      ? 'The turkey made it out — dinner is off the menu.'
      : result.cause
        ? `Caught by ${result.cause}.`
        : 'The farmer finally got his bird.';
    el('end-score').textContent = fmt(result.score);
    el('end-distance').textContent = `${Math.floor(result.distance)} m`;
    el('end-corn').textContent = String(result.corn);
    el('end-mult').textContent = `×${result.multiplier}`;
    el('end-dodges').textContent = String(result.dodges);
    el('end-best').textContent = fmt(result.best);
    el('end-best-line').textContent = `Best score: ${this.bestText(result.best)}`;
  }

  showPause(show) {
    el('screen-pause').classList.toggle('hidden', !show);
  }

  hideScreens() {
    el('screen-title').classList.add('hidden');
    el('screen-end').classList.add('hidden');
    el('screen-pause').classList.add('hidden');
    el('hud').classList.remove('title-mode');
  }

  setMuted(muted) {
    el('btn-mute').textContent = muted ? '🔇' : '🔊';
    el('btn-mute').classList.toggle('off', muted);
  }

  setPausedIcon(paused) {
    el('btn-pause').textContent = paused ? '▶' : '⏸';
  }
}
