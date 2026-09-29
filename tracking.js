/* Municipal Watch measurement layer (Growth Engine).
 * 1. Loads GA4 and the Meta Pixel only if their IDs are set in window.MW_TRACKING.
 * 2. Keeps ad click IDs and UTM tags for 90 days so a sale days later is still credited.
 * 3. Tags every Stripe checkout link with the visitor's GA4 client id (client_reference_id),
 *    so the Stripe webhook can credit the sale to the right ad, campaign and keyword.
 * 4. Fires "begin checkout" when someone clicks Subscribe.
 */
(function () {
  var cfg = window.MW_TRACKING || {};
  var DAY = 864e5;

  function setCookie(k, v, days) {
    document.cookie = k + "=" + encodeURIComponent(v) + ";path=/;max-age=" + days * 86400 + ";SameSite=Lax";
  }
  function getCookie(k) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + k + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  // --- first-touch + last-touch attribution ---
  var q = new URLSearchParams(location.search);
  var touch = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"].forEach(function (k) {
    if (q.get(k)) touch[k] = q.get(k);
  });
  if (Object.keys(touch).length) {
    touch.at = Date.now();
    if (!getCookie("mw_first")) setCookie("mw_first", JSON.stringify(touch), 90);
    setCookie("mw_last", JSON.stringify(touch), 90);
  }
  if (q.get("fbclid") && !getCookie("_fbc")) {
    setCookie("_fbc", "fb.1." + Date.now() + "." + q.get("fbclid"), 90); // Meta's click-id cookie format
  }

  // --- GA4 ---
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  if (cfg.ga4) {
    var g = document.createElement("script");
    g.async = true;
    g.src = "https://www.googletagmanager.com/gtag/js?id=" + cfg.ga4;
    document.head.appendChild(g);
    gtag("js", new Date());
    gtag("config", cfg.ga4);
  }

  // --- Meta Pixel ---
  if (cfg.metaPixel) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    fbq("init", cfg.metaPixel);
    fbq("track", "PageView");
  }

  // --- checkout links ---
  function tagLinks(clientRef) {
    document.querySelectorAll("a[data-checkout]").forEach(function (a) {
      var u = new URL(a.href);
      if (clientRef) u.searchParams.set("client_reference_id", clientRef);
      a.href = u.toString();
    });
  }
  function ga4ClientRef(cb) {
    if (!cfg.ga4) return cb("");
    var done = false;
    gtag("get", cfg.ga4, "client_id", function (id) {
      done = true;
      cb(id ? "ga_" + String(id).replace(/[^0-9]/g, "_") : ""); // Stripe allows letters, digits, - and _
    });
    setTimeout(function () { if (!done) cb(""); }, 2500);
  }

  // --- free pilot form -> Growth Hub ---
  function setupPilot() {
    var f = document.getElementById("pilot-form");
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = function (n) { var el = f.elements[n]; return el ? String(el.value || "").trim() : ""; };
      var msg = document.getElementById("pilot-msg"), btn = f.querySelector("button");
      if (!v("name") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email")) || !v("city") || !v("country")) {
        msg.textContent = "Please fill in your name, a valid email, your city and country."; msg.className = "text-sm text-center mt-3 text-red-600"; return;
      }
      btn.disabled = true; btn.textContent = "Sending...";
      var city = v("city"), country = v("country");
      var attr = {}; try { attr = JSON.parse(getCookie("mw_last") || getCookie("mw_first") || "{}"); } catch (x) {}
      var payload = { email: v("email"), context: "pilot", name: v("name"), company: v("business"), website: v("website"),
        message: "Role: " + v("role") + " | City: " + v("city") + " | Country: " + v("country") + " | Watch: " + v("watch"),
        page: location.pathname, attribution: attr };
      var done = function (ok) {
        if (ok) {
          if (cfg.ga4) gtag("event", "generate_lead", { lead_context: "pilot", city: city, country: country });
          if (cfg.metaPixel) fbq("track", "Lead", { content_name: "pilot" });
          f.innerHTML = '<div class="md:col-span-2 text-center py-6"><p class="text-2xl font-bold mb-2">You\'re in.</p><p class="text-slate-600">We\'re setting up your watch for ' +
            city.replace(/[<>&"]/g, "") + '. Look for an email from us within one business day.</p></div>';
        } else {
          btn.disabled = false; btn.textContent = "Start my free pilot";
          msg.innerHTML = 'That didn\'t go through. Please try again, or email <a class="underline" href="mailto:customercareblackaiser@gmail.com?subject=Free%20pilot">customercareblackaiser@gmail.com</a>.';
          msg.className = "text-sm text-center mt-3 text-red-600";
        }
      };
      if (!cfg.hub) return done(false);
      fetch(cfg.hub.replace(/\/$/, "") + "/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { done(r.ok); }).catch(function () { done(false); });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupPilot();
    ga4ClientRef(tagLinks);
    document.querySelectorAll("a[data-checkout]").forEach(function (a) {
      a.addEventListener("click", function () {
        var plan = a.getAttribute("data-checkout"), value = Number(a.getAttribute("data-value"));
        if (cfg.ga4) gtag("event", "begin_checkout", { currency: "USD", value: value, items: [{ item_id: plan, item_name: plan, price: value }] });
        if (cfg.metaPixel) fbq("track", "InitiateCheckout", { currency: "USD", value: value, content_name: plan });
      });
    });
  });
})();
