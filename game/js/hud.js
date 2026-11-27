// Turkey Runner — the DOM HUD and screens over the 3D canvas.
// One job: show the numbers, run the real buttons, and swap the screens.
import { POWERUP_DEFS } from './coins.js';
import { ESCAPE_DISTANCE, FARMER_GAP_MIN, FARMER_GAP_MAX, THREAT_RED_BELOW } from './config.js';

export class Hud {
  constructor(callbacks) {
    this.cb = callbacks; // { onStart, onResume, onRestart, onPause, onMute }
    this.el = {
      hud: document.getElementById('hud'),
      score: document.getElementById('score'),
      dist: document.getElementById('dist-line'),
      mult: document.getElementById('mult'),
      coins: document.getElementById('coins'),
      lives: document.getElementById('lives'),
      powerup: document.getElementById('powerup'),
      puIcon: document.getElementById('pu-icon'),
      puName: document.getElementById('pu-name'),
      puFill: document.getElementById('pu-fill'),
      missions: document.getElementById('missions'),
      banner: document.getElementById('stage-banner'),
      toast: document.getElementById('toast'),
      title: document.getElementById('title-screen'),
      pause: document.getElementById('pause-screen'),
      end: document.getElementById('end-screen'),
      endTitle: document.getElementById('end-title'),
      endStory: document.getElementById('end-story'),
      endScore: document.getElementById('end-score'),
      endDist: document.getElementById('end-dist'),
      endCoins: document.getElementById('end-coins'),
      endMult: document.getElementById('end-mult'),
      endNearmiss: document.getElementById('end-nearmiss'),
      endBest: document.getElementById('end-best'),
      best: document.getElementById('best-line'),
      bestEnd: document.getElementById('best-line-end'),
      status: document.getElementById('status'),
      stageName: document.getElementById('stage-name'),
      stageFill: document.getElementById('stage-fill'),
      goalLine: document.getElementById('goal-line'),
      farmerLine: document.getElementById('farmer-line'),
      threatFill: document.getElementById('threat-fill'),
      farmerPill: document.getElementById('farmer-pill'),
      shout: document.getElementById('shout'),
      staminaFill: document.getElementById('stamina-fill'),
      dashState: document.getElementById('dash-state'),
      decoyLine: document.getElementById('decoy-line'),
    };
    this.toastTimer = null;
    this.bannerTimer = null;
    this.bannerLockUntil = 0; // a moment banner cannot be overwritten until its last 0.2 s
    this.best = 0;
    try { this.best = Number(window.localStorage.getItem('turkey-run-best') || 0) || 0; } catch (e) { this.best = 0; }
    this._bind();
    // Debug FPS meter (?fps=1): off unless the URL asks for it.
    this.fpsEl = document.getElementById('fps');
    this.fpsOn = new URLSearchParams(window.location.search).get('fps') === '1';
    if (this.fpsEl && this.fpsOn) this.fpsEl.classList.add('on');
    this.showBest();
  }

  setFps(fps, calls) {
    if (!this.fpsOn || !this.fpsEl) return;
    this.fpsEl.textContent = `${fps} fps · ${calls} calls`;
  }

