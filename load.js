// load.js — the load-test gauge in the Work section.
//
// What it shows: the EventPass API's throughput (requests per second) in four
// test setups, on a dial styled like a car's rev counter. Pick a setup and the
// needle swings to that result.
//
// Honest note: nothing is being load-tested live. The numbers below are the
// recorded results from the Locust tests in the EventPass repo (see its
// README, "Load-test results"). This file only replays them.

(() => {
  const svg = document.getElementById('loadGauge');
  if (!svg) return;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- The recorded results ---------- */
  const setups = {
    before: {
      value: 13, label: '13', errors: '10%', conns: 15, workers: 1,
      note: 'The API handled about 800 req/s for four seconds, then froze: zero requests ' +
            'for 30 seconds, then a burst of 500 errors. All 40 request threads were waiting ' +
            'on 15 database connections. A deadlock.',
    },
    w1: {
      value: 950, label: '~950', errors: '0', conns: 15, workers: 1,
      note: 'The fix: a semaphore admits only as many requests as there are database ' +
            'connections. Same laptop, same single worker, zero errors.',
    },
    w2: {
      value: 1500, label: '~1,500', errors: '0', conns: 30, workers: 2,
      note: 'Two worker processes, each with its own pool of 15 connections.',
    },
    w4: {
      value: 1940, label: '~1,940', errors: '0', conns: 60, workers: 4,
      note: 'Four workers. A pool a third of the size (20 connections) still reached ' +
            'about 1,810 req/s, 93% of this. The bottleneck is CPU, not the database.',
    },
  };

  /* ---------- Build the dial (SVG) ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const CX = 160, CY = 160;          // center of the dial
  const MAX = 2000;                  // top of the scale, in req/s
  const START = 135, SWEEP = 270;    // the scale covers 270 degrees, gap at the bottom

  const el = (name, attrs, text) => {
    const node = document.createElementNS(NS, name);
    Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    if (text !== undefined) node.textContent = text;
    svg.append(node);
    return node;
  };
  const angleOf = (v) => START + (SWEEP * Math.min(Math.max(v, 0), MAX)) / MAX;
  const polar = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  };

  el('circle', { cx: CX, cy: CY, r: 150, class: 'g-bezel' });

  // Crimson "stall" zone at the very bottom of the scale (0 to 100 req/s).
  const [sx0, sy0] = polar(139, angleOf(0));
  const [sx1, sy1] = polar(139, angleOf(100));
  el('path', { d: `M${sx0} ${sy0} A139 139 0 0 1 ${sx1} ${sy1}`, class: 'g-stall' });

  // Tick marks every 100 req/s, numbers every 200 (shown as 0, 2, 4 ... 20).
  for (let v = 0; v <= MAX; v += 100) {
    const major = v % 200 === 0;
    const [x1, y1] = polar(130, angleOf(v));
    const [x2, y2] = polar(major ? 113 : 121, angleOf(v));
    el('line', { x1, y1, x2, y2, class: major ? 'g-tick g-major' : 'g-tick' });
    if (major) {
      const [tx, ty] = polar(95, angleOf(v));
      el('text', { x: tx, y: ty + 4.5, class: 'g-num' }, String(v / 100));
    }
  }
  el('text', { x: CX, y: 112, class: 'g-unit' }, '×100 req/s');

  // Digital readout in the gap at the bottom of the dial.
  const readout = el('text', { x: CX, y: 243, class: 'g-read' }, '0');
  el('text', { x: CX, y: 262, class: 'g-unit' }, 'req/s');

  // The needle points right at 0 degrees; we rotate it to the value's angle.
  const needle = el('polygon', {
    points: `${CX + 118},${CY} ${CX},${CY - 4.5} ${CX - 26},${CY - 2.5} ${CX - 26},${CY + 2.5} ${CX},${CY + 4.5}`,
    class: 'g-needle',
  });
  el('circle', { cx: CX, cy: CY, r: 11, class: 'g-hub' });
  el('circle', { cx: CX, cy: CY, r: 3.5, class: 'g-hub-dot' });

  /* ---------- State ---------- */
  const buttons = [...document.querySelectorAll('[data-load]')];
  const errEl = document.getElementById('loadErr');
  const connEl = document.getElementById('loadConn');
  const workEl = document.getElementById('loadWork');
  const noteEl = document.getElementById('loadNote');
  const figure = svg.closest('.load');

  let current = setups.w1;
  let pos = 0;          // where the needle is right now (req/s)
  let vel = 0;          // how fast it is moving
  let target = 0;       // where it is heading
  let stalled = false;  // true while showing the frozen API (needle trembles)
  let jitter = 0, nextJitter = 0;
  let timers = [];

  function draw() {
    needle.setAttribute('transform', `rotate(${angleOf(pos)} ${CX} ${CY})`);
    // Show the recorded figure once the needle has settled; live value while moving.
    const settled = Math.abs(pos - target) < 4 || stalled;
    readout.textContent = settled ? current.label : Math.max(0, Math.round(pos)).toLocaleString('en-US');
  }

  function showReadouts(setup, errors) {
    errEl.textContent = errors;
    errEl.classList.toggle('bad', errors !== '0');
    connEl.textContent = setup.conns;
    workEl.textContent = setup.workers;
    noteEl.textContent = setup.note;
    figure.classList.toggle('is-stalled', errors !== '0');
  }

  /* ---------- Needle physics: a damped spring, so it overshoots a little ---------- */
  let raf = 0, last = 0, visible = false;
  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    let goal = target;
    if (stalled) {
      // A frozen API: the needle trembles just above zero.
      if (now > nextJitter) { jitter = (Math.random() - 0.5) * 26; nextJitter = now + 110; }
      goal = Math.max(0, target + jitter);
    }
    const stiffness = stalled ? 200 : 70, damping = stalled ? 18 : 12;
    vel += (stiffness * (goal - pos) - damping * vel) * dt;
    pos += vel * dt;
    draw();
    const moving = Math.abs(goal - pos) > 0.4 || Math.abs(vel) > 0.4;
    if (visible && (stalled || moving)) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (raf || reduceMotion) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  /* ---------- Choosing a setup ---------- */
  function select(id) {
    timers.forEach(clearTimeout);
    timers = [];
    current = setups[id];
    buttons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.load === id));

    if (reduceMotion) {
      stalled = false; target = pos = current.value;
      showReadouts(current, current.errors);
      draw();
      return;
    }
    if (id === 'before') {
      // Replay what the load test saw: a short burst near 800 req/s, then a freeze.
      stalled = false; target = 800;
      showReadouts(current, '0');
      timers.push(setTimeout(() => {
        stalled = true; target = current.value;
        showReadouts(current, current.errors);
        kick();
      }, 1400));
    } else {
      stalled = false; target = current.value;
      showReadouts(current, current.errors);
    }
    kick();
  }
  buttons.forEach((b) => b.addEventListener('click', () => { autoplay = false; select(b.dataset.load); }));

  /* ---------- First view: play "before", then "after" ---------- */
  let autoplay = true, started = false;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) return;
    if (!started) {
      started = true;
      if (reduceMotion) { select('w1'); return; }
      select('before');
      timers.push(setTimeout(() => { if (autoplay) select('w1'); }, 4600));
    } else {
      kick(); // resume the needle if it was mid-swing or trembling
    }
  }, { threshold: 0.4 }).observe(figure);

  // Before it is scrolled into view, show the headline result without motion.
  showReadouts(setups.w1, setups.w1.errors);
  buttons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.load === 'w1'));
  draw();
})();
