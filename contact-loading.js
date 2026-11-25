(function () {
  "use strict";

  let loading = false;

  function installStyles() {
    if (document.getElementById("bbva-contact-loading-style")) return;
    const style = document.createElement("style");
    style.id = "bbva-contact-loading-style";
    style.textContent = `
      .bbva-contact-loading {
        position: fixed;
        inset: 0;
        z-index: 20000;
        display: grid;
        place-items: center;
        background: rgba(4, 24, 55, .32);
        -webkit-backdrop-filter: blur(6px) saturate(.82);
        backdrop-filter: blur(6px) saturate(.82);
        opacity: 0;
        animation: bbva-contact-fade .16s ease forwards;
      }
      .bbva-contact-spinner {
        width: 72px;
        height: 72px;
        box-sizing: border-box;
        border: 10px solid rgba(159, 178, 193, .65);
        border-top-color: #11b9e7;
        border-left-color: #11b9e7;
        border-radius: 50%;
        filter: drop-shadow(0 5px 12px rgba(0, 24, 62, .22));
        animation: bbva-contact-spin .72s linear infinite;
      }
      @keyframes bbva-contact-fade { to { opacity: 1; } }
      @keyframes bbva-contact-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        .bbva-contact-loading { animation: none; opacity: 1; }
        .bbva-contact-spinner { animation-duration: 1.25s; }
      }
    `;
    document.head.appendChild(style);
  }

  function showLoading() {
    installStyles();
    const overlay = document.createElement("div");
    overlay.className = "bbva-contact-loading";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-label", "Procesando transferencia");
    overlay.innerHTML = '<div class="bbva-contact-spinner" aria-hidden="true"></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  document.addEventListener("click", function (event) {
    if (event.__bbvaContactLoadingComplete) return;

    const button = event.target.closest?.("app-celular button.confirm-btn");
    if (!button || button.disabled) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (loading) return;

    loading = true;
    const overlay = showLoading();
    window.setTimeout(function () {
      overlay.remove();
      loading = false;
      if (!button.isConnected) return;

      const nextClick = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window
      });
      Object.defineProperty(nextClick, "__bbvaContactLoadingComplete", { value: true });
      button.dispatchEvent(nextClick);
    }, 900);
  }, true);
})();
