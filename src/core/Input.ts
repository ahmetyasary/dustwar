const BLOCKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Klavye durumu: isDown (basılı mı) ve justPressed (bu karede mi basıldı). */
export class Input {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();

  private readonly down = (e: KeyboardEvent) => {
    if (BLOCKED.has(e.code)) e.preventDefault();
    if (!this.keys.has(e.code)) this.pressed.add(e.code);
    this.keys.add(e.code);
  };
  private readonly up = (e: KeyboardEvent) => this.keys.delete(e.code);
  private readonly blur = () => this.keys.clear();

  constructor() {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
  }

  isDown(code: string) {
    return this.keys.has(code);
  }

  justPressed(code: string) {
    return this.pressed.has(code);
  }

  /** Her karenin sonunda çağrılır. */
  endFrame() {
    this.pressed.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
  }
}
