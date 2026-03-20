import * as THREE from 'three';
import gsap from 'gsap';

import cardVertSrc from './shaders/card.vert?raw';
import cardFragSrc from './shaders/card.frag?raw';
import postVertSrc from './shaders/post.vert?raw';
import postFragSrc from './shaders/post.frag?raw';

// ─── Project Data ───────────────────────────────────────────────────────────
const projects = [
  { name: 'Garden Eight',  color: '#2d5a3d', accent: '#8fc9a0' },
  { name: 'Drift',         color: '#3a3a5c', accent: '#9a9adc' },
  { name: 'Stone & Style', color: '#5c3a2d', accent: '#d4a088' },
  { name: 'Aircord',       color: '#2d4a5c', accent: '#88b8d4' },
  { name: 'Maxilla',       color: '#4a2d5c', accent: '#c088d4' },
];
const numCards = projects.length;

// ─── Canvas Textures (generate card content) ────────────────────────────────
function createCardTexture(project) {
  const canvas = document.createElement('canvas');
  const w = 562;  // 1125 * 0.5
  const h = 1000; // 2000 * 0.5
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = project.color;
  ctx.fillRect(0, 0, w, h);

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Decorative lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const y = h * 0.3 + i * 40;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, y);
    ctx.lineTo(w * 0.85, y);
    ctx.stroke();
  }

  // Project name
  ctx.fillStyle = project.accent;
  ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(project.name, w / 2, h * 0.18);

  // Small label
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '18px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText('PROJECT', w / 2, h * 0.82);

  // Small circle decoration
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.55, 30, 0, Math.PI * 2);
  ctx.strokeStyle = project.accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ─── Globals ────────────────────────────────────────────────────────────────
let renderer, camera, scene;
let windowWidth, windowHeight;
let cards = [];
let postScene, postCamera, postMaterial, renderTarget;
let floorMesh;
let time = 0;

// Mouse parallax
const mouse = { x: 0, y: 0, lx: 0, ly: 0 };

// Scroll system (slideScroll)
const scroll = {
  x: 0,     // lerped (current position)
  delta: 0, // target (where we want to go)
};
const isWindows = navigator.platform.indexOf('Win') > -1;
const ease = isWindows ? 0.0875 : 0.175;
const wheelRatio = isWindows ? 120 : 80;
let scrollStopTimer = null;
let paddingWidth = 0;
let totalDist = 0;
let snapTween = null;

// Content aspect ratio
const contentRatio = { x: 1125, y: 2000 };
const scaleFactor = { x: 0.58, y: 0.58 };

// ─── DOM refs ───────────────────────────────────────────────────────────────
const projectTitleEl = document.getElementById('project-title');
const scrollDotsEl = document.getElementById('scroll-dots');
const dots = scrollDotsEl.querySelectorAll('.scroll-dot');

