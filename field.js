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
    buildGraph(w, h);
    draw(reduceMotion ? 0 : performance.now());
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
      const rect = elementRect(panel.querySelector(".panel-clip")) || elementRect(panel);
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
    const feather = 78;
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

  let graph = null;
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = reduceQuery.matches;

  function hash01(n) {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  }

  function buildGraph(w, h) {
    const count = w < 560 ? 28 : w < 1000 ? 42 : 56;
    const cols = Math.max(4, Math.round(Math.sqrt(count * (w / Math.max(h, 1)))));
    const rows = Math.max(3, Math.ceil(count / cols));
    const cw = w / cols;
    const rh = h / rows;
    const nodes = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ux = hash01(r * 19.1 + c * 7.7 + 1.3);
        const uy = hash01(r * 3.1 + c * 13.9 + 4.2);
        nodes.push({
          x: (c + 0.16 + ux * 0.68) * cw,
          y: (r + 0.16 + uy * 0.68) * rh,
          ax: 16 + ux * 18,
          ay: 14 + uy * 16,
          p: ux * Math.PI * 2,
          q: uy * Math.PI * 2,
        });
      }
    }
    const edges = [];
    const reach = Math.hypot(cw, rh) * 1.45;
    for (let i = 0; i < nodes.length; i++) {
      const near = [];
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d < reach) near.push({ j: j, d: d });
      }
      near.sort(function (a, b) { return a.d - b.d; });
      const links = Math.min(3, near.length);
      for (let k = 0; k < links; k++) {
        if (k === 2 && hash01(i + 0.2) < 0.45) continue;
        edges.push({ a: i, b: near[k].j, p: hash01(i * 1.7 + near[k].j) * Math.PI * 2 });
      }
    }
    graph = { nodes: nodes, edges: edges };
  }

  function place(n, now) {
    const t = now * 0.0002;
    return {
      x: n.x + Math.sin(t + n.p) * n.ax + Math.sin(t * 0.53 + n.q) * n.ax * 0.38,
      y: n.y + Math.cos(t * 0.71 + n.q) * n.ay + Math.sin(t * 0.37 + n.p) * n.ay * 0.32,
    };
  }

  function textHalo(x, y, regions) {
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
        factor *= u * u * (3 - 2 * u);
      }
    }
    return factor;
  }

  function magnetic(x, baseY, proximity, regions) {
    const strength = state.pointerStrength;
    if (strength < 0.001) return { dy: 0, glow: 0 };
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
    const bend = (dy / denom) * 24 * g * strength * calm;
    const glow = 0.1 * g * strength * calm;
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

    if (!graph) buildGraph(width, height);
    const regions = masks();
    if (!document.getElementById("open")) {
      const column = elementRect(document.querySelector("main"));
      if (column) regions.push(column);
    }
    const nodes = graph.nodes;
    const placed = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) placed[i] = place(nodes[i], now);

    for (let b = 0; b < bucketCount; b++) buckets[b].length = 0;
    const edges = graph.edges;
    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];
      const a = placed[edge.a];
      const bpt = placed[edge.b];
      const span = Math.hypot(bpt.x - a.x, bpt.y - a.y) || 1;
      const bow = Math.sin(now * 0.00016 + edge.p) * span * 0.22;
      const nx = -(bpt.y - a.y) / span;
      const ny = (bpt.x - a.x) / span;
      const mx = (a.x + bpt.x) / 2 + nx * bow;
      const my = (a.y + bpt.y) / 2 + ny * bow;
      const keep = Math.min(keepAlpha(a.x, a.y, regions), keepAlpha(bpt.x, bpt.y, regions), keepAlpha(mx, my, regions));
      if (keep < 0.04) continue;
      const pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(now * 0.0008 + edge.p));
      const alpha = Math.min(0.22, (0.07 + 0.1 * pulse) * keep);
      const index = Math.min(bucketCount - 1, Math.floor((alpha / 0.22) * bucketCount));
      buckets[index].push(a.x, a.y, mx, my, bpt.x, bpt.y);
    }

    for (let b = 0; b < bucketCount; b++) {
      const bucket = buckets[b];
      if (!bucket.length) continue;
      const alpha = ((b + 0.5) / bucketCount) * 0.22;
      context.strokeStyle = "rgba(255, 255, 255, " + alpha.toFixed(3) + ")";
      context.beginPath();
      for (let p = 0; p < bucket.length; p += 6) {
        context.moveTo(bucket[p], bucket[p + 1]);
        context.quadraticCurveTo(bucket[p + 2], bucket[p + 3], bucket[p + 4], bucket[p + 5]);
      }
      context.stroke();
    }

    for (let i = 0; i < placed.length; i++) {
      const point = placed[i];
      const keep = keepAlpha(point.x, point.y, regions);
      if (keep < 0.05) continue;
      const beat = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now * 0.0011 + nodes[i].p));
      context.fillStyle = "rgba(255, 255, 255, " + (0.16 * beat * keep).toFixed(3) + ")";
      context.beginPath();
      context.arc(point.x, point.y, 1.15 + beat * 0.7, 0, Math.PI * 2);
      context.fill();
    }

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
    if (reduceMotion || document.hidden) {
      draw(reduceMotion ? 0 : performance.now());
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
  if (reduceQuery.addEventListener) {
    reduceQuery.addEventListener("change", function (event) {
      reduceMotion = event.matches;
      start();
    });
  }
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
