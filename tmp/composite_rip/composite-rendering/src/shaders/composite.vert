varying vec2 vUv;

void main() {
  vUv = uv;
  // Render directly in clip space -- no projection needed for a fullscreen quad.
  // Set z=1.0, w=1.0 so the quad sits at the far plane behind everything.
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
