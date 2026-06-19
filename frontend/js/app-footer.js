(function () {
  const FOOTER_ID = "amc-global-footer";

  function ensureStyles() {
    if (document.getElementById("amc-global-footer-styles")) return;

    const style = document.createElement("style");
    style.id = "amc-global-footer-styles";
    style.textContent = `
      .amc-global-footer {
        width: 100%;
        padding: 28px 16px 34px;
        text-align: center;
        color: #7e98a8;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        font-size: 0.78rem;
        font-weight: 600;
        line-height: 1.45;
      }

      .amc-global-footer p {
        margin: 0;
      }

      .amc-global-footer strong {
        color: #638092;
        font-weight: 700;
      }
    `;
    document.head.appendChild(style);
  }

  function renderFooter() {
    if (document.getElementById(FOOTER_ID)) return;
    ensureStyles();

    const footer = document.createElement("footer");
    footer.id = FOOTER_ID;
    footer.className = "amc-global-footer";
    footer.innerHTML = `
      <p><strong>Desarrollado por: Andres Campos AMC&reg;</strong></p>
      <p>N.I.T. 1.110.591.592</p>
      <p>Derechos reservados a: Andres Campos AMC</p>
      <p>Desde 2025&reg;</p>
    `;
    document.body.appendChild(footer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderFooter);
  } else {
    renderFooter();
  }
})();
