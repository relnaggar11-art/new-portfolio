/* ==========================================================
   Passport Portfolio, script.js
   - Builds the book from the pages inside #pages
   - Desktop: 2-page spread. Mobile (<768px): one page at a time
   - Flip by click, arrows, keyboard, tabs or mouse/touch drag
   - Paper sounds generated with the Web Audio API (no audio files)
   ========================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const book = $('#book');
  const scene = $('#scene');
  const srcBox = $('#pages');
  const pages = [...srcBox.children];          // 9 pages: cover, contents, ... closing
  const NAMES = ['Cover', 'Contents', 'Identity', 'Education', 'Skills', 'Experience', 'Projects', 'Contact', 'Closing'];

  const mqMobile = matchMedia('(max-width: 767px)');
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');

  const DUR = 900;        // must match --flip in CSS
  const STAGGER = 150;    // delay between leaves on multi-page jumps
  const DRAG_GAIN = 1.7;  // how fast the page follows the pointer
  const THRESH = 0.3;     // drag distance (fraction of a full flip) needed to complete
  const EDGE = 0.16;      // clickable edge zone (fraction of page width)

  let mode = 'spread';    // 'spread' | 'single'
  let leaves = [];
  let L = 0;              // number of flippable leaves
  let n = 0;              // number of leaves currently flipped
  let drag = null;
  let swallowClick = false;   // ignore the click that follows a drag

  /* ---------------- Build ---------------- */
  const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
  const curl = () => { const c = div('curl'); c.setAttribute('aria-hidden', 'true'); return c; };

  function face(cls, page, side) {
    const f = div('face ' + cls);
    if (page) {
      page.classList.add(side);
      if (!page.classList.contains('cover')) page.append(curl());
      f.append(page);
    } else {
      f.classList.add('blank');
    }
    return f;
  }
  function leaf(front, back) {
    const l = div('leaf');
    l.append(front, back);
    return l;
  }

  function build(startN) {
    leaves.forEach(l => { clearTimeout(l._s); clearTimeout(l._t); });
    pages.forEach(p => {
      p.classList.remove('left', 'right');
      p.querySelector(':scope > .curl')?.remove();
      srcBox.append(p);
    });
    book.querySelectorAll('.leaf, .static-end').forEach(e => e.remove());

    mode = mqMobile.matches ? 'single' : 'spread';
    book.dataset.mode = mode;
    leaves = [];

    if (mode === 'spread') {
      for (let i = 0; i < 4; i++) leaves.push(leaf(face('front', pages[2 * i], 'right'), face('back', pages[2 * i + 1], 'left')));
    } else {
      for (let i = 0; i < 8; i++) leaves.push(leaf(face('front', pages[i], 'right'), face('back', null)));
    }
    const end = div('static-end');
    pages[8].classList.add('right');
    end.append(pages[8]);
    book.append(...leaves, end);

    L = leaves.length;
    n = clamp(startN || 0, 0, L);
    leaves.forEach((l, i) => {
      l.classList.toggle('flipped', i < n);
      l.style.zIndex = i < n ? i + 1 : L - i;
    });

    book.classList.add('no-anim');
    requestAnimationFrame(() => requestAnimationFrame(() => book.classList.remove('no-anim')));
    update();
  }

  /* ---------------- State / UI ---------------- */
  function visiblePages() {
    if (mode === 'single') return [n];
    return n === 0 ? [0] : [2 * n - 1, 2 * n];
  }

  function update() {
    scene.dataset.state = n === 0 ? 'closed' : (n === L ? 'end' : 'open');
    const vis = visiblePages();
    pages.forEach((p, i) => {
      const on = vis.includes(i);
      p.inert = !on;
      p.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    $('#status').textContent = vis.map(i => NAMES[i]).join(' · ');
    $('#prev').disabled = n === 0;
    $('#next').disabled = n === L;
    document.querySelectorAll('.tabs button').forEach(b => {
      b.classList.toggle('active', vis.includes(+b.dataset.goto));
      b.toggleAttribute('aria-current', vis.includes(+b.dataset.goto));
    });
  }

  const restZ = (i) => leaves[i].classList.contains('flipped') ? i + 1 : L - i;

  function startFlip(i, flipped) {
    const l = leaves[i];
    clearTimeout(l._s); clearTimeout(l._t);
    l.style.zIndex = 100 + (flipped ? i : L - i);
    l.classList.add('moving');
    l.classList.toggle('flipped', flipped);
    l._t = setTimeout(() => {
      l.classList.remove('moving');
      l.style.zIndex = restZ(i);
    }, DUR + 60);
  }

  function goTo(target) {
    target = clamp(target, 0, L);
    if (target === n) return;
    const from = n;
    n = target;
    const dir = target > from ? 1 : -1;

    const todo = [];
    for (let i = 0; i < L; i++) {
      const want = i < n;
      if (leaves[i].classList.contains('flipped') !== want || leaves[i]._s) todo.push([i, want]);
    }
    if (dir < 0) todo.reverse();

    todo.forEach(([i, want], k) => {
      const l = leaves[i];
      clearTimeout(l._s);
      const go = () => {
        l._s = null;
        startFlip(i, want);
        const opening = (from === 0 && i === 0 && want) || (n === 0 && i === 0 && !want);
        setTimeout(() => (opening ? Sound.thump() : Sound.swish()), 90);
      };
      if (k === 0) go(); else l._s = setTimeout(go, k * STAGGER);
    });
    update();
  }

  const goToPage = (p) => goTo(mode === 'spread' ? Math.ceil(p / 2) : p);

  /* ---------------- Drag / click ---------------- */
  function geo() {
    const r = book.getBoundingClientRect();
    return mode === 'spread'
      ? { spine: r.left + r.width / 2, W: r.width / 2, r }
      : { spine: r.left, W: r.width, r };
  }

  book.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, started: false, idx: -1, dir: 0, theta: 0 };
  });

  book.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    const g = geo();

    if (!drag.started) {
      if (Math.hypot(dx, dy) < 8 || mqReduce.matches) return;
      let dir;
      if (mode === 'spread') dir = drag.x0 >= g.spine ? 1 : -1;
      else { if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; } dir = dx < 0 ? 1 : -1; }
      const idx = dir > 0 ? n : n - 1;
      if (idx < 0 || idx >= L) { drag = null; return; }
      drag.dir = dir; drag.idx = idx; drag.started = true;
      try { book.setPointerCapture(e.pointerId); } catch (_) {}
      book.classList.add('dragging');
      const l = leaves[idx];
      clearTimeout(l._s); clearTimeout(l._t);
      l.style.zIndex = 200;
      l.style.transition = 'none';
      l.classList.add('moving');
    }

    // The free edge of the page follows the pointer: edgeX = spine + W*cos(theta)
    const edge0 = drag.dir > 0 ? g.spine + g.W : g.spine - g.W;
    const ex = edge0 + (e.clientX - drag.x0) * DRAG_GAIN;
    const c = clamp((ex - g.spine) / g.W, -1, 1);
    drag.theta = Math.acos(c) * 180 / Math.PI;
    leaves[drag.idx].style.transform = `rotateY(${-drag.theta}deg)`;
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (d.started) { swallowClick = true; setTimeout(() => { swallowClick = false; }, 60); }
    book.classList.remove('dragging');

    if (!d.started) { if (!cancelled) handleClick(e); return; }

    const l = leaves[d.idx];
    l.style.transition = '';
    l.style.transform = '';
    const progress = d.dir > 0 ? d.theta / 180 : (180 - d.theta) / 180;
    if (!cancelled && progress > THRESH) {
      goTo(d.dir > 0 ? n + 1 : n - 1);
    } else {
      // snap back to the resting side
      l._t = setTimeout(() => { l.classList.remove('moving'); l.style.zIndex = restZ(d.idx); }, DUR + 60);
    }
  }
  book.addEventListener('pointerup', (e) => endDrag(e, false));
  book.addEventListener('pointercancel', (e) => endDrag(e, true));
  book.addEventListener('dragstart', (e) => e.preventDefault());

  function handleClick(e) {
    const g = geo();
    if (n === 0) { if (e.clientX >= g.spine) goTo(1); return; }
    if (e.clientX > g.spine + g.W * (1 - EDGE)) goTo(n + 1);
    else if (e.clientX < g.spine + (mode === 'spread' ? -g.W * (1 - EDGE) : g.W * EDGE)) goTo(n - 1);
  }

  /* ---------------- Buttons / keyboard ---------------- */
  $('#prev').addEventListener('click', () => goTo(n - 1));
  $('#next').addEventListener('click', () => goTo(n + 1));
  document.addEventListener('click', (e) => {
    if (swallowClick) { e.preventDefault(); e.stopPropagation(); return; }
    const g = e.target.closest('[data-goto]');
    if (g) { goToPage(+g.dataset.goto); return; }
    const a = e.target.closest('a[href="#"]');
    if (a) e.preventDefault();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') goTo(n + 1);
    else if (e.key === 'ArrowLeft') goTo(n - 1);
    else if (e.key === 'Escape') goTo(0);
  });

  /* ---------------- Responsive switch ---------------- */
  mqMobile.addEventListener('change', () => {
    const right = mode === 'spread' ? (n ? 2 * n : 0) : n;
    const next = mqMobile.matches ? 'single' : 'spread';
    build(next === 'spread' ? Math.ceil(right / 2) : right);
  });

  /* ---------------- Sound (Web Audio, no files) ---------------- */
  const Sound = (() => {
    let ctx = null, noise = null, unlocked = false, muted = false;
    try { muted = localStorage.getItem('portfolio-muted') === '1'; } catch (_) {}

    function init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const len = ctx.sampleRate * 0.6;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const unlock = () => { unlocked = true; init(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, unlock, { passive: true }));

    const ready = () => unlocked && !muted && ctx && ctx.state !== 'closed';

    function swish() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = 0.9 + Math.random() * 0.25;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(1500, t);
      bp.frequency.exponentialRampToValueAtTime(3000, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      src.connect(bp).connect(g).connect(ctx.destination);
      src.start(t); src.stop(t + 0.45);
    }

    function thump() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.55, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      src.connect(lp).connect(g).connect(ctx.destination);
      src.start(t); src.stop(t + 0.35);

      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.22);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(og).connect(ctx.destination);
      o.start(t); o.stop(t + 0.32);
      swish();
    }

    function toggle() {
      muted = !muted;
      try { localStorage.setItem('portfolio-muted', muted ? '1' : '0'); } catch (_) {}
      syncBtn();
    }
    function syncBtn() {
      const b = $('#sound');
      b.setAttribute('aria-pressed', muted ? 'true' : 'false');
      b.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    }
    $('#sound').addEventListener('click', toggle);
    syncBtn();
    return { swish, thump };
  })();

  /* ---------------- Go ---------------- */
  build(0);
})();
