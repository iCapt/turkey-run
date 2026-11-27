// input.js — keyboard, mouse and touch, all funnelling into one callback.
// One job: turn physical input into game actions. It never touches game state.

export class Input {
  constructor(onAction) {
    this.onAction = onAction;
    this.keys = new Set();
    this.touchStart = null;
    this.boundKeyDown = (e) => this.handleKey(e, true);
    this.boundKeyUp = (e) => this.handleKey(e, false);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
  }

  handleKey(e, down) {
    const gameKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'KeyP', 'KeyM', 'Enter'];
    if (gameKeys.includes(e.code)) e.preventDefault();
    if (!down) {
      this.keys.delete(e.code);
      return;
    }
    if (e.repeat) return;
    this.keys.add(e.code);
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.onAction('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.onAction('right');
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        this.onAction('jump');
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.onAction('roll');
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.onAction('dash');
        break;
      case 'KeyQ':
        this.onAction('decoy');
        break;
      case 'KeyP':
        this.onAction('pause');
        break;
      case 'KeyM':
        this.onAction('mute');
        break;
      case 'Enter':
        this.onAction('confirm');
        break;
      default:
        break;
    }
  }

  // Swipe on the play area: left/right lanes, up jump, down roll. A tap jumps.
  attachTouch(el) {
    el.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this.touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (!this.touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - this.touchStart.x;
      const dy = t.clientY - this.touchStart.y;
      this.touchStart = null;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
        this.onAction('jump');
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) {
        this.onAction(dx > 0 ? 'right' : 'left');
      } else if (dy < 0) {
        this.onAction('jump');
      } else {
        this.onAction('roll');
      }
    }, { passive: true });
  }

  // A click on the play area jumps, so the mouse can play too.
  attachClick(el) {
    el.addEventListener('click', () => this.onAction('jump'));
  }

  destroy() {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
  }
}
