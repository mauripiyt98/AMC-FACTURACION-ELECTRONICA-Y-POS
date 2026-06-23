document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const usuarioInput = document.getElementById("usuario");
  const claveInput = document.getElementById("clave");
  const errorMsg = document.getElementById("error-msg");

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const usuarioVal = usuarioInput.value.trim();
    const claveVal = claveInput.value;

    // Obtener las credenciales registradas del localStorage
    const DEV_USER_KEY = "amc_developer_user";
    const SESSION_KEY = "amc_session_active";

    let storedUser = null;
    try {
      const data = localStorage.getItem(DEV_USER_KEY);
      if (data) {
        storedUser = JSON.parse(data);
      }
    } catch (err) {
      console.error("Error al leer datos del usuario:", err);
    }

    // Si por alguna razón no existiera, usar el valor por defecto
    if (!storedUser) {
      storedUser = {
        nombre: "PRINCIPAL DESARROLLADOR",
        codigo: "1110591592",
        clave: "Desa*2026",
        email: "dev@amc.com"
      };
      localStorage.setItem(DEV_USER_KEY, JSON.stringify(storedUser));
    }

    // Buscar si es un usuario independiente
    let isIndependentUser = false;
    let matchingIndependentUser = null;
    try {
      const independentUsersRaw = localStorage.getItem("amc_independent_users");
      if (independentUsersRaw) {
        const independentUsers = JSON.parse(independentUsersRaw);
        if (Array.isArray(independentUsers)) {
          matchingIndependentUser = independentUsers.find(
            (u) => u.codigo === usuarioVal && u.clave === claveVal
          );
          if (matchingIndependentUser) {
            isIndependentUser = true;
          }
        }
      }
    } catch (err) {
      console.error("Error al buscar usuario independiente:", err);
    }

    // Verificar credenciales
    if (usuarioVal === storedUser.codigo && claveVal === storedUser.clave) {
      // Éxito: Establecer sesión activa
      sessionStorage.setItem(SESSION_KEY, "true");
      sessionStorage.setItem("amc_active_user_code", storedUser.codigo);
      sessionStorage.setItem("amc_active_user_name", storedUser.nombre);
      errorMsg.style.display = "none";
      // Redirigir a la página principal
      window.location.replace("index.html");
    } else if (isIndependentUser && matchingIndependentUser) {
      // Éxito usuario independiente: Establecer sesión activa
      sessionStorage.setItem(SESSION_KEY, "true");
      sessionStorage.setItem("amc_active_user_code", matchingIndependentUser.codigo);
      sessionStorage.setItem("amc_active_user_name", `Usuario ${matchingIndependentUser.codigo}`);
      errorMsg.style.display = "none";
      // Redirigir a la página principal
      window.location.replace("index.html");
    } else {
      // Fallo: Mostrar alerta de error
      errorMsg.textContent = "Código de usuario o contraseña incorrectos.";
      errorMsg.style.display = "block";
      claveInput.value = "";
      claveInput.focus();
    }
  });
});