  _bind() {
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', (event) => { event.stopPropagation(); fn(); });
    };
    bind('btn-start', () => this.cb.onStart());
    bind('btn-resume', () => this.cb.onResume());
    bind('btn-restart', () => this.cb.onRestart());
    bind('btn-restart-pause', () => this.cb.onRestart());
    bind('btn-pause', () => this.cb.onPause());
    bind('btn-mute', () => this.cb.onMute());
    bind('btn-mute-pause', () => this.cb.onMute());
  }

  showBest() {
    // A fresh player has no best yet: show a dash, never a "0".
    const label = this.best > 0 ? this.best.toLocaleString('en-US') : '—';
    if (this.el.best) this.el.best.textContent = `Best score: ${label}`;
    if (this.el.bestEnd) this.el.bestEnd.textContent = `Best score: ${label}`;
  }

  // Screenshot staging only: a staged scene must never show a zero best score.
  // Raises the stored best to at least `min` (a plausible run total) and
  // persists it, so title and end screens show a real number.
  ensureStagedBest(min) {
    if (this.best < min) {
      this.best = min;
      try { window.localStorage.setItem('turkey-run-best', String(this.best)); } catch (e) { /* ignore */ }
      this.showBest();
    }
    return this.best;
  }

  saveBest(score) {
    if (score > this.best) {
      this.best = Math.floor(score);
      try { window.localStorage.setItem('turkey-run-best', String(this.best)); } catch (e) { /* ignore */ }
      this.showBest();
      return true;
    }
    return false;
  }

  showScreen(name) {
    this.el.title.classList.toggle('on', name === 'title');
    this.el.pause.classList.toggle('on', name === 'pause');
    this.el.end.classList.toggle('on', name === 'end');
    this.el.hud.classList.toggle('on', name === 'play' || name === 'pause');
    if (this.el.status) this.el.status.textContent = `Screen: ${name}`;
  }

  showEnd(escaped, stats) {
    this.el.endTitle.textContent = escaped ? 'ESCAPED!' : 'CAUGHT!';
    this.el.endStory.textContent = escaped
      ? 'The turkey spread its wings and flew off into the sunset. Dinner is cancelled!'
      : 'The farmer got his Thanksgiving turkey. Better luck next run!';
    this.el.endScore.textContent = Math.floor(stats.score).toLocaleString('en-US');
    this.el.endDist.textContent = `${Math.floor(stats.distance)} m`;
    this.el.endCoins.textContent = String(stats.coins);
    this.el.endMult.textContent = `×${stats.multiplier}`;
    if (this.el.endNearmiss) this.el.endNearmiss.textContent = String(stats.nearMiss || 0);
    if (this.el.endBest) this.el.endBest.textContent = Math.floor(this.best).toLocaleString('en-US');
    this.showScreen('end');
  }

  update(state) {
    this.el.score.textContent = Math.floor(state.score).toLocaleString('en-US');
    this.el.dist.textContent = `${Math.floor(state.distance)} m  ·  ${state.stageName}`;
    this.el.mult.textContent = `×${state.multiplier}`;
    this.el.mult.classList.toggle('hot', state.multiplier >= 3);
    this.el.coins.innerHTML = `&#127805; ${state.coins}`;
    let hearts = '';
    for (let i = 0; i < 3; i += 1) {
      hearts += i < state.lives ? '&#10084;' : '<span class="lost">&#10084;</span>';
    }
    this.el.lives.innerHTML = hearts;
    // Centre: stage + goal. The fill is overall progress to freedom (1500 m).
    if (this.el.stageName) this.el.stageName.textContent = `STAGE ${state.stageIndex + 1} · ${state.stageName}`;
    if (this.el.stageFill) this.el.stageFill.style.width = `${Math.min(100, (state.distance / ESCAPE_DISTANCE) * 100)}%`;
    if (this.el.goalLine) this.el.goalLine.textContent = `${Math.floor(state.distance)} / ${ESCAPE_DISTANCE} m TO FREEDOM`;
    // Right: the farmer threat panel.
    if (this.el.farmerLine) this.el.farmerLine.textContent = `FARMER ${state.farmerName} ${state.farmerGap.toFixed(1)} m`;
    const threat = 1 - (state.farmerGap - FARMER_GAP_MIN) / (FARMER_GAP_MAX - FARMER_GAP_MIN);
    if (this.el.threatFill) {
      this.el.threatFill.style.width = `${Math.max(4, Math.min(100, threat * 100))}%`;
      this.el.threatFill.classList.toggle('hot', state.farmerGap < THREAT_RED_BELOW);
    }
    if (this.el.farmerPill) {
      const pill = this.el.farmerPill;
      if (state.farmerState === 'SEARCH') {
        pill.textContent = 'SEARCHING...';
        pill.className = 'search';
        pill.id = 'farmer-pill';
      } else if (state.farmerState === 'CORNER') {
        pill.textContent = 'CUT OFF!';
        pill.className = 'danger';
        pill.id = 'farmer-pill';
      } else if (state.farmerState === 'LUNGE') {
        pill.textContent = "HE'S GRABBING!";
        pill.className = 'danger';
        pill.id = 'farmer-pill';
      } else if (state.farmerGap < THREAT_RED_BELOW) {
        pill.textContent = 'SPOTTED!';
        pill.className = 'danger';
        pill.id = 'farmer-pill';
      } else {
        pill.textContent = 'CLOSING IN!';
        pill.className = '';
        pill.id = 'farmer-pill';
      }
    }
    // Farmer shout (game rotates the lines; empty string hides it).
    if (this.el.shout) {
      if (state.shout) {
        if (this.el.shout.textContent !== state.shout) this.el.shout.textContent = state.shout;
        this.el.shout.classList.add('show');
      } else {
        this.el.shout.classList.remove('show');
      }
    }
    // Bottom-left: stamina + decoy stock.
    if (this.el.staminaFill) {
      this.el.staminaFill.style.width = `${Math.max(0, Math.min(100, state.stamina * 100))}%`;
      this.el.staminaFill.classList.toggle('ready', state.dashReady);
    }
    if (this.el.dashState) {
      this.el.dashState.textContent = state.dashReady ? 'DASH READY' : (state.stamina < 0.42 ? 'LOW STAMINA' : 'DASH...');
    }
    if (this.el.decoyLine) this.el.decoyLine.innerHTML = `&#129704; DECOY &times;${state.decoys}`;
    // Missions.
    this.el.missions.innerHTML = state.missions.map((m) => {
      const cls = m.done ? 'mission done' : 'mission';
      const label = m.done ? '✓ ' : '';
      return `<div class="${cls}">${label}${m.text}<span class="m-prog">${Math.min(m.progress, m.target)} / ${m.target}</span></div>`;
    }).join('');
    // Active power-up indicator on the right edge.
    if (state.powerup) {
      const def = POWERUP_DEFS[state.powerup.kind] || { icon: '⭐', name: state.powerup.kind };
      this.el.powerup.classList.add('on');
      this.el.puIcon.textContent = def.icon;
      this.el.puName.textContent = def.name;
      this.el.puFill.style.width = `${Math.max(0, Math.min(100, (state.powerup.left / state.powerup.total) * 100))}%`;
    } else {
      this.el.powerup.classList.remove('on');
    }
  }

  // One moment-banner state + anti-overwrite lock: a new banner may not
  // replace a moment banner until its last 0.2 s, so a big moment is never
  // covered by a small notification. kind: 'moment' (yellow) | 'danger'
  // (red) | 'hide' (blue). seconds: how long it stays up.
  showBanner(name, sub, kind = 'moment', seconds = 1.6) {
    const now = performance.now();
    if (now < this.bannerLockUntil - 200) return; // locked: moment still live
    const banner = this.el.banner;
    banner.innerHTML = `${name}<small>${sub || ''}</small>`;
    banner.classList.remove('danger', 'hide');
    if (kind === 'danger') banner.classList.add('danger');
    else if (kind === 'hide') banner.classList.add('hide');
    banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerLockUntil = now + seconds * 1000;
    this.bannerTimer = setTimeout(() => {
      banner.classList.remove('show');
      this.bannerLockUntil = 0;
    }, seconds * 1000);
  }

  // Short-hand for a scored moment: "THAT WAS CLOSE! +120".
  showMoment(text, kind = 'moment', seconds = 1.2) {
    this.showBanner(text, '', kind, seconds);
  }

  hideBanner() {
    clearTimeout(this.bannerTimer);
    this.bannerLockUntil = 0;
    this.el.banner.classList.remove('show');
  }

  hideToast() {
    clearTimeout(this.toastTimer);
    this.el.toast.classList.remove('show');
  }

  showToast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 1800);
  }

  setMuted(muted) {
    const btn = document.getElementById('btn-mute');
    if (btn) btn.innerHTML = muted ? '&#128263;' : '&#128266;';
    const pauseBtn = document.getElementById('btn-mute-pause');
    if (pauseBtn) pauseBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  }
}