// ─── Init ───────────────────────────────────────────────────────────────────
function init() {
  windowWidth = window.innerWidth;
  windowHeight = window.innerHeight;

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(windowWidth, windowHeight);
  renderer.setClearColor(0x0a0a0a, 1);
  document.body.appendChild(renderer.domElement);

  // Camera: FOV 30, position.z computed so height fills screen
  const fov = 30;
  camera = new THREE.PerspectiveCamera(fov, windowWidth / windowHeight, 1, 10000);
  camera.position.z = (windowHeight / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  // Render target for post-processing
  renderTarget = new THREE.WebGLRenderTarget(
    windowWidth * renderer.getPixelRatio(),
    windowHeight * renderer.getPixelRatio(),
    { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
  );

  // Create cards
  createCards();

  // Create floor
  createFloor();

  // Post-processing fullscreen quad
  createPostProcessing();

  // Events
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouseMove);

  // Touch support
  let touchLastX = 0;
  window.addEventListener('touchstart', (e) => {
    touchLastX = e.touches[0].clientX;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    const touchX = e.touches[0].clientX;
    const dx = touchLastX - touchX;
    touchLastX = touchX;
    scroll.delta += dx * 2.5;
    if (snapTween) { snapTween.kill(); snapTween = null; }
    resetScrollStop();
  }, { passive: true });
  window.addEventListener('touchend', () => {
    snapToNearest();
  });

  // Start render loop
  animate();
}

// ─── Create Cards ───────────────────────────────────────────────────────────
function createCards() {
  const cardScaleX = windowHeight * (contentRatio.x / contentRatio.y) * scaleFactor.x;
  const cardScaleY = windowHeight * scaleFactor.y;

  paddingWidth = cardScaleX + 0.2 * windowWidth * 0.5;
  totalDist = numCards * paddingWidth;

  for (let i = 0; i < numCards; i++) {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    const texture = createCardTexture(projects[i]);

    const material = new THREE.ShaderMaterial({
      vertexShader: cardVertSrc,
      fragmentShader: cardFragSrc,
      uniforms: {
        tMap: { value: texture },
        deg: { value: 0 },
        opacity: { value: 1.0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(cardScaleX, cardScaleY, 1);
    mesh.userData.index = i;
    scene.add(mesh);
    cards.push(mesh);
  }
}

// ─── Create Floor ───────────────────────────────────────────────────────────
function createFloor() {
  const floorGeometry = new THREE.CircleGeometry(1, 12);
  const floorMaterial = new THREE.MeshBasicMaterial({
    color: 0x111115,
    transparent: true,
    opacity: 0.35,
  });
  floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);

  const far = camera.position.z;
  floorMesh.rotation.x = THREE.MathUtils.degToRad(-80);
  floorMesh.position.y = -0.37 * windowHeight * 0.9;
  floorMesh.position.z = 0.2 * -far;
  const floorScale = windowHeight * 0.8;
  floorMesh.scale.set(floorScale, floorScale, 1);
  scene.add(floorMesh);
}

// ─── Post-processing ────────────────────────────────────────────────────────
function createPostProcessing() {
  postMaterial = new THREE.ShaderMaterial({
    vertexShader: postVertSrc,
    fragmentShader: postFragSrc,
    uniforms: {
      tScreen: { value: renderTarget.texture },
      rgb_shift: { value: 0 },
    },
  });

  const postGeometry = new THREE.PlaneGeometry(2, 2);
  const postQuad = new THREE.Mesh(postGeometry, postMaterial);
  postScene = new THREE.Scene();
  postScene.add(postQuad);
  postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

// ─── Scroll Handler ─────────────────────────────────────────────────────────
function onWheel(e) {
  e.preventDefault();

  // Kill any running snap tween
  if (snapTween) { snapTween.kill(); snapTween = null; }

  // Use whichever axis has more movement
  let dist = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

  // Normalize for line-mode scrolling
  if (e.deltaMode === 1) dist *= 40;

  // Clamp and apply
  const normalized = (dist / Math.max(Math.abs(dist), 1)) * Math.min(Math.abs(dist), 150) / 150;
  scroll.delta += normalized * wheelRatio;

  resetScrollStop();
}

function resetScrollStop() {
  if (scrollStopTimer) clearTimeout(scrollStopTimer);
  scrollStopTimer = setTimeout(() => {
    snapToNearest();
  }, 100);
}

function snapToNearest() {
  const snapTarget = Math.round(scroll.delta / paddingWidth) * paddingWidth;
  if (snapTween) snapTween.kill();
  snapTween = gsap.to(scroll, {
    duration: 1,
    delta: snapTarget,
    ease: 'power2.out',
    onComplete: () => { snapTween = null; },
  });
}

// ─── Mouse ──────────────────────────────────────────────────────────────────
function onMouseMove(e) {
  mouse.x = (e.clientX / windowWidth - 0.5) * 2;
  mouse.y = (e.clientY / windowHeight - 0.5) * 2;
}

// ─── Resize ─────────────────────────────────────────────────────────────────
function onResize() {
  windowWidth = window.innerWidth;
  windowHeight = window.innerHeight;

  camera.aspect = windowWidth / windowHeight;
  camera.updateProjectionMatrix();
  camera.position.z = (windowHeight / 2) / Math.tan(THREE.MathUtils.degToRad(15));

  renderer.setSize(windowWidth, windowHeight);
  renderTarget.setSize(
    windowWidth * renderer.getPixelRatio(),
    windowHeight * renderer.getPixelRatio()
  );

  // Update card scales and padding
  const cardScaleX = windowHeight * (contentRatio.x / contentRatio.y) * scaleFactor.x;
  const cardScaleY = windowHeight * scaleFactor.y;
  paddingWidth = cardScaleX + 0.2 * windowWidth * 0.5;
  totalDist = numCards * paddingWidth;

  cards.forEach((card) => {
    card.scale.set(cardScaleX, cardScaleY, 1);
  });

  // Update floor
  if (floorMesh) {
    const far = camera.position.z;
    floorMesh.position.y = -0.37 * windowHeight * 0.9;
    floorMesh.position.z = 0.2 * -far;
    const floorScale = windowHeight * 0.8;
    floorMesh.scale.set(floorScale, floorScale, 1);
  }
}

// ─── Update Card Positions (atan2 arc) ──────────────────────────────────────
function updateCards() {
  const radius = windowWidth * 0.6;
  const scrollX = scroll.x + (paddingWidth * (numCards - 1)) / 2;
  const halfWidth = windowWidth / 2;

  // Track closest to center for active project
  let closestDist = Infinity;
  let activeIndex = 0;

  for (let i = 0; i < numCards; i++) {
    const card = cards[i];
    const basePosn = i * paddingWidth - scrollX;

    // Infinite wrapping
    let r = basePosn % totalDist;
    if (r > totalDist / 2) r -= totalDist;
    if (r < -totalDist / 2) r += totalDist;

    // Arc angle via atan2
    const angle = Math.atan2(radius, r);
    const rotation = angle - Math.PI / 2;
    card.rotation.y = rotation;

    // Z position (depth along arc)
    const z = -Math.sin(r / halfWidth) * paddingWidth * Math.tan(rotation);
    card.position.z = -z;

    // X position with arc adjustment
    const sign = r > 0 ? -1 : 1;
    card.position.x = r + Math.abs(z) * sign * 0.32;

    // Y at zero
    card.position.y = 0;

    // Pass rotation angle to shader
    card.material.uniforms.deg.value = rotation;

    // Track closest
    if (Math.abs(r) < closestDist) {
      closestDist = Math.abs(r);
      activeIndex = i;
    }
  }

  // Update UI
  projectTitleEl.textContent = projects[activeIndex].name;
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === activeIndex);
  });
}

// ─── Render Loop ────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  time += 0.016;

  // Lerp scroll: this is the core wobble — delta jumps via gsap snap,
  // x chases it with ease, creating the springy overshoot
  scroll.x += (scroll.delta - scroll.x) * ease;

  // Scroll velocity drives RGB shift intensity
  const velocity = Math.abs(scroll.delta - scroll.x);
  const targetShift = Math.min(velocity / windowWidth * 0.15, 0.025);
  postMaterial.uniforms.rgb_shift.value +=
    (targetShift - postMaterial.uniforms.rgb_shift.value) * 0.1;

  // Mouse parallax on camera
  mouse.lx += (mouse.x * 15 - mouse.lx) * 0.05;
  mouse.ly += (mouse.y * 10 - mouse.ly) * 0.05;
  camera.position.x = mouse.lx;
  camera.position.y = -mouse.ly;

  // Update card positions
  updateCards();

  // Render scene to offscreen target
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  // Render post-processing to screen
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCamera);
}

// ─── Start ──────────────────────────────────────────────────────────────────
init();
