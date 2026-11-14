// story.js — the scroll story in the Research section.
//
// It explains the deforestation project in four steps, driven by scrolling:
//   1. Orbit:   a globe (drawn by hero3d.js).
//   2. T1:      zoom in to a patch of forest, the "earlier" satellite image.
//   3. T2:      the "later" image: some forest cleared, new plantations in rows.
//   4. Output:  the change mask a Dual-Stream U-Net would produce.
//
// Honest note: the forest is drawn in code (thousands of small green dots)
// and the "mask" is the same shapes that were used to draw the changes, so
// it is perfect by construction. It illustrates the idea. The 89% IoU figure
// on the page is from the real research; the area percentages in the legend
// are measured from this drawing.
//
// How the scroll part works: GSAP's ScrollTrigger pins the panel in place and
// reports a progress number from 0 to 1 as you scroll. Everything on screen is
// a function of that one number (see draw()).

(() => {
  const story = document.getElementById('story');
  const canvas = document.getElementById('storyTile');
  if (!story || !canvas) return;
  const globe = story.querySelector('.story-globe');
  const tag = document.getElementById('storyTag');
  const legend = document.getElementById('storyLegend');
  const steps = [...document.querySelectorAll('#storySteps li')];
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const W = 960, H = 600;  // size of the drawing space
  const Q = 2;             // layers are drawn at 2x so they stay sharp on retina screens

  /* ---------- The changed areas (in drawing coordinates) ---------- */
  const cleared = [   // forest that was cut down between T1 and T2
    [[120, 330], [210, 300], [300, 318], [330, 380], [290, 450], [190, 470], [110, 420]],
    [[560, 90], [660, 70], [740, 110], [730, 180], [650, 210], [570, 170]],
    [[700, 430], [790, 400], [860, 450], [840, 530], [740, 540]],
  ];
  const planted = [   // new plantations: regular plots with trees in rows
    [[380, 120], [500, 100], [520, 200], [400, 225]],
    [[470, 400], [610, 380], [630, 500], [490, 520]],
  ];
  const PLANT_COLOR = '#19A974';

  const pathOf = (pts) => {
    const p = new Path2D();
    pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  };
  // Area of a polygon (the "shoelace" formula), used for the legend numbers.
  const areaOf = (pts) => Math.abs(pts.reduce((sum, [x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length];
    return sum + (x * ny - nx * y);
  }, 0)) / 2;
  const share = (polys) => ((polys.reduce((s, p) => s + areaOf(p), 0) / (W * H)) * 100).toFixed(1) + '%';

  // A small random-number generator with a fixed seed, so the forest looks
  // the same on every visit.
  function seeded(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newLayer() {
    const c = document.createElement('canvas');
    c.width = W * Q; c.height = H * Q;
    const ctx = c.getContext('2d');
    ctx.scale(Q, Q);
    return { c, ctx };
  }

  /* ---------- Layer 1: the earlier image (T1), all forest ---------- */
  const t1 = newLayer();
  (function drawForest() {
    const { ctx } = t1;
    const rnd = seeded(7);
    ctx.fillStyle = '#1F4A2E';
    ctx.fillRect(0, 0, W, H);
    // Big soft patches so the forest isn't one flat tone.
    for (let i = 0; i < 46; i++) {
      const x = rnd() * W, y = rnd() * H, r = 60 + rnd() * 120;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rnd() < 0.5 ? 'rgba(52,120,74,.35)' : 'rgba(20,52,34,.4)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Tree crowns: thousands of small dots in slightly different greens.
    const greens = ['#2D6A3E', '#27603A', '#34784A', '#225433', '#3B8250', '#2A6640'];
    for (let i = 0; i < 6200; i++) {
      ctx.fillStyle = greens[(rnd() * greens.length) | 0];
      ctx.beginPath();
      ctx.arc(rnd() * W, rnd() * H, 2.6 + rnd() * 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // A river winding across the tile.
    const river = new Path2D('M-20 215 C180 160 330 270 480 262 S780 300 980 215');
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#24566B'; ctx.lineWidth = 18; ctx.stroke(river);
    ctx.strokeStyle = '#3A7D95'; ctx.lineWidth = 8; ctx.stroke(river);
  })();

  /* ---------- Layer 2: the later image (T2) ---------- */
  const t2 = newLayer();
  (function drawLater() {
    const { ctx } = t2;
    const rnd = seeded(21);
    ctx.drawImage(t1.c, 0, 0, W, H);

    // Dirt roads leading in to the clearings.
    ctx.strokeStyle = '#C9B48E'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.stroke(new Path2D('M150 600 C160 540 185 500 200 468 M960 470 C920 465 890 470 858 462 M620 0 C625 30 640 55 650 72'));

    // Cleared forest: bare soil, a few leftover trees, and "fishbone" logging tracks.
    cleared.forEach((pts) => {
      const shape = pathOf(pts);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      ctx.save();
      ctx.clip(shape);
      ctx.fillStyle = '#A9825A';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let i = 0; i < 520; i++) {           // soil texture
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(143,107,71,.7)' : 'rgba(198,160,116,.7)';
        ctx.beginPath();
        ctx.arc(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 2 + rnd() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(226,208,174,.9)'; // logging tracks
      ctx.lineWidth = 2;
      const mid = (y0 + y1) / 2;
      ctx.beginPath();
      ctx.moveTo(x0, mid); ctx.lineTo(x1, mid);
      for (let x = x0 + 18; x < x1; x += 30) {
        ctx.moveTo(x, mid); ctx.lineTo(x + 14, mid - 46);
        ctx.moveTo(x, mid); ctx.lineTo(x + 14, mid + 46);
      }
      ctx.stroke();
      for (let i = 0; i < 26; i++) {            // a few trees left standing
        ctx.fillStyle = '#2D6A3E';
        ctx.beginPath();
        ctx.arc(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 3 + rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // New plantations: a lighter, even green with young trees in straight rows.
    planted.forEach((pts, n) => {
      const shape = pathOf(pts);
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      ctx.save();
      ctx.clip(shape);
      ctx.fillStyle = '#7FB069';
      ctx.fillRect(0, 0, W, H);
      ctx.translate(cx, cy);
      ctx.rotate(n === 0 ? -0.17 : -0.14);     // rows follow the plot's slant
      ctx.fillStyle = '#3F7D3A';
      for (let y = -140; y <= 140; y += 13) {
        for (let x = -140; x <= 140; x += 11) {
          ctx.beginPath();
          ctx.arc(x, y, 3.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(201,180,142,.9)'; // a track around each plot
      ctx.lineWidth = 2;
      ctx.stroke(shape);
    });
  })();

  /* ---------- Layer 3: the change mask (re-drawn when the theme changes) ---------- */
  const mask = newLayer();
  function drawMask() {
    const { ctx } = mask;
    const clearedColor = getComputedStyle(root).getPropertyValue('--accent-display').trim();
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF';
    cleared.forEach((pts) => { const p = pathOf(pts); ctx.fillStyle = clearedColor; ctx.fill(p); ctx.stroke(p); });
    planted.forEach((pts) => { const p = pathOf(pts); ctx.fillStyle = PLANT_COLOR; ctx.fill(p); ctx.stroke(p); });

    // Legend, with the share of the tile each class covers.
    legend.textContent = '';
    [['cleared forest', clearedColor, share(cleared)], ['new plantation', PLANT_COLOR, share(planted)]]
      .forEach(([name, color, pct]) => {
        const chip = document.createElement('span');
        const dot = document.createElement('i');
        dot.style.background = color;
        chip.append(dot, `${name} · ${pct} of tile`);
        legend.append(chip);
      });
  }
  drawMask();

  /* ---------- Draw one frame for a given scroll progress (0..1) ---------- */
  // smooth(p, a, b): 0 before a, 1 after b, and an eased ramp in between.
  const smooth = (p, a, b) => {
    const t = Math.min(Math.max((p - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };
  const TAGS = ['Orbit view', 'T1 · earlier image', 'T2 · later image', 'Change mask'];
  let progress = 0;

  function draw() {
    const p = progress;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (!cssW) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);

    const tileIn = smooth(p, 0.22, 0.34);     // forest fades in over the globe
    const zoom = 1.7 - 0.7 * smooth(p, 0.22, 0.44); // ...and settles from a closer zoom
    const later = smooth(p, 0.50, 0.62);      // T1 cross-fades to T2
    const reveal = smooth(p, 0.76, 0.93);     // the mask sweeps in from the left

    // The globe (a separate canvas underneath) zooms in and fades out.
    window.storyZoom = smooth(p, 0.06, 0.32);
    globe.style.opacity = String(1 - tileIn);

    if (tileIn > 0) {
      // Fit the 960 x 600 drawing to the canvas, zoomed about its center.
      const s = (pw / W) * zoom;
      ctx.setTransform(s, 0, 0, s, pw / 2 - (W * s) / 2, ph / 2 - (H * s) / 2);
      ctx.globalAlpha = tileIn;
      ctx.drawImage(t1.c, 0, 0, W, H);
      if (later > 0) { ctx.globalAlpha = tileIn * later; ctx.drawImage(t2.c, 0, 0, W, H); }
      if (reveal > 0) {
        const edge = reveal * W;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, edge, H); ctx.clip();
        ctx.globalAlpha = 0.5;                 // dim everything that did not change
        ctx.fillStyle = '#0B1016';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(mask.c, 0, 0, W, H);
        ctx.restore();
        if (reveal < 1) {                      // the scan line
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(edge - 1.5, 0, 3, H);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Which of the four steps are we in?
    const step = p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.75 ? 2 : 3;
    steps.forEach((li, i) => li.classList.toggle('on', i === step));
    tag.textContent = TAGS[step];
    legend.classList.toggle('show', reveal > 0.6);
  }

  function setProgress(p) { progress = Math.min(Math.max(p, 0), 1); draw(); }

  new ResizeObserver(draw).observe(canvas);
  const onTheme = () => { drawMask(); draw(); };
  new MutationObserver(onTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);

  /* ---------- Hook it up to scrolling ---------- */
  const STEP_AT = [0.04, 0.42, 0.68, 0.97]; // a good progress value to show each step
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  if (hasGsap && !reduceMotion) {
    gsap.registerPlugin(ScrollTrigger);
    // Pin the panel just below the nav bar and scrub through the story over
    // about three screens of scrolling.
    const trigger = ScrollTrigger.create({
      trigger: story,
      start: () => `top ${Math.max(76, (window.innerHeight - story.offsetHeight) / 2)}px`,
      end: '+=260%',
      pin: true,
      scrub: 0.5,
      invalidateOnRefresh: true,
      onUpdate: (self) => setProgress(self.progress),
    });
    // Clicking a step scrolls to that part of the story.
    steps.forEach((li, i) => li.querySelector('button').addEventListener('click', () => {
      const y = trigger.start + (trigger.end - trigger.start) * STEP_AT[i];
      window.scrollTo({ top: y, behavior: 'smooth' });
    }));
    setProgress(0);
  } else {
    // No scroll animation: show the final result, list every step's text, and
    // let the step buttons switch the picture.
    story.classList.add('is-static');
    steps.forEach((li, i) => li.querySelector('button').addEventListener('click', () => setProgress(STEP_AT[i])));
    setProgress(1);
  }
})();
