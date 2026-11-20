(function () {
  const openButton = document.getElementById("open");
  const panel = document.getElementById("panel");
  const form = document.getElementById("form");
  const closeButton = document.getElementById("close");
  const statusEl = document.getElementById("status");
  const detailsEl = document.getElementById("details");
  const submitButton = document.getElementById("submit");
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

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
    statusEl.textContent = "Not sent.";
    statusEl.classList.remove("is-received");
  }

  function hasTextSelection() {
    const selection = window.getSelection();
    return !!(selection && selection.toString().trim().length > 0);
  }

  function toggleOpen() {
    // Dragging across "hidden" leaves a selection; do not snap open the inquiry.
    if (!open && hasTextSelection()) return;
    setOpen(!open);
  }

  openButton.addEventListener("click", toggleOpen);

  openButton.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleOpen();
    }
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
    if (t === detailsEl || t.closest(".submit") || t.closest(".close")) return;
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

  form.addEventListener("input", function () {
    if (!statusEl.classList.contains("is-received") && statusEl.textContent === "Not sent.") {
      clearStatus();
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (sending || form.hidden) return;

    detailsEl.value = detailsEl.value.trim();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const payload = {
      details: detailsEl.value.toUpperCase(),
      _subject: "Monotropic inquiry",
      _captcha: "false",
      _template: "box",
    };

    sending = true;
    submitButton.disabled = true;
    form.setAttribute("aria-busy", "true");

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
      if (data && (data.success === true || data.success === "true")) showReceived();
      else showError();
    } catch (error) {
      showError();
    } finally {
      sending = false;
      submitButton.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });
})();
