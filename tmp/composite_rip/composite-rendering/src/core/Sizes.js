export class Sizes {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspect = this.width / this.height;
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    this._listeners = {};

    window.addEventListener('resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.aspect = this.width / this.height;
      this.pixelRatio = Math.min(window.devicePixelRatio, 2);
      this._emit('resize');
    });
  }

  on(event, fn) {
    (this._listeners[event] ??= []).push(fn);
  }

  _emit(event) {
    (this._listeners[event] ?? []).forEach((fn) => fn());
  }
}
