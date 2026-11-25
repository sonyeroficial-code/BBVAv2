(function () {
  "use strict";

  const STARTUP_FALLBACK_ID = "bbva-startup-fallback";
  const RECOVERY_KEY = "bbva-startup-recovery-v3";

  function startupStillBlocked() {
    const fallback = document.getElementById(STARTUP_FALLBACK_ID);
    return Boolean(fallback && fallback.closest("app-root"));
  }

  function showRetryButton(message) {
    if (!startupStillBlocked()) return;
    const fallback = document.getElementById(STARTUP_FALLBACK_ID);
    fallback.classList.add("bbva-startup-error");
    const text = fallback.querySelector("span");
    if (text) {
      text.classList.remove("sr-only");
      text.textContent = message || "No se pudo iniciar. Intenta nuevamente.";
    }
    const button = fallback.querySelector("button");
    if (button) button.hidden = false;
  }

  async function repairStartup() {
    if (!startupStillBlocked()) {
      sessionStorage.removeItem(RECOVERY_KEY);
      return;
    }
    if (!navigator.onLine) {
      showRetryButton("Revisa tu conexión a internet");
      return;
    }
    const attempts = Number(sessionStorage.getItem(RECOVERY_KEY) || "0");
    if (attempts >= 1) {
      showRetryButton("La aplicación está tardando más de lo normal");
      return;
    }
    sessionStorage.setItem(RECOVERY_KEY, String(attempts + 1));
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(function (registration) {
          return registration.unregister();
        }));
      }
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.filter(function (name) {
          return /^ngsw:|bbva/i.test(name);
        }).map(function (name) {
          return caches.delete(name);
        }));
      }
    } catch (_) {}
    const url = new URL(location.href);
    url.searchParams.set("inicio", Date.now().toString());
    location.replace(url.toString());
  }

  window.setTimeout(repairStartup, 8000);
  window.addEventListener("pageshow", function () {
    window.setTimeout(repairStartup, 7000);
  }, { once: true });
})();
