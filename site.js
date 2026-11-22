(function () {
  const openButton = document.getElementById("open");
  const panel = document.getElementById("panel");
  const form = document.getElementById("form");
  const closeButton = document.getElementById("close");
  const statusEl = document.getElementById("status");
  const detailsEl = document.getElementById("details");
  const submitButton = document.getElementById("submit");

  const heading = openButton.closest("h1");
  let open = false;
  let sending = false;

  // Keep the layout fixed when the mobile keyboard opens.
  const root = document.documentElement;
  let lockedWidth = window.innerWidth;
  function lockHeight() {
    root.style.setProperty("--lock-h", window.innerHeight + "px");
    lockedWidth = window.innerWidth;
  }
  lockHeight();
  window.addEventListener("orientationchange", function () {
    window.setTimeout(lockHeight, 350);
  });
  window.addEventListener("resize", function () {
    if (window.innerWidth !== lockedWidth && document.activeElement !== detailsEl) lockHeight();
  });

  function fitToKeyboard() {
    const vv = window.visualViewport;
    if (!vv || document.activeElement !== detailsEl) {
      detailsEl.style.maxHeight = "";
      detailsEl.style.minHeight = "";
      return;
    }
    if (vv.offsetTop || window.scrollY) window.scrollTo(0, 0);
    const top = detailsEl.getBoundingClientRect().top;
    const room = Math.floor(vv.height - top - 16);
    const val = room > 60 && room < detailsEl.offsetHeight + 1 ? room + "px" : "";
    detailsEl.style.maxHeight = val;
    detailsEl.style.minHeight = val ? "0" : "";
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitToKeyboard);
    window.visualViewport.addEventListener("scroll", fitToKeyboard);
  }
  detailsEl.addEventListener("focus", function () {
    window.setTimeout(fitToKeyboard, 60);
    window.setTimeout(fitToKeyboard, 350);
  });
  detailsEl.addEventListener("blur", function () {
    detailsEl.style.maxHeight = "";
    detailsEl.style.minHeight = "";
    window.scrollTo(0, 0);
  });
  detailsEl.addEventListener("input", fitToKeyboard);

  function redraw() {
    if (typeof window.monotropicRedraw === "function") window.monotropicRedraw();
  }

  function clearStatus() {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.classList.remove("is-received");
  }

  function setOpen(next) {
    open = next;
    openButton.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      document.body.dataset.view = "inquiry";
      heading.inert = true;
      heading.setAttribute("aria-hidden", "true");
      panel.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      panel.inert = false;
      closeButton.hidden = false;
      window.requestAnimationFrame(function () {
        redraw();
      });
      return;
    }

    delete document.body.dataset.view;
    heading.inert = false;
    heading.removeAttribute("aria-hidden");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    panel.inert = true;
    closeButton.hidden = true;
    if (statusEl.classList.contains("is-received")) {
      form.hidden = false;
      form.reset();
    }
    clearStatus();
    sending = false;
    submitButton.disabled = false;
    form.removeAttribute("aria-busy");
    openButton.focus({ preventScroll: true });
    window.requestAnimationFrame(redraw);
  }

  function showReceived() {
    form.hidden = true;
    statusEl.hidden = false;
    statusEl.textContent = "Received.";
    statusEl.classList.add("is-received");
    statusEl.focus({ preventScroll: true });
    window.requestAnimationFrame(redraw);
  }

  function showError() {
    statusEl.hidden = false;
    statusEl.textContent = "Not sent. Try again.";
    statusEl.classList.remove("is-received");
  }

  openButton.addEventListener("click", function () {
    setOpen(!open);
  });

  closeButton.addEventListener("click", function () {
    setOpen(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  });

  document.querySelector("main").addEventListener("mousedown", function (event) {
    if (!open || form.hidden) return;
    const t = event.target;
    if (t.closest("input, textarea, button, a, label")) return;
    event.preventDefault();
    detailsEl.focus({ preventScroll: true });
  });

  // Stop mobile pull-to-refresh when dragging a thumb down anywhere.
  // Still allow real scrolling inside a long #details.
  let touchStartY = 0;
  document.addEventListener(
    "touchstart",
    function (event) {
      if (event.touches && event.touches.length) touchStartY = event.touches[0].clientY;
    },
    { passive: true }
  );
  document.addEventListener(
    "touchmove",
    function (event) {
      if (!event.touches || !event.touches.length) {
        event.preventDefault();
        return;
      }
      const target = event.target;
      if (target && target.closest && target.closest(".works")) return;
      if (target && detailsEl.contains(target)) {
        const canScroll = detailsEl.scrollHeight > detailsEl.clientHeight + 1;
        if (canScroll) {
          const currentY = event.touches[0].clientY;
          const pullingDown = currentY > touchStartY;
          const atTop = detailsEl.scrollTop <= 0;
          const atBottom =
            detailsEl.scrollTop + detailsEl.clientHeight >= detailsEl.scrollHeight - 1;
          // Block only the rubber-band / pull-to-refresh edges.
          if (!(atTop && pullingDown) && !(atBottom && !pullingDown)) return;
        }
      }
      event.preventDefault();
    },
    { passive: false }
  );

  function validate() {
    detailsEl.value = detailsEl.value.trim();
    if (!detailsEl.value) {
      detailsEl.focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  function settle() {
    var works = document.querySelector(".works");
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var first = works.getBoundingClientRect();
    document.body.classList.add("is-sent");
    if (reduced) return;
    var last = works.getBoundingClientRect();
    var dx = first.left + first.width / 2 - (last.left + last.width / 2);
    var dy = first.top + first.height / 2 - (last.top + last.height / 2);
    works.animate(
      [
        { transform: "translate(" + dx + "px, " + dy + "px)" },
        { transform: "translate(0px, 0px)" }
      ],
      { duration: 780, easing: "cubic-bezier(0.22, 0.7, 0.2, 1)", fill: "both" }
    );
  }

  function depart(text) {
    return new Promise(function (resolve) {
      var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var rect = detailsEl.getBoundingClientRect();
      var cs = window.getComputedStyle(detailsEl);
      var ghost = document.createElement("div");
      ghost.className = "depart";
      ghost.setAttribute("aria-hidden", "true");
      ghost.textContent = text;
      ghost.style.left = rect.left + "px";
      ghost.style.top = rect.top + "px";
      ghost.style.width = rect.width + "px";
      ghost.style.height = rect.height + "px";
      ghost.style.font = cs.font;
      ghost.style.padding = cs.padding;
      ghost.style.letterSpacing = cs.letterSpacing;
      ghost.style.lineHeight = cs.lineHeight;
      ghost.style.textAlign = cs.textAlign;
      ghost.style.color = cs.color;
      ghost.style.border = cs.border;
      ghost.style.background = "#000";
      document.body.appendChild(ghost);
      form.classList.add("is-departing");
      var done = function () {
        ghost.remove();
        form.classList.remove("is-departing");
        resolve();
      };
      if (reduced) {
        var fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
        fade.onfinish = done;
        return;
      }
      var dx = window.innerWidth / 2 - (rect.left + rect.width / 2);
      var dy = window.innerHeight / 2 - (rect.top + rect.height / 2);
      var anim = ghost.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", borderRadius: "0px", opacity: 1, offset: 0 },
          { transform: "translate(" + dx * 0.45 + "px, " + dy * 0.45 + "px) scale(0.55)", borderRadius: "18px", opacity: 1, offset: 0.42 },
          { transform: "translate(" + dx + "px, " + dy + "px) scale(0.1)", borderRadius: "50%", opacity: 1, offset: 0.74 },
          { transform: "translate(" + dx + "px, " + dy + "px) scale(0.028)", borderRadius: "50%", opacity: 1, offset: 0.88 },
          { transform: "translate(" + dx + "px, " + dy + "px) scale(0.012)", borderRadius: "50%", opacity: 0, offset: 1 }
        ],
        { duration: 1500, easing: "cubic-bezier(0.45, 0.02, 0.15, 1)", fill: "forwards" }
      );
      anim.onfinish = done;
    });
  }

  form.addEventListener("input", function () {
    if (!statusEl.classList.contains("is-received") && statusEl.textContent === "Not sent.") {
      clearStatus();
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (sending || form.hidden) return;
    clearStatus();
    if (!validate()) return;
    if (form.querySelector("[name='_honey']").value) {
      depart(detailsEl.value).then(settle);
      return;
    }

    const payload = {
      details: detailsEl.value,
      _subject: "Monotropic inquiry",
      _captcha: "false",
      _template: "box",
    };

    sending = true;
    submitButton.disabled = true;
    form.setAttribute("aria-busy", "true");
    let sent = false;

    try {
      const response = await fetch("https://formsubmit.co/ajax/7588f879162bfd41a033043c56061629", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90000),
      });
      const data = await response.json().catch(function () {
        return null;
      });
      if (data && (data.success === true || data.success === "true")) {
        sent = true;
        var message = detailsEl.value;
        await depart(message);
        settle();
        clearStatus();
      } else showError();
    } catch (error) {
      showError();
    } finally {
      if (!sent) {
        sending = false;
        submitButton.disabled = false;
        form.removeAttribute("aria-busy");
      }
    }
  });
})();
