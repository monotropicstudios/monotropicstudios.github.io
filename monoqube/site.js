(function () {
  const form = document.getElementById("form");
  const details = document.getElementById("details");
  const submit = document.getElementById("submit");
  const status = document.getElementById("status");
  if (!form || !details || !submit || !status) return;

  let sending = false;

  function show(text, received) {
    status.hidden = false;
    status.textContent = text;
    status.classList.toggle("is-received", received);
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (sending) return;
    details.value = details.value.trim();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    sending = true;
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");

    try {
      const response = await fetch("https://formsubmit.co/ajax/7588f879162bfd41a033043c56061629", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          details: details.value.toUpperCase(),
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
        form.hidden = true;
        show("Received.", true);
      } else {
        show("Not sent.", false);
      }
    } catch (error) {
      show("Not sent.", false);
    } finally {
      sending = false;
      submit.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });
})();
