// main.js — page behavior and animations.
//
// Libraries (all loaded from CDNs in index.html, no build step):
//   GSAP + ScrollTrigger  -> animations tied to time and scroll
//   Lenis                 -> smooth scrolling
// If any of them fail to load, the page still works without the effects.

(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const animate = hasGsap && !reduceMotion;

  /* ---------- Theme toggle ---------- */
  const isDark = () =>
    root.dataset.theme ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
  document.getElementById('themeBtn').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  /* ---------- Resume dropdown ---------- */
  const btn = document.getElementById('resumeBtn');
  const menu = document.getElementById('resumeMenu');
  const setOpen = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', open); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden); });
  document.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  /* ---------- Smooth scrolling (Lenis) ---------- */
  let lenis = null;
  if (animate && typeof window.Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    // Keep ScrollTrigger in sync with Lenis, and drive Lenis from GSAP's clock.
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  // Nav links (#work, #contact...) scroll smoothly too.
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: -72 });
      else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* ---------- Nav border + scroll progress bar ---------- */
  const nav = document.querySelector('.nav');
  const bar = document.querySelector('.progress');
  const onScroll = () => {
    nav.classList.toggle('scrolled', scrollY > 8);
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Highlight the nav link for the section in view ---------- */
  const links = [...document.querySelectorAll('.nav nav a')];
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((a) => { const s = document.querySelector(a.getAttribute('href')); if (s) spy.observe(s); });

  /* ---------- Helper: wrap each word of a heading in a mask ----------
     <h1>Hey there</h1>  ->  <h1><span class="w-mask"><span class="w">Hey</span></span> ...
     The mask hides overflow, so each word can slide up from below. */
  function splitWords(el) {
    [...el.childNodes].forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          const mask = document.createElement('span');
          mask.className = 'w-mask';
          const word = document.createElement('span');
          word.className = 'w';
          word.textContent = part;
          mask.append(word);
          frag.append(mask);
        });
        node.replaceWith(frag);
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BR') {
        splitWords(node); // keeps <span class="accent"> etc. around its words
      }
    });
  }

  /* ---------- Count-up numbers (e.g. ~950 req/s) ---------- */
  function countUp(el) {
    const to = Number(el.dataset.to), prefix = el.dataset.prefix || '';
    const t0 = performance.now(), dur = 1600;
    const step = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = prefix + Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Marquee: duplicate the words so the loop is seamless ---------- */
  const track = document.querySelector('.marquee-track');
  if (track) track.innerHTML += track.innerHTML;

  /* ---------- Animations ---------- */
  const revealItems = '.card, .paper, .seg, .load, .plate, .timeline li, .skill, .more li';

  if (animate) {
    gsap.registerPlugin(ScrollTrigger);

    // 1) Hero intro: headline words slide up out of their masks, one by one.
    const h1 = document.querySelector('.hero h1');
    splitWords(h1);
    gsap.timeline({ defaults: { ease: 'power4.out' } })
      .from('.eyebrow', { y: 20, opacity: 0, duration: 0.7 })
      .from(h1.querySelectorAll('.w'), {
        yPercent: 115, rotate: 6, duration: 1.1, stagger: 0.055,
      }, '-=0.4')
      .from('.lede', { y: 24, opacity: 0, duration: 0.9 }, '-=0.7')
      .from('.hero .cta > *', { y: 20, opacity: 0, stagger: 0.07, duration: 0.8, clearProps: 'transform' }, '-=0.7')
      .from('.sr', { y: 60, opacity: 0, rotate: 4, duration: 1.3, ease: 'expo.out' }, '-=1.2')
      // 2) Stats pop in like they were thrown onto the page.
      .from('.stats > div', {
        y: 80, scale: 0.7, opacity: 0,
        rotate: (i) => [-8, 6, -5][i] || 0,
        duration: 1, stagger: 0.12, ease: 'back.out(1.7)', clearProps: 'transform',
        onStart: () => document.querySelectorAll('.count').forEach(countUp),
      }, '-=1.0');

    // 3) Section headings: same word-by-word reveal when scrolled into view.
    document.querySelectorAll('.section h2, .contact h2').forEach((h) => {
      splitWords(h);
      gsap.from(h.querySelectorAll('.w'), {
        yPercent: 115, rotate: 4, duration: 1, stagger: 0.06, ease: 'power4.out',
        scrollTrigger: { trigger: h, start: 'top 88%' },
      });
    });
    gsap.utils.toArray('.kicker, .section-head p, .contact p').forEach((el) => {
      gsap.from(el, {
        y: 16, opacity: 0, duration: 0.7, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
      });
    });

    // 4) Cards and list items rise in, in small groups.
    gsap.set(revealItems, { opacity: 0, y: 50 });
    ScrollTrigger.batch(revealItems, {
      start: 'top 92%',
      onEnter: (batch) => gsap.to(batch, {
        opacity: 1, y: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out',
        clearProps: 'transform', // hands control back to the CSS tilt effect
      }),
    });

    // 5) Marquee: loops forever, speeds up and leans while you scroll.
    if (track) {
      const loop = gsap.to(track, { xPercent: -50, ease: 'none', duration: 28, repeat: -1 });
      const skew = gsap.quickTo('.marquee-track', 'skewX', { duration: 0.4, ease: 'power3' });
      ScrollTrigger.create({
        onUpdate: (self) => {
          const v = self.getVelocity();
          loop.timeScale(1 + Math.min(Math.abs(v) / 300, 6));
          skew(gsap.utils.clamp(-12, 12, v / -200));
        },
      });
      // Ease back to normal speed after scrolling stops.
      gsap.ticker.add(() => {
        const ts = loop.timeScale();
        if (ts > 1.01) loop.timeScale(ts + (1 - ts) * 0.06);
        else skew(0);
      });
    }

    // 6) The super-resolution viewer drifts up slightly as you scroll past (parallax).
    gsap.to('.sr', {
      yPercent: -10, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  } else {
    // Fallback without GSAP or with reduced motion: simple fade-ins.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(revealItems).forEach((el) => {
      if (!reduceMotion) { el.classList.add('reveal'); io.observe(el); }
    });
    if (!reduceMotion) document.querySelectorAll('.count').forEach(countUp);
  }

  /* ---------- Mouse-only effects ---------- */
  if (finePointer && !reduceMotion) {
    // Custom cursor: a crimson ring that trails the mouse and grows over
    // things you can interact with, showing a label like "view" or "drag".
    const cursor = document.querySelector('.cursor');
    const label = cursor.querySelector('.cursor-label');
    let moveX, moveY;
    if (hasGsap) {
      moveX = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3' });
      moveY = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3' });
    } else {
      moveX = (x) => { cursor.style.left = x + 'px'; };
      moveY = (y) => { cursor.style.top = y + 'px'; };
    }
    addEventListener('pointermove', (e) => {
      cursor.classList.add('on');
      moveX(e.clientX); moveY(e.clientY);
    });
    document.addEventListener('pointerleave', () => cursor.classList.remove('on'));
    const grow = (text) => { label.textContent = text; cursor.classList.add('big'); };
    const shrink = () => cursor.classList.remove('big');
    document.querySelectorAll('.card').forEach((el) => {
      const hasLink = el.querySelector('.links a');
      el.addEventListener('pointerenter', () => grow(hasLink ? 'view' : 'soon'));
      el.addEventListener('pointerleave', shrink);
    });
    // Globe: big "drag" cursor. Compare viewer: keep the ring small so it
    // doesn't cover the picture you're comparing.
    const art = document.querySelector('.hero-art');
    if (art) {
      art.addEventListener('pointerenter', () => grow('drag'));
      art.addEventListener('pointerleave', shrink);
    }

    // Project cards: 3D tilt + glow that follows the mouse.
    document.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--ry', `${(x - 0.5) * 10}deg`);
        card.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
        card.style.setProperty('--mx', `${x * 100}%`);
        card.style.setProperty('--my', `${y * 100}%`);
      });
      card.addEventListener('pointerleave', () => {
        ['--rx', '--ry', '--mx', '--my'].forEach((p) => card.style.removeProperty(p));
      });
    });

    // Magnetic buttons: lean toward the cursor.
    if (hasGsap) {
      document.querySelectorAll('.btn').forEach((b) => {
        b.addEventListener('pointermove', (e) => {
          const r = b.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          gsap.to(b, { x: dx * 0.2, y: dy * 0.3, duration: 0.3, ease: 'power3.out' });
        });
        b.addEventListener('pointerleave', () => {
          gsap.to(b, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
        });
      });
    }
  }

  document.getElementById('year').textContent = new Date().getFullYear();
})();
