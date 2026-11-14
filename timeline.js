// timeline.js — the career timeline, drawn like a git branch graph.
//
// The idea: study runs along the bottom "main" line. Internships, research
// and the current job are branches that fork off above it and merge back
// when they end. A one-off event (the IEEE paper) is a tag: a diamond on a
// short stem. A dashed "HEAD" line marks today.
//
// The entries themselves live in index.html as a normal list. This script
// reads their dates from data-start / data-end, draws the graph as an SVG,
// adds a row of buttons, and shows one entry at a time. Without JavaScript
// the page simply shows the whole list.
//
// The graph draws itself from left to right as the section scrolls into view.

(() => {
  const box = document.getElementById('tl');
  const svg = document.getElementById('tlGraph');
  if (!box || !svg) return;
  const graphBox = document.getElementById('tlGraphBox');
  const tabs = document.getElementById('tlTabs');
  const items = [...box.querySelectorAll('.tl-entry')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Time -> x position ---------- */
  const W = 1200, H = 250;
  const FIRST_YEAR = 2021, LAST_YEAR = 2027;
  const LEFT = 70, RIGHT = 1170;
  const MONTHS = (LAST_YEAR - FIRST_YEAR + 1) * 12;
  // "months since January 2021" -> x in the drawing
  const xOf = (months) => LEFT + (months / MONTHS) * (RIGHT - LEFT);
  // "2024-05" -> months since January 2021 (start of that month)
  const monthIndex = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return (y - FIRST_YEAR) * 12 + (m - 1);
  };
  const today = new Date();
  const nowIndex = Math.min(
    (today.getFullYear() - FIRST_YEAR) * 12 + today.getMonth() + today.getDate() / 31, MONTHS);
  const NOW_X = xOf(nowIndex);

  /* ---------- Rows of the graph ---------- */
  const MAIN_Y = 186;   // study runs along here
  const LANE_A = 112;   // internships, research, current job
  const TAG_Y = 150;    // height of a tag marker (a one-off event, like a paper)
  const CURVE = 16;     // width of a fork / merge curve

  // How each entry connects to the rest of the graph.
  //   lane:  which row it runs along
  //   from:  the row it forks from
  //   to:    the row it merges into when it ends (null = still open)
  //   tag:   a single moment, drawn as a diamond on a short stem (like a git tag)
  const shape = {
    btech:   { lane: MAIN_Y },
    ms:      { lane: MAIN_Y },
    candore: { lane: LANE_A, from: MAIN_Y, to: MAIN_Y },
    unet:    { lane: LANE_A, from: MAIN_Y, to: MAIN_Y },
    paper:   { lane: MAIN_Y, tag: true },
    ces:     { lane: LANE_A, from: MAIN_Y, to: null },
  };

  /* ---------- Read the entries from the page ---------- */
  const entries = items.map((li) => {
    const start = monthIndex(li.dataset.start);
    const open = li.dataset.end === 'now';
    // An end month counts in full, so the bar runs to the start of the next month.
    const end = open ? nowIndex : monthIndex(li.dataset.end) + 1;
    return { li, id: li.dataset.id, kind: li.dataset.kind, branch: li.dataset.branch,
             start, end, open, x0: xOf(start), x1: xOf(end), ...shape[li.dataset.id] };
  });

  // "5 mo", "1 yr 9 mo", "4 yr". Long stretches are rounded to whole years,
  // so a four-year degree reads "4 yr" and not "4 yr 1 mo".
  const lengthText = (months) => {
    const m = Math.max(1, Math.round(months));
    if (m >= 36) return `${Math.round(m / 12)} yr`;
    const y = Math.floor(m / 12), r = m % 12;
    return [y ? `${y} yr` : '', r ? `${r} mo` : ''].filter(Boolean).join(' ');
  };
  entries.forEach((e) => {
    if (e.tag) { e.x1 = e.x0; return; }               // a single moment has no length
    const when = e.li.querySelector('.tl-when');
    const total = lengthText(e.end - e.start);
    let note = total;
    if (e.open) note = `${total} and counting`;
    else if (e.end > nowIndex) note = `${total} in total, ${lengthText(e.end - nowIndex)} to go`;
    when.textContent += ` · ${note}`;
  });

  /* ---------- Build the SVG ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs, parent = svg, text) => {
    const node = document.createElementNS(NS, name);
    Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  };

  // Year lines and labels.
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    const x = xOf((y - FIRST_YEAR) * 12);
    el('line', { x1: x, y1: 36, x2: x, y2: H - 22, class: 'tl-grid' });
    el('text', { x: x + 6, y: 28, class: 'tl-year' }, svg, String(y));
  }
  el('text', { x: 12, y: MAIN_Y + 4, class: 'tl-lane' }, svg, 'main');

  // Everything that gets "drawn in" on scroll sits inside this clipped group.
  const clip = el('clipPath', { id: 'tlClip' }, el('defs', {}));
  const clipRect = el('rect', { x: 0, y: 0, width: W, height: H }, clip);
  const drawn = el('g', { 'clip-path': 'url(#tlClip)' });

  // The thin main line, from the first entry to today.
  const firstX = Math.min(...entries.map((e) => e.x0));
  el('path', { d: `M${firstX} ${MAIN_Y} H${NOW_X}`, class: 'tl-main' }, drawn);

  // An S-shaped curve between two rows.
  const sCurve = (xa, ya, xb, yb) => `C${xa + (xb - xa) * 0.6} ${ya} ${xb - (xb - xa) * 0.6} ${yb} ${xb} ${yb}`;

  entries.forEach((e) => {
    const g = el('g', { class: `tl-branch tl-${e.kind}`, 'data-id': e.id, tabindex: -1 }, drawn);
    e.g = g;
    g.addEventListener('click', () => select(e.id, true));
    if (e.tag) {
      // A tag: a short stem up from the main line with a diamond on top.
      el('circle', { cx: e.x0, cy: TAG_Y, r: 18, class: 'tl-hit' }, g);
      el('path', { d: `M${e.x0} ${MAIN_Y} V${TAG_Y + 9}`, class: 'tl-line tl-stem' }, g);
      el('path', { d: `M${e.x0} ${TAG_Y - 9} l9 9 l-9 9 l-9 -9 Z`, class: 'tl-node' }, g);
      return;
    }
    let d;
    if (e.lane === MAIN_Y) {
      // Study: a thick stretch of the main line. Anything after today is dashed.
      const solidEnd = Math.min(e.x1, NOW_X);
      d = `M${e.x0} ${MAIN_Y} H${solidEnd}`;
      if (e.x1 > NOW_X) {
        el('path', { d: `M${NOW_X + 10} ${MAIN_Y} H${e.x1}`, class: 'tl-line tl-planned' }, g);
      }
    } else {
      // A branch: fork up from the main line, run along its lane, merge back.
      d = `M${e.x0 - CURVE} ${e.from} ${sCurve(e.x0 - CURVE, e.from, e.x0, e.lane)}`;
      d += ` H${e.x1}`;
      if (e.to != null) d += ` ${sCurve(e.x1, e.lane, e.x1 + CURVE, e.to)}`;
    }
    el('path', { d, class: 'tl-hit' }, g);
    el('path', { d, class: 'tl-line' }, g);
    // A dot at each end of the entry.
    el('circle', { cx: e.x0, cy: e.lane, r: 5.5, class: 'tl-node' }, g);
    el('circle', { cx: Math.min(e.x1, e.lane === MAIN_Y ? NOW_X : e.x1), cy: e.lane, r: 5.5, class: 'tl-node' }, g);
  });

  // The name of the picked branch, shown above it.
  const nameLabel = el('text', { x: 0, y: 0, class: 'tl-name' }, drawn, '');

  // HEAD: a dashed line at today's date.
  el('line', { x1: NOW_X, y1: 50, x2: NOW_X, y2: H - 22, class: 'tl-head-line' }, drawn);
  el('rect', { x: NOW_X - 34, y: 36, width: 68, height: 20, rx: 10, class: 'tl-head-tag' }, drawn);
  el('circle', { cx: NOW_X - 22, cy: 46, r: 3.5, class: 'tl-head-dot' }, drawn);
  el('text', { x: NOW_X + 6, y: 50, class: 'tl-head-text' }, drawn, 'HEAD');

  /* ---------- Buttons under the graph ---------- */
  entries.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e.branch;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => select(e.id, true));
    tabs.append(b);
    e.tab = b;
  });

  /* ---------- Picking an entry ---------- */
  function select(id, userAction) {
    // On phones the panel's height changes with the entry, so tell
    // ScrollTrigger to re-measure where everything below now sits.
    if (userAction && !isWide() && window.ScrollTrigger) setTimeout(() => ScrollTrigger.refresh(), 60);
    entries.forEach((e) => {
      const on = e.id === id;
      e.li.classList.toggle('on', on);
      e.g.classList.toggle('on', on);
      e.tab.setAttribute('aria-pressed', on);
      if (!on) return;
      drawn.insertBefore(e.g, nameLabel);  // bring the picked branch to the front
      const mid = Math.min(Math.max((e.x0 + Math.min(e.x1, RIGHT)) / 2, 110), W - 110);
      // A branch that is still open ends at the HEAD line, so its name sits
      // to the left of that line instead of being centered across it.
      nameLabel.setAttribute('text-anchor', e.open ? 'end' : 'middle');
      nameLabel.setAttribute('x', e.open ? NOW_X - 12 : mid);
      nameLabel.setAttribute('y', e.lane === MAIN_Y ? MAIN_Y + 30 : e.lane - 16);
      nameLabel.textContent = e.branch;
      // On a phone the graph scrolls sideways: bring the picked branch into view.
      if (userAction && graphBox.scrollWidth > graphBox.clientWidth) {
        const scale = graphBox.scrollWidth / W;
        graphBox.scrollTo({ left: mid * scale - graphBox.clientWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
  }

  // Entries have different lengths. Reserve room for the longest one so the
  // page below doesn't jump when you switch between them.
  const list = box.querySelector('.tl-entries');
  // (Only on wide screens. On a phone that would leave a big empty gap, so
  // there the page is re-measured after each switch instead; see select().)
  const isWide = () => window.innerWidth >= 820;
  function reserveHeight() {
    if (!isWide()) { box.classList.add('is-live'); list.style.minHeight = ''; return; }
    box.classList.remove('is-live');                   // show them all for a moment to measure
    const tallest = Math.max(...items.map((li) => li.offsetHeight));
    box.classList.add('is-live');
    list.style.minHeight = tallest + 'px';
  }
  reserveHeight();
  let lastWidth = box.clientWidth;
  const onResize = () => {
    if (box.clientWidth === lastWidth) return;         // only re-measure when the width changes
    lastWidth = box.clientWidth;
    reserveHeight();
  };
  new ResizeObserver(onResize).observe(box);
  window.addEventListener('resize', onResize);

  select('ces', false);                                // start on the current job
  graphBox.scrollLeft = graphBox.scrollWidth;          // on phones, start at the "now" end

  /* ---------- Draw the graph in as the section scrolls into view ---------- */
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  if (hasGsap && !reduceMotion) {
    gsap.registerPlugin(ScrollTrigger);
    clipRect.setAttribute('width', 0);
    ScrollTrigger.create({
      trigger: box,
      start: 'top 82%',
      end: 'top 28%',
      scrub: 0.5,
      onUpdate: (self) => clipRect.setAttribute('width', self.progress * W),
    });
  }
})();
