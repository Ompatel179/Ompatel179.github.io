// seg.js — the "semantic segmentation" viewer in the Research section.
//
// What it shows: segmentation means giving every pixel of an image a class.
// Here the image is a side view of a McLaren F1 and the classes are body,
// glass, wheels, vents and lights. Hover or tap a part to light up its mask.
//
// Honest note: no neural network runs here. Each class is a hand-drawn shape,
// so the masks are "perfect" by construction. The "% of pixels" numbers ARE
// real: they are measured from the drawing (see measureShares below).
// The 89% IoU in the caption is from the actual U-Net research.
//
// The car is my own line art (no photos or logos), drawn in an 800 x 330 space
// with the nose pointing left.

(() => {
  const stage = document.getElementById('segStage');
  if (!stage) return;
  const canvas = stage.querySelector('canvas');
  const tip = stage.querySelector('.seg-tip');
  const legend = document.getElementById('segLegend');
  const modeButtons = [...document.querySelectorAll('[data-seg-mode]')];
  const runButton = document.getElementById('segRun');
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = 800, H = 330;

  /* ---------- The shapes ---------- */
  const FRONT = { x: 214, y: 222, r: 48 };  // front wheel
  const REAR = { x: 620, y: 217, r: 53 };   // rear wheel (bigger, like the real car)

  const bodyPath = new Path2D(
    // Outline: nose -> hood -> windscreen -> roof -> tail -> underside,
    // with a round cut-out above each wheel.
    // The F1's shape is one smooth arc: a short rounded nose, the cabin pushed
    // forward, then a long gentle slope down to a short tail.
    'M80 230 C80 218 83 211 90 206 C120 186 170 166 240 152 ' +
    'L345 104 C360 99 374 98 388 98 C440 99 520 116 572 130 ' +
    'C620 140 670 150 712 154 L722 151 L723 160 C724 190 722 216 716 234 L704 252 ' +
    'L669 252 A60 60 0 1 0 571 252 L260 252 A55 55 0 1 0 168 252 L96 252 ' +
    'C86 250 80 242 80 230 Z ' +
    'M372 99 L384 88 L424 90 L432 101 Z ' +     // roof air scoop
    'M236 151 L240 138 L256 136 L258 147 Z');   // mirror on its stalk
  const glassPath = new Path2D(
    'M258 148 L347 110 C368 104 400 103 428 107 L474 138 C420 147 330 150 258 148 Z');
  const ventsPath = new Path2D(
    'M486 158 L540 150 C546 164 546 182 540 194 L492 202 C486 188 484 172 486 158 Z');
  const lightsPath = new Path2D(
    'M100 210 L146 186 L157 194 C148 204 124 216 104 220 Z ' +  // headlight
    'M703 170 L717 170 L716 194 L703 194 Z');                   // tail light
  const wheelsPath = new Path2D();
  [FRONT, REAR].forEach((w) => { wheelsPath.moveTo(w.x + w.r, w.y); wheelsPath.arc(w.x, w.y, w.r, 0, Math.PI * 2); });

  // Lines that only appear in the "photo": door cuts, a body crease, pillars.
  const creases = new Path2D(
    'M270 150 C264 190 266 230 274 250 M462 142 C468 190 466 230 460 250 ' +
    'M246 206 C340 197 440 197 558 201 M96 232 L160 232');
  const pillars = new Path2D('M430 108 L448 141');

  // Draw order matters: later classes sit on top of earlier ones.
  const classes = [
    { id: 'body',   label: 'body',   path: bodyPath,   color: null },       // crimson, from the theme
    { id: 'glass',  label: 'glass',  path: glassPath,  color: '#2E9BD6' },
    { id: 'vents',  label: 'vents',  path: ventsPath,  color: '#8B5CF6' },
    { id: 'lights', label: 'lights', path: lightsPath, color: '#22A565' },
    { id: 'wheels', label: 'wheels', path: wheelsPath, color: '#E0921A' },
  ];

  /* ---------- Which class is at a point? ---------- */
  const hit = document.createElement('canvas').getContext('2d');
  function classAt(x, y) {
    for (let i = classes.length - 1; i >= 0; i--) {       // top-most first
      if (hit.isPointInPath(classes[i].path, x, y)) return classes[i];
    }
    return null; // background
  }

  // Measure how much of the image each class covers by sampling a grid of
  // points. These are the real "% of pixels" numbers shown in the legend.
  function measureShares() {
    const counts = { background: 0 };
    classes.forEach((c) => { counts[c.id] = 0; });
    let total = 0;
    for (let y = 2; y < H; y += 4) {
      for (let x = 2; x < W; x += 4) {
        const c = classAt(x, y);
        counts[c ? c.id : 'background']++;
        total++;
      }
    }
    const shares = {};
    Object.keys(counts).forEach((k) => { shares[k] = (counts[k] / total) * 100; });
    return shares;
  }
  const shares = measureShares();
  const pct = (id) => shares[id].toFixed(1) + '%';

  /* ---------- Colors ---------- */
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches);
  function colors() {
    const css = getComputedStyle(root);
    const get = (n) => css.getPropertyValue(n).trim();
    const dark = isDark();
    return {
      surface: get('--surface'), chip: get('--chip'), ink: get('--ink'),
      muted: get('--muted'), border: get('--border'), accent: get('--accent'),
      glass: dark ? '#6B7684' : '#8A95A3',
      tire: dark ? '#4A4A52' : '#1D1D20',
      rim: dark ? '#D2D2D8' : '#DADAE0',
    };
  }
  const classColor = (cls, c) => cls.color || c.accent;

  /* ---------- State ---------- */
  let mode = 'overlay';   // 'image' | 'overlay' | 'mask'
  let hovered = null;     // class under the mouse (or hovered legend chip)
  let pinned = null;      // class selected by click/tap
  let reveal = reduceMotion ? 1 : 0;  // 0..1, how far the scan has swept

  /* ---------- Drawing ---------- */
  function drawPhoto(ctx, c) {
    // Faint grid and ground line.
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 40; x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 40; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(30, 271); ctx.lineTo(770, 271); ctx.stroke();
    // Soft shadow under the car.
    ctx.fillStyle = c.ink;
    ctx.globalAlpha = 0.14;
    ctx.beginPath(); ctx.ellipse(400, 275, 335, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Body.
    ctx.fillStyle = c.ink;
    ctx.fill(bodyPath);
    ctx.strokeStyle = c.surface;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.6;
    ctx.stroke(creases);
    ctx.globalAlpha = 1;
    // Glass, vents, lights.
    ctx.fillStyle = c.glass; ctx.fill(glassPath);
    ctx.strokeStyle = c.ink; ctx.lineWidth = 4; ctx.stroke(pillars);
    ctx.fillStyle = c.muted; ctx.fill(ventsPath);
    ctx.fillStyle = c.accent; ctx.fill(lightsPath);
    // Wheels: tire, rim, five spokes, hub.
    [FRONT, REAR].forEach((w) => {
      ctx.fillStyle = c.tire;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.rim;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 0.66, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c.tire;
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(w.x + Math.cos(a) * w.r * 0.62, w.y + Math.sin(a) * w.r * 0.62);
      }
      ctx.stroke();
      ctx.fillStyle = c.tire;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 0.16, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawMasks(ctx, c) {
    const active = hovered || pinned;
    classes.forEach((cls) => {
      let alpha = mode === 'mask' ? 1 : mode === 'overlay' ? 0.62 : 0;
      if (active) {
        // Spotlight one class: it gets brighter, the others fade back.
        if (cls === active) alpha = mode === 'mask' ? 1 : 0.88;
        else alpha = mode === 'mask' ? 0.16 : mode === 'overlay' ? 0.1 : 0;
      }
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = classColor(cls, c);
      ctx.fill(cls.path);
      if (cls === active) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = classColor(cls, c);
        ctx.lineWidth = 2.5;
        ctx.stroke(cls.path);
      }
    });
    ctx.globalAlpha = 1;
  }

  function render() {
    const cssW = stage.clientWidth;
    if (!cssW) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(cssW * dpr), ph = Math.round((pw * H) / W);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const ctx = canvas.getContext('2d');
    const s = pw / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const c = colors();

    ctx.fillStyle = mode === 'mask' ? c.chip : c.surface;
    ctx.fillRect(0, 0, W, H);
    if (mode !== 'mask') drawPhoto(ctx, c);

    // Masks only appear where the scan line has already passed.
    const edge = reveal * W;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, edge, H); ctx.clip();
    drawMasks(ctx, c);
    ctx.restore();

    if (reveal > 0 && reveal < 1) {
      // The scan line, with a soft glow trailing behind it.
      const glow = ctx.createLinearGradient(edge - 70, 0, edge, 0);
      glow.addColorStop(0, 'transparent');
      glow.addColorStop(1, c.accent);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = glow;
      ctx.fillRect(edge - 70, 0, 70, H);
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.accent;
      ctx.fillRect(edge - 1.5, 0, 3, H);
    }
  }

  /* ---------- The scan animation ("running the model") ---------- */
  let scanFrame = 0;
  function scan() {
    cancelAnimationFrame(scanFrame);
    if (reduceMotion) { reveal = 1; render(); return; }
    if (mode === 'image') setMode('overlay', false);
    const t0 = performance.now(), dur = 1700;
    const step = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      reveal = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // ease in-out
      render();
      if (p < 1) scanFrame = requestAnimationFrame(step);
    };
    scanFrame = requestAnimationFrame(step);
  }
  // Run it the first time the viewer scrolls into view.
  const firstView = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) { firstView.disconnect(); setTimeout(scan, 350); }
  }, { threshold: 0.55 });
  firstView.observe(stage);

  /* ---------- Controls: Image / Overlay / Mask / Run ---------- */
  function setMode(next, finishScan = true) {
    mode = next;
    if (finishScan) { cancelAnimationFrame(scanFrame); reveal = 1; }
    modeButtons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.segMode === mode));
    render();
  }
  modeButtons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.segMode)));
  runButton.addEventListener('click', scan);

  /* ---------- Legend chips ---------- */
  function syncChips() {
    legend.querySelectorAll('.seg-chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', pinned ? chip.dataset.cls === pinned.id : false);
    });
  }
  function togglePin(cls) {
    pinned = pinned === cls ? null : cls;
    syncChips();
    render();
  }
  function buildLegend() {
    const c = colors();
    legend.textContent = '';
    classes.forEach((cls) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'seg-chip';
      chip.dataset.cls = cls.id;
      chip.setAttribute('aria-pressed', 'false');
      const dot = document.createElement('i');
      dot.style.background = classColor(cls, c);
      const share = document.createElement('b');
      share.textContent = pct(cls.id);
      chip.append(dot, cls.label + ' ', share);
      // Hover preview is for mice only; on touch, a tap pins the class instead.
      chip.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        hovered = cls; render();
      });
      chip.addEventListener('pointerleave', () => { hovered = null; render(); });
      // Keyboard users get the same preview when they Tab onto a chip.
      chip.addEventListener('focus', () => {
        if (chip.matches(':focus-visible')) { hovered = cls; render(); }
      });
      chip.addEventListener('blur', () => { hovered = null; render(); });
      chip.addEventListener('click', () => togglePin(cls));
      legend.append(chip);
    });
    const bg = document.createElement('span');
    bg.className = 'seg-chip seg-chip-bg';
    const share = document.createElement('b');
    share.textContent = pct('background');
    bg.append('background ', share);
    legend.append(bg);
    syncChips();
  }
  buildLegend();

  /* ---------- Hover / tap on the picture ---------- */
  function toDrawing(e) {
    const r = stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, r };
  }
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const p = toDrawing(e);
    const cls = reveal >= 1 ? classAt(p.x, p.y) : null;
    if (cls !== hovered) { hovered = cls; render(); }
    if (cls) {
      tip.hidden = false;
      tip.textContent = `${cls.label} · ${pct(cls.id)} of pixels`;
      tip.style.left = Math.min(e.clientX - p.r.left + 14, p.r.width - 170) + 'px';
      tip.style.top = Math.max(e.clientY - p.r.top - 34, 6) + 'px';
    } else {
      tip.hidden = true;
    }
    stage.style.cursor = cls ? 'pointer' : 'default';
  });
  stage.addEventListener('pointerleave', () => { hovered = null; tip.hidden = true; render(); });
  stage.addEventListener('click', (e) => {
    if (reveal < 1) return;
    const p = toDrawing(e);
    const cls = classAt(p.x, p.y);
    if (cls) togglePin(cls);
    else if (pinned) togglePin(pinned);
  });

  /* ---------- Keep it in sync with size and theme ---------- */
  render();
  new ResizeObserver(render).observe(stage);
  const onTheme = () => { buildLegend(); render(); };
  new MutationObserver(onTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
})();
