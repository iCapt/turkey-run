// Turkey Run 3D — the DOM HUD and screens over the 3D canvas.
// One job: show the numbers, run the real buttons, and swap the screens.
import { POWERUP_DEFS } from './coins.js';

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
      best: document.getElementById('best-line'),
      bestEnd: document.getElementById('best-line-end'),
      status: document.getElementById('status'),
    };
    this.toastTimer = null;
    this.bannerTimer = null;
    this.best = 0;
    try { this.best = Number(window.localStorage.getItem('turkey-run-best') || 0) || 0; } catch (e) { this.best = 0; }
    this._bind();
    this.showBest();
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
    if (this.el.best) this.el.best.textContent = `Best score: ${this.best.toLocaleString('en-US')}`;
    if (this.el.bestEnd) this.el.bestEnd.textContent = `Best score: ${this.best.toLocaleString('en-US')}`;
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

  showBanner(name, sub) {
    this.el.banner.innerHTML = `${name}<small>${sub || ''}</small>`;
    this.el.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), 1900);
  }

  hideBanner() {
    clearTimeout(this.bannerTimer);
    this.el.banner.classList.remove('show');
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
