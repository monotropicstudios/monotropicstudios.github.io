(function () {
  const canvas = document.getElementById("field");
  if (!canvas) return;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  const bucketCount = 10;
  const buckets = Array.from({ length: bucketCount }, function () {
    return [];
  });

  const state = {
    w: 0,
    h: 0,
    dpr: 1,
    px: 0,
    py: 0,
    spx: 0,
    spy: 0,
    pvx: 0,
    pvy: 0,
    hasPointer: false,
    isTouch: false,
    offsetY: 0,
    raf: 0,
    started: performance.now(),
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bitmapW = Math.round(w * dpr);
    const bitmapH = Math.round(h * dpr);
    if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
      canvas.width = bitmapW;
      canvas.height = bitmapH;
    }
    state.w = w;
    state.h = h;
    state.dpr = dpr;
    draw(performance.now());
  }

  function elementRect(node) {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return rect;
  }

  function headingVisible() {
    const heading = document.querySelector("h1");
    if (!heading) return false;
    const style = window.getComputedStyle(heading);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return parseFloat(style.opacity) > 0.05;
  }

  function masks() {
    const list = [];
    if (headingVisible()) {
      const word = elementRect(document.querySelector(".word"));
      const line = elementRect(document.querySelector(".line"));
      const identity = unionRect(word, line);
      if (identity) list.push(identity);
    }
    const panel = document.getElementById("panel");
    if (panel && panel.classList.contains("is-open")) {
      const rect = elementRect(panel);
      if (rect) list.push(rect);
    }
    const status = document.getElementById("status");
    if (status && !status.hidden) {
      const rect = elementRect(status);
      if (rect) list.push(rect);
    }
    return list;
  }

  function unionRect(a, b) {
    if (!a) return b;
    if (!b) return a;
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    const right = Math.max(a.right, b.right);
    const bottom = Math.max(a.bottom, b.bottom);
    return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
  }

  function keepAlpha(x, y, regions) {
    const feather = 34;
    let keep = 1;
    for (let i = 0; i < regions.length; i++) {
      const rect = regions[i];
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const outside = Math.hypot(dx, dy);
      if (outside === 0) return 0;
      if (outside < feather) keep *= outside / feather;
    }
    return keep;
  }

  function collimation(now) {
    if (document.body.dataset.view === "inquiry") return 1;
    const t = clamp((now - state.started) / 7800, 0, 1);
    const eased = t * t * (3 - 2 * t);
    return 0.36 + 0.64 * eased;
  }

  function pairCount(width) {
    if (width < 520) return 16;
    if (width < 960) return 22;
    return 30;
  }

  // Magnetic dipole bend around the desktop pointer, plus a faint velocity wake.
  // Returns { dy, glow } where dy is vertical deflection in px and glow is a 0..1 brightness lift.
  function magnetic(x, y) {
    if (!state.hasPointer || state.isTouch || document.body.dataset.view === "inquiry") {
      return { dy: 0, glow: 0 };
    }
    const dx = x - state.spx;
    const dy = y - state.spy;
    const distance = Math.hypot(dx, dy);
    const radius = 260;
    if (distance > radius || distance < 0.001) return { dy: 0, glow: 0 };

    const t = 1 - distance / radius;
    const falloff = t * t * (3 - 2 * t); // smoothstep
    const side = dy >= 0 ? 1 : -1;
    const peak = 30;
    const bend = side * peak * falloff * falloff;

    const speed = Math.min(Math.hypot(state.pvx, state.pvy), 36);
    const wake = ((dx * state.pvy - dy * state.pvx) / distance) * falloff * falloff * speed * 0.055;

    const glow = falloff * (0.7 + 0.3 * Math.min(speed / 24, 1));
    return { dy: bend + wake, glow: glow };
  }

  function draw(now) {
    const width = state.w;
    const height = state.h;
    if (width < 2 || height < 2) return;

    const dpr = state.dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    context.lineWidth = 1 / dpr;
    context.lineCap = "butt";

    const word = elementRect(document.querySelector(".word"));
    const aimY = word ? word.top + word.height / 2 : height / 2;
    const centerX = word ? word.left + word.width / 2 : width / 2;
    const calm = document.body.dataset.view === "inquiry" || !state.hasPointer || state.isTouch;
    const desiredOffset = calm ? 0 : clamp((state.spy - height / 2) * 0.14, -42, 42);
    state.offsetY += (desiredOffset - state.offsetY) * 0.07;
    const breathe = Math.sin(now * 0.00028) * 2.4;
    const focusY = aimY + state.offsetY + breathe;
    const col = collimation(now);
    const regions = masks();
    const pairs = pairCount(width);
    const step = width < 700 ? 13 : 11;

    // Continuous hypnotic flow: strong traveling silk waves + inward luminosity pulse.
    // Never frozen by prefers-reduced-motion; Tim wants the living field on his devices.
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.00055);

    for (let b = 0; b < bucketCount; b++) buckets[b].length = 0;

    for (let i = 0; i < pairs; i++) {
      const t = (i + 0.5) / pairs;
      const centered = (t - 0.5) * 2;
      const shaped = Math.sign(centered) * Math.pow(Math.abs(centered), 0.82);
      const yStart = (0.5 + shaped * 0.48) * height;
      const phase = i * 0.37;

      for (let side = 0; side < 2; side++) {
        const direction = side === 0 ? 1 : -1;
        let x = direction > 0 ? -8 : width + 8;
        let y = yStart;
        const targetY = focusY + (yStart - focusY) * 0.055;
        const steps = Math.ceil((width + 40) / step);
        for (let s = 0; s < steps; s++) {
          const previousX = x;
          const previousY = y;
          const proximity = 1 - clamp(Math.abs(x - centerX) / (width * 0.5), 0, 1);
          const gather = proximity * proximity;
          const rate = 0.0015 + col * (0.006 + 0.1 * gather);

          // Intro wave fades with collimation; continuous silk waves keep running forever.
          // Layered harmonics: ~6-12px of graceful living undulation along each line.
          const introWave = Math.sin(x * 0.009 + phase) * (1 - col) * 0.7;
          const silk =
            Math.sin(x * 0.011 - direction * now * 0.00042 + phase) * 7.2 +
            Math.sin(x * 0.0047 + direction * now * 0.00019 + phase * 1.7) * 3.8 +
            Math.sin(x * 0.021 - direction * now * 0.00031 + phase * 0.6) * 1.6;
          const mag = magnetic(x, y);
          y += (targetY - y) * rate + introWave + silk + mag.dy;
          x += direction * step;
          if (!Number.isFinite(y)) break;
          if ((direction > 0 && x > centerX) || (direction < 0 && x < centerX)) break;

          const keep = Math.min(keepAlpha(previousX, previousY, regions), keepAlpha(x, y, regions));
          const dist = Math.abs(previousY - focusY) / (height * 0.5);
          const along = 0.82 + 0.18 * (s / steps);

          // Inward luminosity pulse: silver-gray light traveling from edges toward center.
          // Alpha smoothly breathes between ~0.12 and ~0.46.
          const inward = Math.sin(proximity * Math.PI * 0.92 - now * 0.00048 + phase * 0.2);
          const pulseLift = 0.55 + 0.45 * ((inward + 1) * 0.5) * (0.65 + 0.35 * pulse);
          const base = 0.16 + 0.26 * Math.pow(Math.max(0, 1 - dist), 1.15);
          const alpha = base * along * keep * pulseLift + mag.glow * 0.12 * keep;
          const capped = Math.min(alpha, 0.46);
          if (capped > 0.03) {
            const index = Math.min(bucketCount - 1, Math.floor((capped / 0.46) * bucketCount));
            buckets[index].push(previousX, previousY, x, y);
          }
        }
      }
    }

    for (let b = 0; b < bucketCount; b++) {
      const bucket = buckets[b];
      if (!bucket.length) continue;
      const alpha = ((b + 0.5) / bucketCount) * 0.46;
      context.strokeStyle = "rgba(214, 217, 223, " + alpha.toFixed(3) + ")";
      context.beginPath();
      for (let p = 0; p < bucket.length; p += 4) {
        context.moveTo(bucket[p], bucket[p + 1]);
        context.lineTo(bucket[p + 2], bucket[p + 3]);
      }
      context.stroke();
    }

    // Smooth the pointer toward the live coords so the field feels heavy and fluid.
    if (state.hasPointer && !state.isTouch) {
      state.spx += (state.px - state.spx) * 0.16;
      state.spy += (state.py - state.spy) * 0.16;
    }
    state.pvx *= 0.86;
    state.pvy *= 0.86;
  }

  function frame(now) {
    draw(now);
    if (!document.hidden) state.raf = window.requestAnimationFrame(frame);
  }

  function start() {
    window.cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (document.hidden) {
      draw(performance.now());
      return;
    }
    state.raf = window.requestAnimationFrame(frame);
  }

  function onPointer(event) {
    if (typeof event.clientX !== "number") return;
    const isTouch = event.pointerType === "touch";
    state.isTouch = isTouch;
    if (state.hasPointer) {
      state.pvx = event.clientX - state.px;
      state.pvy = event.clientY - state.py;
    } else {
      state.spx = event.clientX;
      state.spy = event.clientY;
    }
    state.px = event.clientX;
    state.py = event.clientY;
    // Magnetic disruption is desktop-only; ignore touch for hasPointer magnetism.
    state.hasPointer = !isTouch;
  }

  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerdown", onPointer, { passive: true });
  window.addEventListener("pointerleave", function () {
    state.hasPointer = false;
  });
  window.addEventListener("pointerup", function (event) {
    if (event.pointerType === "touch") state.hasPointer = false;
  });
  window.addEventListener("pointercancel", function () {
    state.hasPointer = false;
  });

  document.addEventListener("visibilitychange", start);
  window.addEventListener("resize", resize);

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
  }

  window.monotropicRedraw = function () {
    resize();
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      resize();
    });
  }

  resize();
  start();
})();
