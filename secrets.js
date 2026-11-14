// secrets.js — hidden extras.
//
//   Type "f22" anywhere on the page  -> an F-22 flies across the screen.
//   Type "v12" anywhere on the page  -> a row of shift lights revs to the redline.
//
// The footer has a small hint, and the two words there are buttons, so the
// extras also work on phones (no keyboard needed). People who open the browser
// console get a short note pointing at them too.
//
// Both effects use the browser's built-in Web Animations API and
// requestAnimationFrame, so this file needs no library.

(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const busy = { f22: false, v12: false };

  /* ---------- A small message that pops up at the bottom ---------- */
  const toastEl = document.getElementById('toast');
  let toastTimer = 0;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4200);
  }

  /* ---------- f22: the fly-by ---------- */
  // Same top-view drawing as the super-resolution viewer (nose pointing up).
  const JET_SVG =
    '<svg viewBox="70 20 260 350">' +
    '<path class="fb-body" d="M200 30 L208 60 L216 96 L231 126 L235 150 L322 248 L322 266 L250 288 L246 293 L292 336 L292 348 L246 360 L239 340 L227 350 L214 338 L206 345 L200 340 L194 345 L186 338 L173 350 L161 340 L154 360 L108 348 L108 336 L154 293 L150 288 L78 266 L78 248 L165 150 L169 126 L184 96 L192 60 Z"/>' +
    '<path class="fb-tail" d="M224 258 L247 300 L241 328 L221 292 Z M176 258 L153 300 L159 328 L179 292 Z"/>' +
    '<path class="fb-hot" d="M200 68 Q210 88 206 114 L200 122 L194 114 Q190 88 200 68 Z M214 338 L227 350 L239 340 L234 326 L217 326 Z M186 338 L173 350 L161 340 L166 326 L183 326 Z"/>' +
    '</svg>';

  function flyby() {
    if (busy.f22) return;
    busy.f22 = true;
    toast('F-22 fly-by. It cruises above Mach 1.5 without afterburners.');
    if (reduceMotion) { busy.f22 = false; return; }

    const jet = document.createElement('div');
    jet.className = 'flyby';
    jet.setAttribute('aria-hidden', 'true');
    jet.innerHTML = '<span class="flyby-trail a"></span><span class="flyby-trail b"></span>' + JET_SVG;
    document.body.append(jet);

    // Fly from off-screen bottom-left to off-screen top-right.
    const w = window.innerWidth, h = window.innerHeight;
    const x0 = -480, y0 = h * 0.86, x1 = w + 220, y1 = h * 0.1;
    const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    const flight = jet.animate([
      { transform: `translate(${x0}px, ${y0}px) rotate(${angle}deg)` },
      { transform: `translate(${x1}px, ${y1}px) rotate(${angle}deg)` },
    ], { duration: 1400, easing: 'cubic-bezier(.35, 0, .65, 1)' });
    flight.onfinish = () => { jet.remove(); busy.f22 = false; };

    // A short shake as it passes overhead, like the boom catching up.
    const page = document.querySelector('main');
    setTimeout(() => {
      page.animate([
        { transform: 'translate(0, 0)' }, { transform: 'translate(-5px, 3px)' },
        { transform: 'translate(4px, -3px)' }, { transform: 'translate(-2px, 1px)' },
        { transform: 'translate(0, 0)' },
      ], { duration: 340 });
    }, 760);
  }

  /* ---------- v12: shift lights ---------- */
  function redline() {
    if (busy.v12) return;
    busy.v12 = true;
    toast('McLaren F1. 6.1 litre V12, redline at 7,500 rpm.');
    if (reduceMotion) { busy.v12 = false; return; }

    const box = document.createElement('div');
    box.className = 'shift';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<div class="shift-leds">' + '<i></i>'.repeat(10) + '</div>' +
                    '<div class="shift-rpm mono"><b>900</b> rpm</div>';
    document.body.append(box);
    const leds = [...box.querySelectorAll('i')];
    const number = box.querySelector('b');

    const IDLE = 900, REDLINE = 7500;
    const revTime = 2400, holdTime = 900;
    const t0 = performance.now();
    const step = (now) => {
      const t = now - t0;
      if (t < revTime) {
        // Revs build slowly, then faster (an ease-in curve).
        const p = Math.pow(t / revTime, 1.7);
        const rpm = IDLE + (REDLINE - IDLE) * p;
        number.textContent = (Math.round(rpm / 10) * 10).toLocaleString('en-US');
        const lit = Math.floor(p * leds.length + 0.001);
        leds.forEach((led, i) => led.classList.toggle('on', i < lit));
        requestAnimationFrame(step);
      } else if (t < revTime + holdTime) {
        // At the redline every light flashes: time to shift.
        number.textContent = REDLINE.toLocaleString('en-US');
        box.classList.add('max');
        const on = Math.floor((t - revTime) / 110) % 2 === 0;
        leds.forEach((led) => led.classList.toggle('on', on));
        requestAnimationFrame(step);
      } else {
        box.classList.add('out');
        setTimeout(() => { box.remove(); busy.v12 = false; }, 400);
      }
    };
    requestAnimationFrame(step);
  }

  const secrets = { f22: flyby, v12: redline };

  /* ---------- Triggers ---------- */
  // 1) Typing: remember the last three keys and look for a code.
  let typed = '';
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    typed = (typed + e.key.toLowerCase()).slice(-3);
    if (secrets[typed]) { secrets[typed](); typed = ''; }
  });
  // 2) The buttons in the footer hint.
  document.querySelectorAll('[data-secret]').forEach((b) => {
    b.addEventListener('click', () => secrets[b.dataset.secret]());
  });

  /* ---------- A note for people who open the console ---------- */
  console.log(
    '%cLooking under the hood?%c\nPlain HTML, CSS and JavaScript, no build step. ' +
    'Source: https://github.com/Ompatel179/Ompatel179.github.io\n' +
    'Two hidden extras: type f22 or v12 on the page.',
    'font: 800 16px sans-serif; color: #F0223F;', 'font: 13px monospace;');
})();
