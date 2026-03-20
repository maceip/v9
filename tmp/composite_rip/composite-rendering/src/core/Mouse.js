export class Mouse {
  constructor(canvas) {
    // Normalized coords: 0..1 (UV space)
    this.x = 0.5;
    this.y = 0.5;
    // Velocity for fluid-like effects
    this.vx = 0;
    this.vy = 0;
    this._prevX = 0.5;
    this._prevY = 0.5;

    canvas.addEventListener('mousemove', (e) => {
      this.x = e.clientX / window.innerWidth;
      this.y = 1.0 - e.clientY / window.innerHeight; // flip Y to match GL
    });

    canvas.addEventListener('mouseleave', () => {
      this.x = 0.5;
      this.y = 0.5;
    });
  }

  update() {
    this.vx = this.x - this._prevX;
    this.vy = this.y - this._prevY;
    this._prevX = this.x;
    this._prevY = this.y;
  }
}
