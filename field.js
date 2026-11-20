(function () {
  const canvas = document.getElementById("field");
  if (!canvas) return;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  // More buckets so the inward luminosity pulse transitions never band or step.
  const bucketCount = 16;
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
    pointerStrength: 0,
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
    const feather = 48;
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

  // Smooth Gaussian dipole bend around the desktop pointer, plus a soft, damped
  // velocity wake and a gentle local brightness lift. This is a PURE offset keyed
  // on the undisturbed baseY, never fed back into baseY. Dividing by
  // (distance + 38) removes the discontinuity at dy = 0, so there is no sign-flip
  // glitch when the cursor crosses directly over a line. state.pointerStrength
  // fades the whole effect in and out, so entering or leaving never snaps.
  // Returns { dy, glow } where dy is vertical deflection in px and glow is a brightness lift.
  function textHalo(x, y, regions) {
    // Softly calm magnetic displacement around the centered text mask so the
    // tightly converged lines never pop out of the mask edges or tangle when
    // the cursor moves over the text.
    const pad = 96;
    let factor = 1;
    for (let i = 0; i < regions.length; i++) {
      const rect = regions[i];
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const outside = Math.hypot(dx, dy);
      if (outside === 0) return 0;
      if (outside < pad) {
        const u = outside / pad;
        // Smoothstep 0..1
        factor *= u * u * (3 - 2 * u);
      }
    }
    return factor;
  }

  function magnetic(x, baseY, proximity, regions) {
    const strength = state.pointerStrength;
    if (strength < 0.001) return { dy: 0, glow: 0 };
    // Attenuate smoothly near the convergence center and around the text mask.
    const centerCalm = 1 - Math.pow(proximity, 3);
    const maskCalm = textHalo(x, baseY, regions);
    const pointerCalm = textHalo(state.spx, state.spy, regions);
    const calm = centerCalm * maskCalm * (0.18 + 0.82 * pointerCalm);
    if (calm < 0.001) return { dy: 0, glow: 0 };

    const dx = x - state.spx;
    const dy = baseY - state.spy;
    const r2 = dx * dx + dy * dy;
    const sigma = 155;
    const g = Math.exp(-r2 / (2 * sigma * sigma));
    if (g < 0.0004) return { dy: 0, glow: 0 };
    const distance = Math.hypot(dx, dy);
    const denom = distance + 46;
    // Pure smoothed-position Gaussian parting: zero raw-velocity jitter.
    const bend = (dy / denom) * 24 * g * strength * calm;
    const glow = 0.10 * g * strength * calm;
    return { dy: bend, glow: glow };
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
    const centerX = width / 2;
    const calm = document.body.dataset.view === "inquiry" || !state.hasPointer || state.isTouch;
    const desiredOffset = calm ? 0 : clamp((state.spy - height / 2) * 0.14, -42, 42);
    state.offsetY += (desiredOffset - state.offsetY) * 0.07;
    const breathe = Math.sin(now * 0.00028) * 2.4;
    const focusY = aimY + state.offsetY + breathe;
    const col = collimation(now);
    const regions = masks();
    const pairs = pairCount(width);
    // Small step so every curve is silky smooth with no visible polyline corners.
    const step = width < 700 ? 8 : 6;

    // Continuous hypnotic flow: long traveling silk waves + inward luminosity pulse.
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
        const startDist = width * 0.5 + 8;
        let x = direction > 0 ? centerX - startDist : centerX + startDist;
        // baseY tracks ONLY the smooth convergence toward targetY. Wave and magnet
        // are added afterward as pure offsets and are NEVER fed back into baseY,
        // so nothing can compound into kinks or spikes across the step loop.
        let baseY = yStart;
        const targetY = focusY + (yStart - focusY) * 0.055;
        const steps = Math.ceil((width + 40) / step);
        let prevX = null;
        let prevDrawY = 0;
        for (let s = 0; s < steps; s++) {
          // Exact mirrored distance from centerX so left and right halves are a
          // bit-for-bit horizontal mirror at every point and every frame.
          const distFromCenter = Math.abs(x - centerX);
          const proximity = 1 - clamp(distFromCenter / (width * 0.5), 0, 1);
          const gather = proximity * proximity;
          const rate = 0.0015 + col * (0.006 + 0.1 * gather);
          baseY += (targetY - baseY) * rate;

          // Intro wave fades out with collimation; mirrored by distFromCenter.
          const introWave = Math.sin(distFromCenter * 0.009 + phase) * (1 - col) * 0.7;
          // Silk wave: long-wavelength traveling waves flowing inward from both
          // edges toward centerX in exact mirror symmetry (+ now moves crests toward smaller distFromCenter).
          const waveOffset =
            (Math.sin(distFromCenter * 0.0075 + now * 0.00055 + phase) * 9.5 +
              Math.sin(distFromCenter * 0.0038 + now * 0.00028 + phase * 1.4) * 5.0) *
              (0.25 + 0.75 * (1 - proximity * 0.75)) +
            introWave;

          const mag = magnetic(x, baseY, proximity, regions);
          const drawY = baseY + waveOffset + mag.dy;
          if (!Number.isFinite(drawY)) break;

          if (prevX !== null) {
            const keep = Math.min(keepAlpha(prevX, prevDrawY, regions), keepAlpha(x, drawY, regions));
            const dist = Math.abs(prevDrawY - focusY) / (height * 0.5);
            const along = 0.82 + 0.18 * (s / steps);

            // Inward luminosity pulse: silver-gray light traveling from edges toward
            // center, breathing smoothly between roughly 0.12 and 0.44.
            const inward = Math.sin(proximity * Math.PI * 0.92 - now * 0.00048 + phase * 0.2);
            const pulseLift = 0.55 + 0.45 * ((inward + 1) * 0.5) * (0.65 + 0.35 * pulse);
            const base = 0.16 + 0.26 * Math.pow(Math.max(0, 1 - dist), 1.15);
            const alpha = base * along * keep * pulseLift + mag.glow * keep;
            const capped = Math.min(alpha, 0.44);
            if (capped > 0.03) {
              const index = Math.min(bucketCount - 1, Math.floor((capped / 0.44) * bucketCount));
              buckets[index].push(prevX, prevDrawY, x, drawY);
            }
          }

          prevX = x;
          prevDrawY = drawY;
          x += direction * step;
          if ((direction > 0 && x > centerX) || (direction < 0 && x < centerX)) break;
        }
      }
    }

    for (let b = 0; b < bucketCount; b++) {
      const bucket = buckets[b];
      if (!bucket.length) continue;
      const alpha = ((b + 0.5) / bucketCount) * 0.44;
      context.strokeStyle = "rgba(214, 217, 223, " + alpha.toFixed(3) + ")";
      context.beginPath();
      for (let p = 0; p < bucket.length; p += 4) {
        context.moveTo(bucket[p], bucket[p + 1]);
        context.lineTo(bucket[p + 2], bucket[p + 3]);
      }
      context.stroke();
    }

    // Smoothly fade the magnetic effect in and out and glide the pointer toward the
    // live coords so entering, leaving, and moving never snap.
    const wantStrength =
      state.hasPointer && !state.isTouch && document.body.dataset.view !== "inquiry" ? 1 : 0;
    state.pointerStrength += (wantStrength - state.pointerStrength) * 0.08;
    if (state.hasPointer && !state.isTouch) {
      state.spx += (state.px - state.spx) * 0.11;
      state.spy += (state.py - state.spy) * 0.11;
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
