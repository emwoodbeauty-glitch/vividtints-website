(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Boot screen ---------- */
  var bootScreen = document.getElementById("boot-screen");
  var bootSkip = document.getElementById("boot-skip");

  function hideBoot() {
    if (!bootScreen) return;
    bootScreen.classList.add("is-hiding");
    window.setTimeout(function () {
      bootScreen.hidden = true;
    }, 500);
  }

  if (sessionStorage.getItem("vt-booted") || reduceMotion) {
    if (bootScreen) bootScreen.hidden = true;
  } else {
    sessionStorage.setItem("vt-booted", "1");
    window.setTimeout(hideBoot, 1400);
    if (bootSkip) bootSkip.addEventListener("click", hideBoot);
    document.addEventListener("keydown", hideBoot, { once: true });
  }

  /* ---------- Live taskbar clock ---------- */
  var clockEl = document.getElementById("taskbar-clock");
  function updateClock() {
    if (!clockEl) return;
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    clockEl.textContent = h + ":" + String(m).padStart(2, "0") + " " + ampm;
  }
  updateClock();
  window.setInterval(updateClock, 15000);

  /* ---------- Booking time slots (15-min increments, 6am-5pm) ---------- */
  var bfTime = document.getElementById("bf-time");
  if (bfTime) {
    for (var totalMin = 6 * 60; totalMin <= 17 * 60; totalMin += 15) {
      var hh24 = Math.floor(totalMin / 60);
      var mm = totalMin % 60;
      var value = String(hh24).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
      var hh12 = hh24 % 12 || 12;
      var ampmLabel = hh24 >= 12 ? "PM" : "AM";
      var label = hh12 + ":" + String(mm).padStart(2, "0") + " " + ampmLabel;
      var opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      bfTime.appendChild(opt);
    }
  }

  /* ---------- Start menu ---------- */
  var startBtn = document.getElementById("start-btn");
  var startMenu = document.getElementById("start-menu");

  function closeStartMenu() {
    if (!startMenu) return;
    startMenu.hidden = true;
    if (startBtn) startBtn.setAttribute("aria-expanded", "false");
  }

  if (startBtn && startMenu) {
    startBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = !startMenu.hidden;
      if (isOpen) {
        closeStartMenu();
      } else {
        startMenu.hidden = false;
        startBtn.setAttribute("aria-expanded", "true");
      }
    });

    document.addEventListener("click", function (e) {
      if (!startMenu.hidden && !startMenu.contains(e.target) && e.target !== startBtn) {
        closeStartMenu();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeStartMenu();
    });

    startMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeStartMenu);
    });
  }

  /* ---------- Minimize windows ---------- */
  document.querySelectorAll(".win-btn--min").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var win = btn.closest(".win");
      if (!win) return;
      var body = win.querySelector(".win-body");
      var collapsed = win.classList.toggle("is-minimized");
      if (body) body.style.display = collapsed ? "none" : "";
      btn.setAttribute("aria-expanded", String(!collapsed));
    });
  });

  /* ---------- Policy dialog OK button ---------- */
  var policyOk = document.getElementById("policy-ok");
  if (policyOk) {
    policyOk.addEventListener("click", function () {
      var next = document.getElementById("book");
      if (next) next.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Booking form -> live calendar ---------- */
  var BOOKING_ENDPOINT = "https://script.google.com/macros/s/AKfycbzOKfhOsh8c7P_x21M0F6-eEXE_Rmt2lX2oXR_StaYyvPWElu30CW0-ML_w4NEsuqzeQQ/exec";
  var RECAPTCHA_SITE_KEY = "6LcSkWUtAAAAACM55qbeldDlDK0Q2pICRfijnh-o";
  var STUDIO_TZ = "America/New_York";

  /* The studio's calendar always runs on America/New_York regardless of a
     visitor's browser timezone. These convert between that fixed zone and
     UTC so availability shown client-side matches what the server (which
     always runs in the studio's timezone) will actually book. */
  function nyOffsetHours(dateStr) {
    var refUTC = new Date(dateStr + "T12:00:00Z");
    var parts = new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, timeZoneName: "short", hour: "2-digit" }).formatToParts(refUTC);
    var tzName = parts.find(function (p) { return p.type === "timeZoneName"; });
    return (tzName && tzName.value === "EDT") ? 4 : 5;
  }

  function nyWallTimeToUTC(dateStr, timeStr) {
    return new Date(Date.parse(dateStr + "T" + timeStr + ":00Z") + nyOffsetHours(dateStr) * 3600000);
  }

  function nyDateKey(date) {
    var parts = {};
    new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(date)
      .forEach(function (p) { parts[p.type] = p.value; });
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  var form = document.getElementById("booking-form");
  var statusEl = document.getElementById("bf-status");
  var submitBtn = document.getElementById("bf-submit");

  function setStatus(state, message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.setAttribute("data-state", state);
  }

  var renderDaySchedule;
  var renderCalendar;
  var dateInput = document.getElementById("bf-date");
  if (dateInput) {
    var today = new Date();
    var iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    dateInput.setAttribute("min", iso);
    dateInput.addEventListener("change", function () {
      if (dateInput.value && typeof renderDaySchedule === "function") renderDaySchedule(dateInput.value);
    });
  }

  /* ---------- Mini calendar (availability replica) ---------- */
  var miniCal = document.getElementById("mini-cal");
  if (miniCal) {
    var mcGrid = document.getElementById("mini-cal-grid");
    var mcTitle = document.getElementById("mini-cal-title");
    var mcPrev = document.getElementById("mini-cal-prev");
    var mcNext = document.getElementById("mini-cal-next");
    var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    var viewYear = todayStart.getFullYear();
    var viewMonth = todayStart.getMonth();
    var busyCache = {};
    var busyEventsCache = {};
    var selectedDateKey = null;

    function isoDate(y, m, d) {
      return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    }

    function fetchBusyForMonth(y, m) {
      var key = y + "-" + m;
      if (busyCache[key]) return Promise.resolve(busyCache[key]);
      var start = isoDate(y, m, 1);
      var end = isoDate(y, m, new Date(y, m + 1, 0).getDate());
      return fetch(BOOKING_ENDPOINT + "?action=busy&start=" + start + "&end=" + end)
        .then(function (r) { return r.json(); })
        .then(function (json) {
          var days = {};
          var events = [];
          if (json.ok && json.busy) {
            json.busy.forEach(function (ev) {
              var evStart = new Date(ev.start);
              var evEnd = ev.end ? new Date(ev.end) : new Date(evStart.getTime() + 15 * 60000);
              var dayKey = nyDateKey(evStart);
              days[dayKey] = true;
              events.push({ start: evStart, end: evEnd, dayKey: dayKey });
            });
          }
          busyCache[key] = days;
          busyEventsCache[key] = events;
          return days;
        })
        .catch(function () { return {}; });
    }

    /* ---------- Day schedule (per-date slot availability) ---------- */
    var daySchedule = document.getElementById("day-schedule");
    var daySchedTitle = document.getElementById("day-schedule-title");
    var daySchedSlots = document.getElementById("day-schedule-slots");

    renderDaySchedule = function (dateKey) {
      if (!daySchedule || !daySchedTitle || !daySchedSlots || !dateKey) return;
      selectedDateKey = dateKey;
      var d = new Date(dateKey + "T00:00:00");
      var weekday = d.getDay();

      daySchedule.hidden = false;
      daySchedTitle.textContent = monthNames[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
      daySchedSlots.innerHTML = "";

      if (weekday === 1 || weekday === 2) {
        var closedMsg = document.createElement("p");
        closedMsg.className = "day-schedule-empty";
        closedMsg.textContent = "Closed this day — please pick Wednesday through Sunday.";
        daySchedSlots.appendChild(closedMsg);
        return;
      }

      for (var totalMin = 6 * 60; totalMin <= 17 * 60; totalMin += 15) {
        var hh24 = Math.floor(totalMin / 60);
        var mm = totalMin % 60;
        var slotValue = String(hh24).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
        var hh12 = hh24 % 12 || 12;
        var ampmLabel = hh24 >= 12 ? "PM" : "AM";
        var slotLabel = hh12 + ":" + String(mm).padStart(2, "0") + " " + ampmLabel;

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "day-schedule-slot";
        btn.textContent = slotLabel;
        btn.setAttribute("data-time", slotValue);

        btn.addEventListener("click", function () {
          if (this.disabled) return;
          if (bfTime) {
            bfTime.value = this.getAttribute("data-time");
            bfTime.dispatchEvent(new Event("change"));
          }
          var prevSelected = daySchedSlots.querySelector(".day-schedule-slot--selected");
          if (prevSelected) prevSelected.classList.remove("day-schedule-slot--selected");
          this.classList.add("day-schedule-slot--selected");
        });

        daySchedSlots.appendChild(btn);
      }

      var key = d.getFullYear() + "-" + d.getMonth();
      fetchBusyForMonth(d.getFullYear(), d.getMonth()).then(function () {
        if (selectedDateKey !== dateKey) return;
        var dayEvents = (busyEventsCache[key] || []).filter(function (ev) {
          return ev.dayKey === dateKey;
        });
        if (!dayEvents.length) return;

        daySchedSlots.querySelectorAll(".day-schedule-slot").forEach(function (btn) {
          var slotValue = btn.getAttribute("data-time");
          var slotStart = nyWallTimeToUTC(dateKey, slotValue);
          var slotEnd = new Date(slotStart.getTime() + 15 * 60000);
          var isBusy = dayEvents.some(function (ev) {
            return slotStart < ev.end && slotEnd > ev.start;
          });
          if (isBusy) {
            btn.classList.add("day-schedule-slot--busy");
            btn.disabled = true;
          }
        });
      });
    };

    renderCalendar = function () {
      mcTitle.textContent = monthNames[viewMonth] + " " + viewYear;
      mcGrid.innerHTML = "";
      var firstDay = new Date(viewYear, viewMonth, 1).getDay();
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

      fetchBusyForMonth(viewYear, viewMonth).then(function (busyDays) {
        mcGrid.innerHTML = "";
        for (var i = 0; i < firstDay; i++) {
          var empty = document.createElement("div");
          empty.className = "mini-cal-day mini-cal-day--empty";
          mcGrid.appendChild(empty);
        }
        for (var d = 1; d <= daysInMonth; d++) {
          var cellDate = new Date(viewYear, viewMonth, d);
          var weekday = cellDate.getDay();
          var dayKey = isoDate(viewYear, viewMonth, d);
          var cell = document.createElement("button");
          cell.type = "button";
          cell.textContent = d;
          cell.className = "mini-cal-day";

          var closed = weekday === 1 || weekday === 2;
          var isPast = cellDate < todayStart;

          if (closed) {
            cell.classList.add("mini-cal-day--closed");
            cell.disabled = true;
            cell.setAttribute("aria-label", monthNames[viewMonth] + " " + d + " — closed");
          } else if (isPast) {
            cell.classList.add("mini-cal-day--past");
            cell.disabled = true;
          } else {
            cell.classList.add("mini-cal-day--open");
            if (busyDays[dayKey]) cell.classList.add("mini-cal-day--busy");
            cell.setAttribute("aria-label", monthNames[viewMonth] + " " + d + " — open");
            cell.addEventListener("click", function () {
              var chosen = this.getAttribute("data-date");
              if (dateInput) {
                dateInput.value = chosen;
                dateInput.dispatchEvent(new Event("change"));
              } else {
                renderDaySchedule(chosen);
              }
              var prevSelected = mcGrid.querySelector(".mini-cal-day--selected");
              if (prevSelected) prevSelected.classList.remove("mini-cal-day--selected");
              this.classList.add("mini-cal-day--selected");
            });
          }
          cell.setAttribute("data-date", dayKey);
          mcGrid.appendChild(cell);
        }
      });
    };

    mcPrev.addEventListener("click", function () {
      viewMonth -= 1;
      if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
      renderCalendar();
    });
    mcNext.addEventListener("click", function () {
      viewMonth += 1;
      if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
      renderCalendar();
    });

    renderCalendar();
  }

  /* ---------- Approved client reviews (fetched from the Reviews sheet) ---------- */
  var notepadReviews = document.getElementById("notepad-reviews");
  if (notepadReviews) {
    fetch(BOOKING_ENDPOINT + "?action=reviews")
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json.ok || !json.reviews || !json.reviews.length) return;
        var cursor = notepadReviews.querySelector(".notepad-cursor");
        json.reviews.forEach(function (rev) {
          var p = document.createElement("p");
          p.className = "notepad-line";
          var stars = "★".repeat(Number(rev.rating) || 5);
          var em = document.createElement("em");
          em.textContent = String(rev.name);
          p.appendChild(document.createTextNode("\"" + String(rev.text) + "\" (" + stars + ") — "));
          p.appendChild(em);
          notepadReviews.insertBefore(p, cursor);
        });
      })
      .catch(function () {});
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var dateVal = data.get("date");
      var timeVal = data.get("time");

      if (dateVal) {
        var weekday = new Date(dateVal + "T00:00:00").getDay();
        if (weekday === 1 || weekday === 2) {
          setStatus("error", "VividTints is closed Mondays and Tuesdays — please pick Wednesday through Sunday.");
          return;
        }
      }

      submitBtn.disabled = true;
      setStatus("pending", "Booking your appointment…");

      grecaptcha.ready(function () {
        grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "booking" }).then(function (token) {
          var payload = {
            name: data.get("name"),
            email: data.get("email"),
            phone: data.get("phone"),
            carrier: data.get("carrier"),
            service: data.get("service"),
            date: dateVal,
            time: timeVal,
            notes: data.get("notes"),
            website: data.get("website"),
            recaptchaToken: token
          };

          fetch(BOOKING_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
          })
            .then(function (res) { return res.json(); })
            .then(function (result) {
              submitBtn.disabled = false;
              if (result.ok) {
                setStatus("ok", "✓ Booked for " + result.when + ". Check your email for confirmation!");
                var bookedDateKey = dateVal;
                form.reset();
                if (typeof busyCache !== "undefined") {
                  busyCache = {};
                  busyEventsCache = {};
                  if (typeof renderCalendar === "function") renderCalendar();
                  if (bookedDateKey && typeof renderDaySchedule === "function") renderDaySchedule(bookedDateKey);
                }
              } else {
                setStatus("error", result.error || "Something went wrong — please try a different time.");
              }
            })
            .catch(function () {
              submitBtn.disabled = false;
              setStatus("error", "Couldn't reach the booking system. Please call " + "380-219-0424" + " or try again.");
            });
        });
        });
    });
  }
})();
