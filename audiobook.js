(function () {
  "use strict";
  var data = JSON.parse(document.getElementById("book-data").textContent);
  var chapters = data.chapters;
  var key = "audiobook:" + data.id;
  var audio = document.getElementById("audio");
  var playBtn = document.getElementById("play");
  var seek = document.getElementById("seek");
  var cur = document.getElementById("cur");
  var dur = document.getElementById("dur");
  var now = document.getElementById("now");
  var speedBtn = document.getElementById("speed");
  var list = document.getElementById("chapters");
  var speeds = [1, 1.25, 1.5, 0.75];
  var state = load();
  var index = state.i;
  var pending = state.t;
  var dragging = false;
  var lastSave = 0;

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(key) || "{}");
      var i = Number.isInteger(s.i) && s.i >= 0 && s.i < chapters.length ? s.i : 0;
      return { i: i, t: Number.isFinite(s.t) && s.t > 0 && s.t < chapters[i].duration - 1 ? s.t : 0, r: speeds.indexOf(s.r) >= 0 ? s.r : 1 };
    } catch (e) { return { i: 0, t: 0, r: 1 }; }
  }
  function start() {
    document.getElementById("message").textContent = "";
    var p = audio.play();
    if (p) p.catch(function (e) {
      if (e.name !== "AbortError") document.getElementById("message").textContent = "Tap Play to try again.";
    });
  }
  audio.addEventListener("error", function () {
    document.getElementById("message").textContent = "Couldn't load this chapter. Check your connection.";
  });
  function save(force) {
    var t = Date.now();
    if (!force && t - lastSave < 3000) return;
    lastSave = t;
    try { localStorage.setItem(key, JSON.stringify({ i: index, t: Math.floor(audio.currentTime || pending || 0), r: audio.playbackRate })); } catch (e) {}
  }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
  }

  chapters.forEach(function (c, i) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button";
    var a = document.createElement("span"); a.textContent = c.title;
    var d = document.createElement("span"); d.textContent = fmt(c.duration);
    b.appendChild(a); b.appendChild(d);
    b.addEventListener("click", function () {
      if (i === index && audio.src) { audio.paused ? start() : audio.pause(); return; }
      select(i, 0); start();
    });
    li.appendChild(b);
    list.appendChild(li);
  });

  function select(i, t) {
    index = i;
    pending = t || 0;
    audio.src = chapters[i].src;
    audio.load();
    audio.playbackRate = speeds[speedIdx];
    now.textContent = chapters[i].title;
    dur.textContent = fmt(chapters[i].duration);
    cur.textContent = fmt(pending);
    setBar(pending, chapters[i].duration);
    Array.prototype.forEach.call(list.querySelectorAll("button"), function (b, j) {
      b.setAttribute("aria-current", j === i ? "true" : "false");
    });
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapters[i].title,
        artist: data.author,
        album: data.title,
        artwork: [{ src: data.cover, sizes: "720x900", type: "image/jpeg" }]
      });
    }
    save(true);
  }
  function setBar(t, d) {
    var p = d ? Math.min(100, (t / d) * 100) : 0;
    seek.value = String(p * 10);
    seek.style.setProperty("--p", p + "%");
  }
  function applyPending() {
    if (pending && audio.duration && Math.abs(audio.currentTime - pending) > 1) {
      try { audio.currentTime = Math.min(pending, audio.duration - 1); } catch (e) {}
    }
    pending = 0;
  }
  function skip(n) {
    var d = audio.duration || chapters[index].duration;
    var t = Math.max(0, Math.min(d - 0.5, (audio.currentTime || pending) + n));
    if (audio.readyState > 0) audio.currentTime = t; else { pending = t; cur.textContent = fmt(t); setBar(t, d); }
  }

  audio.addEventListener("loadedmetadata", function () {
    dur.textContent = fmt(audio.duration);
    applyPending();
  });
  audio.addEventListener("timeupdate", function () {
    if (dragging || pending) return;
    cur.textContent = fmt(audio.currentTime);
    setBar(audio.currentTime, audio.duration || chapters[index].duration);
    save(false);
  });
  audio.addEventListener("play", function () { playBtn.setAttribute("aria-label", "Pause"); playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'; });
  audio.addEventListener("pause", function () { playBtn.setAttribute("aria-label", "Play"); playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z"/></svg>'; save(true); });
  audio.addEventListener("ended", function () {
    if (index < chapters.length - 1) { select(index + 1, 0); start(); }
    else { select(0, 0); }
  });

  playBtn.addEventListener("click", function () { audio.paused ? start() : audio.pause(); });
  document.getElementById("back").addEventListener("click", function () { skip(-15); });
  document.getElementById("fwd").addEventListener("click", function () { skip(30); });

  var speedIdx = Math.max(0, speeds.indexOf(state.r));
  function showSpeed() { speedBtn.textContent = speeds[speedIdx] + "\u00d7"; speedBtn.setAttribute("aria-label", "Speed " + speeds[speedIdx]); }
  speedBtn.addEventListener("click", function () {
    speedIdx = (speedIdx + 1) % speeds.length;
    audio.playbackRate = speeds[speedIdx];
    showSpeed(); save(true);
  });
  showSpeed();

  seek.addEventListener("input", function () {
    dragging = true;
    var d = audio.duration || chapters[index].duration;
    var t = (Number(seek.value) / 1000) * d;
    cur.textContent = fmt(t);
    seek.style.setProperty("--p", Number(seek.value) / 10 + "%");
  });
  seek.addEventListener("change", function () {
    var d = audio.duration || chapters[index].duration;
    var t = (Number(seek.value) / 1000) * d;
    if (audio.readyState > 0) audio.currentTime = t; else pending = t;
    dragging = false;
    save(true);
  });

  if ("mediaSession" in navigator) {
    var ms = navigator.mediaSession;
    try {
      ms.setActionHandler("play", function () { start(); });
      ms.setActionHandler("pause", function () { audio.pause(); });
      ms.setActionHandler("seekbackward", function () { skip(-15); });
      ms.setActionHandler("seekforward", function () { skip(30); });
      ms.setActionHandler("previoustrack", function () { if (index > 0) { select(index - 1, 0); start(); } });
      ms.setActionHandler("nexttrack", function () { if (index < chapters.length - 1) { select(index + 1, 0); start(); } });
    } catch (e) {}
  }

  window.addEventListener("pagehide", function () { save(true); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(true); });

  select(index, state.t);
  audio.controls = false;
  document.getElementById("custom-controls").hidden = false;
})();
