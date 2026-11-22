(function () {
  const canvas = document.getElementById("cube");
  if (!canvas) return;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const vertices = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];

  const state = { w: 0, h: 0, dpr: 1, raf: 0 };

  function project(point, yaw, pitch, roll, size) {
    let x = point[0];
    let y = point[1];
    let z = point[2];
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const y1 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const x2 = x1 * cr - y1 * sr;
    const y2 = x1 * sr + y1 * cr;
    const depth = 4.2;
    const scale = size / (z2 + depth);
    return [x2 * scale, y2 * scale, z2];
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

  function drawCube(yaw, pitch, roll, size, progress, ox, oy, gain) {
    const points = vertices.map(function (vertex) {
      const p = project(vertex, yaw, pitch, roll, size);
      return [p[0] + ox, p[1] + oy, p[2]];
    });
    const order = edges
      .map(function (edge, index) {
        return { edge: edge, index: index, depth: (points[edge[0]][2] + points[edge[1]][2]) / 2 };
      })
      .sort(function (a, b) {
        return a.depth - b.depth;
      });

    order.forEach(function (item) {
      const a = points[item.edge[0]];
      const b = points[item.edge[1]];
      const front = (item.depth + 1.4) / 2.8;
      const alpha = (0.34 + front * 0.66) * gain;
      context.strokeStyle = "rgba(231, 229, 224, " + alpha + ")";
      context.lineWidth = (0.85 + front * 0.85) * state.dpr;
      context.beginPath();
      context.moveTo(a[0], a[1]);
      context.lineTo(b[0], b[1]);
      context.stroke();

      if (progress < 0) return;
      const along = progress * edges.length - item.index;
      const amount = Math.max(0, Math.min(1, along));
      const tail = Math.max(0, Math.min(1, along - 0.15));
      if (amount <= tail) return;
      const x1 = a[0] + (b[0] - a[0]) * tail;
      const y1 = a[1] + (b[1] - a[1]) * tail;
      const x2 = a[0] + (b[0] - a[0]) * amount;
      const y2 = a[1] + (b[1] - a[1]) * amount;
      context.strokeStyle = "rgba(231, 229, 224, " + Math.min(1, alpha + 0.35) + ")";
      context.lineWidth = (1.6 + front) * state.dpr;
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    });
  }

  function draw(now) {
    const w = state.w;
    const h = state.h;
    if (w < 2 || h < 2) return;
    context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    context.fillStyle = "#000";
    context.fillRect(0, 0, w, h);
    context.lineCap = "round";
    context.lineJoin = "round";

    const size = Math.min(w * 0.72, h * 0.46);
    const ox = w * 0.5;
    const oy = h * 0.38;
    let yaw = -0.62;
    let pitch = 0.42;
    let sweep = -1;
    if (!reduced) {
      yaw = -0.62 + (now / 22000) * Math.PI * 2;
      pitch = 0.38 + Math.sin(now / 11000) * 0.06;
      sweep = (now % 9000) / 9000;
    }
    drawCube(yaw + 0.22, pitch - 0.04, 0.06, size * 1.12, -1, ox, oy, 0.22);
    drawCube(yaw, pitch, 0, size, sweep, ox, oy, 1);
  }

  function frame(now) {
    draw(now);
    if (!reduced && !document.hidden) state.raf = window.requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  if (!reduced) {
    state.raf = window.requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        window.cancelAnimationFrame(state.raf);
        return;
      }
      state.raf = window.requestAnimationFrame(frame);
    });
  }
})();
