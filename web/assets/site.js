/* Agent Sean — agentsean.dev
   No dependencies. The only network call is the GitHub star count. */
(function () {
  "use strict";

  var REPO = "seziro-team/agentsean";
  var STAR_KEY = "as_stars_v1";
  var STAR_TTL = 6 * 60 * 60 * 1000; // 6h
  var reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------- live star count ----
     Unauthenticated api.github.com allows 60 req/hr per IP, so paint from
     localStorage first and revalidate in the background. Repeat visitors
     almost never hit the API. On failure keep the last known value; if there
     is none, hide the counter rather than show a zero or an error. */
  function fmtStars(n) {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  function stars() {
    var targets = document.querySelectorAll("[data-gh-stars]");
    if (!targets.length) return;

    var cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(STAR_KEY) || "null");
    } catch {
      /* private mode or corrupt value */
    }
    var paint = function (n) {
      for (var i = 0; i < targets.length; i++) targets[i].textContent = fmtStars(n);
    };
    if (cached && typeof cached.v === "number") {
      paint(cached.v);
      if (Date.now() - cached.t < STAR_TTL) return;
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
          localStorage.setItem(
            STAR_KEY,
            JSON.stringify({ v: d.stargazers_count, t: Date.now() }),
          );
        } catch {
          /* quota */
        }
      })
      .catch(function () {
        if (cached) return;
        for (var i = 0; i < targets.length; i++) {
          var pill = targets[i].closest(".ghstar");
          if (pill) {
            var n = pill.querySelector(".gh-n");
            if (n) n.style.display = "none";
          }
        }
      });
  }

  /* ------------------------------------------------------------- copy ---- */
  function copy() {
    var buttons = document.querySelectorAll(".cmd button");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
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
          } catch {
            /* nothing sensible to do */
          }
          document.body.removeChild(ta);
        });
      })(buttons[i]);
    }
  }

  /* ---------------------------------------------------- terminal replay ----
     Types out a real onboarding run. Content is identical whether or not the
     animation plays, so reduced-motion users get the same information. */
  var TTY = [
    { t: '<span class="c-p">$</span> <span class="c-w">npx agentsean</span>', d: 260 },
    { t: "", d: 120 },
    {
      t: '<span class="c-d">?</span> What site should Sean work on?  <span class="c-g">https://acme.example</span>',
      d: 200,
    },
    {
      t: '<span class="c-d">?</span> Where does it live?             <span class="c-g">WordPress</span>',
      d: 180,
    },
    {
      t: '<span class="c-d">?</span> Connect Search Console?         <span class="c-g">yes → 127.0.0.1:7777/connect</span>',
      d: 260,
    },
    { t: "", d: 140 },
    {
      t: '<span class="c-w">Crawling acme.example</span> <span class="c-d">·············</span> 80 pages · 6s',
      d: 300,
    },
    {
      t: '<span class="c-w">Running 425 checks</span>    <span class="c-d">·············</span> 14 findings · score <span class="c-a">62</span>',
      d: 320,
    },
    { t: "", d: 120 },
    {
      t: '  <span class="c-r">critical</span>  ONP.TITLE_TOO_SHORT      Homepage title is 12 characters',
      d: 130,
    },
    {
      t: '  <span class="c-a">high</span>      IMG.ALT_MISSING          31 images without alt text',
      d: 130,
    },
    {
      t: '  <span class="c-a">high</span>      LINK.BROKEN_INTERNAL     4 internal links return 404',
      d: 130,
    },
    { t: '  <span class="c-d">…11 more</span>', d: 260 },
    { t: "", d: 140 },
    {
      t: '<span class="c-g">✓</span> Sean is watching. 7-day observe window, then it starts fixing.',
      d: 200,
    },
    {
      t: '  <span class="c-d">Dashboard</span>       <span class="c-p">http://127.0.0.1:7777</span>',
      d: 110,
    },
    {
      t: '  <span class="c-d">Survive reboot</span>  <span class="c-w">sean service install</span>',
      d: 110,
    },
    {
      t: '  <span class="c-d">Stop everything</span> <span class="c-w">sean freeze</span>',
      d: 110,
    },
  ];

  function renderTty(el, upto) {
    var out = [];
    for (var i = 0; i < upto; i++) out.push(TTY[i].t);
    el.innerHTML = out.join("\n") + (upto < TTY.length ? '\n<span class="caret"></span>' : "");
  }

  function terminal() {
    var el = document.getElementById("tty");
    if (!el) return;
    if (reduce) {
      renderTty(el, TTY.length);
      return;
    }
    var started = false;
    var run = function () {
      if (started) return;
      started = true;
      var i = 0;
      var step = function () {
        i++;
        renderTty(el, i);
        if (i < TTY.length) setTimeout(step, TTY[i - 1].d);
      };
      step();
    };
    if (!("IntersectionObserver" in window)) return run();
    var io = new IntersectionObserver(
      function (entries) {
        for (var k = 0; k < entries.length; k++) {
          if (entries[k].isIntersecting) {
            run();
            io.disconnect();
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
  }

  /* ------------------------------------------------------- the diff demo ---
     The product's whole thesis, made pressable: apply a fix, watch the diff
     land, then revert it. Purely local — nothing is sent anywhere. */
  function demo() {
    var apply = document.getElementById("demoApply");
    var revert = document.getElementById("demoRevert");
    var l1 = document.getElementById("dLine1");
    var l2 = document.getElementById("dLine2");
    var meta = document.getElementById("dMeta");
    var state = document.getElementById("demoState");
    var dot = document.getElementById("demoDot");
    if (!apply || !revert || !l1 || !l2) return;

    var busy = false;
    var wait = function (ms) {
      return new Promise(function (r) {
        setTimeout(r, reduce ? 0 : ms);
      });
    };
    var setState = function (text, live) {
      if (state) state.textContent = text;
      if (dot) dot.className = live ? "dot" : "dot idle";
    };

    apply.addEventListener("click", function () {
      if (busy) return;
      busy = true;
      apply.disabled = true;
      setState("Snapshotting…", true);
      wait(420)
        .then(function () {
          l1.classList.remove("pending");
          setState("Applying…", true);
          return wait(520);
        })
        .then(function () {
          l2.classList.remove("pending");
          setState("Verifying live HTML…", true);
          return wait(680);
        })
        .then(function () {
          if (meta) meta.style.opacity = "1";
          setState("Applied · verified", true);
          apply.hidden = true;
          revert.hidden = false;
          busy = false;
        });
    });

    revert.addEventListener("click", function () {
      if (busy) return;
      busy = true;
      setState("Reverting…", true);
      if (meta) meta.style.opacity = "0";
      wait(420)
        .then(function () {
          l2.classList.add("pending");
          return wait(320);
        })
        .then(function () {
          l1.classList.add("pending");
          setState("Reverted · snapshot restored", false);
          revert.hidden = true;
          apply.hidden = false;
          apply.disabled = false;
          busy = false;
          return wait(1800);
        })
        .then(function () {
          if (apply.hidden === false && l1.classList.contains("pending")) {
            setState("Ready", false);
          }
        });
    });
  }

  /* ------------------------------------------------------- scroll reveal -- */
  function reveal() {
    var els = document.querySelectorAll(".rv");
    if (!els.length) return;
    if (reduce || !("IntersectionObserver" in window)) {
      for (var i = 0; i < els.length; i++) els[i].classList.add("in");
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        for (var k = 0; k < entries.length; k++) {
          if (entries[k].isIntersecting) {
            entries[k].target.classList.add("in");
            io.unobserve(entries[k].target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    for (var j = 0; j < els.length; j++) io.observe(els[j]);
  }

  /* ------------------------------------------------------------- nav ----- */
  function nav() {
    var el = document.getElementById("nav");
    if (!el) return;
    var onScroll = function () {
      el.classList.toggle("scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function year() {
    var els = document.querySelectorAll("[data-year]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = String(new Date().getFullYear());
    }
  }

  function init() {
    stars();
    copy();
    terminal();
    demo();
    reveal();
    nav();
    year();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
