(function () {
  const form = document.getElementById("form");
  const nameEl = document.getElementById("name");
  const emailEl = document.getElementById("email");
  const details = document.getElementById("details");
  const submit = document.getElementById("submit");
  const status = document.getElementById("status");
  if (!form || !nameEl || !emailEl || !details || !submit || !status) return;

  let sending = false;

  function show(text, received) {
    status.hidden = false;
    status.textContent = text;
    status.classList.toggle("is-received", received);
  }

  function fieldError(input, message) {
    const err = document.getElementById(input.id + "-error");
    const bad = Boolean(message);
    input.setAttribute("aria-invalid", bad ? "true" : "false");
    if (!err) return;
    err.hidden = !bad;
    err.textContent = message || "";
  }

  function validate() {
    nameEl.value = nameEl.value.trim();
    emailEl.value = emailEl.value.trim();
    details.value = details.value.trim();
    fieldError(nameEl, nameEl.value ? "" : "Enter your name.");
    if (!emailEl.value) fieldError(emailEl, "Enter your email.");
    else if (!emailEl.checkValidity()) fieldError(emailEl, "Enter a valid email.");
    else fieldError(emailEl, "");
    fieldError(details, details.value ? "" : "Enter your inquiry.");
    const first = form.querySelector("[aria-invalid='true']");
    if (first) first.focus();
    return !first;
  }

  form.addEventListener("input", function (event) {
    if (event.target && event.target.id) fieldError(event.target, "");
    if (status.textContent.indexOf("Not sent") === 0) {
      status.hidden = true;
      status.textContent = "";
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (sending) return;
    if (!validate()) return;
    if (form.querySelector("[name='_honey']").value) {
      window.location.assign("/inquiry/received/");
      return;
    }

    sending = true;
    submit.disabled = true;
    submit.textContent = "Sending";
    submit.setAttribute("aria-busy", "true");
    form.setAttribute("aria-busy", "true");
    let sent = false;

    try {
      const response = await fetch("https://formsubmit.co/ajax/7588f879162bfd41a033043c56061629", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: nameEl.value,
          email: emailEl.value,
          details: details.value,
          _subject: "MonoQube licensing",
          _captcha: "false",
          _template: "box",
          _next: "https://monotropicstudios.com/inquiry/received/",
        }),
        signal: AbortSignal.timeout(90000),
      });
      const data = await response.json().catch(function () {
        return null;
      });
      if (data && (data.success === true || data.success === "true")) {
        sent = true;
        window.location.assign("/inquiry/received/");
      } else {
        show("Not sent. Try again.", false);
      }
    } catch (error) {
      show("Not sent. Try again.", false);
    } finally {
      if (!sent) {
        sending = false;
        submit.disabled = false;
        submit.textContent = "Send inquiry";
        submit.removeAttribute("aria-busy");
        form.removeAttribute("aria-busy");
      }
    }
  });
})();
