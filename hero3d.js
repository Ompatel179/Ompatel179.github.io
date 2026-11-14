// hero3d.js — the interactive globe in the hero.
//
// Idea: a satellite view of a planet that starts "low-res" (blocky, blurry,
// scattered points) and sharpens into a crisp sphere, like super-resolution.
// Orange patches are "detected change" (a nod to the deforestation research).
// Interactions: drag to spin, move the mouse to tilt, click to re-enhance.
//
// Three.js is loaded straight from a CDN as an ES module, so no build step.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

function init() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const box = canvas.parentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Renderer (bail out gracefully if WebGL isn't available) ---
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    box.classList.add('no-webgl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 3.6;

  const globe = new THREE.Group();
  globe.rotation.x = 0.35;
  scene.add(globe);

  // --- Build the points ---
  // Points are spread evenly over a sphere with the "Fibonacci sphere" trick.
  const N = window.innerWidth < 600 ? 1600 : 2800;
  const target = new Float32Array(N * 3); // final, sharp positions
  const start = new Float32Array(N * 3);  // starting, low-res positions
  const delay = new Float32Array(N);      // so points don't all move at once
  const isChange = new Float32Array(N);   // 1 = orange "detected change" point

  // A few random directions on the sphere act as centers of orange patches.
  const patches = Array.from({ length: 5 }, () =>
    new THREE.Vector3().randomDirection());

  const golden = Math.PI * (3 - Math.sqrt(5));
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    v.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
    target.set([v.x, v.y, v.z], i * 3);

    // Low-res start: snap to a coarse grid (pixelated) and add noise (blurry).
    const q = 0.28;
    start[i * 3]     = Math.round(v.x / q) * q * 1.25 + (Math.random() - 0.5) * 0.5;
    start[i * 3 + 1] = Math.round(v.y / q) * q * 1.25 + (Math.random() - 0.5) * 0.5;
    start[i * 3 + 2] = Math.round(v.z / q) * q * 1.25 + (Math.random() - 0.5) * 0.5;

    delay[i] = Math.random();
    isChange[i] = patches.some((p) => p.dot(v) > 0.9) ? 1 : 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(target, 3));
  geometry.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
  geometry.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
  geometry.setAttribute('aChange', new THREE.BufferAttribute(isChange, 1));

  // A small custom shader: it blends each point from start -> target by
  // uProgress, shrinks it as it sharpens, and dims points on the far side.
  const uniforms = {
    uProgress: { value: reduceMotion ? 1 : 0 },
    uScale: { value: 400 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uBase: { value: new THREE.Color() },
    uChange: { value: new THREE.Color() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aStart;
      attribute float aDelay;
      attribute float aChange;
      uniform float uProgress;
      uniform float uScale;
      uniform float uPixelRatio;
      varying float vChange;
      varying float vAlpha;
      void main() {
        float t = clamp((uProgress - aDelay * 0.45) / 0.55, 0.0, 1.0);
        t = t * t * (3.0 - 2.0 * t);                 // smooth ease
        vec3 p = mix(aStart, position, t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float worldSize = mix(0.08, 0.032, t);     // big + blurry -> small + crisp
        gl_PointSize = worldSize * uScale * uPixelRatio / -mv.z;
        float depth = smoothstep(2.7, 4.5, -mv.z);   // 0 = front, 1 = back
        vAlpha = mix(1.0, 0.18, depth) * mix(0.45, 1.0, t);
        vChange = aChange;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase;
      uniform vec3 uChange;
      varying float vChange;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;                         // round points
        float a = smoothstep(0.5, 0.15, d) * vAlpha;
        gl_FragColor = vec4(mix(uBase, uChange, vChange), a);
      }`,
  });
  globe.add(new THREE.Points(geometry, material));

  // --- Orbit ring + satellite ---
  const ringGroup = new THREE.Group();
  ringGroup.rotation.set(1.15, 0, 0.45);
  scene.add(ringGroup);

  const ringPts = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    ringPts.push(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0);
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPts, 3));
  const ringMat = new THREE.PointsMaterial({ size: 0.012, transparent: true, opacity: 0.5 });
  ringGroup.add(new THREE.Points(ringGeo, ringMat));

  const satMat = new THREE.MeshBasicMaterial();
  const satellite = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), satMat);
  ringGroup.add(satellite);

  // --- Colors follow the site theme (CSS variables) ---
  function applyTheme() {
    const css = getComputedStyle(document.documentElement);
    const get = (name) => css.getPropertyValue(name).trim();
    uniforms.uBase.value.set(get('--ink'));      // black (light mode) / white (dark mode)
    uniforms.uChange.value.set(get('--accent')); // crimson patches
    ringMat.color.set(get('--muted'));
    satMat.color.set(get('--accent'));
    if (reduceMotion) render();
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme'],
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  // --- Size the canvas to its box ---
  function resize() {
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Converts "world size" to pixels for the point shader.
    uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    if (reduceMotion) render();
  }
  new ResizeObserver(resize).observe(box);
  resize();

  // --- Interaction: drag to spin, hover to tilt, click to re-enhance ---
  let spinVelocity = reduceMotion ? 0 : 0.12; // radians per second
  let tiltX = 0, tiltY = 0;
  let dragging = false, lastX = 0, dragDistance = 0;

  box.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; dragDistance = 0;
    box.classList.add('grabbing');
  });
  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    box.classList.remove('grabbing');
    if (dragDistance < 5) enhance(); // a click, not a drag
  });
  window.addEventListener('pointercancel', () => { dragging = false; box.classList.remove('grabbing'); });
  box.addEventListener('pointermove', (e) => {
    const rect = box.getBoundingClientRect();
    tiltX = ((e.clientY - rect.top) / rect.height - 0.5) * 0.5;
    tiltY = ((e.clientX - rect.left) / rect.width - 0.5) * 0.5;
    if (dragging) {
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      dragDistance += Math.abs(dx);
      globe.rotation.y += dx * 0.008;
      spinVelocity = dx * 0.3;
      if (reduceMotion) render();
    }
  });
  box.addEventListener('pointerleave', () => { tiltX = 0; tiltY = 0; });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enhance(); }
  });

  // Replays the low-res -> high-res animation.
  // The first run starts when the globe scrolls into view (see below).
  let enhanceStart = -1;
  let hasPlayed = false;
  function enhance() {
    if (reduceMotion) return;
    uniforms.uProgress.value = 0;
    enhanceStart = performance.now();
  }

  // --- Animation loop (paused while the hero is off screen) ---
  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !hasPlayed && !reduceMotion) {
      hasPlayed = true;
      enhanceStart = performance.now() + 250;
    }
  }, { threshold: 0.3 }).observe(box);

  function render() { renderer.render(scene, camera); }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!visible || reduceMotion) return;

    if (enhanceStart > 0 && now >= enhanceStart) {
      uniforms.uProgress.value = Math.min((now - enhanceStart) / 2600, 1);
      if (uniforms.uProgress.value >= 1) enhanceStart = -1;
    }

    if (!dragging) {
      // Ease the spin back toward a slow, steady rotation.
      spinVelocity += (0.12 - spinVelocity) * 0.02;
      globe.rotation.y += spinVelocity * dt;
    }
    globe.rotation.x += (0.35 + tiltX - globe.rotation.x) * 0.05;
    globe.rotation.z += (-tiltY * 0.3 - globe.rotation.z) * 0.05;

    const a = now * 0.0004;
    satellite.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0);

    render();
  }
  requestAnimationFrame(frame);
  if (reduceMotion) render();
}

init();
