(function () {
  const DEV_USER_KEY = "amc_developer_user";
  const SESSION_KEY = "amc_session_active";

  // Inicializar usuario desarrollador por defecto en localStorage si no existe
  if (!localStorage.getItem(DEV_USER_KEY)) {
    localStorage.setItem(DEV_USER_KEY, JSON.stringify({
      nombre: "PRINCIPAL DESARROLLADOR",
      codigo: "1110591592",
      clave: "Desa*2026",
      email: "dev@amc.com"
    }));
  }

  // Compatibilidad de sesión activa sin código seteado
  if (sessionStorage.getItem(SESSION_KEY) === "true" && !sessionStorage.getItem("amc_active_user_code")) {
    sessionStorage.setItem("amc_active_user_code", "1110591592");
    sessionStorage.setItem("amc_active_user_name", "PRINCIPAL DESARROLLADOR");
  }

  const isLoggedIn = sessionStorage.getItem(SESSION_KEY) === "true";
  const path = window.location.pathname;
  const isLoginPage = path.endsWith("login.html");

  if (!isLoggedIn && !isLoginPage) {
    // Redirigir a login.html según el nivel del directorio actual
    if (
      path.includes("/productos/") ||
      path.includes("/terceros/") ||
      path.includes("/facturas-generadas/") ||
      path.includes("/usuario/")
    ) {
      window.location.replace("../login.html");
    } else {
      window.location.replace("login.html");
    }
  } else if (isLoggedIn && isLoginPage) {
    // Si ya está autenticado, no permitir ver el login
    window.location.replace("index.html");
  }
})();
