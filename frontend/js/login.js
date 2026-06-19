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
      };
      localStorage.setItem(DEV_USER_KEY, JSON.stringify(storedUser));
    }

    // Verificar credenciales
    if (usuarioVal === storedUser.codigo && claveVal === storedUser.clave) {
      // Éxito: Establecer sesión activa
      sessionStorage.setItem(SESSION_KEY, "true");
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
