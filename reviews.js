(function () {
  "use strict";

  var REVIEWS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzOKfhOsh8c7P_x21M0F6-eEXE_Rmt2lX2oXR_StaYyvPWElu30CW0-ML_w4NEsuqzeQQ/exec";
  var RECAPTCHA_SITE_KEY = "6LcSkWUtAAAAACM55qbeldDlDK0Q2pICRfijnh-o";

  var form = document.getElementById("review-form");
  var statusEl = document.getElementById("rv-status");
  var submitBtn = document.getElementById("rv-submit");

  function setStatus(state, message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.setAttribute("data-state", state);
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);

      submitBtn.disabled = true;
      setStatus("pending", "Submitting your review…");

      grecaptcha.ready(function () {
        grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "review" }).then(function (token) {
          var payload = {
            action: "review",
            name: data.get("name"),
            rating: data.get("rating"),
            text: data.get("text"),
            website: data.get("website"),
            recaptchaToken: token
          };

          fetch(REVIEWS_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
          })
            .then(function (res) { return res.json(); })
            .then(function (result) {
              submitBtn.disabled = false;
              if (result.ok) {
                setStatus("ok", "✓ Thanks! Your review is in for approval and will appear on the site soon.");
                form.reset();
              } else {
                setStatus("error", result.error || "Something went wrong — please try again.");
              }
            })
            .catch(function () {
              submitBtn.disabled = false;
              setStatus("error", "Couldn't reach the review system. Please try again later.");
            });
        });
      });
    });
  }
})();
