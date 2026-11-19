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
        const rect = submitButton.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 12) {
          submitButton.scrollIntoView({
            block: "nearest",
            behavior: reducedQuery.matches ? "auto" : "smooth",
          });
        }
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
    if (t === detailsEl || t.closest(".submit") || t.closest(".close")) return;
    event.preventDefault();
    detailsEl.focus({ preventScroll: true });
  });

  form.addEventListener("focusin", function (event) {
    const target = event.target;
    if (!target || target === submitButton) return;
    window.setTimeout(function () {
      target.scrollIntoView({
        block: "center",
        behavior: reducedQuery.matches ? "auto" : "smooth",
      });
    }, 50);
  });

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
        signal: AbortSignal.timeout(20000),
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
