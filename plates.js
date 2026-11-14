// plates.js — the two spec plates in the "Off the clock" section.
//
// Two small behaviors:
//   1. Imperial / Metric toggle: swaps every value that has both units.
//   2. Draw-in: each line drawing traces itself when its plate scrolls into view.

(() => {
  const plates = [...document.querySelectorAll('.plate')];
  if (!plates.length) return;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Units ---------- */
  // Values that differ by unit carry both in the HTML:
  //   <dd data-imp="618 bhp" data-met="461 kW">618 bhp</dd>
  const unitButtons = [...document.querySelectorAll('[data-units]')];
  const dualValues = [...document.querySelectorAll('[data-imp][data-met]')];
  function setUnits(units) {
    dualValues.forEach((el) => { el.textContent = units === 'met' ? el.dataset.met : el.dataset.imp; });
    unitButtons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.units === units));
    try { localStorage.setItem('units', units); } catch (e) {}
  }
  unitButtons.forEach((b) => b.addEventListener('click', () => setUnits(b.dataset.units)));
  // Remember the visitor's choice between visits.
  let saved = null;
  try { saved = localStorage.getItem('units'); } catch (e) {}
  if (saved === 'met') setUnits('met');

  /* ---------- 2. Draw-in ---------- */
  // CSS hides the lines of a plate with class "will-draw" (each line is one
  // long dash, shifted out of view) and slides them in when "drawn" is added.
  // The class is only added here, so without JavaScript the drawings just show.
  if (reduceMotion) return;
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('drawn');
      seen.unobserve(entry.target);
    });
  }, { threshold: 0.35 });
  plates.forEach((plate) => { plate.classList.add('will-draw'); seen.observe(plate); });
})();
