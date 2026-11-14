// sr.js — the "super-resolution" compare viewer in the hero.
//
// What it shows: the same image twice. On the left, a 64x64 low-res version
// (blocky and noisy). On the right, the sharp version. Dragging the divider
// compares them, like the before/after figures in a super-resolution paper.
//
// Honest note: no neural network runs here. The sharp side is the original
// drawing and the low-res side is made by shrinking it. It illustrates what
// SRGAN/ESRGAN do; the PSNR/LPIPS numbers in the caption are from the paper.
//
// The test image is a top-view F-22, drawn below as plain shapes (my own
// line art, no photos or logos).

(() => {
  const stage = document.getElementById('srStage');
  if (!stage) return;
  const hi = stage.querySelector('.sr-hi');
  const lo = stage.querySelector('.sr-lo');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- The drawing (in a 400 x 400 space, nose pointing up) ---------- */
  const body = new Path2D(
    'M200 30 L208 60 L216 96 L231 126 L235 150 L322 248 L322 266 L250 288 L246 293 ' +
    'L292 336 L292 348 L246 360 L239 340 L227 350 L214 338 L206 345 L200 340 ' +
    'L194 345 L186 338 L173 350 L161 340 L154 360 L108 348 L108 336 L154 293 ' +
    'L150 288 L78 266 L78 248 L165 150 L169 126 L184 96 L192 60 Z');
  const canopy = new Path2D('M200 68 Q210 88 206 114 L200 122 L194 114 Q190 88 200 68 Z');
  const tails = new Path2D(
    'M224 258 L247 300 L241 328 L221 292 Z ' +   // right tail fin (canted outward)
    'M176 258 L153 300 L159 328 L179 292 Z');    // left tail fin
  const nozzles = new Path2D(
    'M214 338 L227 350 L239 340 L234 326 L217 326 Z ' +
    'M186 338 L173 350 L161 340 L166 326 L183 326 Z');
  const panelLines = new Path2D(
    'M200 122 L200 322 ' +                        // spine
    'M231 126 L222 152 L222 252 M169 126 L178 152 L178 252 ' + // intake ducts
    'M316 250 L252 272 M84 250 L148 272 ' +       // wing flaps
    'M288 338 L250 348 M112 338 L150 348');       // tail flaps

  // Read the theme colors from the CSS variables in style.css.
  function themeColors() {
    const css = getComputedStyle(document.documentElement);
    const get = (name) => css.getPropertyValue(name).trim();
    return { bg: get('--surface'), ink: get('--ink'), grid: get('--border'),
             muted: get('--muted'), accent: get('--accent-display') };
  }

  // Draws the whole picture onto any canvas context at any size.
  function drawScene(ctx, size, c) {
    const s = size / 400;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, 400, 400);

    // Background: a faint grid and two range rings, like a radar scope.
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 40; i < 400; i += 40) {
      ctx.moveTo(i, 0); ctx.lineTo(i, 400);
      ctx.moveTo(0, i); ctx.lineTo(400, i);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(200, 200, 110, 0, Math.PI * 2);
    ctx.moveTo(380, 200);
    ctx.arc(200, 200, 180, 0, Math.PI * 2);
    ctx.stroke();

    // The aircraft, tilted so it looks like it is banking across the frame.
    ctx.save();
    ctx.translate(200, 200);
    ctx.rotate(0.55);
    ctx.scale(0.94, 0.94);
    ctx.translate(-200, -195);
    ctx.fillStyle = c.ink;
    ctx.fill(body);
    ctx.fillStyle = c.muted;
    ctx.fill(tails);
    ctx.strokeStyle = c.bg;
    ctx.lineWidth = 1.6;
    ctx.stroke(panelLines);
    ctx.stroke(tails);
    ctx.fillStyle = c.accent;
    ctx.fill(canopy);
    ctx.fill(nozzles);
    ctx.restore();
  }

  /* ---------- Render both versions ---------- */
  const LOW = 64; // the low-res image is 64 x 64 pixels
  const small = document.createElement('canvas');
  small.width = small.height = LOW;

  function render() {
    const cssSize = stage.clientWidth;
    if (!cssSize) return;
    const px = Math.round(cssSize * Math.min(window.devicePixelRatio || 1, 2));
    const c = themeColors();

    // Sharp version: drawn directly at full resolution.
    hi.width = hi.height = px;
    drawScene(hi.getContext('2d'), px, c);

    // Low-res version: draw it tiny, add sensor-style noise, then blow it
    // back up with smoothing off so each pixel becomes a visible block.
    const sctx = small.getContext('2d');
    drawScene(sctx, LOW, c);
    const img = sctx.getImageData(0, 0, LOW, LOW);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 34;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.putImageData(img, 0, 0);

    lo.width = lo.height = px;
    const lctx = lo.getContext('2d');
    lctx.imageSmoothingEnabled = false;
    lctx.drawImage(small, 0, 0, px, px);
  }

  render();
  new ResizeObserver(render).observe(stage);
  // Re-draw when the theme changes (toggle button or system setting).
  new MutationObserver(render).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme'],
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

  /* ---------- The divider ---------- */
  // pos = how much of the picture shows the low-res version, 0..100 (%).
  let pos = 50;
  function setPos(p) {
    pos = Math.max(0, Math.min(100, p));
    stage.style.setProperty('--pos', pos + '%'); // CSS clips the low-res canvas
    stage.setAttribute('aria-valuenow', Math.round(pos));
  }

  let intro = null;   // the opening animation, so we can cancel it
  let dragging = false;
  const fromPointer = (e) => {
    const r = stage.getBoundingClientRect();
    setPos(((e.clientX - r.left) / r.width) * 100);
  };
  stage.addEventListener('pointerdown', (e) => {
    if (intro) { intro.kill(); intro = null; }
    dragging = true;
    stage.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  stage.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
  const stop = () => { dragging = false; };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);
  stage.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
    if (e.key === 'Home') { e.preventDefault(); setPos(0); }
    else if (e.key === 'End') { e.preventDefault(); setPos(100); }
    else if (step) { e.preventDefault(); setPos(pos + step); }
  });

  /* ---------- Opening animation: start fully low-res, then "enhance" ---------- */
  if (!reduceMotion && typeof window.gsap !== 'undefined') {
    const state = { p: 100 };
    setPos(100);
    intro = gsap.timeline({ delay: 1.4 })
      .to(state, { p: 12, duration: 1.6, ease: 'power3.inOut', onUpdate: () => setPos(state.p) })
      .to(state, { p: 50, duration: 1.1, ease: 'power2.out', onUpdate: () => setPos(state.p) });
  } else {
    setPos(50);
  }
})();
