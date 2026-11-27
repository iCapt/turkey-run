// Turkey Run 3D — keyboard, mouse drag, touch swipe and the custom cursor.
// One job: turn raw input into game intents (lane, jump, roll, pause, mute).
// Buttons in the DOM stay real buttons; this module only reads the play field.
export class Input {
  constructor(app, callbacks) {
    this.app = app;
    this.cb = callbacks; // { onLane(dir), onJump(), onRoll(), onPause(), onMute() }
    this.dragStart = null;
    this.dragFired = null;
    this.cursor = document.getElementById('cursor');
    this.cursorOn = false;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const key = event.key;
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') { this.cb.onLane(-1); event.preventDefault(); }
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') { this.cb.onLane(1); event.preventDefault(); }
      else if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === ' ') { this.cb.onJump(); event.preventDefault(); }
      else if (key === 'ArrowDown' || key === 's' || key === 'S') { this.cb.onRoll(); event.preventDefault(); }
      else if (key === 'p' || key === 'P' || key === 'Escape') { this.cb.onPause(); }
      else if (key === 'm' || key === 'M') { this.cb.onMute(); }
      else if (key === 'Enter') { this.cb.onConfirm(); }
    });

    // Mouse: drag sideways to switch lanes, flick up/down to jump/roll.
    // A plain click on the play field does nothing (buttons are real DOM buttons).
    this.app.addEventListener('pointerdown', (event) => {
      if (event.target !== this.app && event.target.tagName !== 'CANVAS') return;
      this.dragStart = { x: event.clientX, y: event.clientY, t: performance.now() };
      this.dragFired = null;
    });
    this.app.addEventListener('pointermove', (event) => {
      this._moveCursor(event.clientX, event.clientY);
      if (!this.dragStart) return;
      const dx = event.clientX - this.dragStart.x;
      const dy = event.clientY - this.dragStart.y;
      if (this.dragFired === null && Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) {
        this.cb.onLane(dx > 0 ? 1 : -1);
        this.dragFired = 'lane';
        this.dragStart = { x: event.clientX, y: event.clientY, t: performance.now() };
      } else if (this.dragFired === null && dy < -40 && Math.abs(dy) > Math.abs(dx)) {
        this.cb.onJump(); this.dragFired = 'jump';
      } else if (this.dragFired === null && dy > 40 && Math.abs(dy) > Math.abs(dx)) {
        this.cb.onRoll(); this.dragFired = 'roll';
      }
    });
    window.addEventListener('pointerup', () => { this.dragStart = null; this.dragFired = null; });
    window.addEventListener('pointercancel', () => { this.dragStart = null; this.dragFired = null; });

    // Touch: same flicks, on the play field only.
    let touchStart = null;
    this.app.addEventListener('touchstart', (event) => {
      if (event.target !== this.app && event.target.tagName !== 'CANVAS') return;
      const t = event.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    this.app.addEventListener('touchend', (event) => {
      if (!touchStart) return;
      const t = event.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) this.cb.onLane(dx > 0 ? 1 : -1);
      else if (dy < -30) this.cb.onJump();
      else if (dy > 30) this.cb.onRoll();
      touchStart = null;
    }, { passive: true });

    // Custom cursor: follows the real mouse; hidden on touch devices.
    window.addEventListener('mousemove', (event) => this._moveCursor(event.clientX, event.clientY));
    document.addEventListener('mouseleave', () => this._hideCursor());
  }

  _moveCursor(x, y) {
    if (!this.cursor) return;
    if (!this.cursorOn) { this.cursor.classList.add('on'); this.cursorOn = true; }
    this.cursor.style.left = `${x}px`;
    this.cursor.style.top = `${y}px`;
    // Highlight the button under the pointer, like a real hover state.
    const el = document.elementFromPoint(x, y);
    document.querySelectorAll('.hud-btn.hot').forEach((b) => b.classList.remove('hot'));
    if (el && el.classList && el.classList.contains('hud-btn')) el.classList.add('hot');
  }

  _hideCursor() {
    if (this.cursor) this.cursor.classList.remove('on');
    this.cursorOn = false;
  }

  // Place the cursor over a DOM element (used by screenshot staging).
  placeCursorOver(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    this._moveCursor(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
}
