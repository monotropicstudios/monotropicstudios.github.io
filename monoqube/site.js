(function () {
  const form = document.getElementById("form");
  const details = document.getElementById("details");
  const submit = document.getElementById("submit");
  const status = document.getElementById("status");
  if (!form || !details || !submit || !status) return;

  let sending = false;

  function show(text) {
    status.hidden = false;
    status.textContent = text;
  }

  function clearStatus() {
    status.hidden = true;
    status.textContent = "";
  }

  function validate() {
    details.value = details.value.trim();
    if (!details.value) {
      details.focus();
      return false;
    }
    return true;
  }

  function settle() {
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var layer = document.createElement("nav");
    layer.className = "arrived";
    layer.setAttribute("aria-label", "Studio");
    layer.innerHTML = '<a href="/inventions/">Inventions</a><a href="/books/">Books</a><a href="/software/">Software</a>';
    document.body.appendChild(layer);
    if (reduced) return;
    layer.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 700, easing: "cubic-bezier(0.22, 0.7, 0.2, 1)", fill: "both" }
    );
  }

  function depart(text) {
    return new Promise(function (resolve) {
      var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var rect = details.getBoundingClientRect();
      var cs = window.getComputedStyle(details);
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
    if (status.textContent === "Not sent.") clearStatus();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (sending) return;
    clearStatus();
    if (!validate()) return;
    if (form.querySelector("[name='_honey']").value) {
      await depart(details.value);
      settle();
      return;
    }

    sending = true;
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    var sent = false;

    try {
      const response = await fetch("https://formsubmit.co/ajax/7588f879162bfd41a033043c56061629", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          details: details.value,
          _subject: "MonoQube licensing",
          _captcha: "false",
          _template: "box",
        }),
        signal: AbortSignal.timeout(90000),
      });
      const data = await response.json().catch(function () {
        return null;
      });
      if (data && (data.success === true || data.success === "true")) {
        sent = true;
        var message = details.value;
        await depart(message);
        settle();
        clearStatus();
      } else {
        show("Not sent.");
      }
    } catch (error) {
      show("Not sent.");
    } finally {
      if (!sent) {
        sending = false;
        submit.disabled = false;
        form.removeAttribute("aria-busy");
      }
    }
  });
})();
