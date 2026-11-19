(function () {
  const canvas = document.getElementById("field");
  if (!canvas) return;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
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
    pvx: 0,
    pvy: 0,
    hasPointer: false,
    offsetY: 0,
    raf: 0,
    reduced: reducedQuery.matches,
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
    if (state.reduced || document.body.dataset.view === "inquiry") return 1;
    const t = clamp((now - state.started) / 7800, 0, 1);
    const eased = t * t * (3 - 2 * t);
    return 0.36 + 0.64 * eased;
  }

  function pairCount(width) {
    if (width < 520) return 16;
    if (width < 960) return 22;
    return 30;
  }

  function displace(x, y) {
    if (!state.hasPointer || state.reduced || document.body.dataset.view === "inquiry") return 0;
    const dx = x - state.px;
    const dy = y - state.py;
    const distance = Math.hypot(dx, dy);
    if (distance > 200 || distance < 0.001) return 0;
    const falloff = 1 - distance / 200;
    const speed = Math.min(Math.hypot(state.pvx, state.pvy), 32);
    const side = (dx * state.pvy - dy * state.pvx) / distance;
    return side * falloff * falloff * speed * 0.05;
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
    const calm = document.body.dataset.view === "inquiry" || state.reduced || !state.hasPointer;
    const desiredOffset = calm ? 0 : clamp((state.py - height / 2) * 0.14, -42, 42);
    state.offsetY += (desiredOffset - state.offsetY) * (state.reduced ? 1 : 0.07);
    const breathe = state.reduced ? 0 : Math.sin(now * 0.00028) * 2.4;
    const focusY = aimY + state.offsetY + breathe;
    const col = collimation(now);
    const regions = masks();
    const pairs = pairCount(width);
    const step = width < 700 ? 13 : 11;

    for (let b = 0; b < bucketCount; b++) buckets[b].length = 0;

    for (let i = 0; i < pairs; i++) {
      const t = (i + 0.5) / pairs;
      const centered = (t - 0.5) * 2;
      const shaped = Math.sign(centered) * Math.pow(Math.abs(centered), 0.82);
      const yStart = (0.5 + shaped * 0.48) * height;

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
          const wave = Math.sin(x * 0.009) * (1 - col) * 0.7;
          y += (targetY - y) * rate + wave + displace(x, y);
          x += direction * step;
          if (!Number.isFinite(y)) break;
          if ((direction > 0 && x > centerX) || (direction < 0 && x < centerX)) break;
          const keep = Math.min(keepAlpha(previousX, previousY, regions), keepAlpha(x, y, regions));
          const dist = Math.abs(previousY - focusY) / (height * 0.5);
          const along = 0.82 + 0.18 * (s / steps);
          const alpha = (0.12 + 0.16 * Math.pow(Math.max(0, 1 - dist), 1.2)) * along * keep;
          if (alpha > 0.03) {
            const index = Math.min(bucketCount - 1, Math.floor((alpha / 0.32) * bucketCount));
            buckets[index].push(previousX, previousY, x, y);
          }
        }
      }
    }

    for (let b = 0; b < bucketCount; b++) {
      const bucket = buckets[b];
      if (!bucket.length) continue;
      const alpha = ((b + 0.5) / bucketCount) * 0.32;
      context.strokeStyle = "rgba(214, 217, 223, " + alpha.toFixed(3) + ")";
      context.beginPath();
      for (let p = 0; p < bucket.length; p += 4) {
        context.moveTo(bucket[p], bucket[p + 1]);
        context.lineTo(bucket[p + 2], bucket[p + 3]);
      }
      context.stroke();
    }

    state.pvx *= 0.84;
    state.pvy *= 0.84;
  }

  function frame(now) {
    draw(now);
    if (!state.reduced && !document.hidden) state.raf = window.requestAnimationFrame(frame);
  }

  function start() {
    window.cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (state.reduced || document.hidden) {
      draw(performance.now());
      return;
    }
    state.raf = window.requestAnimationFrame(frame);
  }

  function onPointer(event) {
    if (typeof event.clientX !== "number") return;
    if (state.hasPointer) {
      state.pvx = event.clientX - state.px;
      state.pvy = event.clientY - state.py;
    }
    state.px = event.clientX;
    state.py = event.clientY;
    state.hasPointer = true;
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

  reducedQuery.addEventListener("change", function () {
    state.reduced = reducedQuery.matches;
    start();
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
