/* Agent Sean site JS. No dependencies, no external requests except the GitHub API. */
(function () {
  "use strict";

  var REPO = "seziro-team/agentsean";
  var KEY = "as_stars_v1";
  var TTL = 6 * 60 * 60 * 1000; // 6h

  /* ---- live GitHub star count ------------------------------------------
     Unauthenticated api.github.com allows 60 req/hr per IP, so we paint from
     localStorage first and revalidate in the background. Repeat visitors
     almost never hit the API. On failure we leave the last known value, or
     hide the counter entirely rather than showing an error. */
  function fmt(n) {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  function paint(n) {
    var els = document.querySelectorAll("[data-gh-stars]");
    for (var i = 0; i < els.length; i++) els[i].textContent = fmt(n);
  }

  function stars() {
    var targets = document.querySelectorAll("[data-gh-stars]");
    if (!targets.length) return;

    var cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch (e) {
      /* private mode or corrupt value */
    }
    if (cached && typeof cached.v === "number") {
      paint(cached.v);
      if (Date.now() - cached.t < TTL) return;
    }

    fetch("https://api.github.com/repos/" + REPO, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (d) {
        if (typeof d.stargazers_count !== "number") throw new Error("shape");
        paint(d.stargazers_count);
        try {
          localStorage.setItem(KEY, JSON.stringify({ v: d.stargazers_count, t: Date.now() }));
        } catch (e) {
          /* quota */
        }
      })
      .catch(function () {
        if (!cached) {
          for (var i = 0; i < targets.length; i++) {
            var pill = targets[i].closest(".ghstar");
            if (pill) pill.querySelector(".gh-n").style.display = "none";
          }
        }
      });
  }

  /* ---- copy-to-clipboard on command blocks ---- */
  function copy() {
    document.querySelectorAll(".cmd button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.parentElement.getAttribute("data-copy") || "";
        var done = function () {
          var was = btn.textContent;
          btn.textContent = "Copied";
          btn.classList.add("done");
          setTimeout(function () {
            btn.textContent = was;
            btn.classList.remove("done");
          }, 1600);
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(done, function () {});
          return;
        }
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          done();
        } catch (e) {
          /* nothing sensible to do */
        }
        document.body.removeChild(ta);
      });
    });
  }

  /* ---- current year in the footer ---- */
  function year() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      stars();
      copy();
      year();
    });
  } else {
    stars();
    copy();
    year();
  }
})();
